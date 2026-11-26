import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listaDoMapa, mapasDoRanqueado, mapasDoTrofeu, montarRanqueado, montarTrofeu, deveColetar, MIN_PARTIDAS } from './montagem.mjs';

// Um dia de referência para todas as contas com idade. Os blocos do BTN terminam no dia do
// rótulo (season); o de 24/11 cobre de 10/11 a 23/11.
const AGORA = Date.parse('2026-11-25T12:00:00Z');
const BLOCO = '2026-11-24T00:00:00.000Z';

// Linhas de brawler de um mapa já pesadas, como o pesarPorIdade devolve.
const pesadas = (lista) => lista.map(([brawler, picks, winRate, extra = {}]) => ({ brawler, picks, winRate, ...extra }));
// Totais do modo em Map nome -> { n, v }, como a cascata recebe.
const totais = (lista) => new Map(lista.map(([nome, n, wr]) => [nome, { n, v: n * wr }]));
const taxas = (lista) => new Map(lista.map(([nome, n, wr]) => [nome, { n, wr }]));

const MODO = [['Shelly', 6000, 0.52], ['Colt', 6000, 0.48], ['Bull', 3000, 0.5], ['Piper', 3000, 0.55]];
const cascata = (extra = {}) => ({ modo: totais(MODO), fundo: new Map(), parte: totais(MODO), mapas: 3, ...extra });

test('listaDoMapa: a lista principal corta quem tem menos de MIN_PARTIDAS e sai pela nota', () => {
  const { mapa } = listaDoMapa('gemGrab', 'A', pesadas([['SHELLY', 900, 0.56], ['COLT', 900, 0.46], ['BULL', 600, 0.5], ['PIPER', MIN_PARTIDAS - 1, 0.6]]), { geral: taxas(MODO), cascata: cascata() });
  assert.deepEqual(mapa.brawlers.map((b) => b.nome), ['Shelly', 'Bull', 'Colt']);
  // Na tabela por mapa, cada partida conta uma vez para cada um dos 3 do time.
  assert.equal(mapa.total, 2549);
  assert.equal(mapa.partidas, Math.round(2549 / 3));
  assert.equal(mapa.estimada, undefined);
  // Piper fica fora da lista por amostra, mas aparece em pouca amostra (vitória acima da média + 6 pontos).
  assert.deepEqual(mapa.poucaAmostra.map((b) => b.nome), ['Piper']);
  // A lista não traz duplas nem counters: cada parte monta os dela.
  assert.equal(mapa.melhoresDuplas, undefined);
  assert.equal(mapa.confrontos, undefined);
});

test('listaDoMapa devolve força e nota de todo brawler, inclusive quem ficou fora da lista', () => {
  const { mapa, forca, nota, media } = listaDoMapa('gemGrab', 'A', pesadas([['SHELLY', 900, 0.56], ['COLT', 900, 0.46], ['PIPER', 30, 0.6]]), { geral: taxas(MODO), cascata: cascata() });
  assert.ok(!mapa.brawlers.some((b) => b.nome === 'Piper'));
  assert.equal(typeof forca.get('Piper').delta, 'number');
  assert.equal(typeof forca.get('Piper').variancia, 'number');
  assert.ok(nota.has('Piper'));
  // A média sai sem arredondar, para as duplas; a do mapa vai com 4 casas.
  assert.equal(mapa.media, Math.round(media * 1e4) / 1e4);
});

test('listaDoMapa com poucas partidas mostra a lista estimada pelo modo', () => {
  // Mapa com 300 partidas: a média vem do modo, e entra quem passa do corte num mapa típico.
  const { mapa } = listaDoMapa('gemGrab', 'A', pesadas([['SHELLY', 200, 0.6], ['COLT', 100, 0.4]]), { geral: taxas(MODO), cascata: cascata() });
  assert.equal(mapa.estimada, true);
  const bull = mapa.brawlers.find((b) => b.nome === 'Bull');
  assert.deepEqual([bull.n, bull.wr, bull.uso], [0, null, 0]);
});

test('listaDoMapa leva troféus e posição só quando a linha traz', () => {
  const { mapa } = listaDoMapa('soloShowdown', 'S', pesadas([['SHELLY', 3000, 0.5, { trophyChange: 3.456, rank: 4.321 }], ['COLT', 3000, 0.5, { rank: null }]]), { geral: taxas(MODO), cascata: cascata() });
  const shelly = mapa.brawlers.find((b) => b.nome === 'Shelly');
  const colt = mapa.brawlers.find((b) => b.nome === 'Colt');
  assert.deepEqual([shelly.trofeus, shelly.posicao], [3.46, 4.32]);
  assert.ok(!('posicao' in colt));
  // No Showdown solo, partida é escolha: 1 por time.
  assert.equal(mapa.partidas, 6000);
});

