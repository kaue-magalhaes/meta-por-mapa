import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nomeBonito, ajustada, duplasDeTimes, resumirConfrontos, especialistas, forcaNaCascata, semOMapa, somar, pesarPorIdade, efeitoDosPatches } from './calculo.mjs';

test('nomeBonito troca maiúsculas por nome normal', () => {
  assert.equal(nomeBonito('EL PRIMO'), 'El Primo');
  assert.equal(nomeBonito('MR. P'), 'Mr. P');
});

test('ajustada puxa a taxa pra média do mapa com peso de 100 partidas', () => {
  // 60 vitórias em 100 partidas, média 50%: (60 + 50) / 200
  assert.equal(ajustada(60, 100, 0.5), 0.55);
});

test('duplasDeTimes quebra cada time em pares ordenados', () => {
  const d = duplasDeTimes([{ team: ['COLT', 'BEA', 'EL PRIMO'], picks: '10', winRate: '0.6' }]);
  assert.deepEqual(Object.keys(d).sort(), ['Bea|Colt', 'Bea|El Primo', 'Colt|El Primo']);
  assert.deepEqual(d['Bea|Colt'], { n: 10, v: 6 });
});

test('resumirConfrontos devolve efeito relativo à taxa do próprio brawler', () => {
  const r = resumirConfrontos([['X', 100, 0.7], ['Y', 100, 0.3], ['Z', 100, 0.5]]);
  // base 50%; X: (70 + 0,5*60) / 160 - 0,5 = 0,125
  assert.deepEqual(r, { bom: [['X', 0.125]], ruim: [['Y', -0.125]] });
});

test('resumirConfrontos guarda no máximo 5 de cada lado', () => {
  const linhas = Array.from({ length: 20 }, (_, i) => [`B${i}`, 200, i < 10 ? 0.8 : 0.2]);
  const r = resumirConfrontos(linhas);
  assert.equal(r.bom.length, 5);
  assert.equal(r.ruim.length, 5);
});

test('resumirConfrontos sem linhas devolve listas vazias', () => {
  assert.deepEqual(resumirConfrontos([]), { bom: [], ruim: [] });
});

test('especialistas pega só diferença positiva e significativa', () => {
  const modo = new Map([
    ['Forte', { n: 10000, wr: 0.5 }],
    ['Sorte', { n: 10000, wr: 0.5 }],
    ['Pior', { n: 10000, wr: 0.5 }],
  ]);
  const mapa = [
    { nome: 'Forte', n: 1000, wr: 0.6 },
    { nome: 'Sorte', n: 200, wr: 0.53 },
    { nome: 'Pior', n: 1000, wr: 0.4 },
    { nome: 'SemModo', n: 1000, wr: 0.7 },
  ];
  const e = especialistas(mapa, modo);
  assert.deepEqual(e.map((x) => x.nome), ['Forte']);
  assert.equal(Math.round(e[0].delta * 1000) / 1000, 0.1);
  assert.equal(e[0].wrModo, 0.5);
});

test('especialistas ignora mapa que é o modo inteiro', () => {
  const modo = new Map([['A', { n: 500, wr: 0.5 }]]);
  assert.deepEqual(especialistas([{ nome: 'A', n: 500, wr: 0.6 }], modo), []);
});

const linhas = (obj) => new Map(Object.entries(obj).map(([k, [n, v]]) => [k, { n, v }]));
const perto = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('forcaNaCascata sem partida no mapa fica com a força do brawler no modo', () => {
  // Modo: média 50%, Forte com 60% e Fraco com 40%, 10.000 partidas cada.
  const modo = linhas({ Forte: [10000, 6000], Fraco: [10000, 4000] });
  const d = forcaNaCascata(new Map(), modo, new Map(), 400);
  // (6.000 − 5.000 + 400 × 0) / (10.000 + 400)
  perto(d.get('Forte').delta, 1000 / 10400);
  perto(d.get('Fraco').delta, -1000 / 10400);
});

