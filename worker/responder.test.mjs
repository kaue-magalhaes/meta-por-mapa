// worker/responder.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { responder, ORIGEM } from './responder.mjs';

const CHAVE = 'chave-de-teste-nao-real';
const pedido = (caminho, init = {}) => new Request(`https://w.example${caminho}`, init);
const resposta = (status, corpo = {}) => new Response(JSON.stringify(corpo), { status });

// Busca falsa que lembra o que recebeu.
function falsa(r) {
  const chamadas = [];
  const buscar = async (url, init) => {
    chamadas.push({ url, init });
    if (r instanceof Error) throw r;
    return r;
  };
  return { buscar, chamadas };
}

const PERFIL = { name: 'k a u e', brawlers: [{ name: 'BIBI', power: 11, gadgets: [1], starPowers: [1], hyperCharges: [1], highestTrophies: 900 }] };

test('perfil encontrado volta o resumo, com cache de 3 minutos e CORS só para o site', async () => {
  const { buscar, chamadas } = falsa(resposta(200, PERFIL));
  const r = await responder(pedido('/perfil/%232pu0yl92j'), { chave: CHAVE, buscar, log: () => {} });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { tag: '2PU0YL92J', nome: 'k a u e', maximizados: ['Bibi'], recordes: { Bibi: 900 } });
  assert.equal(r.headers.get('cache-control'), 'public, max-age=180, stale-while-revalidate=60, stale-if-error=900');
  assert.equal(r.headers.get('access-control-allow-origin'), ORIGEM);
  assert.equal(r.headers.get('vary'), 'Origin');
  assert.equal(chamadas[0].url, 'https://bsproxy.royaleapi.dev/v1/players/%232PU0YL92J');
  assert.equal(chamadas[0].init.headers.authorization, `Bearer ${CHAVE}`);
  assert.equal(chamadas[0].init.redirect, 'manual');
  assert.ok(chamadas[0].init.signal instanceof AbortSignal);
});

test('tag inválida volta 400 sem chamar a API', async () => {
  const { buscar, chamadas } = falsa(resposta(200, PERFIL));
  for (const caminho of ['/perfil/abc', '/perfil/', '/perfil/%E0%A4%A', '/outra/coisa']) {
    const r = await responder(pedido(caminho), { chave: CHAVE, buscar, log: () => {} });
    assert.equal(r.status, 400, caminho);
    assert.deepEqual(await r.json(), { erro: 'tag-invalida' });
  }
  assert.equal(chamadas.length, 0);
});

test('cada erro da API vira um erro de formato fixo', async () => {
  const casos = [
    [404, 404, 'nao-existe', 'public, max-age=60'],
    [429, 429, 'ocupado', 'no-store'],
    [503, 503, 'manutencao', 'no-store'],
    [500, 502, 'fora', 'no-store'],
    [403, 502, 'fora', 'no-store'],
    [302, 502, 'fora', 'no-store'],
  ];
  for (const [daApi, status, erro, cache] of casos) {
    const upstream = resposta(daApi, { reason: 'segredo', message: 'não repassar' });
    const { buscar } = falsa(upstream);
    const r = await responder(pedido('/perfil/2PU0YL92J'), { chave: CHAVE, buscar, log: () => {} });
    assert.equal(r.status, status, `API ${daApi}`);
    assert.deepEqual(await r.json(), { erro }, `API ${daApi}`);
    assert.equal(r.headers.get('cache-control'), cache, `API ${daApi}`);
    assert.equal(r.headers.get('access-control-allow-origin'), ORIGEM);
    assert.equal(upstream.bodyUsed, true, `API ${daApi}`);
  }
});

test('falha de rede ou corpo que não é JSON vira fora', async () => {
  const rede = falsa(new Error('timeout'));
  const r1 = await responder(pedido('/perfil/2PU0YL92J'), { chave: CHAVE, buscar: rede.buscar, log: () => {} });
  assert.equal(r1.status, 502);
  assert.deepEqual(await r1.json(), { erro: 'fora' });
  assert.equal(r1.headers.get('cache-control'), 'no-store');
  assert.equal(r1.headers.get('access-control-allow-origin'), ORIGEM);
  const lixo = falsa(new Response('<html>', { status: 200 }));
  const r2 = await responder(pedido('/perfil/2PU0YL92J'), { chave: CHAVE, buscar: lixo.buscar, log: () => {} });
  assert.equal(r2.status, 502);
  assert.deepEqual(await r2.json(), { erro: 'fora' });
});

