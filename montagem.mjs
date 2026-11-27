// Contas do gerador: transformam as linhas cruas do BTN em cada parte do site. Não faz
// pedido, não grava arquivo e não lê o relógio; quem busca, grava e sabe a hora é o
// atualizar.mjs, que chama estas funções entre um pedido e outro. Assim as contas têm
// teste sem gastar a cota do BTN (montagem.test.mjs).

import { nomeBonito, ajustada, duplasDeAliados, diasDosBlocos, resumirConfrontos, especialistas, forcaNaCascata, freioDeUso, semOMapa, somar, mediaDe, pesarPorIdade, efeitoDosPatches, confrontosEmCascata, escolherConfrontos, tabelaDeConfrontos, duplasPelaForca, mapasNoAr, MIN_CONFRONTO, PESO_FUNDO, DIAS_PERIODO, MEIA_VIDA, FOLGA_MARGEM } from './calculo.mjs';

// Abaixo disso o brawler sai da lista principal e só aparece em "pouca amostra".
export const MIN_PARTIDAS = 150;
const MIN_PARTIDAS_DUPLA = 200;
// Mapa com menos partidas que isso mostra a lista estimada pelo modo,
// com todo brawler que o modo conhece, e a página avisa.
const MIN_PARTIDAS_ESTIMADA = 1000;
// Faixa de troféus do brawler, em centenas: 10 = 1.000 troféus ou mais.
export const FAIXA_TROFEU = 10;
// Mapa de troféu entra com pelo menos isso de partidas nos blocos que terminam nos
// últimos DIAS_MAPA dias. Corta mapa que saiu do jogo e evento que durou um fim de
// semana. A tabela somada não separa os dias em que o mapa só passou no Jogo Livre.
const MIN_PARTIDAS_MAPA = 3000;
export const DIAS_MAPA = 14;
// As estatísticas são coletadas de novo quando a coleta anterior passa disso. Com 24,
// o atraso do timer empurraria a coleta uma hora por dia.
const HORAS_ENTRE_COLETAS = 23;

// Na tabela por mapa do BTN, cada partida conta uma vez para cada brawler do time do
// jogador rastreado (confirmado pelo schneefux em 30/10). As partidas de verdade são o
// total dividido pelo tamanho do time. Modo fora desta lista mostra escolhas, e não
// partidas, para não arriscar um número errado.
const JOGADORES_POR_TIME = {
  gemGrab: 3, brawlBall: 3, bounty: 3, heist: 3, knockout: 3, hotZone: 3, basketBrawl: 3, deathmatch: 3,
  soloShowdown: 1, duoShowdown: 2, trioShowdown: 3,
  gemGrab5V5: 5, brawlBall5V5: 5, knockout5V5: 5, deathmatch5v5: 5,
};

// Mapas do ranqueado de agora. Todo mapa da lista tem partida a cada poucos minutos;
// o que saiu na troca de temporada para de ter. Vale o mapa cuja última partida
// fica a até FOLGA_RANQUEADO horas da partida mais recente do ranqueado inteiro,
// sem filtro de faixa (com filtro, mapa novo some). A comparação é com a última
// partida, e não com o relógio, porque o site às vezes passa horas sem gravar nada:
// em 16/10 ficou de 15h a 18h UTC sem nenhuma partida, e uma janela de 3 horas
// derrubou metade dos mapas. Numa pausa assim, todo mapa para junto e nenhum sai.
const FOLGA_RANQUEADO = 6;
export const ORDEM_RANQUEADO = ['gemGrab', 'brawlBall', 'heist', 'bounty', 'knockout', 'hotZone'];

export const ehShowdown = (modo) => modo.endsWith('Showdown');
const r4 = (x) => Math.round(x * 1e4) / 1e4;
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

// Se a parte (ranqueado ou trofeu) deve ser coletada nesta rodada. forcada é o --parte
// da linha de comando: com ele, só a parte pedida é coletada, mesmo com a coleta do dia
// feita. partes são as do dados.json anterior; agora, em ms.
export const deveColetar = (id, partes, forcada, agora) =>
  forcada ? forcada === id : !partes[id] || agora - Date.parse(partes[id].geradoEm) > HORAS_ENTRE_COLETAS * 36e5;