test('mapasDoRanqueado ordena pelos modos do jogo e depois por nome', () => {
  const linha = (mode, map, eventId = 1) => ({ mode, map, eventId, timestamp: '2026-11-25T10:00:00Z' });
  const linhas = [
    linha('hotZone', 'Z'), linha('gemGrab', 'B'), linha('gemGrab', 'A'), linha('brawlBall', 'C'), linha('heist', 'D'),
    linha('bounty', 'E'), linha('knockout', 'F'), linha('knockout', 'G'), linha('wipeout', 'W'), linha('brawlBall', 'H'),
    linha('gemGrab', 'X', 0),
  ];
  assert.deepEqual(mapasDoRanqueado(linhas).map((m) => m.mapa), ['A', 'B', 'C', 'H', 'D', 'E', 'F', 'G', 'Z', 'W']);
});

test('mapasDoRanqueado recusa lista com menos de 10 mapas', () => {
  assert.throws(() => mapasDoRanqueado([{ mode: 'gemGrab', map: 'A', eventId: 1, timestamp: '2026-11-25T10:00:00Z' }]), /só 1 mapas/);
});

test('mapasDoTrofeu corta mapa com pouca partida e põe o da rotação mesmo sem partida', () => {
  const linha = (mode, map, picks, extra = {}) => ({ mode, map, picks, trophyChange: 1, eventId: 7, ...extra });
  const { lista, modos, naRotacao } = mapasDoTrofeu([
    linha('brawlBall', 'Grande', 9000),
    linha('brawlBall', 'Pequeno', 100),
    linha('gemGrab', 'Mina', 4000),
    linha('gemGrab', 'Competição', 9000, { eventId: 0 }),
    linha('heist', 'Sem troféu', 9000, { trophyChange: null }),
  ], new Set(['brawlBall|Pequeno', 'heist|Cofre']));
  // Os mapas com partidas vêm em ordem de modo e nome; os que só entram pela rotação, no fim.
  assert.deepEqual(lista.map((m) => `${m.mapa}${m.rotacao ? '*' : ''}`), ['Grande', 'Mina', 'Pequeno*']);
  // O heist não tem mapa com variação de troféu, então o mapa dele na rotação não entra.
  assert.deepEqual(naRotacao, ['brawlBall|Pequeno']);
  // Os modos do mais jogado ao menos.
  assert.deepEqual(modos, ['brawlBall', 'gemGrab']);
});

test('mapasDoTrofeu sem nenhuma variação de troféu falha alto', () => {
  assert.throws(() => mapasDoTrofeu([{ mode: 'gemGrab', map: 'A', picks: 9000, trophyChange: null, eventId: 1 }], null), /nenhum modo/);
});

test('deveColetar: uma vez a cada 23 horas, ou a parte pedida no --parte', () => {
  const partes = { ranqueado: { geradoEm: '2026-11-24T14:00:00Z' } };
  assert.equal(deveColetar('ranqueado', partes, undefined, Date.parse('2026-11-25T12:00:00Z')), false);
  assert.equal(deveColetar('ranqueado', partes, undefined, Date.parse('2026-11-25T13:30:00Z')), true);
  assert.equal(deveColetar('trofeu', partes, undefined, AGORA), true);
  assert.equal(deveColetar('ranqueado', partes, 'trofeu', Date.parse('2026-11-26T12:00:00Z')), false);
});

// Um ranqueado inventado: dois mapas de Gem Grab com quatro brawlers.
const NOMES = ['SHELLY', 'COLT', 'BULL', 'PIPER'];
const TAXAS = { SHELLY: 0.54, COLT: 0.47, BULL: 0.5, PIPER: 0.52 };
const deModo = (picks) => NOMES.map((brawler) => ({ brawler, mode: 'gemGrab', season: BLOCO, picks, winRate: TAXAS[brawler] }));
const deMapa = (map, picks) => NOMES.map((brawler) => ({ brawler, mode: 'gemGrab', map, season: BLOCO, picks, winRate: TAXAS[brawler] + (map === 'A' ? 0.01 : -0.01) }));
const pares = (map, outro, picks, wr) => NOMES.flatMap((brawler) => NOMES.map((o) => ({ brawler, [outro]: o, map, picks, winRate: wr(brawler, o) })));