test('403 da API avisa no log que a chave ou o IP estão errados, sem gravar a chave', async () => {
  const linhas = [];
  const { buscar } = falsa(resposta(403));
  await responder(pedido('/perfil/2PU0YL92J'), { chave: CHAVE, buscar, log: (l) => linhas.push(l) });
  assert.ok(linhas.some((l) => l.includes('ATENÇÃO') && l.includes('45.79.218.79')));
  assert.ok(linhas.every((l) => !l.includes(CHAVE)));
});

test('limitador estourado volta 429 sem chamar a API, contando pelo IP do visitante', async () => {
  const chaves = [];
  const limite = { limit: async ({ key }) => (chaves.push(key), { success: false }) };
  const { buscar, chamadas } = falsa(resposta(200, PERFIL));
  const r = await responder(pedido('/perfil/2PU0YL92J', { headers: { 'cf-connecting-ip': '203.0.113.7' } }), { chave: CHAVE, buscar, limite, log: () => {} });
  assert.equal(r.status, 429);
  assert.deepEqual(await r.json(), { erro: 'ocupado' });
  assert.deepEqual(chaves, ['203.0.113.7']);
  assert.equal(chamadas.length, 0);
});

test('preflight responde só para o site e outros métodos levam 405', async () => {
  const { buscar } = falsa(resposta(200, PERFIL));
  const pre = await responder(pedido('/perfil/2PU0YL92J', { method: 'OPTIONS' }), { chave: CHAVE, buscar, log: () => {} });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), ORIGEM);
  assert.equal(pre.headers.get('access-control-allow-methods'), 'GET, OPTIONS');
  const post = await responder(pedido('/perfil/2PU0YL92J', { method: 'POST' }), { chave: CHAVE, buscar, log: () => {} });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, OPTIONS');
  assert.equal(post.headers.get('access-control-allow-origin'), ORIGEM);
});

test('200 que não é perfil (sem lista de brawlers) vira fora, sem cache', async () => {
  for (const corpo of [[], { name: 'x' }, 'texto']) {
    const linhas = [];
    const { buscar } = falsa(resposta(200, corpo));
    const r = await responder(pedido('/perfil/2PU0YL92J'), { chave: CHAVE, buscar, log: (l) => linhas.push(l) });
    assert.equal(r.status, 502);
    assert.deepEqual(await r.json(), { erro: 'fora' });
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.ok(linhas.some((l) => l.includes('sem lista de brawlers')));
  }
});

test('limitador que deixa passar chama a API uma vez, contando pelo IP do visitante', async () => {
  const chaves = [];
  const limite = { limit: async ({ key }) => (chaves.push(key), { success: true }) };
  const { buscar, chamadas } = falsa(resposta(200, PERFIL));
  const r = await responder(pedido('/perfil/2PU0YL92J', { headers: { 'cf-connecting-ip': '203.0.113.7' } }), { chave: CHAVE, buscar, limite, log: () => {} });
  assert.equal(r.status, 200);
  assert.deepEqual(chaves, ['203.0.113.7']);
  assert.equal(chamadas.length, 1);
});

test('limitador que falha não derruba o pedido: segue sem limite e avisa no log', async () => {
  const linhas = [];
  const limite = { limit: async () => { throw new Error('quebrou'); } };
  const { buscar, chamadas } = falsa(resposta(200, PERFIL));
  const r = await responder(pedido('/perfil/2PU0YL92J'), { chave: CHAVE, buscar, limite, log: (l) => linhas.push(l) });
  assert.equal(r.status, 200);
  assert.equal(chamadas.length, 1);
  assert.ok(linhas.some((l) => l.includes('limitador falhou')));
});
