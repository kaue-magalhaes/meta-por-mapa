// Nome em português e imagem de cada mapa, modo e brawler do site.
// Os nomes vêm do arquivo de textos do jogo, que a BrawlAPI (api.brawlapi.com) publica,
// e as imagens vêm do CDN do Brawlify. Tudo fica guardado: a tabela em nomes.json e as
// imagens em site/img/. A BrawlAPI só é chamada quando aparece mapa ou brawler que o
// nomes.json ainda não viu, e só sai pedido de imagem para a que falta no disco.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

// Sem o e-mail: o Kauê liberou o e-mail só para o User-Agent do Brawl Time Ninja.
export const AGENTE_BRAWLIFY = 'meta-por-mapa (https://kaue-magalhaes.github.io/meta-por-mapa/)';
const API = 'https://api.brawlapi.com';
const CDN = 'https://cdn.brawlify.com';
const TEMPO_POR_PEDIDO = 30_000;
const FALHAS_SEGUIDAS = 3;
// O mapa ou brawler que a BrawlAPI não conhecia é perguntado de novo depois disso. Ela
// fica semanas atrás do jogo (em 15/11, os arquivos eram de 03/10).
const DIAS_PARA_PERGUNTAR_DE_NOVO = 7;

// O arquivo de textos não traz o nome dos brawlers de forma confiável. Os cinco que
// mudam em português, conferidos em 15/11; os outros ficam com o nome em inglês.
export const NOME_PT = { 'Surge': 'Wattson', 'Gene': 'Eugênio', 'Crow': 'Corvo', 'Mr. P': 'Mister P', 'Larry & Lawrie': 'Larry e Lawrie' };

// A BrawlAPI escreve "Belles Rock" e "Out In The Open"; o BTN, "Belle's Rock" e "Out in the Open".
const chave = (nome) => nome.toLowerCase().replaceAll('&', 'and').replace(/[^a-z0-9]/g, '');

// "PIQUE-GEMA" vira "Pique-Gema", e "COLECIONADOR DE ALMAS", "Colecionador de Almas":
// a palavra pequena fica em minúscula, menos no começo.
const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'ao', 'aos', 'à', 'às', 'e', 'em', 'no', 'na', 'nos', 'nas', 'a', 'o', 'com', 'por', 'para']);
const primeiraMaiuscula = (texto) =>
  texto.replace(/[^\s-]+/g, (parte, posicao) => {
    const minuscula = parte.toLowerCase();
    return posicao > 0 && MINUSCULAS.has(minuscula) ? minuscula : parte[0] + minuscula.slice(1);
  });

// mapa: { modo, mapa, id? }, com o id que veio do BTN. maps: a lista de /v1/maps.
// O mesmo mapa tem vários ids (Double Swoosh: 15000115, 15000665 e 15001320, a versão do
// Duolingo); sem o id do BTN, vale o menor, que é o original.
export function idDoMapa(mapa, maps) {
  if (mapa.id && maps.some((m) => m.id === mapa.id)) return mapa.id;
  const ids = maps.filter((m) => chave(m.name) === chave(mapa.mapa)).map((m) => m.id);
  return ids.length ? Math.min(...ids) : null;
}

// maps e brawlers: as listas (`list`) de /v1/maps e /v1/brawlers; locations, gmv e pt: os
// arquivos do jogo. mapasDoSite: [{ modo, mapa, id? }]; nomesDoSite: nomes dos brawlers.
// O que a BrawlAPI não conhece fica de fora, e a página mostra o nome em inglês.
export function montarTabela({ maps, locations, pt, gmv, brawlers }, mapasDoSite, nomesDoSite) {
  const texto = (tid) => pt[tid]?.PT;
  const local = new Map(Object.values(locations).map((l) => [l.id, l]));
  const variacao = new Map(Object.values(gmv).map((v) => [v.id, v]));
  const doMapa = new Map(maps.map((m) => [m.id, m]));

  const mapas = {};
  const idDoModo = {};
  for (const m of mapasDoSite) {
    const id = idDoMapa(m, maps);
    if (id == null) continue;
    const nome = texto(local.get(id)?.TID);
    mapas[`${m.modo}|${m.mapa}`] = { id, ...(nome && { pt: nome }) };
    idDoModo[m.modo] ??= doMapa.get(id).gameMode?.id;
  }

  // O modo sai do nome interno do jogo (duoShowdown e DuoShowdown). Os que o jogo chama
  // diferente (Showdown, KingOfHill) saem do modo de um mapa dele. A ordem importa: o
  // Kroket do Combate Duplo tem o id do Kroket do Solitário.
  const modos = {};
  for (const modo of new Set(mapasDoSite.map((m) => m.modo))) {
    const v = Object.values(gmv).find((g) => chave(g.Name ?? '') === chave(modo)) ?? variacao.get(idDoModo[modo]);
    if (!v) continue;
    const nome = texto(v.TID);
    modos[modo] = { ...(nome && { pt: primeiraMaiuscula(nome) }), icone: v.id };
  }

  const porChave = new Map(brawlers.map((b) => [chave(b.name), b]));
  const doSite = {};
  for (const nome of nomesDoSite) {
    const b = porChave.get(chave(nome));
    if (b) doSite[nome] = { id: b.id, pt: NOME_PT[nome] ?? nome };
  }
  return { mapas, modos, brawlers: doSite };
}