// A lista de um mapa como a página mostra, sem duplas nem counters: cada parte monta os
// seus de um jeito (o ranqueado com todos os mapas juntos, o troféu com o modo inteiro).
// brawlers: as linhas deste mapa já pesadas, { brawler, picks, winRate, trophyChange?, rank? }.
// geral: Map nome -> { n, wr } do modo inteiro, para os especialistas.
// cascata: { modo, fundo, parte } em Map nome -> { n, v }, e mapas (quantos o modo tem).
// Devolve o mapa e o que as duplas e os counters precisam: a média sem arredondar e, de
// todo brawler, a força (delta e variância) e a nota (a força com o freio por uso).
export function listaDoMapa(modo, mapa, brawlers, { geral, cascata }) {
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
  const { modo: doModoTodo, fundo, parte: daParte, mapas } = cascata;
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
  // O uso entra na nota (freioDeUso). Mapa estimado tem pouca partida e uso de sorte: ali
  // fica só a vitória.
  const freio = estimada ? (delta) => delta : freioDeUso(linhas.filter((r) => r.n >= MIN_PARTIDAS).map((r) => r.n / total));
  const lista = [...linhas.map((r) => ({ ...r, uso: r.n / total })), ...conhecidos]
    .map((r) => ({ ...r, adj: media + freio(forca.get(r.nome).delta, r.uso) }))
    .sort((a, b) => b.adj - a.adj);
  const principais = lista.filter((r) => r.n >= MIN_PARTIDAS || (estimada && doModo(r.nome)));
  const enxuto = (r) => ({ ...r, n: Math.round(r.n), wr: r.wr == null ? null : r4(r.wr), uso: r4(r.uso), adj: r4(r.adj) });
  return {
    mapa: {
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
      especialistas: especialistas(principais.filter((b) => b.n > 0), geral).map((e) => ({
        ...e,
        wr: r4(e.wr),
        wrModo: r4(e.wrModo),
        delta: r4(e.delta),
      })),
    },
    media,
    forca,
    // A força com o freio por uso, de todo brawler: ordena o Draft como a tier list.
    nota: new Map([...forca].map(([nome, { delta }]) => [nome, freio(delta, (doMapa.get(nome)?.n ?? 0) / total)])),
  };
}

// O peso das partidas de uma parte. Troféu e Ranqueado usam o mesmo período, a mesma
// meia-vida e a mesma correção de patch, e mudança aqui vale nas duas (22/11/2026,
// memória mesmo-peso-nas-duas-partes); cada parte mede o efeito dos patches nas
// próprias partidas. doModo: as linhas do BTN da parte inteira por { brawler, mode,
// season }, como vieram; patchesDoConfig: a lista do config.json.
// Devolve os patches medidos e pesar, que leva outras linhas cruas da mesma parte a uma
// linha por brawler, no formato do pesarPorIdade.
export function pesoDaParte(doModo, patchesDoConfig, agora) {
  const patches = efeitoDosPatches(diasDosBlocos(doModo, agora), patchesDoConfig, agora);
  return { patches, pesar: (linhas) => pesarPorIdade(diasDosBlocos(linhas, agora), agora, patches) };
}

// Mapas do ranqueado no ar, das linhas { mode, map, eventId, timestamp } do BTN, na ordem
// em que a página mostra: os modos de ORDEM_RANQUEADO primeiro, depois por nome.
export function mapasDoRanqueado(linhas) {
  const ativos = mapasNoAr(linhas, (ultima) => ultima - FOLGA_RANQUEADO * 36e5);
  if (ativos.length < 10) throw new Error(`só ${ativos.length} mapas no ranqueado: o site mudou o formato?`);
  const pos = (modo) => (ORDEM_RANQUEADO.includes(modo) ? ORDEM_RANQUEADO.indexOf(modo) : ORDEM_RANQUEADO.length);
  return ativos
    .map((r) => ({ modo: r.mode, mapa: r.map, id: Number(r.eventId) || undefined }))
    .sort((a, b) => pos(a.modo) - pos(b.modo) || a.modo.localeCompare(b.modo) || a.mapa.localeCompare(b.mapa));
}