test('forcaNaCascata com muito dado no mapa fica perto do mapa', () => {
  const modo = linhas({ A: [10000, 6000], B: [10000, 4000] });
  // No mapa, A fica na média e B também: o mapa desmente o modo.
  const mapa = linhas({ A: [100000, 50000], B: [100000, 50000] });
  const d = forcaNaCascata(mapa, modo, new Map(), 400);
  assert.ok(Math.abs(d.get('A').delta) < 0.001);
});

test('forcaNaCascata com pouco dado no mapa fica perto do modo', () => {
  const modo = linhas({ A: [10000, 6000], B: [10000, 4000] });
  const mapa = linhas({ A: [10, 3], B: [10, 7] });
  const d = forcaNaCascata(mapa, modo, new Map(), 400);
  assert.ok(d.get('A').delta > 0.08);
  assert.ok(d.get('B').delta < -0.08);
});

test('semOMapa tira as partidas do mapa e somar junta com peso', () => {
  const modo = linhas({ A: [100, 60], B: [50, 20] });
  const mapa = linhas({ A: [30, 20] });
  assert.deepEqual(semOMapa(modo, mapa), linhas({ A: [70, 40], B: [50, 20] }));
  assert.deepEqual(somar(linhas({ A: [10, 5] }), linhas({ A: [10, 8], C: [4, 2] }), 0.5), linhas({ A: [15, 9], C: [2, 1] }));
});

test('pesarPorIdade junta os dias e a partida de 14 dias atrás vale metade', () => {
  const agora = Date.parse('2026-10-17T12:00:00Z');
  const r = pesarPorIdade([
    { brawler: 'COLT', day: '2026-10-17T00:00:00.000', picks: '100', winRate: '0.6' },
    { brawler: 'COLT', day: '2026-10-03T00:00:00.000', picks: '100', winRate: '0.4' },
    { brawler: 'BEA', day: '2026-10-17T00:00:00.000', picks: '10', winRate: '0.5' },
  ], agora);
  const colt = r.find((x) => x.brawler === 'COLT');
  // Hoje vale 1 e 14 dias atrás vale 0,5: 150 partidas e (60 + 20) / 150 de vitória.
  perto(colt.picks, 150);
  perto(colt.winRate, 80 / 150);
  perto(r.find((x) => x.brawler === 'BEA').picks, 10);
});

test('pesarPorIdade deixa de fora o dia mais velho que o período', () => {
  const agora = Date.parse('2026-10-17T12:00:00Z');
  const r = pesarPorIdade([
    { brawler: 'COLT', day: '2026-10-17T00:00:00.000', picks: '10', winRate: '0.5' },
    { brawler: 'COLT', day: '2026-09-04T00:00:00.000', picks: '1000', winRate: '1' },
  ], agora);
  assert.deepEqual(r, [{ brawler: 'COLT', picks: 10, winRate: 0.5 }]);
});

test('pesarPorIdade desloca os dias de antes do patch e tira o dia do patch', () => {
  const agora = Date.parse('2026-10-17T12:00:00Z');
  const r = pesarPorIdade([
    { brawler: 'COLT', day: '2026-10-17T00:00:00.000', picks: '100', winRate: '0.5' },
    { brawler: 'COLT', day: '2026-10-16T00:00:00.000', picks: '100', winRate: '0.9' },
    { brawler: 'COLT', day: '2026-10-15T00:00:00.000', picks: '100', winRate: '0.6' },
    { brawler: 'BEA', day: '2026-10-15T00:00:00.000', picks: '100', winRate: '0.6' },
  ], agora, new Map([['COLT', { dia: '2026-10-16', efeito: -0.1 }]]));
  const colt = r.find((x) => x.brawler === 'COLT');
  const w = (dias) => 0.5 ** (dias / 14);
  // O dia 16 sai; o dia 15 vale 0,6 - 0,1.
  perto(colt.picks, 100 * (w(0) + w(2)));
  perto(colt.winRate, (0.5 * w(0) + 0.5 * w(2)) / (w(0) + w(2)));
  perto(r.find((x) => x.brawler === 'BEA').winRate, 0.6);
});