// existe(caminho): se site/img/<caminho> já está no disco. Mapa repetido em vários modos
// (o Kroket nos três Showdown) tem uma imagem só.
export function faltando(tabela, existe) {
  const imagens = [
    ...Object.values(tabela.mapas).map((m) => [`${CDN}/maps/regular/${m.id}.png`, `m/${m.id}.png`]),
    ...Object.values(tabela.modos).map((m) => [`${CDN}/game-modes/regular/${m.icone}.png`, `modo/${m.icone}.png`]),
    ...Object.values(tabela.brawlers).map((b) => [`${CDN}/brawlers/borderless/${b.id}.png`, `b/${b.id}.png`]),
  ];
  const unicas = new Map(imagens.map(([url, caminho]) => [caminho, url]));
  return [...unicas].filter(([caminho]) => !existe(caminho)).map(([caminho, url]) => ({ url, caminho }));
}

const VAZIA = { mapas: {}, modos: {}, brawlers: {} };
const pedidoDoMapa = (m) => `${m.modo}|${m.mapa}|${m.id ?? ''}`;

// O cache nomes.json guarda a tabela e o que já foi perguntado à BrawlAPI. Mapa e brawler
// perguntados e que ela não conhecia não disparam pedido toda hora; o id do BTN conta
// como pergunta nova, porque pode trocar a imagem.
function precisaPerguntar(cache, mapasDoSite, nomesDoSite, agora) {
  if (!cache) return mapasDoSite.length > 0 || nomesDoSite.length > 0;
  const mapasPedidos = new Set(cache.mapasPedidos);
  const brawlersPedidos = new Set(cache.brawlersPedidos);
  if (mapasDoSite.some((m) => !mapasPedidos.has(pedidoDoMapa(m))) || nomesDoSite.some((n) => !brawlersPedidos.has(n))) return true;
  const semDados = mapasDoSite.some((m) => !cache.tabela.mapas[`${m.modo}|${m.mapa}`]) || nomesDoSite.some((n) => !cache.tabela.brawlers[n]);
  return semDados && agora - Date.parse(cache.geradoEm) > DIAS_PARA_PERGUNTAR_DE_NOVO * 864e5;
}

// dir: URL da raiz do projeto. buscar: o fetch, trocado nos testes. Devolve a tabela de
// montarTabela. Falha de rede não derruba a rodada: avisa e segue com o cache.
export async function atualizarNomesEImagens(dir, mapasDoSite, nomesDoSite, { buscar = fetch, agora = Date.now() } = {}) {
  let pedidos = 0;
  const pedir = async (url) => {
    pedidos++;
    const r = await buscar(url, { headers: { 'User-Agent': AGENTE_BRAWLIFY }, signal: AbortSignal.timeout(TEMPO_POR_PEDIDO) });
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return r;
  };

  const arquivo = new URL('nomes.json', dir);
  const cache = await readFile(arquivo, 'utf8').then(JSON.parse).catch(() => null);
  let tabela = cache?.tabela ?? VAZIA;
  if (precisaPerguntar(cache, mapasDoSite, nomesDoSite, agora)) {
    try {
      // Um pedido por vez, nunca em paralelo.
      const json = async (caminho) => (await pedir(`${API}/${caminho}`)).json();
      const maps = (await json('v1/maps')).list;
      const brawlers = (await json('v1/brawlers')).list;
      const locations = await json('game/csv_logic/locations');
      const gmv = await json('game/csv_logic/game_mode_variations');
      const pt = await json('game/localization/pt');
      tabela = montarTabela({ maps, locations, pt, gmv, brawlers }, mapasDoSite, nomesDoSite);
      const novo = {
        geradoEm: new Date(agora).toISOString(),
        mapasPedidos: mapasDoSite.map(pedidoDoMapa),
        brawlersPedidos: nomesDoSite,
        tabela,
      };
      await writeFile(arquivo, JSON.stringify(novo));
    } catch (e) {
      console.warn(`nomes da BrawlAPI falharam, fica o nomes.json da última vez: ${e.message}`);
    }
  }

  const img = new URL('site/img/', dir);
  const falta = faltando(tabela, (caminho) => existsSync(new URL(caminho, img)));
  // Com o CDN fora do ar, cada imagem esperaria o tempo do pedido inteiro, e as 261 da
  // primeira rodada passariam do limite de 45 minutos do publicar.sh antes da coleta.
  // Depois de FALHAS_SEGUIDAS, o resto fica para a próxima rodada.
  const falharam = [];
  let baixadas = 0;
  let seguidas = 0;
  for (const { url, caminho } of falta) {
    try {
      const destino = new URL(caminho, img);
      const bytes = new Uint8Array(await (await pedir(url)).arrayBuffer());
      await mkdir(new URL('.', destino), { recursive: true });
      await writeFile(destino, bytes);
      baixadas++;
      seguidas = 0;
    } catch (e) {
      falharam.push(`${caminho} (${e.message})`);
      if (++seguidas === FALHAS_SEGUIDAS) break;
    }
  }
  if (falharam.length) {
    const parou = seguidas === FALHAS_SEGUIDAS ? `; o CDN deu ${FALHAS_SEGUIDAS} falhas seguidas e parei` : '';
    console.warn(`imagens que não baixaram, a página mostra a inicial no lugar: ${falharam.join(', ')}${parou}; ${falta.length - baixadas} imagens ficam para a próxima rodada`);
  }
  console.log(`nomes e imagens: pedidos à BrawlAPI e ao CDN: ${pedidos}; imagens novas: ${baixadas}`);
  return tabela;
}
