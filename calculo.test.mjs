import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nomeBonito, ajustada, duplasDeTimes, resumirConfrontos, especialistas, forcaNaCascata, semOMapa, somar } from './calculo.mjs';

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
  perto(d.get('Forte'), 1000 / 10400);
  perto(d.get('Fraco'), -1000 / 10400);
});

test('forcaNaCascata com muito dado no mapa fica perto do mapa', () => {
  const modo = linhas({ A: [10000, 6000], B: [10000, 4000] });
  // No mapa, A fica na média e B também: o mapa desmente o modo.
  const mapa = linhas({ A: [100000, 50000], B: [100000, 50000] });
  const d = forcaNaCascata(mapa, modo, new Map(), 400);
  assert.ok(Math.abs(d.get('A')) < 0.001);
});

test('forcaNaCascata com pouco dado no mapa fica perto do modo', () => {
  const modo = linhas({ A: [10000, 6000], B: [10000, 4000] });
  const mapa = linhas({ A: [10, 3], B: [10, 7] });
  const d = forcaNaCascata(mapa, modo, new Map(), 400);
  assert.ok(d.get('A') > 0.08);
  assert.ok(d.get('B') < -0.08);
});

test('semOMapa tira as partidas do mapa e somar junta com peso', () => {
  const modo = linhas({ A: [100, 60], B: [50, 20] });
  const mapa = linhas({ A: [30, 20] });
  assert.deepEqual(semOMapa(modo, mapa), linhas({ A: [70, 40], B: [50, 20] }));
  assert.deepEqual(somar(linhas({ A: [10, 5] }), linhas({ A: [10, 8], C: [4, 2] }), 0.5), linhas({ A: [15, 9], C: [2, 1] }));
});
