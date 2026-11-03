// Puxa do Brawl Time Ninja o meta por mapa e gera site/index.html.
// Duas partes: o ranqueado e os mapas que valem troféu, as duas descobertas na
// hora, com os mapas da rotação marcados. Os perfis do clube vão junto, pra cada
// membro escolher o próprio nome na página e ver quem tem no máximo.
//
// Roda de hora em hora, mas as estatísticas do BTN só são coletadas uma vez por dia
// (pedido do dono do site). Nas outras rodadas mudam só a rotação e o clube, que vêm
// da API oficial.
//
// Uso: node atualizar.mjs [--parte ranqueado|trofeu] [--rank 16] [--blocos 2] [--clube 290J9JL8] [--limite N]
//   --parte   coleta essa parte agora, mesmo com a coleta do dia feita; a outra fica como está
//   --rank    faixa mínima do ranqueado (10 = Diamante I, 13 = Mítico I, 16 = Lendário I, 19 = Mestre I)
//   --blocos  quantos blocos de duas semanas juntar (o site agrupa os dados assim)
//   --clube   tag do clube cujos membros aparecem no seletor "Você"
//   --limite  processa só os N primeiros mapas de cada parte, pra testar rápido
// Sem argumento, vale o que está em config.json e as duas partes são geradas.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { nomeBonito, ajustada, duplasDeAliados, diasDosBlocos, resumirConfrontos, especialistas, forcaNaCascata, semOMapa, somar, mediaDe, pesarPorIdade, efeitoDosPatches, confrontosEmCascata, escolherConfrontos, tabelaDeConfrontos, duplasPelaForca, MIN_CONFRONTO, LIMITE_NICHO, PESO_FUNDO, DIAS_PERIODO, MEIA_VIDA, FOLGA_MARGEM } from './calculo.mjs';
import { atributosDaSemana } from './wiki.mjs';
import { partidasRanqueadas, juntarPartidas } from './registro.mjs';

