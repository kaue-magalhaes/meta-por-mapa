import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { freioDeUso } from './calculo.mjs';
import fixture from './tier.fixture.json' with { type: 'json' };
import { tierDe, forte, incerto, escondido, popular, nicho, selosDe, TEXTO_INCERTO, TEXTO_ESCONDIDO, TEXTO_POPULAR, TEXTO_NICHO, TEXTO_TIER } from './tier.mjs';

// Mapa inventado: média 0,5, então a nota de cada brawler na tier list é adj − 0,5.
const mapa = (parte, brawlers) => ({ parte, media: 0.5, brawlers });
const b = (nome, nota, uso, sd = null) => ({ nome, adj: 0.5 + nota, uso, sd });

test('tierDe: cada corte entra no tier de cima', () => {
  assert.equal(tierDe(0.04), 'S');
  assert.equal(tierDe(0.0399), 'A');
  assert.equal(tierDe(0.02), 'A');
  assert.equal(tierDe(-0.01), 'B');
  assert.equal(tierDe(-0.0101), 'C');
});

test('forte: a partir do corte do A', () => {
  const m = mapa('ranqueado', []);
  assert.equal(forte(b('X', 0.02, 0.1), m), true);
  assert.equal(forte(b('X', 0.0199, 0.1), m), false);
});

test('incerto: só um S com margem larga, e só com margem medida', () => {
  const m = mapa('ranqueado', []);
  assert.equal(incerto(b('X', 0.045, 0.1), m), false);
  assert.equal(incerto(b('X', 0.03, 0.1, 0.02), m), false);
  assert.equal(incerto(b('X', 0.045, 0.1, 0.02), m), true);
  assert.equal(incerto(b('X', 0.045, 0.1, 0.001), m), false);
});

test('escondido: S do Ranqueado com menos de 1% de uso e sem dúvida de ser S', () => {
  const m = mapa('ranqueado', []);
  assert.equal(escondido(b('X', 0.05, 0.009, 0.001), m), true);
  assert.equal(escondido(b('X', 0.05, 0.01, 0.001), m), false);
  assert.equal(escondido(b('X', 0.03, 0.009, 0.001), m), false);
  assert.equal(escondido(b('X', 0.05, 0.009, 0.001), mapa('trofeu', [])), false);
  assert.equal(escondido(b('X', 0.045, 0.009, 0.02), m), false);
});

test('popular: abaixo da média e entre os 10 mais usados do mapa do Ranqueado', () => {
  const lista = Array.from({ length: 11 }, (_, i) => b(`P${i}`, -0.01, 0.2 - i * 0.01));
  const m = mapa('ranqueado', lista);
  assert.equal(popular(lista[0], m), true);
  assert.equal(popular(lista[9], m), true);
  assert.equal(popular(lista[10], m), false);
  const acima = mapa('ranqueado', [b('A', 0.01, 0.3)]);
  assert.equal(popular(acima.brawlers[0], acima), false);
  const trofeu = mapa('trofeu', lista);
  assert.equal(popular(lista[0], trofeu), false);
});

test('nicho: só no Troféu, com uso abaixo de 0,5%', () => {
  const t = mapa('trofeu', []);
  assert.equal(nicho(b('X', 0, 0.0049), t), true);
  assert.equal(nicho(b('X', 0, 0.005), t), false);
  assert.equal(nicho(b('X', 0, 0.0049), mapa('ranqueado', [])), false);
});

test('selosDe: devolve chave, título e texto de cada selo que vale', () => {
  const t = mapa('trofeu', []);
  assert.deepEqual(selosDe(b('X', 0.045, 0.001), t).map((s) => s.chave), ['nicho']);
  assert.deepEqual(selosDe(b('X', 0.045, 0.01), t), []);
  const r = mapa('ranqueado', [b('Y', 0.05, 0.009, 0.001)]);
  const [selo] = selosDe(r.brawlers[0], r);
  assert.deepEqual({ chave: selo.chave, titulo: selo.titulo, texto: selo.texto }, { chave: 'escondido', titulo: 'Escondido', texto: TEXTO_ESCONDIDO });
});

