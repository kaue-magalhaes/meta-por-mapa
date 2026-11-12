import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nomeBonito, ajustada, duplasDeTimes, resumirConfrontos, especialistas, forcaNaCascata, semOMapa, somar, pesarPorIdade, efeitoDosPatches, confrontosEmCascata, escolherConfrontos, tabelaDeConfrontos, duplasPelaForca, diasDosBlocos, duplasDeAliados, mapasNoAr, especiaisNoAr } from './calculo.mjs';

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
  ], agora, new Map([['COLT', [{ dia: '2026-10-16', efeito: -0.1 }]]]));
  const colt = r.find((x) => x.brawler === 'COLT');
  const w = (dias) => 0.5 ** (dias / 14);
  // O dia 16 sai; o dia 15 vale 0,6 - 0,1.
  perto(colt.picks, 100 * (w(0) + w(2)));
  perto(colt.winRate, (0.5 * w(0) + 0.5 * w(2)) / (w(0) + w(2)));
  perto(r.find((x) => x.brawler === 'BEA').winRate, 0.6);
});

test('pesarPorIdade soma o efeito de todos os patches que vieram depois do dia', () => {
  const agora = Date.parse('2026-10-17T12:00:00Z');
  const r = pesarPorIdade([
    { brawler: 'COLT', day: '2026-10-11T00:00:00.000', picks: '100', winRate: '0.5' },
    { brawler: 'COLT', day: '2026-10-12T00:00:00.000', picks: '100', winRate: '0.9' },
    { brawler: 'COLT', day: '2026-10-14T00:00:00.000', picks: '100', winRate: '0.7' },
    { brawler: 'COLT', day: '2026-10-15T00:00:00.000', picks: '100', winRate: '0.9' },
    { brawler: 'COLT', day: '2026-10-17T00:00:00.000', picks: '100', winRate: '0.6' },
  ], agora, new Map([['COLT', [{ dia: '2026-10-12', efeito: 0.1 }, { dia: '2026-10-15', efeito: -0.05 }]]]));
  const w = (dias) => 0.5 ** (dias / 14);
  // Os dias 12 e 15 saem. O dia 11 anda os dois efeitos, o 14 só o segundo, o 17 nenhum.
  const total = w(6) + w(3) + w(0);
  perto(r[0].picks, 100 * total);
  perto(r[0].winRate, ((0.5 + 0.1 - 0.05) * w(6) + (0.7 - 0.05) * w(3) + 0.6 * w(0)) / total);
});

const diaDe = (brawler, day, picks, winRate) => ({ brawler, day: `${day}T00:00:00.000`, picks: String(picks), winRate: String(winRate) });

test('efeitoDosPatches usa só o chute quando ainda não há dia depois do patch', () => {
  const agora = Date.parse('2026-10-17T12:00:00Z');
  const linhas = [diaDe('COLT', '2026-10-10', 1000, 0.6), diaDe('BEA', '2026-10-10', 1000, 0.4)];
  const patches = [{ data: '2026-10-17', mudancas: [{ brawler: 'Colt', direcao: 'nerf', tamanho: 'media' }] }];
  const e = efeitoDosPatches(linhas, patches, agora, { nerf: { media: -0.025 } });
  assert.deepEqual([...e.keys()], ['COLT']);
  perto(e.get('COLT')[0].efeito, -0.025);
  assert.equal(e.get('COLT')[0].dia, '2026-10-17');
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
  perto(e.get('COLT')[0].efeito, (velho * -0.02 + novo * (0.04 - 0.1)) / (velho + novo));
});

test('efeitoDosPatches guarda todos os patches do brawler, em ordem, e ignora patch futuro', () => {
  const agora = Date.parse('2026-10-17T12:00:00Z');
  const patches = [
    { data: '2026-10-10', mudancas: [{ brawler: 'COLT', direcao: 'nerf', tamanho: 'media' }] },
    { data: '2026-10-01', mudancas: [{ brawler: 'COLT', direcao: 'buff', tamanho: 'media' }] },
    { data: '2026-10-20', mudancas: [{ brawler: 'COLT', direcao: 'buff', tamanho: 'grande' }] },
  ];
  const e = efeitoDosPatches([], patches, agora, { nerf: { media: -0.025 }, buff: { media: 0.03, grande: 0.017 } });
  assert.deepEqual(e.get('COLT').map((p) => p.dia), ['2026-10-01', '2026-10-10']);
  perto(e.get('COLT')[0].efeito, 0.03);
  perto(e.get('COLT')[1].efeito, -0.025);
});