const dir = new URL('.', import.meta.url);
const config = JSON.parse(await readFile(new URL('config.json', dir), 'utf8'));
const arg = (nome) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : config[nome];
};
const RANK = Number(arg('rank') ?? 16);
const BLOCOS = Number(arg('blocos') ?? 2);
const CLUBE = arg('clube')?.replace(/^#/, '').toUpperCase();
const PARTE = arg('parte');
const LIMITE = Number(arg('limite') ?? Infinity);
if (PARTE && !['ranqueado', 'trofeu'].includes(PARTE)) {
  console.error('--parte aceita ranqueado ou trofeu');
  process.exit(1);
}

// Abaixo disso o brawler sai da lista principal e só aparece em "pouca amostra".
const MIN_PARTIDAS = 150;
const MIN_PARTIDAS_DUPLA = 200;
// Mapa com menos partidas que isso mostra a lista estimada pelo modo,
// com todo brawler que o modo conhece, e a página avisa.
const MIN_PARTIDAS_ESTIMADA = 1000;
// Faixa de troféus do brawler, em centenas: 10 = 1.000 troféus ou mais.
const FAIXA_TROFEU = 10;
// Mapa de troféu entra com pelo menos isso de partidas nos blocos que terminam nos
// últimos DIAS_MAPA dias. Corta mapa que saiu do jogo e evento que durou um fim de
// semana. A tabela somada não separa os dias em que o mapa só passou no Jogo Livre.
const MIN_PARTIDAS_MAPA = 3000;
const DIAS_MAPA = 14;
// As estatísticas são coletadas de novo quando a coleta anterior passa disso. Com 24,
// o atraso do timer empurraria a coleta uma hora por dia.
const HORAS_ENTRE_COLETAS = 23;

// Desde 21/10/2026 o BTN barra quem não tem token; o nosso veio em 27/10, por DM ao
// schneefux, dono do site, no Discord dele. As regras dele: User-Agent com o nome do app e
// um contato, poucos pedidos a cada poucos minutos e só as tabelas já somadas, que são
// rápidas e vêm em blocos de duas semanas. A tabela de partidas, usada até 21/10, é
// lenta. Uma coleta faz uns 55 pedidos, um a cada INTERVALO, e roda uma vez por dia.
const API_BTN = 'https://brawltime.ninja/api';
const TOKEN_BTN = join(homedir(), '.config/brawltime-ninja/token');
const AGENTE = 'meta-por-mapa (https://kaue-magalhaes.github.io/meta-por-mapa/; kauedemagalhaes27@gmail.com)';
const INTERVALO = 20_000;
// Máximo de linhas numa resposta; acima disso o BTN corta as de menos partidas.
const LIMITE_LINHAS = 50000;

const esperar = (ms) => new Promise((ok) => setTimeout(ok, Math.max(0, ms)));
let tokenBtn;
let ultimoPedido = 0;
let pedidosBtn = 0;

// Pedido tRPC: a entrada vai em ?input= dentro de { json }, e a resposta vem em
// result.data.json. Os pedidos saem um por vez, nunca em paralelo.
async function btn(procedimento, entrada) {
  tokenBtn ??= (await readFile(TOKEN_BTN, 'utf8')).trim();
  const url = `${API_BTN}/${procedimento}` + (entrada ? `?input=${encodeURIComponent(JSON.stringify({ json: entrada }))}` : '');
  for (let tentativa = 1; ; tentativa++) {
    await esperar(ultimoPedido + INTERVALO - Date.now());
    ultimoPedido = Date.now();
    pedidosBtn++;
    const r = await fetch(url, { headers: { 'User-Agent': AGENTE, Authorization: `Bearer ${tokenBtn}` } });
    const texto = await r.text();
    // Quando o site barra o acesso (proteção contra robôs), a resposta é uma página HTML.
    if (texto.startsWith('<')) {
      throw new Error(`o BTN barrou ${procedimento} (HTTP ${r.status}): ${texto.slice(0, 120).replace(/\s+/g, ' ')}`);
    }
    const j = JSON.parse(texto);
    if (r.ok) return j.result.data.json;
    // Site ocupado ou fora do ar: tenta de novo, esperando um minuto a mais por vez.
    if ((r.status === 429 || r.status >= 500) && tentativa < 3) {
      await esperar(60_000 * tentativa);
      continue;
    }
    throw new Error(`${procedimento}: HTTP ${r.status} ${j.error?.json?.message ?? ''}`.trim());
  }
}

// Uma linha por combinação das dimensões, com as medidas junto:
// { brawler, map, season, picks, winRate }. fatias são os filtros; season filtra os
// blocos que terminam nesse dia ou depois.
async function consultaCortavel(cubo, dimensoes, medidas, fatias, ordem = 'picks') {
  const { data } = await btn('klicker.query', {
    query: { cubeId: cubo, dimensionsIds: dimensoes, metricsIds: medidas, slices: fatias, sortId: ordem, limit: LIMITE_LINHAS },
  });
  return data.map((linha) => Object.assign({}, ...Object.values(linha.dimensionsRaw), linha.metricsRaw));
}

async function consulta(...args) {
  const linhas = await consultaCortavel(...args);
  if (linhas.length >= LIMITE_LINHAS) throw new Error(`${args[0]}: a consulta bateu o limite de ${LIMITE_LINHAS} linhas`);
  return linhas;
}

const diasAtras = (dias) => new Date(Date.now() - dias * 864e5).toISOString().slice(0, 10);
const r4 = (x) => Math.round(x * 1e4) / 1e4;

// Perfis e clube vêm da API oficial da Supercell, e não do BTN: assim o seletor
// "Você" continua atualizando mesmo quando o BTN barra a coleta. A chave é criada em
// developer.brawlstars.com e fica presa ao IP de casa; se o IP mudar, a API responde
// 403 e é preciso criar outra.
const CHAVE_OFICIAL = join(homedir(), '.config/brawlstars-api/token');

async function oficial(caminho) {
  const chave = (await readFile(CHAVE_OFICIAL, 'utf8')).trim();
  const r = await fetch(`https://api.brawlstars.com/v1${caminho}`, { headers: { authorization: `Bearer ${chave}` } });
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`API oficial recusou ${caminho} (HTTP ${r.status}): ${d?.reason ?? ''} ${d?.message ?? ''}`.trim());
  return d;
}

const comTag = (tag) => encodeURIComponent(`#${tag}`);

// "No máximo" = nível 11 com pelo menos um gadget, uma star power e a hipercarga.
// Engrenagem fica de fora porque é barata de comprar. recordes é o maior troféu que a
// pessoa já teve com cada brawler: no Draft, marca quem ela mais jogou.
async function perfil(tag) {
  const p = await oficial(`/players/${comTag(tag)}`);
  const tem = (b, k) => (b[k] ?? []).length > 0;
  return {
    tag,
    nome: p.name,
    maximizados: p.brawlers
      .filter((b) => b.power === 11 && tem(b, 'gadgets') && tem(b, 'starPowers') && tem(b, 'hyperCharges'))
      .map((b) => nomeBonito(b.name))
      .sort(),
    recordes: Object.fromEntries(p.brawlers.filter((b) => b.highestTrophies > 0).map((b) => [nomeBonito(b.name), b.highestTrophies])),
  };
}