// A parte do ranqueado. As partidas pesam pelo pesoDaParte; duplas e counters continuam
// com os blocos juntos, sem peso.
// O primeiro argumento leva as linhas do BTN como vieram: doModo e comAbaixo por
//   { brawler, mode, season }, doMapa por { brawler, mode, map, season }, aliados e
//   confrontos por mapa.
// Devolve a parte sem o geradoEm, que é a hora em que a casca terminou, e os patches
// medidos, que a casca escreve no log.
export function montarRanqueado({ lista, doModo, comAbaixo, doMapa, aliados, confrontos }, { agora, patches: patchesDoConfig, desde, rank }) {
  // O efeito de cada patch sai do ranqueado inteiro e vale igual em todo mapa e no fundo.
  const { patches, pesar } = pesoDaParte(doModo, patchesDoConfig, agora);
  const porNome = (linhas) => porBrawler(pesar(linhas));
  const modos = [...new Set(lista.map((m) => m.modo))];
  const doModoX = (linhas, modo) => linhas.filter((r) => r.mode === modo);
  const geral = new Map(modos.map((modo) => [modo, porNome(doModoX(doModo, modo))]));
  const vitoriasDoModo = new Map([...geral].map(([modo, m]) => [modo, comVitorias(m)]));
  // A liga logo abaixo (Mítico, com o rank padrão) entra como fundo da cascata. A tabela
  // só filtra "dessa faixa pra cima", então o Mítico sai da diferença entre as duas.
  const fundo = new Map(
    modos.map((modo) => [modo, somar(comVitorias(porNome(doModoX(comAbaixo, modo))), vitoriasDoModo.get(modo), -1)]),
  );
  const ranqueado = comVitorias(porNome(doModo));

  const montados = lista.map(({ modo, mapa, id }) => {
    const { mapa: m, media, forca, nota } = listaDoMapa(
      modo,
      mapa,
      pesar(doMapa.filter((r) => r.mode === modo && r.map === mapa)),
      {
        geral: geral.get(modo),
        cascata: { modo: vitoriasDoModo.get(modo), fundo: fundo.get(modo), parte: ranqueado, mapas: lista.filter((x) => x.modo === modo).length },
      },
    );
    // A margem só foi validada no ranqueado; a página marca o S que pode ser B.
    const comMargem = (b) => ({ ...b, sd: r4(FOLGA_MARGEM * Math.sqrt(forca.get(b.nome).variancia)) });
    return {
      m: { ...m, brawlers: m.brawlers.map(comMargem), poucaAmostra: m.poucaAmostra.map(comMargem), id },
      media,
      nota,
      forca: new Map([...forca].map(([nome, { delta }]) => [nome, delta])),
      duplas: duplasDeAliados(aliados.filter((r) => r.map === mapa)),
      confrontos: confrontos.filter((r) => r.map === mapa).map((c) => [nomeBonito(c.brawler), nomeBonito(c.enemy), Number(c.picks), Number(c.winRate)]),
    };
  });
  // Counters e duplas usam os outros mapas e a tier list, então só saem com tudo pronto.
  const confrontosCascata = confrontosEmCascata(montados.map((x) => ({ modo: x.m.modo, linhas: x.confrontos, forca: x.forca })));
  const duplas = duplasPelaForca(montados);
  const mapas = montados.map(({ m, media, forca, nota }, i) => {
    const duplasDoMapa = duplas[i]
      .filter((d) => d.n >= MIN_PARTIDAS_DUPLA)
      .map(({ nota: notaDaDupla, ...d }) => ({ ...d, wr: r4(d.wr), adj: r4(media + notaDaDupla) }));
    // A tabela de confrontos do BTN mistura o troféu, onde dá pra pegar o mesmo brawler
    // dos dois lados. No ranqueado não dá, então o espelho sai.
    const efeitos = (nome) => (confrontosCascata[i].get(nome) ?? []).filter(([e]) => e !== nome);
    return {
      ...m,
      melhoresDuplas: duplasDoMapa.slice(0, 8),
      pioresDuplas: duplasDoMapa.slice(-5).reverse(),
      confrontos: Object.fromEntries(m.brawlers.map((b) => [b.nome, escolherConfrontos(efeitos(b.nome))])),
      // Os confrontos com amostra de todo brawler, não só dos da tier list: o modo Draft
      // soma contra os inimigos escolhidos, e qualquer um pode ser escolhido. Sem o corte
      // de amostra o arquivo dobrava pra quase nenhum ganho na chance (2026-10-20).
      tabela: Object.fromEntries([...confrontosCascata[i].keys()].map((nome) => [nome, tabelaDeConfrontos(efeitos(nome))])),
      // A força de todo brawler, não só de quem tem partidas pra tier list. Sem ela, no
      // Draft quem ficava de fora contava como mediano, e esses ganham 47%.
      forca: Object.fromEntries([...forca].map(([nome, delta]) => [nome, r4(delta)])),
      // O Draft ordena por esta (notaNoDraft, no draft.mjs) e calcula a chance pela forca.
      nota: Object.fromEntries([...nota].map(([nome, v]) => [nome, r4(v)])),
    };
  });
  return { parte: { desde, dias: DIAS_PERIODO, meiaVida: MEIA_VIDA, rank, mapas }, patches };
}

