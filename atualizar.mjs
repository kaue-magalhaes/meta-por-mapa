// Puxa do Brawl Time Ninja o meta por mapa e gera site/index.html.
// Duas partes: o ranqueado e os mapas que valem troféu, as duas descobertas na
// hora, com os mapas da rotação marcados. O perfil de quem usa a página vem da Worker
// em worker/, buscado pela tag na hora; o endereço dela vai junto nos dados.
//
// Este arquivo só fala com o mundo: argumentos, pedidos, arquivos, relógio e log. As
// contas que transformam as linhas do BTN em cada parte do site moram no montagem.mjs,
// que tem teste; aqui ficam os pedidos e a ordem em que eles saem.
//
// Roda de hora em hora, mas as estatísticas do BTN só são coletadas uma vez por dia,
// escolha nossa pra pesar pouco no site (as regras do dono estão em API_BTN). Nas outras
// rodadas mudam só a rotação, que vem
// da API oficial, e os mapas da aba Especial, num pedido pequeno ao BTN.
//
// Uso: node atualizar.mjs [--parte ranqueado|trofeu] [--rank 16] [--blocos 2] [--limite N] [--so-pagina]
//   --so-pagina  só refaz site/index.html com o dados.json que já existe, sem pedido ao BTN
//                (só baixa nome ou imagem do jogo que ainda falte, ver imagens.mjs)
//   --parte   coleta essa parte agora, mesmo com a coleta do dia feita; a outra fica como está
//   --rank    faixa mínima do ranqueado (10 = Diamante I, 13 = Mítico I, 16 = Lendário I, 19 = Mestre I)
//   --blocos  quantos blocos de duas semanas juntar (o site agrupa os dados assim)
//   --limite  processa só os N primeiros mapas de cada parte, pra testar rápido
// Sem argumento, vale o que está em config.json e as duas partes são geradas.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { nomeBonito, gruposDeMapas, DIAS_PERIODO, especiaisNoAr } from './calculo.mjs';
import { atributosDaSemana } from './wiki.mjs';
import { atualizarNomesEImagens } from './imagens.mjs';
import { compactarTabela } from './draft.mjs';
import { separarRotacao, versaoDe, versaoEm, montarEstado, listaDoMaximo, enderecoDaWorker } from './publicacao.mjs';
import { MIN_PARTIDAS, FAIXA_TROFEU, DIAS_MAPA, ORDEM_RANQUEADO, ehShowdown, deveColetar, mapasDoRanqueado, montarRanqueado, mapasDoTrofeu, montarTrofeu } from './montagem.mjs';

const dir = new URL('.', import.meta.url);
const config = JSON.parse(await readFile(new URL('config.json', dir), 'utf8'));
const arg = (nome) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : config[nome];
};
const RANK = Number(arg('rank') ?? 16);
const BLOCOS = Number(arg('blocos') ?? 2);
const PARTE = arg('parte');
const LIMITE = Number(arg('limite') ?? Infinity);
if (PARTE && !['ranqueado', 'trofeu'].includes(PARTE)) {
  console.error('--parte aceita ranqueado ou trofeu');
  process.exit(1);
}

// Desde 21/10/2026 o BTN barra quem não tem token; o nosso veio em 27/10, por DM ao
// schneefux, dono do site, no Discord dele. As três regras dele, na DM: User-Agent com o
// nome do app e um contato; pedidos espalhados ("a few requests every few minutes instead
// of ~500 requests in a short timespan"); e pedir do mesmo jeito que o site pede, porque
// resposta que vem do cache (cabeçalho com HIT) sai quase de graça pra ele. Ele não pediu
// uma vez por dia: isso é escolha nossa. Usamos só as tabelas já somadas, que vêm em blocos
// de duas semanas; a tabela de partidas, usada até 21/10, é lenta. Uma coleta faz uns 55
// pedidos, um a cada INTERVALO. Fora dela sai um pedido por hora, o dos mapas da aba
// Especial (desde 07/11).
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
    // Falha de rede não traz status, e o "fetch failed" sozinho não dizia qual pedido caiu
    // (22/11, no 7º pedido da coleta). Tenta de novo como no site ocupado.
    let r;
    let texto;
    try {
      r = await fetch(url, { headers: { 'User-Agent': AGENTE, Authorization: `Bearer ${tokenBtn}` } });
      texto = await r.text();
    } catch (e) {
      if (tentativa < 3) {
        console.warn(`${procedimento}: falha de rede (${e.cause?.code ?? e.cause?.message ?? e.message}), tentando de novo`);
        await esperar(60_000 * tentativa);
        continue;
      }
      throw new Error(`${procedimento}: falha de rede (${e.cause?.code ?? e.cause?.message ?? e.message}), pedido ${JSON.stringify(entrada?.query?.cubeId ?? '')} ${JSON.stringify(entrada?.query?.dimensionsIds ?? [])}`);
    }
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

