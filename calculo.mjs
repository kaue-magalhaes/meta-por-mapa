// Contas puras do atualizar.mjs. Ficam separadas pra dar pra testar sem rede.

// Peso da média do mapa na taxa ajustada, em partidas. Brawler com poucas
// partidas fica perto da média; com muitas, fica perto da taxa real dele.
export const PESO_MEDIA = 100;
// No troféu, quem leva brawler pouco usado a 1.000 troféus costuma ser especialista
// nele, e a vitória alta mede o jogador e não o brawler. Peso maior segura esses
// brawlers perto da média até terem partida de sobra.
export const PESO_MEDIA_TROFEU = 1000;
// Uso abaixo disso ganha selo de nicho na página do troféu.
export const LIMITE_NICHO = 0.005;
// Peso, em partidas, da taxa normal do brawler na conta do confronto. Evita que
// um confronto com 35 partidas vire counter por sorte.
export const PESO_CONFRONTO = 60;
// Confronto com menos partidas que isso nem entra na conta.
export const MIN_CONFRONTO = 30;
// Diferença mínima, em erros padrão, pra um especialista não ser sorte (p ≤ 0,05).
const Z_95 = 1.96;

export const nomeBonito = (s) =>
  s.toLowerCase().replace(/(^|[\s&.-])(\p{L})/gu, (_, sep, l) => sep + l.toUpperCase());

export function ajustada(vitorias, partidas, media, peso = PESO_MEDIA) {
  return (vitorias + media * peso) / (partidas + peso);
}

// Times inteiros têm amostra pequena demais; quebrando em duplas a amostra sobe.
// Recebe linhas { team, picks, winRate } e devolve { 'A|B': { n, v } }.
export function duplasDeTimes(times) {
  const duplas = {};
  for (const t of times) {
    const n = Number(t.picks);
    const v = Number(t.winRate) * n;
    const m = t.team.map(nomeBonito).sort();
    for (let i = 0; i < m.length; i++) {
      for (let j = i + 1; j < m.length; j++) {
        const k = `${m[i]}|${m[j]}`;
        duplas[k] ??= { n: 0, v: 0 };
        duplas[k].n += n;
        duplas[k].v += v;
      }
    }
  }
  return duplas;
}

// Recebe [[inimigo, partidas, vitória], ...] de um brawler e devolve os confrontos
// mais claros pros dois lados, como [inimigo, efeito]. O efeito é a vitória contra
// aquele inimigo menos a taxa normal do brawler.
export function resumirConfrontos(linhas, quantos = 5) {
  const n = linhas.reduce((s, r) => s + r[1], 0);
  if (!n) return { bom: [], ruim: [] };
  const base = linhas.reduce((s, r) => s + r[1] * r[2], 0) / n;
  const lista = linhas
    .map(([inimigo, partidas, wr]) => [
      inimigo,
      Math.round(((wr * partidas + base * PESO_CONFRONTO) / (partidas + PESO_CONFRONTO) - base) * 1000) / 1000,
    ])
    .sort((a, b) => b[1] - a[1]);
  return {
    bom: lista.filter((c) => c[1] > 0.01).slice(0, quantos),
    ruim: lista.filter((c) => c[1] < -0.01).slice(-quantos).reverse(),
  };
}

// Quem rende mais neste mapa do que no modo inteiro. É a mesma conta da página de
// mapa do Brawl Time Ninja: teste de duas proporções, só diferença positiva.
// porModo é um Map nome -> { n, wr } com os mesmos filtros, sem o de mapa.
export function especialistas(brawlersMapa, porModo, quantos = 5) {
  return brawlersMapa
    .flatMap((b) => {
      const g = porModo.get(b.nome);
      // Se o mapa é o modo inteiro, não há com o que comparar.
      if (!g || g.n <= b.n) return [];
      const p = (b.wr * b.n + g.wr * g.n) / (b.n + g.n);
      const erro = Math.sqrt(p * (1 - p) * (1 / b.n + 1 / g.n));
      const delta = b.wr - g.wr;
      if (!erro || delta / erro < Z_95) return [];
      return [{ nome: b.nome, n: b.n, wr: b.wr, wrModo: g.wr, delta }];
    })
    .sort((a, b) => b.delta - a.delta)
    .slice(0, quantos);
}
