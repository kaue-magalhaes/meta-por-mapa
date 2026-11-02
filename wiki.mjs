// Alcance, vida e recarga de cada brawler, da ficha dele no wiki do Brawl Stars
// (Fandom). O modo Draft mostra esses números lado a lado na leitura da partida.
// O wiki é escrito por fãs e pode ficar uns dias atrás de um balanceamento.

import { readFile, writeFile } from 'node:fs/promises';

// O rótulo da recarga, e não os segundos: a Amber recarrega cada chama, os outros um
// tiro inteiro, e os segundos não se comparam. "Very" vem antes pra não casar só "Fast".
const RECARGA = { 'Very Fast': 'muito rápida', 'Very Slow': 'muito lenta', Fast: 'rápida', Slow: 'lenta', Normal: 'normal' };

// Primeiro valor do campo: depois do <br> vêm os casos com acessório ou poder.
const campo = (texto, nome) =>
  texto.match(new RegExp(`\\|\\s*${nome}\\s*=\\s*([^|}\\n]*)`))?.[1].split('<br>')[0].trim() ?? '';
const numero = (v) => {
  const n = v.match(/\d+(?:\.\d+)?/);
  return n ? Number(n[0]) : null;
};

// A vida da ficha é a do nível 1. Devolve null quando a ficha não tem nenhum dos três
// campos, como a da Kaze, que tem duas formas.
export function lerFicha(texto) {
  const vida = numero(campo(texto, 'Health'));
  const alcance = numero(campo(texto, 'AttackRange'));
  const rotulo = campo(texto, 'Reload').match(/Very Fast|Very Slow|Fast|Slow|Normal/)?.[0];
  const recarga = rotulo ? RECARGA[rotulo] : null;
  return vida == null && alcance == null && recarga == null ? null : { vida, alcance, recarga };
}

const API = 'https://brawlstars.fandom.com/api.php';
// Sem o e-mail: o Kauê liberou o e-mail só para o User-Agent do Brawl Time Ninja.
const AGENTE = 'meta-por-mapa (https://kaue-magalhaes.github.io/meta-por-mapa/)';

// Fichas dos brawlers pelo nome do BTN, 50 páginas por pedido (o máximo da API). O
// wiki troca o título pela grafia dele (Jae-Yong vira Jae-yong) e avisa em normalized
// e redirects. Quem não tem ficha fica de fora.
export async function buscarFichas(nomes, buscar = fetch) {
  const fichas = {};
  for (let i = 0; i < nomes.length; i += 50) {
    const lote = nomes.slice(i, i + 50);
    const url = `${API}?action=query&prop=revisions&rvprop=content&rvslots=main&redirects=1&format=json&formatversion=2&titles=${encodeURIComponent(lote.join('|'))}`;
    const r = await buscar(url, { headers: { 'User-Agent': AGENTE } });
    if (!r.ok) throw new Error(`wiki respondeu ${r.status}`);
    const { query } = await r.json();
    const titulo = new Map(lote.map((n) => [n, n]));
    for (const { from, to } of [...(query.normalized ?? []), ...(query.redirects ?? [])]) {
      for (const [n, t] of titulo) if (t === from) titulo.set(n, to);
    }
    const texto = new Map(query.pages.map((p) => [p.title, p.revisions?.[0]?.slots?.main?.content ?? '']));
    for (const [n, t] of titulo) {
      const ficha = lerFicha(texto.get(t) ?? '');
      if (ficha) fichas[n] = ficha;
    }
  }
  return fichas;
}

// Os números mudam com balanceamento, umas poucas vezes por mês.
const DIAS_WIKI = 7;

// O arquivo guarda os nomes procurados, e não só os achados: a Kaze nunca tem ficha, e
// sem isso a busca rodaria a cada hora. Busca de novo com o arquivo velho ou com um
// brawler novo nos dados. Se o wiki falhar, fica o anterior (ou null, sem nenhum).
export async function atributosDaSemana(arquivo, nomes, { agora = Date.now(), buscar = fetch } = {}) {
  const anterior = await readFile(arquivo, 'utf8').then(JSON.parse).catch(() => null);
  const velho = !anterior || agora - Date.parse(anterior.geradoEm) > DIAS_WIKI * 864e5;
  const novos = nomes.filter((n) => !anterior?.nomes?.includes(n));
  if (!velho && !novos.length) return anterior;
  try {
    const brawlers = await buscarFichas(nomes, buscar);
    const atual = { geradoEm: new Date(agora).toISOString(), nomes, brawlers };
    await writeFile(arquivo, JSON.stringify(atual));
    const sem = nomes.filter((n) => !brawlers[n]);
    if (sem.length) console.warn(`wiki sem ficha de: ${sem.join(', ')}`);
    return atual;
  } catch (e) {
    console.warn(`wiki falhou, ficam os números de ${anterior?.geradoEm ?? 'nenhuma data'}: ${e.message}`);
    return anterior;
  }
}