// A rotação vem da API oficial da Supercell, e não do BTN. A chave é criada em
// developer.brawlstars.com e fica presa a um IP. Até 22/11 era o IP de casa, que muda
// sem aviso e derrubava a rotação; agora o pedido passa pelo proxy da RoyaleAPI, como o
// da Worker (worker/), e a chave leva o IP fixo dele, 45.79.218.79.
const CHAVE_OFICIAL = join(homedir(), '.config/brawlstars-api/token');
const API_OFICIAL = 'https://bsproxy.royaleapi.dev/v1';

async function oficial(caminho) {
  const chave = (await readFile(CHAVE_OFICIAL, 'utf8')).trim();
  const r = await fetch(`${API_OFICIAL}${caminho}`, { headers: { authorization: `Bearer ${chave}` } });
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`API oficial recusou ${caminho} (HTTP ${r.status}): ${d?.reason ?? ''} ${d?.message ?? ''}`.trim());
  return d;
}

// Mapas da rotação do troféu agora, como 'modo|mapa'. Vem da API oficial, que não
// gasta pedido do BTN e por isso é consultada de hora em hora.
async function rotacaoOficial() {
  const eventos = await oficial('/events/rotation');
  return new Set(eventos.map((e) => `${e.event.mode}|${e.event.map}`));
}

// Mapas da aba Especial do jogo agora, como 'modo|mapa'. A API oficial não lista essa aba
// (em 06/11, o Mega Showdown em Duplas no Quadrant Clash); o BTN tem as partidas. Um pedido
// só, com o horário da última partida de cada mapa. daApi: Set 'modo|mapa' da API oficial.
// Até 09/11 entrava tudo o que o BTN mostrava jogado, e a lista ganhava mapas do Ranqueado
// e da rotação que já tinha saído.
async function especiaisDoTrofeu(daApi) {
  const linhas = await consulta('map', ['mode', 'map'], ['picks', 'eventId', 'timestamp'], { season: [diasAtras(2)], powerplay: ['false'] }, 'timestamp');
  const fora = new Set([...ORDEM_RANQUEADO, ...[...daApi].map((k) => k.split('|')[0])]);
  return especiaisNoAr(linhas, fora);
}

