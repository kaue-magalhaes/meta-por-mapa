// Puxa do Brawl Time Ninja o meta por mapa e gera site/index.html.
// Duas partes: o ranqueado e os mapas que valem troféu, as duas descobertas na
// hora, com os mapas da rotação marcados. Os perfis do clube vão junto, pra cada
// membro escolher o próprio nome na página e ver quem tem no máximo.
//
// Uso: node atualizar.mjs [--parte ranqueado|trofeu] [--rank 16] [--blocos 2] [--clube 290J9JL8] [--limite N]
//   --parte   gera só uma parte; a outra continua como estava no dados.json
//   --rank    faixa mínima do ranqueado (10 = Diamante I, 13 = Mítico I, 16 = Lendário I, 19 = Mestre I)
//   --blocos  quantos blocos de duas semanas juntar (o site agrupa os dados assim)
//   --clube   tag do clube cujos membros aparecem no seletor "Você"
//   --limite  processa só os N primeiros mapas de cada parte, pra testar rápido
// Sem argumento, vale o que está em config.json e as duas partes são geradas.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { nomeBonito, ajustada, duplasDeTimes, resumirConfrontos, especialistas, forcaNaCascata, semOMapa, somar, mediaDe, pesarPorIdade, efeitoDosPatches, MIN_CONFRONTO, LIMITE_NICHO, PESO_FUNDO, DIAS_PERIODO, MEIA_VIDA, FOLGA_MARGEM } from './calculo.mjs';

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
// Mapa de troféu entra com pelo menos isso de partidas nos últimos DIAS_MAPA dias,
// contando só os dias em que ele valeu troféu. Corta mapa que saiu do jogo, evento
// que durou um fim de semana e mapa que só passou no Jogo Livre.
const MIN_PARTIDAS_MAPA = 3000;
const DIAS_MAPA = 14;
// Rotação: entre os mapas que valeram troféu nos últimos MINUTOS_ROTACAO, em cada modo
// conta o que tem a partida mais recente, e também os que tiveram partida até
// FOLGA_ROTACAO minutos antes dele. Assim modo com pouca gente rastreada ainda é
// marcado, e o mapa que acabou de sair fica de fora.
const MINUTOS_ROTACAO = 60;
const FOLGA_ROTACAO = 20;
// Mapas consultados ao mesmo tempo (cada um faz até três consultas). Com 3, o
// cache do site estourou a memória no meio da geração completa.
const PARALELO = 2;

// No ranqueado, a vitória de cada brawler pesa as partidas pela idade (pesarPorIdade).
// Duplas e counters continuam com os blocos juntos. O gerarRanqueado acrescenta o
// efeito dos patches da lista do config.json.
const RANQUEADO = { id: 'ranqueado', powerplay: '1', faixa: RANK, porIdade: true };
// A liga logo abaixo (Mítico, com o rank padrão), usada só como fundo da cascata.
const FUNDO = { ...RANQUEADO, faixa: RANK - 3, ate: RANK };
const TROFEU = { id: 'trofeu', powerplay: '0', faixa: FAIXA_TROFEU };

const CUBE = 'https://cube.brawltime.ninja/cubejs-api/v1/load';

