import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PESO_FORCA, SD_SEM_MARGEM, pesoNoDraft, confrontoLido, recomendar, comEmpate, chanceDoTime, leitura, maiorPerigo, quemGanhaDele, compactarTabela, expandirTabela } from './draft.mjs';

// Mapa de brinquedo. A ganha de E por uma ponta (+0,01) e perde pela outra (E contra A
// +0,03, com a força de A de volta): pela conta da nota, A perde de E. B ganha de E e de F
// pelas duas pontas. C não tem número contra ninguém. D tem força mas não está na tier
// list (pouco jogado).
const brinquedo = {
  brawlers: [
    { nome: 'A', uso: 0.2, sd: 0.01 },
    { nome: 'B', uso: 0.1, sd: 0.01 },
    { nome: 'C', uso: 0.1, sd: 0.01 },
    { nome: 'E', uso: 0.3, sd: 0.01 },
    { nome: 'F', uso: 0.1, sd: 0.01 },
  ],
  forca: { A: 0.02, B: 0.01, C: 0.015, D: 0.005, E: 0, F: 0.01 },
  tabela: {
    A: { E: 0.01 },
    E: { A: 0.03, B: -0.02 },
    B: { E: 0.01, F: 0.03 },
    F: { A: 0.04, B: -0.01 },
  },
};

// Recorte do Double Swoosh (Arco duplo) no Ranqueado de 15/11/2026, fixo aqui para o teste
// não depender do mapa estar na rotação. A linha do Mr. P contra a Emz é -0,053, e uma
// ponta só dizia "contra Emz -5,3". Com a força de volta nas duas pontas, a conta dá
// ((-0,053 + 0,0496) - (-0,082 + 0,0668)) / 2 = +0,0059.
const arcoDuplo = {
  brawlers: [
    { nome: 'Emz', uso: 0.0544, sd: 0.0034 },
    { nome: 'Mr. P', uso: 0.0227, sd: 0.0051 },
  ],
  forca: { 'Mr. P': 0.0668, Emz: 0.0496 },
  tabela: { 'Mr. P': { Emz: -0.053 }, Emz: { 'Mr. P': -0.082 } },
};

test('motivo usa as duas pontas: Mister P ganha de Emz em Double Swoosh', () => {
  const m = arcoDuplo;
  const r = recomendar(m, new Set(), ['Emz'], 200).find((x) => x.nome === 'Mr. P');
  assert.equal(r.motivo.tipo, 'ganha');
  assert.equal(r.motivo.contra, 'Emz');
  assert.ok(Math.abs(r.motivo.valor - 0.006) < 0.002); // +0,6 ponto
});

test('motivo não segue uma ponta só: A perde de E mesmo com a linha dele positiva', () => {
  const a = recomendar(brinquedo, new Set(['E']), ['E'], Infinity).find((r) => r.nome === 'A');
  assert.equal(a.motivo.tipo, 'perde');
  assert.equal(a.motivo.contra, 'E');
  assert.ok(Math.abs(a.motivo.valor - confrontoLido(brinquedo, 'A', 'E')) < 1e-12);
  assert.ok(!('pesou' in a));
});

test('motivo perde mostra o pior confronto quando nenhum é positivo', () => {
  // A contra E: (0,01 - 0,05) / 2 = -0,02. A contra F: só a volta, -(0,04 + 0,02) = -0,06.
  const a = recomendar(brinquedo, new Set(['E', 'F']), ['E', 'F'], Infinity).find((r) => r.nome === 'A');
  assert.equal(a.motivo.tipo, 'perde');
  assert.equal(a.motivo.contra, 'F');
  assert.ok(Math.abs(a.motivo.valor - -0.06) < 1e-12);
});

test('motivo ganha mostra o maior confronto positivo', () => {
  // B contra E: (0,01 - (-0,02 + 0,01)) / 2 = 0,01. B contra F: (0,04 - 0) / 2 = 0,02.
  const b = recomendar(brinquedo, new Set(['E', 'F']), ['E', 'F'], Infinity).find((r) => r.nome === 'B');
  assert.deepEqual({ ...b.motivo, valor: Math.round(b.motivo.valor * 1e6) / 1e6 }, { tipo: 'ganha', contra: 'F', valor: 0.02 });
});