test('montarRanqueado monta a parte com margem, duplas e counters de todos os mapas', () => {
  const { parte, patches } = montarRanqueado({
    lista: [{ modo: 'gemGrab', mapa: 'A', id: 1 }, { modo: 'gemGrab', mapa: 'B', id: 2 }],
    doModo: deModo(8000),
    comAbaixo: deModo(12000),
    doMapa: [...deMapa('A', 2000), ...deMapa('B', 2000)],
    aliados: [...pares('A', 'ally', 150, () => 0.5), ...pares('B', 'ally', 150, () => 0.5)],
    confrontos: [...pares('A', 'enemy', 80, (b, e) => (b === 'SHELLY' && e === 'COLT' ? 0.7 : 0.5)), ...pares('B', 'enemy', 80, () => 0.5)],
  }, { agora: AGORA, patches: [], desde: '2026-11-10', rank: 16 });

  assert.equal(patches.size, 0);
  assert.equal(parte.geradoEm, undefined);
  assert.deepEqual([parte.desde, parte.rank, parte.mapas.length], ['2026-11-10', 16, 2]);
  const a = parte.mapas[0];
  assert.deepEqual([a.mapa, a.id], ['A', 1]);
  // Só o ranqueado leva a margem de incerteza de cada brawler.
  assert.ok(a.brawlers.every((b) => typeof b.sd === 'number'));
  // Cada dupla aparece dos dois lados (2 x 150 = 300), acima do mínimo de 200.
  assert.ok(a.melhoresDuplas.length > 0 && a.melhoresDuplas.every((d) => d.n === 300 && typeof d.adj === 'number'));
  // O espelho (Shelly contra Shelly) sai da tabela do Draft.
  assert.ok(!('Shelly' in a.tabela.Shelly));
  assert.ok(a.tabela.Shelly.Colt > 0);
  assert.deepEqual(Object.keys(a.confrontos).sort(), a.brawlers.map((b) => b.nome).sort());
  assert.deepEqual(Object.keys(a.forca).sort(), ['Bull', 'Colt', 'Piper', 'Shelly']);
  assert.deepEqual(Object.keys(a.nota).sort(), ['Bull', 'Colt', 'Piper', 'Shelly']);
});

test('montarTrofeu recusa modo da lista que não veio nos confrontos, em vez de mostrar counters vazios', () => {
  const linhas = (map) => NOMES.map((brawler) => ({ brawler, mode: 'gemGrab', map, season: BLOCO, picks: 1500, winRate: TAXAS[brawler] }));
  const brutos = {
    lista: [{ modo: 'gemGrab', mapa: 'A', id: 1, rotacao: false }],
    modos: ['gemGrab'],
    porModo: NOMES.map((brawler) => ({ brawler, mode: 'gemGrab', season: BLOCO, picks: 9000, winRate: TAXAS[brawler] })),
    doMapa: linhas('A'),
    aliados: new Map([['gemGrab', []]]),
    confrontos: new Map(),
  };
  assert.throws(() => montarTrofeu(brutos, { agora: AGORA, patches: [], desde: '2026-11-10' }), /gemGrab/);
});

test('montarTrofeu: duplas e counters do modo, e o Showdown sem counters nem posição fora dele', () => {
  const linhas = (mode, map) => NOMES.map((brawler) => ({ brawler, mode, map, season: BLOCO, picks: 1500, winRate: TAXAS[brawler], trophyChange: 2, rank: 3 }));
  const porModo = (mode) => NOMES.map((brawler) => ({ brawler, mode, season: BLOCO, picks: 9000, winRate: TAXAS[brawler] }));
  const { parte } = montarTrofeu({
    lista: [{ modo: 'gemGrab', mapa: 'A', id: 1, rotacao: true }, { modo: 'soloShowdown', mapa: 'S', id: 2, rotacao: false }],
    modos: ['gemGrab', 'soloShowdown'],
    porModo: [...porModo('gemGrab'), ...porModo('soloShowdown')],
    doMapa: [...linhas('gemGrab', 'A'), ...linhas('soloShowdown', 'S')],
    aliados: new Map([['gemGrab', pares('A', 'ally', 150, () => 0.5)], ['soloShowdown', []]]),
    confrontos: new Map([['gemGrab', pares('A', 'enemy', 80, () => 0.5)], ['soloShowdown', null]]),
  }, { agora: AGORA, patches: [], desde: '2026-11-10' });

  const [gem, solo] = parte.mapas;
  assert.deepEqual(parte.modos, ['gemGrab', 'soloShowdown']);
  assert.equal(gem.rotacao, true);
  assert.ok(gem.brawlers.every((b) => !('posicao' in b) && b.trofeus === 2 && !('sd' in b)));
  assert.ok(gem.melhoresDuplas.length > 0);
  assert.deepEqual(Object.keys(gem.confrontos).sort(), gem.brawlers.map((b) => b.nome).sort());
  assert.equal(solo.confrontos, null);
  assert.ok(solo.brawlers.every((b) => b.posicao === 3));
  assert.equal(gem.tabela, undefined);
});