// Mapas do troféu, das linhas { mode, map, picks, trophyChange, eventId } do BTN nos
// últimos DIAS_MAPA dias. rotacao: Set 'modo|mapa' da API oficial e da aba Especial, ou
// null se a API falhou. limite corta a lista (o --limite, pra testar rápido).
// Devolve a lista de mapas, os modos com mapa na lista (do mais jogado ao menos) e os
// mapas da rotação que entram.
export function mapasDoTrofeu(linhas, rotacao, limite = Infinity) {
  // Modo e mapa valem troféu quando o site registra variação de troféu neles. eventId 0
  // são os mapas de Competition, que o site também esconde.
  const porMapa = linhas.filter((r) => r.trophyChange != null && Number(r.eventId) !== 0);
  const doModo = new Map();
  for (const r of porMapa) doModo.set(r.mode, (doModo.get(r.mode) ?? 0) + Number(r.picks));
  // O id do mapa no jogo, pra imagem; mapa da rotação sem partida fica sem.
  const idPorMapa = new Map(porMapa.map((r) => [`${r.mode}|${r.map}`, Number(r.eventId) || undefined]));
  const modos = [...doModo].sort((a, b) => b[1] - a[1]).map(([modo]) => modo);
  if (!modos.length) throw new Error('nenhum modo com variação de troféu: o site mudou o formato?');
  const mapas = porMapa
    .filter((r) => Number(r.picks) >= MIN_PARTIDAS_MAPA)
    .map((r) => `${r.mode}|${r.map}`)
    .sort();
  // Mapa da rotação entra mesmo sem partidas suficientes: é o que dá pra jogar agora.
  // A página avisa quando tem poucos dados. Mapa de modo sem nenhuma partida fica de fora.
  const naRotacao = [...(rotacao ?? [])].filter((k) => modos.includes(k.split('|')[0]));
  const lista = [...new Set([...mapas, ...naRotacao])]
    .map((k) => {
      const [modo, mapa] = k.split('|');
      return { modo, mapa, id: idPorMapa.get(k), rotacao: naRotacao.includes(k) };
    })
    .slice(0, limite);
  const presentes = new Set(lista.map((m) => m.modo));
  return { lista, modos: modos.filter((m) => presentes.has(m)), naRotacao };
}