test('motivo sem quando não há inimigo nem dado', () => {
  const semInimigo = recomendar(brinquedo, new Set(), [], Infinity);
  assert.ok(semInimigo.every((r) => r.motivo.tipo === 'sem'));
  const c = recomendar(brinquedo, new Set(['E']), ['E'], Infinity).find((r) => r.nome === 'C');
  assert.deepEqual(c.motivo, { tipo: 'sem' });
});

test('sinal do motivo bate com o termo de confronto da nota', () => {
  const peso = pesoNoDraft(brinquedo);
  for (const inimigos of [['E'], ['F'], ['E', 'F']]) {
    for (const r of recomendar(brinquedo, new Set(inimigos), inimigos, Infinity)) {
      if (r.motivo.tipo === 'sem') continue;
      const termo = peso(r.nome, [r.motivo.contra]) - peso(r.nome, []);
      assert.equal(Math.sign(r.motivo.valor), Math.sign(termo), `${r.nome} contra ${r.motivo.contra}`);
      assert.equal(r.motivo.tipo, termo > 0 ? 'ganha' : 'perde', `${r.nome} contra ${r.motivo.contra}`);
    }
  }
});

test('recomendar ordena pela nota e corta em quantos', () => {
  const peso = pesoNoDraft(brinquedo);
  const r = recomendar(brinquedo, new Set(['E']), ['E'], 2);
  assert.equal(r.length, 2);
  const notas = Object.keys(brinquedo.forca).filter((n) => n !== 'E').map((n) => peso(n, ['E'])).sort((a, b) => b - a);
  assert.deepEqual(r.map((x) => x.nota), notas.slice(0, 2));
});

// O mesmo brinquedo com a nota da tier list (freio por uso): A é forte mas quase ninguém
// usa, e a nota dele cai a zero.
const comNota = { ...brinquedo, nota: { ...brinquedo.forca, A: 0 } };

test('recomendar ordena pela nota da tier list quando o mapa tem uma', () => {
  const ordem = recomendar(comNota, new Set(), [], Infinity).map((r) => r.nome);
  assert.ok(ordem.indexOf('A') > ordem.indexOf('B'), ordem.join(','));
  assert.equal(recomendar(brinquedo, new Set(), [], Infinity)[0].nome, 'A');
  // O confronto continua o mesmo: só a parte da força troca.
  const a = recomendar(comNota, new Set(['E']), ['E'], Infinity).find((r) => r.nome === 'A');
  assert.ok(Math.abs(a.nota - (pesoNoDraft(brinquedo)('A', ['E']) - PESO_FORCA * 0.02)) < 1e-12);
});

test('chanceDoTime não usa a nota da tier list, só a força calibrada', () => {
  assert.equal(chanceDoTime(comNota, ['A'], ['E']), chanceDoTime(brinquedo, ['A'], ['E']));
});

test('recomendar inclui brawler sem posição na tier list', () => {
  const d = recomendar(brinquedo, new Set(), [], Infinity).find((r) => r.nome === 'D');
  assert.equal(d.pos, undefined);
  assert.equal(d.sd, SD_SEM_MARGEM);
  assert.equal(recomendar(brinquedo, new Set(), [], Infinity).find((r) => r.nome === 'B').pos, 2);
});

test('quemGanhaDele ordena por confrontoLido e ignora quem está fora', () => {
  // Contra A: F +0,06 (só a linha dele), E +0,02 ((0,05 - 0,01) / 2); B, C e D sem número.
  const contraA = quemGanhaDele(brinquedo, 'A', new Set(['A']));
  assert.deepEqual(contraA.map(([n]) => n), ['F', 'E']);
  assert.ok(contraA.every(([n, v]) => Math.abs(v - confrontoLido(brinquedo, n, 'A')) < 1e-12));
  assert.deepEqual(quemGanhaDele(brinquedo, 'A', new Set(['A', 'F'])).map(([n]) => n), ['E']);
  // Contra F: B +0,02 e A -0,06. Negativo não entra.
  assert.deepEqual(quemGanhaDele(brinquedo, 'F', new Set(['F'])).map(([n]) => n), ['B']);
  assert.deepEqual(quemGanhaDele(brinquedo, 'F', new Set(['F', 'B'])), []);
});

