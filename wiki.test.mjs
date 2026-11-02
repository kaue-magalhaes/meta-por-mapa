import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lerFicha, buscarFichas, atributosDaSemana } from './wiki.mjs';

// Trechos reais das fichas, de 01/11/2026.
const AMBER = `{{Brawler Infobox
|Title = Fire Starter
|Health = 3400
|AttackRange = 8.33 (Long)
|Reload = 0.22 seconds (8.8 seconds max; Very Fast)
|AttackCooldown = }}`;
const BROCK = `{{Brawler_Infobox|Title = Boom!|Health = 3000|AttackRange = 9 (Long)<br>11 (with Rocket No. 4 and Buffie)|Reload = 1.95 seconds (Normal)|AttackBullets = 3}}`;
const MORTIS = `{{Brawler Infobox
|HealthLabel = Health
|Health = 4000
|AttackRange = 2.67 (Short)<br>4.67 (with dash bar charged)
|Reload = 2.4 seconds (Very Slow)}}`;
const KAZE = `{{Kaze Infobox|Title = Ninja|MovementSpeed = 855 (geisha; Very Fast)}}`;

test('lerFicha tira vida, alcance e o rótulo da recarga', () => {
  assert.deepEqual(lerFicha(AMBER), { vida: 3400, alcance: 8.33, recarga: 'muito rápida' });
  assert.deepEqual(lerFicha(MORTIS), { vida: 4000, alcance: 2.67, recarga: 'muito lenta' });
});

test('lerFicha usa só o primeiro valor de cada campo', () => {
  assert.deepEqual(lerFicha(BROCK), { vida: 3000, alcance: 9, recarga: 'normal' });
});

test('lerFicha devolve null sem nenhum dos três campos', () => {
  assert.equal(lerFicha(KAZE), null);
  assert.equal(lerFicha(''), null);
});

// Resposta do Fandom no formato de action=query com formatversion=2.
const resposta = (corpo) => async () => ({ ok: true, json: async () => corpo });

test('buscarFichas segue normalização e redirecionamento do título', async () => {
  const buscar = resposta({
    query: {
      normalized: [{ from: 'Mr. P', to: 'Mr. P' }],
      redirects: [{ from: 'Jae-Yong', to: 'Jae-yong' }],
      pages: [
        { title: 'Jae-yong', revisions: [{ slots: { main: { content: BROCK } } }] },
        { title: 'Mr. P', revisions: [{ slots: { main: { content: AMBER } } }] },
        { title: 'Kaze', revisions: [{ slots: { main: { content: KAZE } } }] },
      ],
    },
  });
  assert.deepEqual(await buscarFichas(['Jae-Yong', 'Mr. P', 'Kaze'], buscar), {
    'Jae-Yong': { vida: 3000, alcance: 9, recarga: 'normal' },
    'Mr. P': { vida: 3400, alcance: 8.33, recarga: 'muito rápida' },
  });
});

test('buscarFichas pede de 50 em 50 e falha com resposta ruim', async () => {
  const pedidos = [];
  const buscar = async (url) => {
    pedidos.push(new URL(url).searchParams.get('titles').split('|').length);
    return { ok: true, json: async () => ({ query: { pages: [] } }) };
  };
  await buscarFichas(Array.from({ length: 108 }, (_, i) => `B${i}`), buscar);
  assert.deepEqual(pedidos, [50, 50, 8]);
  await assert.rejects(buscarFichas(['Amber'], async () => ({ ok: false, status: 503 })), /503/);
});

const DIA = 864e5;
const AGORA = Date.parse('2026-11-01T12:00:00Z');
const arquivoCom = async (conteudo) => {
  const arquivo = join(await mkdtemp(join(tmpdir(), 'wiki-')), 'atributos.json');
  if (conteudo) await writeFile(arquivo, JSON.stringify(conteudo));
  return arquivo;
};
const guardado = (dias, nomes) => ({ geradoEm: new Date(AGORA - dias * DIA).toISOString(), nomes, brawlers: { Amber: { vida: 1, alcance: 1, recarga: 'normal' } } });
const wikiCom = (texto) => async () => ({ ok: true, json: async () => ({ query: { pages: [{ title: 'Amber', revisions: [{ slots: { main: { content: texto } } }] }] } }) });

test('atributosDaSemana usa o arquivo com menos de 7 dias e os mesmos nomes', async () => {
  const arquivo = await arquivoCom(guardado(3, ['Amber', 'Kaze']));
  // Contar em vez de falhar dentro da busca: o erro seria engolido como falha do wiki.
  let chamadas = 0;
  const r = await atributosDaSemana(arquivo, ['Amber', 'Kaze'], { agora: AGORA, buscar: async () => { chamadas++; return { ok: false, status: 500 }; } });
  assert.equal(chamadas, 0);
  assert.equal(r.brawlers.Amber.vida, 1);
});

test('atributosDaSemana busca de novo com arquivo velho ou nome novo, e grava', async () => {
  for (const [dias, nomes] of [[8, ['Amber']], [1, []]]) {
    const arquivo = await arquivoCom(guardado(dias, nomes));
    const r = await atributosDaSemana(arquivo, ['Amber'], { agora: AGORA, buscar: wikiCom(AMBER) });
    assert.equal(r.brawlers.Amber.vida, 3400);
    assert.deepEqual(JSON.parse(await readFile(arquivo, 'utf8')), r);
  }
});

test('atributosDaSemana fica com o anterior quando o wiki falha', async () => {
  const arquivo = await arquivoCom(guardado(8, ['Amber']));
  const r = await atributosDaSemana(arquivo, ['Amber'], { agora: AGORA, buscar: async () => ({ ok: false, status: 503 }) });
  assert.equal(r.brawlers.Amber.vida, 1);
  const semArquivo = await atributosDaSemana(await arquivoCom(null), ['Amber'], { agora: AGORA, buscar: async () => { throw new Error('sem rede'); } });
  assert.equal(semArquivo, null);
});