// A parte do troféu. As partidas pesam pelo pesoDaParte, como no ranqueado. Até 22/11
// eram os blocos juntos, sem peso, e partida de antes de um nerf contava igual à de
// depois. A posição só vale no Showdown.
// Duplas e counters do troféu são do modo inteiro, e não de cada mapa. Mapa a mapa,
// com 162 mapas, eram uns 300 pedidos por dia; e a maioria dos mapas tem tão poucas
// partidas que quase nenhuma dupla passava do mínimo. O ranqueado continua por mapa.
// O primeiro argumento leva lista e modos do mapasDoTrofeu e as linhas do BTN como
//   vieram: porModo por { brawler, mode, season } e doMapa por { brawler, mode, map,
//   season }; aliados e confrontos em Map modo -> linhas, com todo modo da lista (nos
//   confrontos, o modo sem confronto direto vem como null).
// Devolve a parte sem o geradoEm e os patches medidos, para o log.
export function montarTrofeu({ lista, modos, porModo, doMapa, aliados, confrontos }, { agora, patches: patchesDoConfig, desde }) {
  const { patches, pesar } = pesoDaParte(porModo, patchesDoConfig, agora);
  const doModoTodo = new Map(modos.map((modo) => [modo, somarPorBrawler(pesar(porModo.filter((r) => r.mode === modo)))]));
  const trofeu = somarPorBrawler(pesar(porModo));

  const mapas = lista.map(({ modo, mapa, id, rotacao }) => {
    const { mapa: m, media } = listaDoMapa(
      modo,
      mapa,
      pesar(doMapa.filter((r) => r.mode === modo && r.map === mapa)).map((r) => (ehShowdown(modo) ? r : { ...r, rank: null })),
      {
        geral: comTaxa(doModoTodo.get(modo)),
        // No troféu não há liga abaixo que sirva de fundo: a faixa já é o corte de 1.000 troféus.
        cascata: { modo: doModoTodo.get(modo), fundo: new Map(), parte: trofeu, mapas: lista.filter((x) => x.modo === modo).length },
      },
    );
    const listaDuplas = Object.entries(duplasDeAliados(aliados.get(modo)))
      .filter(([, d]) => d.n >= MIN_PARTIDAS_DUPLA)
      .map(([k, d]) => ({ par: k.split('|'), n: d.n, wr: r4(d.v / d.n), adj: ajustada(d.v, d.n, media) }))
      .sort((a, b) => b.adj - a.adj);
    return {
      ...m,
      melhoresDuplas: listaDuplas.slice(0, 8).map(({ adj, ...d }) => d),
      pioresDuplas: listaDuplas.slice(-5).reverse().map(({ adj, ...d }) => d),
      // null quando a casca gravou que o modo não tem confronto direto (o Showdown).
      confrontos: countersDoModo(doModoNaCasca(confrontos, modo), m.brawlers),
      id,
      rotacao,
    };
  });
  return { parte: { desde, dias: DIAS_PERIODO, meiaVida: MEIA_VIDA, faixa: FAIXA_TROFEU, modos, mapas }, patches };
}

// O que a casca buscou para o modo. Modo que falta é erro: lista vazia faria a página
// mostrar counters vazios sem aviso. Quem não se aplica vem como null, gravado por quem
// decidiu não pedir (pesquisa de 26/11/2026: connascence.io "Meaning", Fowler "Special
// Case"; o null é a "intentional absence" da MDN e o Map.get não o confunde com chave
// ausente).
function doModoNaCasca(porModo, modo) {
  if (!porModo.has(modo)) throw new Error(`${modo}: a casca não mandou este modo`);
  return porModo.get(modo);
}

// Os counters de cada brawler da lista, pelas linhas { brawler, enemy, picks, winRate }
// do modo inteiro, como { nome: { bom, ruim } }, ou null quando o modo não tem confronto.
function countersDoModo(linhas, brawlers) {
  if (linhas === null) return null;
  const porBrawler = {};
  for (const c of linhas) {
    const n = Number(c.picks);
    if (n < MIN_CONFRONTO) continue;
    (porBrawler[nomeBonito(c.brawler)] ??= []).push([nomeBonito(c.enemy), n, Number(c.winRate)]);
  }
  return Object.fromEntries(brawlers.map((b) => [b.nome, resumirConfrontos(porBrawler[b.nome] ?? [])]));
}