// Os textos que a página mostrava em 27/11/2026, copiados do modelo.html. Os números saem
// das constantes; o texto final não pode mudar.
test('textos dos selos e dos tiers iguais aos de 27/11/2026', () => {
  assert.equal(TEXTO_INCERTO, 'Pode não ser S: com as partidas que tem, a chance de ser B ou pior passa de 10%.');
  assert.equal(TEXTO_ESCONDIDO, 'Ganha como um S e quase ninguém escolhe aqui (menos de 1% das escolhas). Parte da vitória pode ser a mão de quem treina ele: se você não joga com ele, treine antes de levar à ranqueada.');
  assert.equal(TEXTO_POPULAR, 'Está entre os 10 mais escolhidos deste mapa e ganha menos que a média. Não precisa ir com ele só porque todo mundo vai.');
  assert.equal(TEXTO_NICHO, 'Menos de 0,5% de uso. Quem leva brawler pouco usado a 1.000 troféus costuma ser especialista nele, então a vitória mede também a mão desses jogadores.');
  assert.deepEqual(TEXTO_TIER, {
    S: '4 pontos ou mais acima da média',
    A: 'de 2 a 4 pontos acima',
    B: 'perto da média, de −1 a +2 pontos',
    C: 'mais de 1 ponto abaixo da média',
  });
});

// A calibragem: os cortes (FAIXAS) e os pesos do freio (USO_FREIO, PESO_USO) foram ajustados
// juntos, e este teste avisa quando um lado muda sem o outro. A entrada são mapas gravados,
// com a força antes do freio (tier.fixture.json, coleta de 26/11/2026, refeita pelo
// tier.fixture.mjs). Ele não olha os dados ao vivo: depois de um balanceamento, o site pode
// mostrar S demais com este teste verde.
// A faixa é decisão do Kauê (27/11/2026): a calibragem de 23/11 deu mediana de 7 S por mapa,
// e a coleta de 26/11 deu 7 no Ranqueado e 8 no Troféu.
const MEDIANA_DE_S = { min: 5, max: 10 };

test('cortes e freio: mediana de S por mapa entre 5 e 10 nas duas partes', () => {
  for (const parte of ['ranqueado', 'trofeu']) {
    const sPorMapa = fixture[parte].map((pares) => {
      const freio = freioDeUso(pares.map(([, uso]) => uso));
      return pares.filter(([delta, uso]) => tierDe(freio(delta, uso)) === 'S').length;
    }).sort((a, b) => a - b);
    const meio = sPorMapa.length / 2;
    const mediana = Number.isInteger(meio) ? (sPorMapa[meio - 1] + sPorMapa[meio]) / 2 : sPorMapa[Math.floor(meio)];
    assert.ok(MEDIANA_DE_S.min <= mediana && mediana <= MEDIANA_DE_S.max,
      `${parte}: mediana de ${mediana} S por mapa, fora da faixa de ${MEDIANA_DE_S.min} a ${MEDIANA_DE_S.max}. `
      + 'Os cortes (FAIXAS) e os pesos do freio (USO_FREIO, PESO_USO) foram calibrados juntos, no tier.mjs: '
      + 'mudou um lado, reveja o outro, e mude a faixa deste teste só se a mudança for de propósito.');
  }
});

// O gerador cola o tier.mjs e o draft.mjs no script do modelo.html. Um nome declarado em
// dois deles derruba o script inteiro com SyntaxError, e a página abre em branco. A busca
// só vê um nome declarado no começo da linha: desestruturação (const { a } = ...) e vários
// nomes num let só passam sem conferência. Em 27/11 nenhum dos três tinha esses casos.
const declarados = (texto) => new Set([...texto
  .matchAll(/^(?:export )?(?:const|let|var|function\*?|async function|class) +([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]));

test('nomes colados não colidem entre o modelo.html, o draft.mjs e o tier.mjs', () => {
  const arquivos = ['modelo.html', 'draft.mjs', 'tier.mjs'];
  const textos = Object.fromEntries(arquivos.map((a) => [a, readFileSync(new URL(a, import.meta.url), 'utf8')]));
  const nomes = Object.fromEntries(arquivos.map((a) => [a, declarados(textos[a])]));
  for (const [i, a] of arquivos.entries()) {
    for (const outro of arquivos.slice(i + 1)) {
      assert.deepEqual([...nomes[a]].filter((n) => nomes[outro].has(n)), [], `${a} e ${outro} declaram os mesmos nomes`);
    }
  }
  assert.ok(nomes['tier.mjs'].size > 10 && nomes['modelo.html'].size > 100);
  for (const colado of ['draft.mjs', 'tier.mjs']) assert.doesNotMatch(textos[colado], /^import /m, `${colado} não pode ter import`);
});