test('maiorPerigo é null com um inimigo só', () => {
  assert.equal(maiorPerigo(brinquedo, ['E']), null);
  assert.equal(maiorPerigo(brinquedo, []), null);
  assert.equal(maiorPerigo(brinquedo, ['E', 'F']), 'F');
});

test('comEmpate põe o seu forte na frente dentro do grupo empatado', () => {
  const lista = [
    { nome: 'X', nota: 0.1, sd: 0.01 },
    { nome: 'Y', nota: 0.09, sd: 0.01 },
    { nome: 'Z', nota: 0.0, sd: 0.01 },
  ];
  // X e Y empatam: 0,01 < 3,88 * hypot(0,01, 0,01). Z fica fora do grupo.
  assert.ok(0.01 < PESO_FORCA * Math.hypot(0.01, 0.01));
  const r = comEmpate(lista, { seuForte: (n) => n === 'Y' || n === 'Z', recorde: () => 0 });
  assert.deepEqual(r.lista.map((x) => x.nome), ['Y', 'X', 'Z']);
  assert.equal(r.empatados, 2);
  const porRecorde = comEmpate(lista, { seuForte: () => false, recorde: (n) => ({ X: 100, Y: 500 }[n] ?? 0) });
  assert.deepEqual(porRecorde.lista.map((x) => x.nome), ['Y', 'X', 'Z']);
  const semPerfil = comEmpate(lista, { seuForte: () => false, recorde: () => 0 });
  assert.deepEqual(semPerfil.lista.map((x) => x.nome), ['X', 'Y', 'Z']);
});

test('leitura separa quem caça e quem evita pelo corte, e avisa sem dado', () => {
  // B contra E +0,01 (abaixo do corte de 0,015) e contra F +0,02.
  assert.deepEqual(leitura(brinquedo, 'B', ['E']), { caca: null, evita: null, semDado: false });
  const b = leitura(brinquedo, 'B', ['E', 'F']);
  assert.equal(b.caca[0], 'F');
  assert.equal(b.evita, null);
  const a = leitura(brinquedo, 'A', ['E', 'F']);
  assert.equal(a.caca, null);
  assert.equal(a.evita[0], 'F'); // -0,06 é pior que -0,02
  assert.deepEqual(leitura(brinquedo, 'C', ['E', 'F']), { caca: null, evita: null, semDado: true });
});

// A tabela vai para o site compacta (nomes uma vez, números em milésimos) e a página a
// remonta ao carregar. A volta precisa dar a mesma tabela: linha vazia continua existindo,
// célula sem número continua sem número, e nome que só aparece como adversário não vira linha.
test('tabela compacta volta igual à original', () => {
  const original = {
    'Mr. P': { Emz: -0.053, Bo: 0, Bolt: 0.126 },
    Emz: { 'Mr. P': -0.082 },
    Bo: {},
    Bolt: { Emz: 0.004, Shelly: -0.1 },
  };
  assert.deepEqual(expandirTabela(compactarTabela(original)), original);
});

test('tabela compacta guarda os números como inteiros em milésimos', () => {
  const c = compactarTabela({ A: { B: -0.052, C: 0.011 }, B: { A: 0.04 }, C: {} });
  assert.deepEqual(c, { nomes: ['A', 'B', 'C'], linhas: [',-52,11', '40,,', ''] });
});

test('o Draft dá a mesma nota com a tabela remontada', () => {
  const remontado = { ...brinquedo, tabela: expandirTabela(compactarTabela(brinquedo.tabela)) };
  const [antes, depois] = [pesoNoDraft(brinquedo), pesoNoDraft(remontado)];
  for (const x of ['A', 'B', 'C', 'E', 'F']) assert.equal(depois(x, ['E', 'F']), antes(x, ['E', 'F']));
});