test('efeitoDosPatches mede cada patch em sequência, com o antes andando os efeitos anteriores', () => {
  const agora = Date.parse('2026-10-12T12:00:00Z');
  // Média do dia 0,5. Colt fica no nível da média até 05/10, 10 pontos acima até 10/10 e 4 acima depois.
  const linhas = [
    diaDe('COLT', '2026-10-03', 1000, 0.5), diaDe('BEA', '2026-10-03', 1000, 0.5),
    diaDe('COLT', '2026-10-07', 1000, 0.6), diaDe('BEA', '2026-10-07', 1000, 0.4),
    diaDe('COLT', '2026-10-12', 1000, 0.54), diaDe('BEA', '2026-10-12', 1000, 0.46),
  ];
  const patches = [
    { data: '2026-10-05', mudancas: [{ brawler: 'COLT', direcao: 'buff', tamanho: 'media' }] },
    { data: '2026-10-10', mudancas: [{ brawler: 'COLT', direcao: 'nerf', tamanho: 'media' }] },
  ];
  const e = efeitoDosPatches(linhas, patches, agora, { buff: { media: 0.03 }, nerf: { media: -0.025 } });
  const w = (dias) => 0.5 ** (dias / 14);
  // Primeiro patch: antes é o dia 3 (no nível 0), depois é só o dia 7 (+0,10), porque o dia 12 já é do segundo.
  const velho1 = 0.1 * 1000 * w(9);
  const e1 = (velho1 * 0.03 + 1000 * w(5) * 0.1) / (velho1 + 1000 * w(5));
  perto(e.get('COLT')[0].efeito, e1);
  // Segundo patch: o dia 3 anda o efeito do primeiro; o dia 7 fica como está.
  const antes = (e1 * w(9) + 0.1 * w(5)) / (w(9) + w(5));
  const velho2 = 0.1 * 1000 * (w(9) + w(5));
  perto(e.get('COLT')[1].efeito, (velho2 * -0.025 + 1000 * (0.04 - antes)) / (velho2 + 1000));
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

test('confrontosEmCascata separa a força do inimigo do confronto e puxa o confronto pro modo', () => {
  // Colt contra Bea e Shelly, em dois mapas do mesmo modo. Bea é forte no mapa A (+5).
  const mapaA = {
    modo: 'gemGrab',
    linhas: [['Colt', 'Bea', 100, 0.4], ['Colt', 'Shelly', 100, 0.6]],
    forca: new Map([['Bea', 0.05], ['Shelly', 0]]),
  };
  const mapaB = { modo: 'gemGrab', linhas: [['Colt', 'Bea', 1000, 0.45], ['Colt', 'Shelly', 1000, 0.55]], forca: new Map() };
  const [a] = confrontosEmCascata([mapaA, mapaB], 400);
  // No B, o resto de Colt x Bea é 0,45 - 0,5 = -0,05. No ranqueado sem o A, também -0,05,
  // puxado pra zero: -50 / 1400. O modo sem o A: (-50 + 400 × g) / 1400.
  const g = -50 / 1400;
  const doModo = (-50 + 400 * g) / 1400;
  // No A, o resto é 0,4 - 0,5 + 0,05 = -0,05; o efeito é -0,05 (força) + o resto puxado pro modo.
  const [, n, efeito] = a.get('Colt').find((c) => c[0] === 'Bea');
  assert.equal(n, 100);
  perto(efeito, -0.05 + (100 * -0.05 + 400 * doModo) / 500);
});

test('escolherConfrontos deixa de fora confronto com menos de 30 partidas', () => {
  const r = escolherConfrontos([['Bea', 29, -0.2], ['Shelly', 100, -0.05], ['Colt', 100, 0.03]]);
  assert.deepEqual(r, { bom: [['Colt', 0.03]], ruim: [['Shelly', -0.05]] });
});

test('tabelaDeConfrontos guarda todo confronto com amostra e contém os 5 do escolherConfrontos', () => {
  // B0 tem 29 partidas e fica de fora; os outros vão de -7 a +7 pontos.
  const efeitos = Array.from({ length: 30 }, (_, i) => [`B${i}`, i === 0 ? 29 : 100, (i - 15) / 200]);
  const tabela = tabelaDeConfrontos(efeitos);
  assert.equal(Object.keys(tabela).length, 29);
  assert.equal(tabela.B0, undefined);
  const { bom, ruim } = escolherConfrontos(efeitos);
  assert.equal(bom.length, 5);
  assert.equal(ruim.length, 5);
  for (const [inimigo, efeito] of [...bom, ...ruim]) assert.equal(tabela[inimigo], efeito);
});

test('tabelaDeConfrontos arredonda o efeito em milésimos', () => {
  assert.deepEqual(tabelaDeConfrontos([['Bea', 100, 0.05649], ['Colt', 100, -0.0126]]), { Bea: 0.056, Colt: -0.013 });
});

test('duplasPelaForca ordena pela soma das forças e puxa a sinergia pra zero', () => {
  // Duas duplas com a mesma vitória: a de brawlers fortes vale menos sinergia, mas a
  // soma das forças é que manda.
  const forca = new Map([['A', 0.04], ['B', 0.04], ['C', 0], ['D', 0]]);
  const duplas = { 'A|B': { n: 1000, v: 580 }, 'C|D': { n: 1000, v: 510 } };
  const [lista] = duplasPelaForca([{ duplas, forca, media: 0.5 }], 1000);
  assert.deepEqual(lista.map((d) => d.par.join('|')), ['A|B', 'C|D']);
  // Fator: (0,08 × 80) / (1000 × 0,08²) = 1. A|B: 0,08 + (80 - 80) / 2000 = 0,08.
  perto(lista[0].nota, 0.08);
  // C|D: 0 + 10 / 2000.
  perto(lista[1].nota, 0.005);
  perto(lista[1].wr, 0.51);
});

const bloco = (brawler, fim, picks, winRate) => ({ brawler, season: `${fim}T00:00:00.000`, picks: String(picks), winRate: String(winRate) });

test('diasDosBlocos divide o bloco pelos 14 dias antes do fim', () => {
  const agora = Date.parse('2026-10-27T12:00:00Z');
  const d = diasDosBlocos([bloco('COLT', '2026-10-19', 1400, 0.6)], agora);
  assert.equal(d.length, 14);
  assert.deepEqual([d[0].day, d.at(-1).day], ['2026-10-05', '2026-10-18']);
  perto(d[0].picks, 100);
  assert.equal(d[0].winRate, '0.6');
  assert.deepEqual([d[0].de, d[0].ate], ['2026-10-05', '2026-10-18']);
});

test('diasDosBlocos divide o bloco em andamento só pelos dias que já passaram', () => {
  const agora = Date.parse('2026-10-27T12:00:00Z');
  const d = diasDosBlocos([bloco('COLT', '2026-11-02', 900, 0.5)], agora);
  // O bloco vai de 19/10 a 01/11; até hoje (27/10) são 9 dias.
  assert.equal(d.length, 9);
  perto(d[0].picks, 100);
  assert.deepEqual([d[0].de, d[0].ate], ['2026-10-19', '2026-10-27']);
});

test('diasDosBlocos com pesarPorIdade desloca só a parte do bloco de antes do patch', () => {
  const agora = Date.parse('2026-10-27T12:00:00Z');
  const linhas = diasDosBlocos([bloco('COLT', '2026-10-19', 1400, 0.6)], agora);
  const r = pesarPorIdade(linhas, agora, new Map([['COLT', [{ dia: '2026-10-12', efeito: -0.1 }]]]));
  // Dias 5 a 11 andam -0,1, o dia 12 sai, dias 13 a 18 ficam.
  const w = (dia) => 0.5 ** ((agora - Date.parse(`${dia}T12:00:00Z`)) / 864e5 / 14);
  const dias = linhas.map((l) => l.day).filter((d) => d !== '2026-10-12');
  const antes = dias.filter((d) => d < '2026-10-12').reduce((s, d) => s + w(d), 0);
  const total = dias.reduce((s, d) => s + w(d), 0);
  perto(r[0].picks, 100 * total);
  perto(r[0].winRate, 0.6 - (0.1 * antes) / total);
});

test('efeitoDosPatches não mede no bloco que mistura antes e depois do patch', () => {
  const agora = Date.parse('2026-10-27T12:00:00Z');
  const linhas = diasDosBlocos([
    bloco('COLT', '2026-10-05', 1400, 0.6), bloco('BEA', '2026-10-05', 1400, 0.4),
    bloco('COLT', '2026-10-19', 1400, 0.9), bloco('BEA', '2026-10-19', 1400, 0.1),
    bloco('COLT', '2026-11-02', 900, 0.54), bloco('BEA', '2026-11-02', 900, 0.46),
  ], agora);
  const patches = [{ data: '2026-10-12', mudancas: [{ brawler: 'COLT', direcao: 'nerf', tamanho: 'pequena' }] }];
  const e = efeitoDosPatches(linhas, patches, agora, { nerf: { pequena: -0.02 } });
  // Sem o bloco do meio, Colt fica 10 pontos acima antes e 4 depois.
  const w = (dia) => 0.5 ** ((agora - Date.parse(`${dia}T12:00:00Z`)) / 864e5 / 14);
  const soma = (fim, n) => diasDosBlocos([bloco('X', fim, n, 0)], agora).reduce((s, l) => s + l.picks * w(l.day), 0);
  const velho = 0.1 * soma('2026-10-05', 1400);
  const novo = soma('2026-11-02', 900);
  perto(e.get('COLT')[0].efeito, (velho * -0.02 + novo * (0.04 - 0.1)) / (velho + novo));
});

test('duplasDeAliados junta os dois lados da dupla, como duplasDeTimes', () => {
  const d = duplasDeAliados([
    { brawler: 'COLT', ally: 'BEA', picks: '10', winRate: '0.6' },
    { brawler: 'BEA', ally: 'COLT', picks: '30', winRate: '0.4' },
    { brawler: 'EL PRIMO', ally: 'COLT', picks: '5', winRate: '1' },
  ]);
  assert.deepEqual(d, { 'Bea|Colt': { n: 40, v: 18 }, 'Colt|El Primo': { n: 5, v: 5 } });
});

const partida = (mode, map, hora, eventId = '1') => ({ mode, map, eventId, timestamp: `2026-11-07T${hora}:00.000Z` });
const nomes = (linhas) => linhas.map((r) => r.map).sort();

test('mapasNoAr mede a folga a partir da última partida, e não do relógio', () => {
  const linhas = [partida('gemGrab', 'A', '10:00'), partida('gemGrab', 'B', '05:00'), partida('gemGrab', 'C', '03:59')];
  // Seis horas antes da última partida (10h) é 4h: B fica, C sai.
  assert.deepEqual(nomes(mapasNoAr(linhas, (ultima) => ultima - 6 * 36e5)), ['A', 'B']);
});

test('mapasNoAr ignora os mapas de Competition, até na última partida', () => {
  const linhas = [partida('gemGrab', 'A', '10:00'), partida('brawlBall', 'Competition Entry', '23:00', '0')];
  assert.deepEqual(nomes(mapasNoAr(linhas, (ultima) => ultima - 36e5)), ['A']);
});

const fora = new Set(['gemGrab', 'duoShowdown']);

test('especiaisNoAr ignora os modos da API oficial e do Ranqueado', () => {
  // O BTN mistura partidas do Ranqueado; Gem Grab já vem da API.
  const linhas = [partida('gemGrab', 'Ranqueado', '10:00'), partida('duoShowdown', 'Normal', '10:00'), partida('megaDuoShowdown', 'Especial', '09:50')];
  assert.deepEqual(especiaisNoAr(linhas, fora), ['megaDuoShowdown|Especial']);
});

test('especiaisNoAr fica com o mapa de partida mais recente de cada modo', () => {
  // O evento trocou de mapa: o anterior ainda aparece nas últimas horas.
  const linhas = [partida('megaDuoShowdown', 'Saiu', '09:58'), partida('megaDuoShowdown', 'Entrou', '10:20'), partida('megaShowdown', 'Outro', '10:15')];
  assert.deepEqual(especiaisNoAr(linhas, fora).sort(), ['megaDuoShowdown|Entrou', 'megaShowdown|Outro']);
});

test('especiaisNoAr tira o modo que parou de ser jogado antes da última partida', () => {
  // O evento acabou: a última partida dele é de mais de uma hora antes da última gravada.
  const linhas = [partida('gemGrab', 'A', '12:00'), partida('megaDuoShowdown', 'Acabou', '10:30')];
  assert.deepEqual(especiaisNoAr(linhas, fora), []);
});

test('especiaisNoAr ignora os mapas de Competition', () => {
  const linhas = [partida('megaShowdown', 'Competition Entry', '10:20', '0'), partida('megaShowdown', 'Normal', '10:10')];
  assert.deepEqual(especiaisNoAr(linhas, fora), ['megaShowdown|Normal']);
});

test('especiaisNoAr sem partida nenhuma devolve lista vazia', () => {
  assert.deepEqual(especiaisNoAr([], fora), []);
});

test('mapasNoAr sem partida nenhuma devolve lista vazia', () => {
  assert.deepEqual(mapasNoAr([], (ultima) => ultima), []);
});
