// worker/responder.mjs
// Busca o perfil de um jogador na API oficial do Brawl Stars e devolve só o que o Draft
// usa. A busca e o limitador chegam como parâmetro, pra testar com node --test sem a
// Cloudflare; index.mjs liga os de verdade. Decisões e fontes em
// ~/.claude/spec/brawl-meta/ferramenta-meta/2026-11-08-perfil-por-tag-design.md.
import { normalizarTag, resumirPerfil } from '../perfil.mjs';

export const ORIGEM = 'https://kaue-magalhaes.github.io';
// A chave da Supercell só aceita IPs cadastrados e a Worker não tem IP fixo. O proxy da
// RoyaleAPI tem: a chave da Worker leva o IP 45.79.218.79.
const API = 'https://bsproxy.royaleapi.dev/v1/players/%23';
const LIMITE_MS = 3000;
// Os tempos do BTN: 3 minutos de cache e, com a API fora, a última versão por 15.
const CACHE_OK = 'public, max-age=180, stale-while-revalidate=60, stale-if-error=900';
// Tag que não existe fica 1 minuto, pra quem repete a tag errada não chegar à API.
const CACHE_NAO_EXISTE = 'public, max-age=60';
const CORS = { 'access-control-allow-origin': ORIGEM, vary: 'Origin' };

const json = (status, corpo, cache = 'no-store') =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache, ...CORS },
  });

// Status da API -> erro nosso. O resto (500, 403, redirecionamento) vira "fora".
const ERROS = {
  404: [404, 'nao-existe', CACHE_NAO_EXISTE],
  429: [429, 'ocupado'],
  503: [503, 'manutencao'],
};

function tagDoCaminho(url) {
  const m = new URL(url).pathname.match(/^\/perfil\/([^/]+)$/);
  if (!m) return null;
  try {
    return normalizarTag(decodeURIComponent(m[1]));
  } catch {
    return null;
  }
}

/**
 * @param {Request} pedido
 * @param {{ chave: string, buscar: typeof fetch, limite?: { limit(o: { key: string }): Promise<{ success: boolean }> }, log?: (linha: string) => void }} deps
 * @returns {Promise<Response>}
 */
export async function responder(pedido, { chave, buscar, limite, log = console.log }) {
  if (pedido.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { ...CORS, 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-max-age': '86400' },
    });
  }
  if (pedido.method !== 'GET') return new Response(null, { status: 405, headers: { allow: 'GET, OPTIONS', ...CORS } });

  const tag = tagDoCaminho(pedido.url);
  if (!tag) return json(400, { erro: 'tag-invalida' });

  if (limite) {
    try {
      const { success } = await limite.limit({ key: pedido.headers.get('cf-connecting-ip') ?? 'sem-ip' });
      if (!success) return json(429, { erro: 'ocupado' });
    } catch (e) {
      log(`perfil ${tag}: limitador falhou (${e.name}), seguindo sem limite`);
    }
  }

  const inicio = Date.now();
  let r;
  try {
    r = await buscar(API + tag, {
      headers: { authorization: `Bearer ${chave}` },
      redirect: 'manual',
      signal: AbortSignal.timeout(LIMITE_MS),
    });
  } catch (e) {
    log(`perfil ${tag}: sem resposta da API (${e.name}) em ${Date.now() - inicio} ms`);
    return json(502, { erro: 'fora' });
  }
  log(`perfil ${tag}: API ${r.status} em ${Date.now() - inicio} ms`);

  if (r.status !== 200) {
    if (r.status === 403) log(`ATENÇÃO perfil ${tag}: a API recusou a chave (403). Confira o segredo SUPERCELL_KEY e o IP 45.79.218.79 na chave.`);
    // Ler o corpo fecha a conexão (lição do BTN, commit f3b57e5). A mensagem não é repassada.
    await r.text().catch(() => {});
    const [status, erro, cache] = ERROS[r.status] ?? [502, 'fora'];
    return json(status, { erro }, cache);
  }
  const dados = await r.json().catch(() => null);
  if (!Array.isArray(dados?.brawlers)) {
    log(`perfil ${tag}: resposta 200 sem lista de brawlers`);
    return json(502, { erro: 'fora' });
  }
  return json(200, resumirPerfil(tag, dados), CACHE_OK);
}
