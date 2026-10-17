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
// Peso, em partidas, de cada degrau da cascata do ranqueado. Em 2026-10-16, a tier
// list montada com uma semana de partidas acertou melhor a semana seguinte com 400
// do que com 100 ou 1.000, e o peso tirado dos próprios dados deu perto disso.
export const PESO_CASCATA = 400;
// A liga logo abaixo entra no modo como informação de fundo, valendo metade.
export const PESO_FUNDO = 0.5;

export const nomeBonito = (s) =>
  s.toLowerCase().replace(/(^|[\s&.-])(\p{L})/gu, (_, sep, l) => sep + l.toUpperCase());

export function ajustada(vitorias, partidas, media, peso = PESO_MEDIA) {
  return (vitorias + media * peso) / (partidas + peso);
}

// As contas da cascata recebem Map nome -> { n, v }, com v = vitórias.
export const mediaDe = (linhas) => {
  let n = 0;
  let v = 0;
  for (const x of linhas.values()) {
    n += x.n;
    v += x.v;
  }
  return n ? v / n : 0;
};

// Delta é a vitória do brawler menos a média do contexto. Cada brawler é puxado
// pro delta que o degrau de cima prevê; quem não jogou neste degrau fica com ele.
function encolher(linhas, prior, peso) {
  const media = mediaDe(linhas);
  const saida = new Map(prior);
  for (const [nome, { n, v }] of linhas) saida.set(nome, (v - n * media + peso * (prior.get(nome) ?? 0)) / (n + peso));
  return saida;
}

// O ranqueado inteiro puxa o modo, e o modo puxa o mapa. Com muito dado no mapa
// vale o mapa; com pouco, vale a força do brawler no modo. Devolve o delta de cada
// brawler no mapa. modo e geral devem vir sem as partidas do próprio mapa.
export function forcaNaCascata(mapa, modo, geral, peso = PESO_CASCATA) {
  return encolher(mapa, encolher(modo, encolher(geral, new Map(), peso), peso), peso);
}

export function semOMapa(total, mapa) {
  const saida = new Map();
  for (const [nome, { n, v }] of total) {
    const m = mapa.get(nome);
    saida.set(nome, m ? { n: n - m.n, v: v - m.v } : { n, v });
  }
  return saida;
}

export function somar(a, b, fator = 1) {
  const saida = new Map(a);
  for (const [nome, { n, v }] of b) {
    const x = saida.get(nome) ?? { n: 0, v: 0 };
    saida.set(nome, { n: x.n + n * fator, v: x.v + v * fator });
  }
  return saida;
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