const diaDe = (brawler, day, picks, winRate) => ({ brawler, day: `${day}T00:00:00.000`, picks: String(picks), winRate: String(winRate) });

test('efeitoDosPatches usa só o chute quando ainda não há dia depois do patch', () => {
  const agora = Date.parse('2026-10-17T12:00:00Z');
  const linhas = [diaDe('COLT', '2026-10-10', 1000, 0.6), diaDe('BEA', '2026-10-10', 1000, 0.4)];
  const patches = [{ data: '2026-10-17', mudancas: [{ brawler: 'Colt', direcao: 'nerf', tamanho: 'media' }] }];
  const e = efeitoDosPatches(linhas, patches, agora, { nerf: { media: -0.025 } });
  assert.deepEqual([...e.keys()], ['COLT']);
  perto(e.get('COLT').efeito, -0.025);
  assert.equal(e.get('COLT').dia, '2026-10-17');
});

test('efeitoDosPatches mistura chute e dado novo, com cada dia antigo valendo 10% de um novo', () => {
  const agora = Date.parse('2026-10-17T12:00:00Z');
  // Colt fica 10 pontos acima da média antes e 4 acima depois; a média do dia é 0,5.
  const linhas = [
    diaDe('COLT', '2026-10-15', 1000, 0.6), diaDe('BEA', '2026-10-15', 1000, 0.4),
    diaDe('COLT', '2026-10-16', 500, 0.9), diaDe('BEA', '2026-10-16', 500, 0.1),
    diaDe('COLT', '2026-10-17', 1000, 0.54), diaDe('BEA', '2026-10-17', 1000, 0.46),
  ];
  const patches = [{ data: '2026-10-16', mudancas: [{ brawler: 'COLT', direcao: 'nerf', tamanho: 'pequena' }] }];
  const e = efeitoDosPatches(linhas, patches, agora, { nerf: { pequena: -0.02 } });
  const velho = 0.1 * 1000 * 0.5 ** (2 / 14);
  const novo = 1000;
  perto(e.get('COLT').efeito, (velho * -0.02 + novo * (0.04 - 0.1)) / (velho + novo));
});

test('efeitoDosPatches fica com o último patch do brawler e ignora patch futuro', () => {
  const agora = Date.parse('2026-10-17T12:00:00Z');
  const patches = [
    { data: '2026-10-01', mudancas: [{ brawler: 'COLT', direcao: 'buff', tamanho: 'media' }] },
    { data: '2026-10-10', mudancas: [{ brawler: 'COLT', direcao: 'nerf', tamanho: 'media' }] },
    { data: '2026-10-20', mudancas: [{ brawler: 'COLT', direcao: 'buff', tamanho: 'grande' }] },
  ];
  const e = efeitoDosPatches([], patches, agora, { nerf: { media: -0.025 }, buff: { media: 0.03, grande: 0.017 } });
  assert.equal(e.get('COLT').dia, '2026-10-10');
  perto(e.get('COLT').efeito, -0.025);
});

test('forcaNaCascata dá a variância da força: ruído do mapa mais o que sobra do degrau de cima', () => {
  // Sem modo nem geral, o degrau de cima vale 0 com variância 0,25 / 400.
  // 0,25 / (100 + 400) + (400 / 500)² × 0,25 / 400 = 0,0005 + 0,0004
  const d = forcaNaCascata(linhas({ X: [100, 60] }), new Map(), new Map(), 400);
  perto(d.get('X').variancia, 0.0009);
});

test('forcaNaCascata dá margem menor a quem tem mais partidas no mapa', () => {
  const modo = linhas({ A: [10000, 5000], B: [10000, 5000] });
  const mapa = linhas({ A: [2000, 1100], B: [50, 30] });
  const d = forcaNaCascata(mapa, modo, new Map(), 400);
  assert.ok(d.get('A').variancia < d.get('B').variancia);
  // Quem só existe no modo herda a margem dele, alargada pela distância até o mapa.
  const so = forcaNaCascata(new Map(), modo, new Map(), 400);
  assert.ok(so.get('A').variancia > 0.25 / 400);
});