async function token() {
  const r = await fetch('https://brawltime.ninja/api/auth.getToken', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  const texto = await r.text();
  // Quando o site barra o acesso (proteção contra robôs), a resposta é uma página HTML.
  if (!r.ok || texto.startsWith('<')) {
    throw new Error(`o site recusou o pedido de token (HTTP ${r.status}, ${r.headers.get('server') ?? '?'}): ${texto.slice(0, 120).replace(/\s+/g, ' ')}`);
  }
  return JSON.parse(texto).result.data.json.token;
}

async function consulta(tok, query) {
  const url = `${CUBE}?queryType=multi&query=${encodeURIComponent(JSON.stringify({ ...query, responseFormat: 'compact' }))}`;
  // A consulta de mapas por dia leva uns 15 segundos; 30 esperas dão 1 minuto.
  let esperas = 0;
  let tentativa = 0;
  while (esperas < 30 && tentativa < 5) {
    const r = await fetch(url, { headers: { Authorization: tok } });
    const j = await r.json();
    // O cube responde "Continue wait" enquanto a consulta ainda está rodando.
    if (j.error === 'Continue wait') {
      esperas++;
      await new Promise((ok) => setTimeout(ok, 2000));
      continue;
    }
    // Com carga alta o cache do site estoura a memória; esperar costuma resolver.
    if (/maxmemory/.test(j.error ?? '')) {
      await new Promise((ok) => setTimeout(ok, 10000 * ++tentativa));
      continue;
    }
    if (j.error) throw new Error(j.error);
    const d = j.results[0].data;
    const nomes = d.members.map((m) => m.replace(/^\w+\.|_measure|_dimension/g, ''));
    return d.dataset.map((linha) => Object.fromEntries(nomes.map((n, i) => [n, linha[i]])));
  }
  throw new Error('o site demorou demais pra responder');
}

const filtro = (member, operator, ...values) => ({ member, operator, values: values.map(String) });
const r4 = (x) => Math.round(x * 1e4) / 1e4;

// "No máximo" = nível 11 com pelo menos um gadget, uma star power e a hipercarga.
// Engrenagem fica de fora porque é barata de comprar.
async function perfil(tag) {
  const url = `https://brawltime.ninja/api/player.byTag?input=${encodeURIComponent(JSON.stringify({ json: tag }))}`;
  const p = (await (await fetch(url)).json()).result?.data?.json;
  if (!p) throw new Error(`perfil #${tag} não encontrado`);
  const brawlers = Array.isArray(p.brawlers) ? p.brawlers : Object.values(p.brawlers);
  const tem = (b, k) => (b[k] ?? []).length > 0;
  return {
    tag,
    nome: p.name,
    maximizados: brawlers
      .filter((b) => b.power === 11 && tem(b, 'gadgets') && tem(b, 'starPowers') && tem(b, 'hyperCharges'))
      .map((b) => nomeBonito(b.name))
      .sort(),
  };
}

// Membros do clube com o que cada um tem no máximo. Um perfil por vez: são poucos,
// e cada consulta faz o site buscar o perfil na API oficial.
async function clube(tag) {
  const url = `https://brawltime.ninja/api/club.byTag?input=${encodeURIComponent(JSON.stringify({ json: tag }))}`;
  const c = (await (await fetch(url)).json()).result?.data?.json;
  if (!c) throw new Error(`clube #${tag} não encontrado`);
  const membros = [];
  for (const m of c.members) {
    const t = m.tag.replace(/^#/, '');
    // Um perfil que falha não derruba a geração: o membro fica de fora até a próxima.
    try {
      membros.push(await perfil(t));
    } catch (e) {
      console.warn(`perfil #${t} falhou: ${e.message}`);
    }
  }
  membros.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return { tag, nome: c.name, membros };
}

// Roda fn em cada item, no máximo `limite` ao mesmo tempo, mantendo a ordem.
async function emLotes(itens, limite, fn) {
  const saida = new Array(itens.length);
  let proximo = 0;
  async function trabalhador() {
    while (proximo < itens.length) {
      const i = proximo++;
      saida[i] = await fn(itens[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador));
  return saida;
}

// O site agrupa as partidas em blocos de duas semanas; devolve o rótulo do mais antigo usado.
async function inicioDosBlocos(tok) {
  const blocos = (
    await consulta(tok, {
      dimensions: ['map.season_dimension'],
      filters: [filtro('map.season_dimension', 'gte', new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10))],
      order: { 'map.season_dimension': 'desc' },
    })
  ).map((r) => r.season.slice(0, 10));
  return blocos[Math.min(BLOCOS, blocos.length) - 1];
}

const filtrosBase = (parte, desde) => [
  filtro('battle.season_dimension', 'gte', desde),
  filtro('battle.powerplay_dimension', 'equals', parte.powerplay),
  filtro('battle.trophyRange_dimension', 'gte', parte.faixa),
  ...(parte.ate ? [filtro('battle.trophyRange_dimension', 'lt', parte.ate)] : []),
];

// Partidas e vitória de cada brawler, com os filtros da parte e os de `filtros`.
// Com peso por idade, a consulta vem dia a dia dos últimos DIAS_PERIODO dias. O site
// rotula o bloco pela data do fim, e a folga de um bloco a mais garante que o bloco
// do dia mais velho venha inteiro; o corte exato fica com pesarPorIdade.
async function brawlersDa(tok, parte, desde, filtros, medidas = []) {
  if (!parte.porIdade) {
    return consulta(tok, {
      measures: ['battle.picks_measure', 'battle.winRate_measure', ...medidas],
      dimensions: ['battle.brawler_dimension'],
      filters: [...filtrosBase(parte, desde), ...filtros],
      limit: 50000,
    });
  }
  if (medidas.length) throw new Error('o peso por idade só junta partidas e vitória');
  return pesarPorIdade(await diasDa(tok, parte, filtros), Date.now(), parte.patches);
}

// Partidas e vitória de cada brawler, dia a dia, sem peso.
function diasDa(tok, parte, filtros) {
  const inicio = new Date(Date.now() - (DIAS_PERIODO + 14) * 864e5).toISOString().slice(0, 10);
  return consulta(tok, {
    measures: ['battle.picks_measure', 'battle.winRate_measure'],
    dimensions: ['battle.brawler_dimension', 'battle.day_dimension'],
    filters: [...filtrosBase(parte, inicio), ...filtros],
    limit: 50000,
  });
}

const porBrawler = (linhas) => new Map(linhas.map((r) => [nomeBonito(r.brawler), { n: Number(r.picks), wr: Number(r.winRate) }]));

// Vitória de cada brawler no modo inteiro, com os filtros da parte. Base dos especialistas.
// Sem modo, é a parte inteira.
async function porModo(tok, parte, desde, modo) {
  return porBrawler(await brawlersDa(tok, parte, desde, modo ? [filtro('battle.mode_dimension', 'equals', modo)] : []));
}

const comVitorias = (m) => new Map([...m].map(([nome, { n, wr }]) => [nome, { n, v: n * wr }]));

// extras: { medidas: medidas a mais na consulta de brawlers, semConfrontos, margem, geral: Map do porModo,
//   cascata: { modo, fundo, parte } em Map nome -> { n, v } e mapas (quantos o modo tem) }
async function processarMapa(tok, parte, desde, modo, mapa, extras) {
  const esteMapa = [filtro('battle.mode_dimension', 'equals', modo), filtro('battle.map_dimension', 'equals', mapa)];
  const filtros = [...filtrosBase(parte, desde), ...esteMapa];
  const [brawlers, times, confrontos] = await Promise.all([
    brawlersDa(tok, parte, desde, esteMapa, extras.medidas),
    consulta(tok, {
      measures: ['battle.picks_measure', 'battle.winRate_measure'],
      dimensions: ['battle.team_dimension'],
      filters: filtros,
      limit: 50000,
    }),
    // Essa tabela não separa ranqueado de partida normal. Na faixa usada, a
    // mistura só acontece em mapa que está nas duas listas.
    extras.semConfrontos
      ? []
      : consulta(tok, {
          measures: ['brawlerEnemies.picks_measure', 'brawlerEnemies.winRate_measure'],
          dimensions: ['brawlerEnemies.brawler_dimension', 'brawlerEnemies.enemy_dimension'],
          filters: [
            filtro('brawlerEnemies.season_dimension', 'gte', desde),
            filtro('brawlerEnemies.trophyRange_dimension', 'gte', parte.faixa),
            filtro('brawlerEnemies.mode_dimension', 'equals', modo),
            filtro('brawlerEnemies.map_dimension', 'equals', mapa),
          ],
          limit: 50000,
        }),
  ]);

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

  const listaDuplas = Object.entries(duplasDeTimes(times))
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
    media: r4(media),
    ...(estimada && { estimada }),
    brawlers: principais.map(enxuto),
    poucaAmostra: lista
      .filter((r) => r.n >= 20 && r.n < MIN_PARTIDAS && r.wr >= media + 0.06)
      .sort((a, b) => b.wr - a.wr)
      .slice(0, 6)
      .map(enxuto),
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
const HORAS_RANQUEADO = 48;
const FOLGA_RANQUEADO = 6;
const ORDEM_RANQUEADO = ['gemGrab', 'brawlBall', 'heist', 'bounty', 'knockout', 'hotZone'];

async function mapasDoRanqueado(tok) {
  const desde = new Date(Date.now() - HORAS_RANQUEADO * 36e5).toISOString().slice(0, 19);
  const linhas = (
    await consulta(tok, {
      measures: ['battle.picks_measure', 'battle.eventId_measure', 'battle.timestamp_measure'],
      dimensions: ['battle.mode_dimension', 'battle.map_dimension'],
      filters: [
        filtro('battle.powerplay_dimension', 'equals', '1'),
        filtro('battle.timestamp_dimension', 'afterDate', desde),
      ],
      limit: 5000,
    })
  ).filter((r) => Number(r.eventId) !== 0);
  const ultima = Math.max(...linhas.map((r) => Date.parse(r.timestamp)));
  const ativos = linhas.filter((r) => Date.parse(r.timestamp) >= ultima - FOLGA_RANQUEADO * 36e5);
  if (ativos.length < 10) throw new Error(`só ${ativos.length} mapas no ranqueado: o site mudou o formato?`);
  const pos = (modo) => (ORDEM_RANQUEADO.includes(modo) ? ORDEM_RANQUEADO.indexOf(modo) : ORDEM_RANQUEADO.length);
  return ativos
    .map((r) => ({ modo: r.mode, mapa: r.map }))
    .sort((a, b) => pos(a.modo) - pos(b.modo) || a.modo.localeCompare(b.modo) || a.mapa.localeCompare(b.mapa));
}

async function gerarRanqueado(tok, desde, anterior) {
  const lista = (await mapasDoRanqueado(tok)).slice(0, LIMITE);
  console.log(`ranqueado: ${lista.length} mapas`);
  // Troca na lista fica no log, pra dar pra conferir depois se foi temporada nova ou erro.
  if (anterior?.mapas && LIMITE === Infinity) {
    const antes = new Set(anterior.mapas.map((m) => m.mapa));
    const agora = new Set(lista.map((m) => m.mapa));
    const entrou = [...agora].filter((m) => !antes.has(m));
    const saiu = [...antes].filter((m) => !agora.has(m));
    if (entrou.length) console.log(`ranqueado: entrou ${entrou.join(', ')}`);
    if (saiu.length) console.log(`ranqueado: saiu ${saiu.join(', ')}`);
  }
  // O efeito de cada patch sai do ranqueado inteiro e vale igual em todo mapa e no fundo.
  const doRanqueado = await diasDa(tok, RANQUEADO, []);
  const patches = efeitoDosPatches(doRanqueado, config.patches ?? [], Date.now());
  if (patches.size) {
    const efeitos = [...patches].map(([b, { efeito }]) => `${nomeBonito(b)} ${efeito > 0 ? '+' : ''}${(efeito * 100).toFixed(1)}`);
    console.log(`ranqueado: efeito dos patches, em pontos: ${efeitos.join(', ')}`);
  }
  const parte = { ...RANQUEADO, patches };
  const modos = [...new Set(lista.map((m) => m.modo))];
  const geral = new Map(await emLotes(modos, PARALELO, async (modo) => [modo, await porModo(tok, parte, desde, modo)]));
  const fundo = new Map(await emLotes(modos, PARALELO, async (modo) => [modo, comVitorias(await porModo(tok, { ...FUNDO, patches }, desde, modo))]));
  const ranqueado = comVitorias(porBrawler(pesarPorIdade(doRanqueado, Date.now(), patches)));
  const saida = await emLotes(lista, PARALELO, async ({ modo, mapa }) => {
    const m = await processarMapa(tok, parte, desde, modo, mapa, {
      medidas: [],
      semConfrontos: false,
      margem: true,
      geral: geral.get(modo),
      cascata: {
        modo: comVitorias(geral.get(modo)),
        fundo: fundo.get(modo),
        parte: ranqueado,
        mapas: lista.filter((m) => m.modo === modo).length,
      },
    });
    console.log(`ranqueado · ${mapa}: ${m.total} partidas${m.estimada ? ' (lista estimada pelo modo)' : ''}`);
    return m;
  });
  return { geradoEm: new Date().toISOString(), desde, dias: DIAS_PERIODO, meiaVida: MEIA_VIDA, rank: RANK, mapas: saida };
}

async function gerarTrofeu(tok, desde) {
  const base = filtrosBase(TROFEU, desde);

  // Modo vale troféu quando o site registra variação de troféu nele.
  const modos = (
    await consulta(tok, {
      measures: ['battle.picks_measure', 'battle.trophyChange_measure', 'battle.rank_measure'],
      dimensions: ['battle.mode_dimension'],
      filters: base,
      order: { 'battle.picks_measure': 'desc' },
    })
  )
    .filter((r) => r.trophyChange != null)
    .map((r) => ({ modo: r.mode, temPosicao: r.rank != null }));
  if (!modos.length) throw new Error('nenhum modo com variação de troféu: o site mudou o formato?');
  const infoModo = new Map(modos.map((m) => [m.modo, m]));

  // O site grava com powerplay 0 também as partidas sem troféu (Jogo Livre, eventos).
  // Não há campo que separe partida a partida, mas num dia sem troféu nenhum a média
  // de troféus do mapa vem vazia. Por isso a conta é por dia.
  const recente = new Date(Date.now() - DIAS_MAPA * 864e5).toISOString().slice(0, 19);
  const porDia = await consulta(tok, {
    measures: ['battle.picks_measure', 'battle.eventId_measure', 'battle.trophyChange_measure'],
    dimensions: ['battle.mode_dimension', 'battle.map_dimension', 'battle.day_dimension'],
    filters: [
      ...base,
      filtro('battle.timestamp_dimension', 'afterDate', recente),
      filtro('battle.mode_dimension', 'equals', ...modos.map((m) => m.modo)),
    ],
    limit: 50000,
  });
  const comTrofeu = new Map();
  for (const r of porDia) {
    // eventId 0 são os mapas de Competition, que o site também esconde.
    if (r.trophyChange == null || Number(r.eventId) === 0) continue;
    const k = `${r.mode}|${r.map}`;
    comTrofeu.set(k, (comTrofeu.get(k) ?? 0) + Number(r.picks));
  }
  const mapas = [...comTrofeu]
    .filter(([, n]) => n >= MIN_PARTIDAS_MAPA)
    .map(([k]) => k)
    .sort();

  const ultimaHora = new Date(Date.now() - MINUTOS_ROTACAO * 6e4).toISOString().slice(0, 19);
  const recentes = (
    await consulta(tok, {
      measures: ['battle.eventId_measure', 'battle.trophyChange_measure', 'battle.timestamp_measure'],
      dimensions: ['battle.mode_dimension', 'battle.map_dimension'],
      filters: [
        filtro('battle.powerplay_dimension', 'equals', '0'),
        filtro('battle.timestamp_dimension', 'afterDate', ultimaHora),
        filtro('battle.mode_dimension', 'equals', ...modos.map((m) => m.modo)),
      ],
      limit: 5000,
    })
  ).filter((r) => r.trophyChange != null && Number(r.eventId) !== 0);
  const ultimaDoModo = new Map();
  for (const r of recentes) {
    const t = Date.parse(r.timestamp);
    if (t > (ultimaDoModo.get(r.mode) ?? 0)) ultimaDoModo.set(r.mode, t);
  }
  const naRotacao = new Set(
    recentes
      .filter((r) => Date.parse(r.timestamp) >= ultimaDoModo.get(r.mode) - FOLGA_ROTACAO * 6e4)
      .map((r) => `${r.mode}|${r.map}`),
  );

  // Mapa da rotação entra mesmo sem partidas suficientes: é o que dá pra jogar agora.
  // A página avisa quando tem poucos dados.
  const lista = [...new Set([...mapas, ...naRotacao])]
    .map((k) => {
      const [modo, mapa] = k.split('|');
      return { modo, mapa, rotacao: naRotacao.has(k) };
    })
    .slice(0, LIMITE);
  console.log(`troféu: ${lista.length} mapas em ${modos.length} modos; na rotação: ${[...naRotacao].map((k) => k.split('|')[1]).join(', ') || 'nenhum'}`);
  const presentes = [...new Set(lista.map((m) => m.modo))];
  const geral = new Map(await emLotes(presentes, PARALELO, async (modo) => [modo, await porModo(tok, TROFEU, desde, modo)]));
  const trofeu = comVitorias(await porModo(tok, TROFEU, desde));

  const saida = await emLotes(lista, PARALELO, async ({ modo, mapa, rotacao }) => {
    const m = await processarMapa(tok, TROFEU, desde, modo, mapa, {
      medidas: ['battle.trophyChange_measure', ...(infoModo.get(modo).temPosicao ? ['battle.rank_measure'] : [])],
      // No Showdown os inimigos são a sala inteira; confronto direto mede pouco.
      semConfrontos: modo.endsWith('Showdown'),
      geral: geral.get(modo),
      // No troféu não há liga abaixo que sirva de fundo: a faixa já é o corte de 1.000 troféus.
      cascata: { modo: comVitorias(geral.get(modo)), fundo: new Map(), parte: trofeu, mapas: lista.filter((m) => m.modo === modo).length },
    });
    console.log(`troféu · ${modo} · ${mapa}: ${m.total} partidas${rotacao ? ' (na rotação)' : ''}${m.estimada ? ' (lista estimada pelo modo)' : ''}`);
    return { ...m, rotacao };
  });

  return {
    geradoEm: new Date().toISOString(),
    desde,
    faixa: FAIXA_TROFEU,
    nicho: LIMITE_NICHO,
    modos: modos.map((m) => m.modo).filter((m) => presentes.includes(m)),
    mapas: saida,
  };
}

async function main() {
  const tok = await token();
  const desde = await inicioDosBlocos(tok);
  // A parte que não foi pedida continua como estava. Arquivo do formato antigo não tem partes.
  const anterior = await readFile(new URL('dados.json', dir), 'utf8').then(JSON.parse).catch(() => null);
  const partes = { ...anterior?.partes };
  if (PARTE !== 'trofeu') partes.ranqueado = await gerarRanqueado(tok, desde, anterior?.partes?.ranqueado);
  if (PARTE !== 'ranqueado') partes.trofeu = await gerarTrofeu(tok, desde);

  // Clube que falha não derruba a geração: vale o da última vez.
  const doClube = CLUBE
    ? await clube(CLUBE).catch((e) => {
        console.warn(`clube #${CLUBE} falhou: ${e.message}`);
        return anterior?.clube ?? null;
      })
    : null;

  const dados = {
    geradoEm: new Date().toISOString(),
    blocos: BLOCOS,
    minPartidas: MIN_PARTIDAS,
    clube: doClube,
    partes,
  };
  const json = JSON.stringify(dados);
  await writeFile(new URL('dados.json', dir), json);
  const modelo = await readFile(new URL('modelo.html', dir), 'utf8');
  await mkdir(new URL('site/', dir), { recursive: true });
  await writeFile(new URL('site/index.html', dir), modelo.replace('/*__DADOS__*/null', json));
  console.log(`ok: site/index.html gerado (${(json.length / 1e6).toFixed(2)} MB de dados, ${doClube?.membros.length ?? 0} perfis do clube)`);
}

main().catch((e) => {
  console.error('falhou:', e.message);
  process.exit(1);
});