// Membros do clube com o que cada um tem no máximo. Um perfil por vez: são poucos,
// e a API oficial limita a taxa de cada chave. De cada membro também vêm as partidas do
// Ranqueado, guardadas em partidas-clube.json (fora do git e do site).
async function clube(tag) {
  const c = await oficial(`/clubs/${comTag(tag)}`);
  const membros = [];
  const novas = [];
  for (const m of c.members) {
    const t = m.tag.replace(/^#/, '');
    // Um perfil ou registro que falha não derruba a geração: o membro fica de fora até a próxima.
    try {
      membros.push(await perfil(t));
    } catch (e) {
      console.warn(`perfil #${t} falhou: ${e.message}`);
    }
    try {
      novas.push(...partidasRanqueadas((await oficial(`/players/${comTag(t)}/battlelog`)).items, m.tag));
    } catch (e) {
      console.warn(`partidas de #${t} falharam: ${e.message}`);
    }
  }
  membros.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const arquivo = new URL('partidas-clube.json', dir);
  const antigas = JSON.parse(await readFile(arquivo, 'utf8').catch(() => '[]'));
  const juntas = juntarPartidas(antigas, novas, Date.now());
  await writeFile(arquivo, JSON.stringify(juntas));
  console.log(`partidas do clube: ${juntas.length} guardadas (${juntas.length - antigas.length} novas)`);
  return { tag, nome: c.name, membros };
}

// Mapas da rotação do troféu agora, como 'modo|mapa'. Vem da API oficial, que não
// gasta pedido do BTN e por isso é consultada de hora em hora.
async function rotacaoOficial() {
  const eventos = await oficial('/events/rotation');
  return new Set(eventos.map((e) => `${e.event.mode}|${e.event.map}`));
}

// O site agrupa as partidas em blocos de duas semanas; devolve o rótulo do mais antigo usado.
async function inicioDosBlocos() {
  const blocos = (await consulta('map', ['season'], ['picks'], { season: [diasAtras(90)] })).map((r) => r.season.slice(0, 10));
  const recentes = [...new Set(blocos)].sort().reverse();
  return recentes[Math.min(BLOCOS, recentes.length) - 1];
}

const porBrawler = (linhas) => new Map(linhas.map((r) => [nomeBonito(r.brawler), { n: Number(r.picks), wr: Number(r.winRate) }]));
const comVitorias = (m) => new Map([...m].map(([nome, { n, wr }]) => [nome, { n, v: n * wr }]));
const comTaxa = (m) => new Map([...m].map(([nome, { n, v }]) => [nome, { n, wr: n ? v / n : 0 }]));

// Partidas e vitórias somadas por brawler, de linhas com qualquer outra dimensão.
function somarPorBrawler(linhas) {
  const soma = new Map();
  for (const r of linhas) {
    const nome = nomeBonito(r.brawler);
    const x = soma.get(nome) ?? { n: 0, v: 0 };
    soma.set(nome, { n: x.n + Number(r.picks), v: x.v + Number(r.picks) * Number(r.winRate) });
  }
  return soma;
}

// Duplas (brawlerAllies, outro = 'ally') ou confrontos (brawlerEnemies, outro = 'enemy')
// nos mapas de um modo. As duas tabelas não separam ranqueado de partida normal; na
// faixa usada, a mistura só acontece em mapa que está nas duas listas. Se o modo
// inteiro passar do limite de linhas, pede mapa por mapa.
// push(...linhas) estoura a pilha acima de ~120 mil linhas, e o troféu passa disso.
function juntar(destino, linhas) {
  for (const r of linhas) destino.push(r);
}

async function pares(cubo, outro, mapas, fatias) {
  const dimensoes = ['brawler', outro, 'map'];
  const linhas = await consultaCortavel(cubo, dimensoes, ['picks', 'winRate'], { ...fatias, map: mapas });
  if (linhas.length < LIMITE_LINHAS) return linhas;
  const porMapa = [];
  for (const mapa of mapas) juntar(porMapa, await consulta(cubo, dimensoes, ['picks', 'winRate'], { ...fatias, map: [mapa] }));
  return porMapa;
}

// Na tabela por mapa do BTN, cada partida conta uma vez para cada brawler do time do
// jogador rastreado (confirmado pelo schneefux em 30/10). As partidas de verdade são o
// total dividido pelo tamanho do time. Modo fora desta lista mostra escolhas, e não
// partidas, para não arriscar um número errado.
const JOGADORES_POR_TIME = {
  gemGrab: 3, brawlBall: 3, bounty: 3, heist: 3, knockout: 3, hotZone: 3, basketBrawl: 3, deathmatch: 3,
  soloShowdown: 1, duoShowdown: 2, trioShowdown: 3,
  gemGrab5V5: 5, brawlBall5V5: 5, knockout5V5: 5, deathmatch5v5: 5,
};

// dados: as linhas deste mapa. brawlers { brawler, picks, winRate, trophyChange?, rank? },
//   aliados { brawler, ally, picks, winRate } e confrontos { brawler, enemy, picks, winRate }.
// extras: { semConfrontos, margem, geral: Map nome -> { n, wr } do modo inteiro,
//   cascata: { modo, fundo, parte } em Map nome -> { n, v } e mapas (quantos o modo tem),
//   todosOsMapas: duplas e counters ficam pro final, com todos os mapas (devolve `bruto`) }
function processarMapa(modo, mapa, { brawlers, aliados, confrontos }, extras) {
  const duplas = duplasDeAliados(aliados);
  const linhas = brawlers.map((r) => ({
    nome: nomeBonito(r.brawler),
    n: Number(r.picks),
    wr: Number(r.winRate),
    ...(r.trophyChange != null && { trofeus: Math.round(Number(r.trophyChange) * 100) / 100 }),
    ...(r.rank != null && { posicao: Math.round(Number(r.rank) * 100) / 100 }),
  }));
  const total = linhas.reduce((s, r) => s + r.n, 0);
  let media = total ? linhas.reduce((s, r) => s + r.wr * r.n, 0) / total : 0;
  const estimada = total < MIN_PARTIDAS_ESTIMADA;
  const { modo: doModoTodo, fundo, parte: daParte, mapas } = extras.cascata;
  const doMapa = new Map(linhas.map((r) => [r.nome, { n: r.n, v: r.n * r.wr }]));
  const semEste = semOMapa(doModoTodo, doMapa);
  // Com poucas partidas, a média do mapa é sorte; a do modo diz mais.
  if (estimada) media = mediaDe(semEste);
  const noModo = somar(semEste, fundo, PESO_FUNDO);
  const forca = forcaNaCascata(doMapa, noModo, semOMapa(daParte, doMapa));
  // Mapa com pouco dado: entra quem passaria do corte num mapa típico do modo,
  // mesmo sem partida aqui.
  const corteModo = MIN_PARTIDAS * Math.max(1, mapas - 1);
  const doModo = (nome) => (semEste.get(nome)?.n ?? 0) >= corteModo;
  const conhecidos = estimada
    ? [...semEste.keys()].filter((nome) => doModo(nome) && !doMapa.has(nome)).map((nome) => ({ nome, n: 0, wr: null, uso: 0 }))
    : [];
  const lista = [...linhas.map((r) => ({ ...r, uso: r.n / total })), ...conhecidos]
    .map((r) => {
      const { delta, variancia } = forca.get(r.nome);
      // A margem só foi validada no ranqueado; a página marca o S que pode ser B.
      return { ...r, adj: media + delta, ...(extras.margem && { sd: r4(FOLGA_MARGEM * Math.sqrt(variancia)) }) };
    })
    .sort((a, b) => b.adj - a.adj);
  const principais = lista.filter((r) => r.n >= MIN_PARTIDAS || (estimada && doModo(r.nome)));

  const doMapaTodo = extras.todosOsMapas && {
    confrontos: confrontos.map((c) => [nomeBonito(c.brawler), nomeBonito(c.enemy), Number(c.picks), Number(c.winRate)]),
    duplas,
    forca: new Map([...forca].map(([nome, { delta }]) => [nome, delta])),
    media,
  };
  const listaDuplas = Object.entries(duplas)
    .filter(([, d]) => d.n >= MIN_PARTIDAS_DUPLA)
    .map(([k, d]) => ({ par: k.split('|'), n: d.n, wr: r4(d.v / d.n), adj: ajustada(d.v, d.n, media) }))
    .sort((a, b) => b.adj - a.adj);

  const porBrawler = {};
  for (const c of confrontos) {
    const n = Number(c.picks);
    if (n < MIN_CONFRONTO) continue;
    (porBrawler[nomeBonito(c.brawler)] ??= []).push([nomeBonito(c.enemy), n, Number(c.winRate)]);
  }

  const enxuto = (r) => ({ ...r, n: Math.round(r.n), wr: r.wr == null ? null : r4(r.wr), uso: r4(r.uso), adj: r4(r.adj) });
  return {
    modo,
    mapa,
    // Com peso por idade, partidas vêm fracionadas.
    total: Math.round(total),
    ...(JOGADORES_POR_TIME[modo] && { partidas: Math.round(total / JOGADORES_POR_TIME[modo]) }),
    media: r4(media),
    ...(estimada && { estimada }),
    brawlers: principais.map(enxuto),
    poucaAmostra: lista
      .filter((r) => r.n >= 20 && r.n < MIN_PARTIDAS && r.wr >= media + 0.06)
      .sort((a, b) => b.wr - a.wr)
      .slice(0, 6)
      .map(enxuto),
    ...(doMapaTodo && { bruto: doMapaTodo }),
    melhoresDuplas: listaDuplas.slice(0, 8).map(({ adj, ...d }) => d),
    pioresDuplas: listaDuplas.slice(-5).reverse().map(({ adj, ...d }) => d),
    // null quando o modo não tem confronto direto (Showdown).
    confrontos: extras.semConfrontos
      ? null
      : Object.fromEntries(principais.map((b) => [b.nome, resumirConfrontos(porBrawler[b.nome] ?? [])])),
    especialistas: especialistas(principais.filter((b) => b.n > 0), extras.geral).map((e) => ({
      ...e,
      wr: r4(e.wr),
      wrModo: r4(e.wrModo),
      delta: r4(e.delta),
    })),
  };
}
// Mapas do ranqueado de agora. Todo mapa da lista tem partida a cada poucos minutos;
// o que saiu na troca de temporada para de ter. Vale o mapa cuja última partida
// fica a até FOLGA_RANQUEADO horas da partida mais recente do ranqueado inteiro,
// sem filtro de faixa (com filtro, mapa novo some). A comparação é com a última
// partida, e não com o relógio, porque o site às vezes passa horas sem gravar nada:
// em 16/10 ficou de 15h a 18h UTC sem nenhuma partida, e uma janela de 3 horas
// derrubou metade dos mapas. Numa pausa assim, todo mapa para junto e nenhum sai.
const FOLGA_RANQUEADO = 6;
const ORDEM_RANQUEADO = ['gemGrab', 'brawlBall', 'heist', 'bounty', 'knockout', 'hotZone'];

async function mapasDoRanqueado() {
  const linhas = (
    await consulta('map', ['mode', 'map'], ['picks', 'eventId', 'timestamp'], { season: [diasAtras(14)], powerplay: ['true'] }, 'timestamp')
  ).filter((r) => Number(r.eventId) !== 0);
  const ultima = Math.max(...linhas.map((r) => Date.parse(r.timestamp)));
  const ativos = linhas.filter((r) => Date.parse(r.timestamp) >= ultima - FOLGA_RANQUEADO * 36e5);
  if (ativos.length < 10) throw new Error(`só ${ativos.length} mapas no ranqueado: o site mudou o formato?`);
  const pos = (modo) => (ORDEM_RANQUEADO.includes(modo) ? ORDEM_RANQUEADO.indexOf(modo) : ORDEM_RANQUEADO.length);
  return ativos
    .map((r) => ({ modo: r.mode, mapa: r.map }))
    .sort((a, b) => pos(a.modo) - pos(b.modo) || a.modo.localeCompare(b.modo) || a.mapa.localeCompare(b.mapa));
}

// No ranqueado, a vitória de cada brawler pesa as partidas pela idade (pesarPorIdade),
// com o efeito dos patches da lista do config.json. Duplas e counters continuam com os
// blocos juntos.
async function gerarRanqueado(desde, anterior) {
  const lista = (await mapasDoRanqueado()).slice(0, LIMITE);
  console.log(`ranqueado: ${lista.length} mapas`);
  // Troca na lista fica no log, pra dar pra conferir depois se foi temporada nova ou erro.
  if (anterior?.mapas && LIMITE === Infinity) {
    const antes = new Set(anterior.mapas.map((m) => m.mapa));
    const atuais = new Set(lista.map((m) => m.mapa));
    const entrou = [...atuais].filter((m) => !antes.has(m));
    const saiu = [...antes].filter((m) => !atuais.has(m));
    if (entrou.length) console.log(`ranqueado: entrou ${entrou.join(', ')}`);
    if (saiu.length) console.log(`ranqueado: saiu ${saiu.join(', ')}`);
  }
  const agora = Date.now();
  // Os blocos que terminam dentro do período; o pesarPorIdade corta os dias mais velhos.
  const base = { season: [diasAtras(DIAS_PERIODO)], powerplay: ['true'] };
  const daFaixa = async (faixa, dimensoes, fatias = {}) =>
    diasDosBlocos(await consulta('map', [...dimensoes, 'season'], ['picks', 'winRate'], { ...base, trophyRangeGte: [String(faixa)], ...fatias }), agora);
  const doModo = await daFaixa(RANK, ['brawler', 'mode']);
  // A liga logo abaixo (Mítico, com o rank padrão) entra como fundo da cascata. A tabela
  // só filtra "dessa faixa pra cima", então o Mítico sai da diferença entre as duas.
  const comAbaixo = await daFaixa(RANK - 3, ['brawler', 'mode']);
  const doMapa = await daFaixa(RANK, ['brawler', 'mode', 'map'], { map: lista.map((m) => m.mapa) });

  // O efeito de cada patch sai do ranqueado inteiro e vale igual em todo mapa e no fundo.
  const patches = efeitoDosPatches(doModo, config.patches ?? [], agora);
  if (patches.size) {
    const efeitos = [...patches].map(([b, { efeito }]) => `${nomeBonito(b)} ${efeito > 0 ? '+' : ''}${(efeito * 100).toFixed(1)}`);
    console.log(`ranqueado: efeito dos patches, em pontos: ${efeitos.join(', ')}`);
  }
  const pesar = (linhas) => porBrawler(pesarPorIdade(linhas, agora, patches));
  const modos = [...new Set(lista.map((m) => m.modo))];
  const doModoX = (linhas, modo) => linhas.filter((r) => r.mode === modo);
  const geral = new Map(modos.map((modo) => [modo, pesar(doModoX(doModo, modo))]));
  const fundo = new Map(
    modos.map((modo) => [modo, somar(comVitorias(pesar(doModoX(comAbaixo, modo))), comVitorias(geral.get(modo)), -1)]),
  );
  const ranqueado = comVitorias(pesar(doModo));

  const fatiasPares = { season: [desde], trophyRangeGte: [String(RANK)] };
  const aliados = [];
  const confrontos = [];
  for (const modo of modos) {
    const mapas = lista.filter((m) => m.modo === modo).map((m) => m.mapa);
    juntar(aliados, await pares('brawlerAllies', 'ally', mapas, fatiasPares));
    juntar(confrontos, await pares('brawlerEnemies', 'enemy', mapas, fatiasPares));
  }

  const saida = lista.map(({ modo, mapa }) => {
    const m = processarMapa(
      modo,
      mapa,
      {
        brawlers: pesarPorIdade(doMapa.filter((r) => r.mode === modo && r.map === mapa), agora, patches),
        aliados: aliados.filter((r) => r.map === mapa),
        confrontos: confrontos.filter((r) => r.map === mapa),
      },
      {
        semConfrontos: false,
        margem: true,
        todosOsMapas: true,
        geral: geral.get(modo),
        cascata: {
          modo: comVitorias(geral.get(modo)),
          fundo: fundo.get(modo),
          parte: ranqueado,
          mapas: lista.filter((m) => m.modo === modo).length,
        },
      },
    );
    console.log(`ranqueado · ${mapa}: ${m.partidas != null ? `${m.partidas} partidas` : `${m.total} escolhas`}${m.estimada ? ' (lista estimada pelo modo)' : ''}`);
    return m;
  });
  // Counters e duplas usam os outros mapas e a tier list, então só saem com tudo pronto.
  const confrontosCascata = confrontosEmCascata(saida.map((m) => ({ modo: m.modo, linhas: m.bruto.confrontos, forca: m.bruto.forca })));
  const duplas = duplasPelaForca(saida.map((m) => m.bruto));
  const mapas = saida.map(({ bruto, ...m }, i) => {
    const lista = duplas[i].filter((d) => d.n >= MIN_PARTIDAS_DUPLA).map(({ nota, ...d }) => ({ ...d, wr: r4(d.wr), adj: r4(bruto.media + nota) }));
    // A tabela de confrontos do BTN mistura o troféu, onde dá pra pegar o mesmo brawler
    // dos dois lados. No ranqueado não dá, então o espelho sai.
    const efeitos = (nome) => (confrontosCascata[i].get(nome) ?? []).filter(([e]) => e !== nome);
    return {
      ...m,
      melhoresDuplas: lista.slice(0, 8),
      pioresDuplas: lista.slice(-5).reverse(),
      confrontos: Object.fromEntries(m.brawlers.map((b) => [b.nome, escolherConfrontos(efeitos(b.nome))])),
      // Os confrontos com amostra de todo brawler, não só dos da tier list: o modo Draft
      // soma contra os inimigos escolhidos, e qualquer um pode ser escolhido. Sem o corte
      // de amostra o arquivo dobrava pra quase nenhum ganho na chance (2026-10-20).
      tabela: Object.fromEntries([...confrontosCascata[i].keys()].map((nome) => [nome, tabelaDeConfrontos(efeitos(nome))])),
      // A força de todo brawler, não só de quem tem partidas pra tier list. Sem ela, no
      // Draft quem ficava de fora contava como mediano, e esses ganham 47%.
      forca: Object.fromEntries([...bruto.forca].map(([nome, delta]) => [nome, r4(delta)])),
    };
  });
  return { geradoEm: new Date().toISOString(), desde, dias: DIAS_PERIODO, meiaVida: MEIA_VIDA, rank: RANK, mapas };
}

// rotacao: Set 'modo|mapa' da API oficial, ou null se ela falhou.
async function gerarTrofeu(desde, rotacao) {
  const base = { powerplay: ['false'], trophyRangeGte: [String(FAIXA_TROFEU)] };

  // Modo e mapa valem troféu quando o site registra variação de troféu neles. eventId 0
  // são os mapas de Competition, que o site também esconde.
  const porMapa = (
    await consulta('map', ['mode', 'map'], ['picks', 'trophyChange', 'eventId'], { ...base, season: [diasAtras(DIAS_MAPA)] })
  ).filter((r) => r.trophyChange != null && Number(r.eventId) !== 0);
  const doModo = new Map();
  for (const r of porMapa) doModo.set(r.mode, (doModo.get(r.mode) ?? 0) + Number(r.picks));
  const modos = [...doModo].sort((a, b) => b[1] - a[1]).map(([modo]) => modo);
  if (!modos.length) throw new Error('nenhum modo com variação de troféu: o site mudou o formato?');
  const mapas = porMapa
    .filter((r) => Number(r.picks) >= MIN_PARTIDAS_MAPA)
    .map((r) => `${r.mode}|${r.map}`)
    .sort();

  // Mapa da rotação entra mesmo sem partidas suficientes: é o que dá pra jogar agora.
  // A página avisa quando tem poucos dados.
  const naRotacao = [...(rotacao ?? [])].filter((k) => modos.includes(k.split('|')[0]));
  const lista = [...new Set([...mapas, ...naRotacao])]
    .map((k) => {
      const [modo, mapa] = k.split('|');
      return { modo, mapa, rotacao: naRotacao.includes(k) };
    })
    .slice(0, LIMITE);
  console.log(`troféu: ${lista.length} mapas em ${modos.length} modos; na rotação: ${naRotacao.map((k) => k.split('|')[1]).join(', ') || 'nenhum'}`);
  const presentes = [...new Set(lista.map((m) => m.modo))];

  // Todos os mapas de uma vez, sem peso por idade; a posição só vale no Showdown.
  const linhas = await consulta('map', ['brawler', 'mode', 'map'], ['picks', 'winRate', 'trophyChange', 'rank'], { ...base, season: [desde] });
  const doModoTodo = new Map(presentes.map((modo) => [modo, somarPorBrawler(linhas.filter((r) => r.mode === modo))]));
  const trofeu = somarPorBrawler(linhas);
  const ehShowdown = (modo) => modo.endsWith('Showdown');

  // Duplas e counters do troféu são do modo inteiro, e não de cada mapa. Mapa a mapa,
  // com 162 mapas, eram uns 300 pedidos por dia; e a maioria dos mapas tem tão poucas
  // partidas que quase nenhuma dupla passava do mínimo. O ranqueado continua por mapa.
  const fatiasPares = { season: [desde], trophyRangeGte: [String(FAIXA_TROFEU)] };
  const aliados = new Map();
  const confrontos = new Map();
  for (const modo of presentes) {
    const fatias = { ...fatiasPares, mode: [modo] };
    aliados.set(modo, await consulta('brawlerAllies', ['brawler', 'ally'], ['picks', 'winRate'], fatias));
    // No Showdown os inimigos são a sala inteira; confronto direto mede pouco.
    if (!ehShowdown(modo)) confrontos.set(modo, await consulta('brawlerEnemies', ['brawler', 'enemy'], ['picks', 'winRate'], fatias));
  }

  const saida = lista.map(({ modo, mapa, rotacao }) => {
    const m = processarMapa(
      modo,
      mapa,
      {
        brawlers: linhas
          .filter((r) => r.mode === modo && r.map === mapa)
          .map((r) => (ehShowdown(modo) ? r : { ...r, rank: null })),
        aliados: aliados.get(modo),
        confrontos: confrontos.get(modo) ?? [],
      },
      {
        semConfrontos: ehShowdown(modo),
        geral: comTaxa(doModoTodo.get(modo)),
        // No troféu não há liga abaixo que sirva de fundo: a faixa já é o corte de 1.000 troféus.
        cascata: { modo: doModoTodo.get(modo), fundo: new Map(), parte: trofeu, mapas: lista.filter((m) => m.modo === modo).length },
      },
    );
    console.log(`troféu · ${modo} · ${mapa}: ${m.partidas != null ? `${m.partidas} partidas` : `${m.total} escolhas`}${rotacao ? ' (na rotação)' : ''}${m.estimada ? ' (lista estimada pelo modo)' : ''}`);
    return { ...m, rotacao };
  });

  return {
    geradoEm: new Date().toISOString(),
    desde,
    faixa: FAIXA_TROFEU,
    nicho: LIMITE_NICHO,
    modos: modos.filter((m) => presentes.includes(m)),
    mapas: saida,
  };
}

async function main() {
  // A parte que não foi pedida continua como estava. Arquivo do formato antigo não tem partes.
  const anterior = await readFile(new URL('dados.json', dir), 'utf8').then(JSON.parse).catch(() => null);
  const partes = { ...anterior?.partes };
  const rotacao = await rotacaoOficial().catch((e) => {
    console.warn(`rotação falhou, fica a da última vez: ${e.message}`);
    return null;
  });
  // Com o BTN fora, o site sai com as estatísticas da última vez e o clube atualizado.
  // Cada parte guarda a data em que foi gerada; é ela que a página mostra e que o
  // aviso de site parado confere (estado.json). Coleta que falha tenta de novo na
  // rodada seguinte.
  const coletar = (id) =>
    PARTE ? PARTE === id : !partes[id] || Date.now() - Date.parse(partes[id].geradoEm) > HORAS_ENTRE_COLETAS * 36e5;
  try {
    if (coletar('ranqueado') || coletar('trofeu')) {
      const desde = await inicioDosBlocos();
      if (coletar('ranqueado')) partes.ranqueado = await gerarRanqueado(desde, anterior?.partes?.ranqueado);
      if (coletar('trofeu')) partes.trofeu = await gerarTrofeu(desde, rotacao);
    }
  } catch (e) {
    if (!partes.ranqueado || !partes.trofeu) throw e;
    console.warn(`estatísticas falharam, ficam as da última vez: ${e.message}`);
  }
  // A rotação muda ao longo do dia, então a marca é refeita a cada rodada.
  if (rotacao) for (const m of partes.trofeu.mapas) m.rotacao = rotacao.has(`${m.modo}|${m.mapa}`);

  // Clube que falha não derruba a geração: vale o da última vez.
  const doClube = CLUBE
    ? await clube(CLUBE).catch((e) => {
        console.warn(`clube #${CLUBE} falhou: ${e.message}`);
        return anterior?.clube ?? null;
      })
    : null;

  // Alcance, vida e recarga de todo brawler que aparece nos dados, pra leitura da
  // partida no Draft. Vêm do wiki uma vez por semana; sem eles a tabela sai com traços.
  const nomes = [...new Set(Object.values(partes).flatMap((p) =>
    p.mapas.flatMap((m) => [...m.brawlers.map((b) => b.nome), ...Object.keys(m.forca ?? {})])))].sort();
  const atributos = await atributosDaSemana(new URL('atributos.json', dir), nomes);

  const dados = {
    geradoEm: new Date().toISOString(),
    blocos: BLOCOS,
    minPartidas: MIN_PARTIDAS,
    clube: doClube,
    atributos: atributos && { geradoEm: atributos.geradoEm, brawlers: atributos.brawlers },
    partes,
  };
  const json = JSON.stringify(dados);
  await writeFile(new URL('dados.json', dir), json);
  const modelo = await readFile(new URL('modelo.html', dir), 'utf8');
  await mkdir(new URL('site/', dir), { recursive: true });
  await writeFile(new URL('site/index.html', dir), modelo.replace('/*__DADOS__*/null', json));
  const estatisticasEm = Object.values(partes).map((p) => p.geradoEm).sort()[0];
  await writeFile(new URL('site/estado.json', dir), JSON.stringify({ publicadoEm: dados.geradoEm, estatisticasEm }));
  console.log(`ok: site/index.html gerado (${(json.length / 1e6).toFixed(2)} MB de dados, ${doClube?.membros.length ?? 0} perfis do clube, ${pedidosBtn} pedidos ao BTN)`);
}

main().catch((e) => {
  console.error('falhou:', e.message);
  process.exit(1);
});