// O site agrupa as partidas em blocos de duas semanas; devolve o rótulo do mais antigo usado.
async function inicioDosBlocos() {
  const blocos = (await consulta('map', ['season'], ['picks'], { season: [diasAtras(90)] })).map((r) => r.season.slice(0, 10));
  const recentes = [...new Set(blocos)].sort().reverse();
  return recentes[Math.min(BLOCOS, recentes.length) - 1];
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

// O efeito de cada patch fica no log, pra conferir o chute contra a medida depois.
function logPatches(parte, patches) {
  if (!patches.size) return;
  const pontos = (x) => `${x > 0 ? '+' : ''}${(x * 100).toFixed(1)}`;
  const efeitos = [...patches].map(([b, lista]) => `${nomeBonito(b)} ${lista.map((p) => `${pontos(p.efeito)} (${p.dia.slice(8)}/${p.dia.slice(5, 7)})`).join(' ')}`);
  console.log(`${parte}: efeito dos patches, em pontos: ${efeitos.join(', ')}`);
}

// Uma linha de log por mapa: partidas (ou escolhas, no modo sem tamanho de time) e os avisos.
function logMapa(rotulo, m) {
  console.log(`${rotulo}: ${m.partidas != null ? `${m.partidas} partidas` : `${m.total} escolhas`}${m.rotacao ? ' (na rotação)' : ''}${m.estimada ? ' (lista estimada pelo modo)' : ''}`);
}

// O troféu tem uns 190 mapas, e com os blocos de seis semanas a consulta de todos de uma
// vez passa das 50 mil linhas. Cada mapa dá umas 500 (120 brawlers em 4 blocos), então
// vão 80 mapas por pedido; grupo que ainda bater o limite é partido ao meio.
const MAPAS_POR_PEDIDO = 80;

async function porGruposDeMapas(nomes, pedir) {
  const linhas = [];
  const buscar = async (grupo) => {
    const parte = await pedir(grupo);
    if (parte.length < LIMITE_LINHAS) return juntar(linhas, parte);
    if (grupo.length === 1) throw new Error(`${grupo[0]}: um mapa só bateu o limite de ${LIMITE_LINHAS} linhas`);
    const meio = Math.ceil(grupo.length / 2);
    await buscar(grupo.slice(0, meio));
    await buscar(grupo.slice(meio));
  };
  for (const grupo of gruposDeMapas(nomes, MAPAS_POR_PEDIDO)) await buscar(grupo);
  return linhas;
}

async function gerarRanqueado(desde, anterior) {
  const lista = mapasDoRanqueado(
    await consulta('map', ['mode', 'map'], ['picks', 'eventId', 'timestamp'], { season: [diasAtras(14)], powerplay: ['true'] }, 'timestamp'),
  ).slice(0, LIMITE);
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
  const daFaixa = (faixa, dimensoes, fatias = {}) =>
    consulta('map', [...dimensoes, 'season'], ['picks', 'winRate'], { ...base, trophyRangeGte: [String(faixa)], ...fatias });
  const doModo = await daFaixa(RANK, ['brawler', 'mode']);
  const comAbaixo = await daFaixa(RANK - 3, ['brawler', 'mode']);
  const doMapa = await daFaixa(RANK, ['brawler', 'mode', 'map'], { map: lista.map((m) => m.mapa) });

  const fatiasPares = { season: [desde], trophyRangeGte: [String(RANK)] };
  const aliados = [];
  const confrontos = [];
  for (const modo of new Set(lista.map((m) => m.modo))) {
    const mapas = lista.filter((m) => m.modo === modo).map((m) => m.mapa);
    juntar(aliados, await pares('brawlerAllies', 'ally', mapas, fatiasPares));
    juntar(confrontos, await pares('brawlerEnemies', 'enemy', mapas, fatiasPares));
  }

  const { parte, patches } = montarRanqueado(
    { lista, doModo, comAbaixo, doMapa, aliados, confrontos },
    { agora, patches: config.patches ?? [], desde, rank: RANK },
  );
  logPatches('ranqueado', patches);
  for (const m of parte.mapas) logMapa(`ranqueado · ${m.mapa}`, m);
  return { geradoEm: new Date().toISOString(), ...parte };
}

// rotacao: Set 'modo|mapa' da API oficial e da aba Especial, ou null se a API falhou.
async function gerarTrofeu(desde, rotacao) {
  const base = { powerplay: ['false'], trophyRangeGte: [String(FAIXA_TROFEU)] };
  const { lista, modos, naRotacao } = mapasDoTrofeu(
    await consulta('map', ['mode', 'map'], ['picks', 'trophyChange', 'eventId'], { ...base, season: [diasAtras(DIAS_MAPA)] }),
    rotacao,
    LIMITE,
  );
  console.log(`troféu: ${lista.length} mapas em ${modos.length} modos; na rotação: ${naRotacao.map((k) => k.split('|')[1]).join(', ') || 'nenhum'}`);

  const agora = Date.now();
  const periodo = { ...base, season: [diasAtras(DIAS_PERIODO)] };
  const porModo = await consulta('map', ['brawler', 'mode', 'season'], ['picks', 'winRate'], periodo);
  const doMapa = await porGruposDeMapas(lista.map((m) => m.mapa), (grupo) =>
    consultaCortavel('map', ['brawler', 'mode', 'map', 'season'], ['picks', 'winRate', 'trophyChange', 'rank'], { ...periodo, map: grupo }));

  const fatiasPares = { season: [desde], trophyRangeGte: [String(FAIXA_TROFEU)] };
  const aliados = new Map();
  const confrontos = new Map();
  for (const modo of modos) {
    const fatias = { ...fatiasPares, mode: [modo] };
    aliados.set(modo, await consulta('brawlerAllies', ['brawler', 'ally'], ['picks', 'winRate'], fatias));
    // No Showdown os inimigos são a sala inteira; confronto direto mede pouco. O null diz
    // à montagem que não se aplica; modo fora do Map é erro lá.
    confrontos.set(modo, ehShowdown(modo) ? null : await consulta('brawlerEnemies', ['brawler', 'enemy'], ['picks', 'winRate'], fatias));
  }

  const { parte, patches } = montarTrofeu(
    { lista, modos, porModo, doMapa, aliados, confrontos },
    { agora, patches: config.patches ?? [], desde },
  );
  logPatches('troféu', patches);
  for (const m of parte.mapas) logMapa(`troféu · ${m.modo} · ${m.mapa}`, m);
  return { geradoEm: new Date().toISOString(), ...parte };
}

async function main() {
  // A parte que não foi pedida continua como estava. Arquivo do formato antigo não tem partes.
  const anterior = await readFile(new URL('dados.json', dir), 'utf8').then(JSON.parse).catch(() => null);
  const partes = { ...anterior?.partes };
  // Nomes e imagens saem da lista de mapas da última vez: mapa novo da coleta de agora
  // ganha nome e imagem na rodada seguinte.
  const nomes = await nomesEImagens(anterior?.partes);
  const daApi = await rotacaoOficial().catch((e) => {
    console.warn(`rotação da API oficial falhou: ${e.message}`);
    return null;
  });
  // Sem a API não dá pra separar a aba Especial do resto: a marca fica a da última vez.
  const especiais = daApi && (await especiaisDoTrofeu(daApi).catch((e) => {
    console.warn(`mapas da aba Especial falharam: ${e.message}`);
    return [];
  }));
  const rotacao = daApi && new Set([...daApi, ...especiais]);
  // Com o BTN fora, o site sai com as estatísticas da última vez e a rotação atualizada.
  // Cada parte guarda a data em que foi gerada; é ela que a página mostra e que o
  // aviso de site parado confere (estado.json). Coleta que falha tenta de novo na
  // rodada seguinte.
  const coletar = (id) => deveColetar(id, partes, PARTE, Date.now());
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
  // A página mostra rotacaoEm como a hora da lista "Na rotação agora".
  if (rotacao) {
    for (const m of partes.trofeu.mapas) m.rotacao = rotacao.has(`${m.modo}|${m.mapa}`);
    partes.trofeu.rotacaoEm = new Date().toISOString();
    const naLista = new Set(partes.trofeu.mapas.map((m) => `${m.modo}|${m.mapa}`));
    const extra = especiais.map((k) => (naLista.has(k) ? k : `${k} (fora da lista até a próxima coleta)`));
    console.log(`rotação: ${daApi.size} mapas da API oficial; aba Especial: ${extra.join(', ') || 'nenhum'}`);
  }

  // Alcance, vida e recarga de todo brawler que aparece nos dados, pra leitura da
  // partida no Draft. Vêm do wiki uma vez por semana; sem eles a tabela sai com traços.
  const atributos = await atributosDaSemana(new URL('atributos.json', dir), brawlersDe(partes));

  const dados = {
    geradoEm: new Date().toISOString(),
    blocos: BLOCOS,
    minPartidas: MIN_PARTIDAS,
    atributos: atributos && { geradoEm: atributos.geradoEm, brawlers: atributos.brawlers },
    // Nome em português e id da imagem de cada mapa, modo e brawler (imagens.mjs).
    nomes,
    partes,
  };
  const json = JSON.stringify(dados);
  await writeFile(new URL('dados.json', dir), json);
  await montarPagina(dados);
  console.log(`ok: site/index.html gerado (${(json.length / 1e6).toFixed(2)} MB de dados, ${pedidosBtn} pedidos ao BTN)`);
}

// Mapas e brawlers que aparecem nos dados. partes pode faltar, na primeira rodada.
const mapasDe = (partes) => Object.values(partes ?? {}).flatMap((p) => p.mapas.map(({ modo, mapa, id }) => ({ modo, mapa, id })));
const brawlersDe = (partes) => [...new Set(Object.values(partes ?? {}).flatMap((p) =>
  p.mapas.flatMap((m) => [...m.brawlers.map((b) => b.nome), ...Object.keys(m.forca ?? {})])))].sort();
const nomesEImagens = (partes) =>
  atualizarNomesEImagens(dir, mapasDe(partes), brawlersDe(partes), { brawlersOficiais: async () => (await oficial('/brawlers')).items });

// O site são três arquivos. A página é o modelo.html com as contas do Draft (draft.mjs, sem
// os export, pra rodar como script comum); a troca usa função porque o texto trocado pode
// ter $, que o replace com texto leria como padrão. Os dados vão à parte, pra página chegar
// leve: o dados.js tem tudo menos os mapas do Troféu (64% do peso), que ficam no
// dados-trofeu.js e só são baixados quando alguém abre esse modo. Os dois guardam o JSON
// num texto lido por JSON.parse, que o navegador lê mais rápido que um objeto escrito em JS.
// A tabela de confrontos vai compacta (compactarTabela, no draft.mjs) e a página a remonta.
// A rotação vai só no estado.json, com a versão dos dados (publicacao.mjs). A lista do
// máximo no Ranqueado e o endereço da Worker entram aqui, e não no dados.json, pra que o
// --so-pagina também leve o que mudou no config.json.
async function montarPagina(dados) {
  const [modelo, draft] = await Promise.all(['modelo.html', 'draft.mjs'].map((f) => readFile(new URL(f, dir), 'utf8')));
  const { lista: maxNoRanqueado, avisos } = listaDoMaximo(config.maxNoRanqueado, brawlersDe(dados.partes));
  for (const aviso of avisos) console.warn(`maxNoRanqueado, no config.json: ${aviso}`);
  const { worker, avisos: avisosWorker } = enderecoDaWorker(config.worker);
  for (const aviso of avisosWorker) console.warn(`worker, no config.json: ${aviso}`);
  const { principal, trofeu, rotacao } = separarRotacao({ ...dados, maxNoRanqueado, worker }, compactarTabela);
  const jsonPrincipal = JSON.stringify(principal);
  const jsonTrofeu = JSON.stringify(trofeu);
  const versao = versaoDe(jsonPrincipal, jsonTrofeu);
  const anterior = await readFile(new URL('site/estado.json', dir), 'utf8').then(JSON.parse).catch(() => null);
  const em = versaoEm(anterior, versao, new Date().toISOString());
  const pagina = modelo
    .replace('/*__DRAFT__*/', () => draft.replace(/^export /gm, ''))
    .replaceAll('__VERSAO__', versao);
  // O texto vai num JSON.parse: a versão entra no fim do objeto, sem refazer o JSON inteiro.
  const lerDepois = (json) => `JSON.parse(${JSON.stringify(json)})`;
  const comVersao = `${jsonPrincipal.slice(0, -1)},"versao":${JSON.stringify(versao)},"versaoEm":${JSON.stringify(em)}}`;
  await mkdir(new URL('site/', dir), { recursive: true });
  await writeFile(new URL('site/index.html', dir), pagina);
  await writeFile(new URL('site/dados.js', dir), `const DADOS = ${lerDepois(comVersao)};\n`);
  // A versão vai junto: a borda do GitHub Pages ignora o ?v= e pode entregar o arquivo de
  // outra geração a uma página aberta há horas, que então confere se saiu versão nova.
  await writeFile(new URL('site/dados-trofeu.js', dir), `trofeuChegou(${lerDepois(jsonTrofeu)}, ${JSON.stringify(versao)});\n`);
  const estado = montarEstado({ publicadoEm: new Date().toISOString(), partes: dados.partes, versao, versaoEm: em, rotacao });
  await writeFile(new URL('site/estado.json', dir), JSON.stringify(estado));
}

// --so-pagina refaz o site/index.html com o dados.json que já existe, sem pedido ao BTN
// nem ao wiki: serve pra ver mudança no modelo.html ou no draft.mjs. Os nomes e as
// imagens do jogo entram também, e o dados.json é regravado com eles.
async function soPagina() {
  const dados = JSON.parse(await readFile(new URL('dados.json', dir), 'utf8'));
  dados.nomes = await nomesEImagens(dados.partes);
  await writeFile(new URL('dados.json', dir), JSON.stringify(dados));
  await montarPagina(dados);
  console.log('ok: site/index.html refeito com o dados.json');
}

(process.argv.includes('--so-pagina') ? soPagina : main)().catch((e) => {
  console.error('falhou:', e.message);
  process.exit(1);
});
