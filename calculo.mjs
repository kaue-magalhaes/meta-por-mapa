// Contas puras do atualizar.mjs. Ficam separadas pra dar pra testar sem rede.

// Peso da média do mapa na taxa ajustada das duplas, em partidas. Dupla com poucas
// partidas fica perto da média; com muitas, fica perto da taxa real dela.
export const PESO_MEDIA = 100;
// Uso abaixo disso ganha selo de nicho na página do troféu.
export const LIMITE_NICHO = 0.005;
// Peso, em partidas, da taxa normal do brawler na conta do confronto. Evita que
// um confronto com 35 partidas vire counter por sorte.
export const PESO_CONFRONTO = 60;
// Confronto com menos partidas que isso nem entra na conta.
export const MIN_CONFRONTO = 30;
// Peso, em partidas, da sinergia de uma dupla no ranqueado. Em 2026-10-17, prevendo o
// bloco seguinte, a dupla rendeu quase só a soma das forças dos dois; a sinergia de um
// bloco se repetiu pouco, e 1.000 errou menos que 100, 300 ou 3.000.
export const PESO_SINERGIA = 1000;
// Diferença mínima, em erros padrão, pra um especialista não ser sorte (p ≤ 0,05).
const Z_95 = 1.96;
// Peso, em partidas, de cada degrau da cascata. Em 2026-10-16, a tier
// list montada com uma semana de partidas acertou melhor a semana seguinte com 400
// do que com 100 ou 1.000, e o peso tirado dos próprios dados deu perto disso.
export const PESO_CASCATA = 400;
// A liga logo abaixo entra no modo como informação de fundo, valendo metade.
export const PESO_FUNDO = 0.5;
// Período do ranqueado, em dias, e a meia-vida do peso de cada partida. Em
// 2026-10-17, seis semanas com meia-vida de duas erraram de 3% a 9% menos a semana
// seguinte do que os 2 a 4 semanas sem peso usados antes.
export const DIAS_PERIODO = 42;
export const MEIA_VIDA = 14;
// A margem da cascata saiu um pouco otimista nos brawlers do S em 2026-10-17 (75%
// dentro do intervalo de 80%, prevendo a semana seguinte); alargar 15% corrige.
export const FOLGA_MARGEM = 1.15;
// Quanto um balanceamento muda a vitória do brawler no ranqueado, pela direção e pelo
// tamanho lido nas notas. Média de 335 mudanças de jun/2025 a set/2026, com os 14 dias
// depois do patch contra os 14 de antes. Buff grande teve só 5 casos e fica com a média
// dos buffs. Misto (buff e nerf juntos) não tem sinal confiável e começa em zero.
export const CHUTE_PATCH = {
  nerf: { pequena: -0.015, media: -0.025, grande: -0.063 },
  buff: { pequena: 0.008, media: 0.03, grande: 0.017 },
  misto: { pequena: 0, media: 0, grande: 0 },
};
// Na conta do efeito do patch, cada dia de antes vale isso de um dia de depois. Com
// peso fixo em partidas o chute some em horas no brawler muito jogado, e um dia só
// engana, porque o nível oscila sozinho. Em 2026-10-17, prevendo os 14 dias depois de
// 30 patches, 10% errou de 39% a 60% menos nos 3 primeiros dias que ignorar o patch.
export const PESO_ANTES_DO_PATCH = 0.1;

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

// Variância do resultado de uma partida, com vitória perto de 50%.
const VAR_PARTIDA = 0.25;

// Delta é a vitória do brawler menos a média do contexto. Cada brawler é puxado
// pro delta que o degrau de cima prevê; quem não jogou neste degrau fica com ele.
// A variância soma o ruído das partidas deste degrau com o que sobra da de cima.
function encolher(linhas, prior, peso) {
  const media = mediaDe(linhas);
  const saida = new Map();
  for (const nome of new Set([...prior.keys(), ...linhas.keys()])) {
    const { n, v } = linhas.get(nome) ?? { n: 0, v: 0 };
    const p = prior.get(nome) ?? { delta: 0, variancia: VAR_PARTIDA / peso };
    saida.set(nome, {
      delta: (v - n * media + peso * p.delta) / (n + peso),
      variancia: VAR_PARTIDA / (n + peso) + (peso / (n + peso)) ** 2 * p.variancia,
    });
  }
  return saida;
}

// O ranqueado inteiro puxa o modo, e o modo puxa o mapa. Com muito dado no mapa
// vale o mapa; com pouco, vale a força do brawler no modo. Devolve { delta, variancia }
// de cada brawler no mapa. modo e geral devem vir sem as partidas do próprio mapa.
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

const pesoDaIdade = (dia, agora, meiaVida, dias) => {
  const idade = Math.max(0, (agora - Date.parse(`${dia}T12:00:00Z`)) / 864e5);
  return idade > dias ? 0 : 0.5 ** (idade / meiaVida);
};

// Junta linhas dia a dia { brawler, day, picks, winRate } numa por brawler, no formato
// da consulta sem dia. Cada partida vale 0,5^(idade / meiaVida), com a idade contada
// do meio do dia (o site grava o dia em UTC); dia mais velho que o período fica de fora.
// patches é o Map do efeitoDosPatches: os dias de antes do patch andam o efeito, e o
// dia do patch, que mistura antes e depois, sai. O peso dos dias de antes não muda,
// porque o patch mexe no nível do brawler, não em onde ele é bom.
export function pesarPorIdade(linhas, agora, patches = new Map(), meiaVida = MEIA_VIDA, dias = DIAS_PERIODO) {
  const soma = new Map();
  for (const r of linhas) {
    const dia = r.day.slice(0, 10);
    const w = pesoDaIdade(dia, agora, meiaVida, dias);
    const patch = patches.get(r.brawler);
    if (!w || dia === patch?.dia) continue;
    const n = Number(r.picks) * w;
    const wr = Number(r.winRate) + (patch && dia < patch.dia ? patch.efeito : 0);
    const x = soma.get(r.brawler) ?? { n: 0, v: 0 };
    soma.set(r.brawler, { n: x.n + n, v: x.v + n * wr });
  }
  return [...soma].map(([brawler, { n, v }]) => ({ brawler, picks: n, winRate: n ? v / n : 0 }));
}

// Efeito do último patch de cada brawler alterado, medido no ranqueado inteiro (linhas
// dia a dia de todos os brawlers, como no pesarPorIdade). Começa no chute da tabela e
// vira o efeito medido conforme chegam os dias de depois: vitória acima da média do
// dia depois do patch, menos antes. Devolve Map BRAWLER -> { dia, efeito }.
// patches: [{ data: 'AAAA-MM-DD', mudancas: [{ brawler, direcao, tamanho }] }].
export function efeitoDosPatches(linhas, patches, agora, tabela = CHUTE_PATCH, meiaVida = MEIA_VIDA, dias = DIAS_PERIODO) {
  const hoje = new Date(agora).toISOString().slice(0, 10);
  const ultimo = new Map();
  for (const p of [...patches].sort((a, b) => a.data.localeCompare(b.data))) {
    if (p.data > hoje) continue;
    for (const m of p.mudancas) ultimo.set(m.brawler.toUpperCase(), { dia: p.data, chute: tabela[m.direcao]?.[m.tamanho] ?? 0 });
  }
  const mediaDoDia = new Map();
  for (const r of linhas) {
    const x = mediaDoDia.get(r.day.slice(0, 10)) ?? { n: 0, v: 0 };
    mediaDoDia.set(r.day.slice(0, 10), { n: x.n + Number(r.picks), v: x.v + Number(r.picks) * Number(r.winRate) });
  }
  const lados = new Map([...ultimo.keys()].map((b) => [b, { antes: { n: 0, v: 0 }, depois: { n: 0, v: 0 } }]));
  for (const r of linhas) {
    const b = lados.get(r.brawler);
    const dia = r.day.slice(0, 10);
    const w = pesoDaIdade(dia, agora, meiaVida, dias);
    if (!b || !w || dia === ultimo.get(r.brawler).dia) continue;
    const m = mediaDoDia.get(dia);
    const lado = dia < ultimo.get(r.brawler).dia ? b.antes : b.depois;
    const n = Number(r.picks) * w;
    lado.n += n;
    lado.v += n * (Number(r.winRate) - m.v / m.n);
  }
  const saida = new Map();
  for (const [brawler, { dia, chute }] of ultimo) {
    const { antes, depois } = lados.get(brawler);
    if (!antes.n) {
      saida.set(brawler, { dia, efeito: chute });
      continue;
    }
    const velho = PESO_ANTES_DO_PATCH * antes.n;
    const medido = depois.n ? depois.v / depois.n - antes.v / antes.n : 0;
    saida.set(brawler, { dia, efeito: (velho * chute + depois.n * medido) / (velho + depois.n) });
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
  return lados(linhas.map(([inimigo, partidas, wr]) => [inimigo, (wr * partidas + base * PESO_CONFRONTO) / (partidas + PESO_CONFRONTO) - base]), quantos);
}

function lados(efeitos, quantos) {
  const lista = efeitos.map(([inimigo, e]) => [inimigo, Math.round(e * 1000) / 1000]).sort((a, b) => b[1] - a[1]);
  return {
    bom: lista.filter((c) => c[1] > 0.01).slice(0, quantos),
    ruim: lista.filter((c) => c[1] < -0.01).slice(-quantos).reverse(),
  };
}

const acumular = (alvo, chave, n, v) => {
  const x = alvo.get(chave) ?? { n: 0, v: 0 };
  alvo.set(chave, { n: x.n + n, v: x.v + v });
};

// Counters do ranqueado, com todos os mapas de uma vez. O efeito de um confronto
// (vitória contra o inimigo menos a taxa normal do brawler) tem duas partes: a força
// do inimigo no mapa, que vem da tier list, e o resto, que é o confronto em si. O
// resto é puxado pro mesmo confronto nos outros mapas do modo, e esse pro ranqueado
// inteiro, com o mesmo peso da tier list. Em 2026-10-17 isso acertou 41% do efeito no
// bloco seguinte, contra 37% do resumirConfrontos.
// mapas: [{ modo, linhas: [[brawler, inimigo, partidas, vitória]], forca: Map nome -> delta }].
// Devolve, por mapa, Map brawler -> [[inimigo, partidas, efeito]].
export function confrontosEmCascata(mapas, peso = PESO_CASCATA) {
  const restos = mapas.map(({ linhas, forca }) => {
    const base = new Map();
    for (const [b, , n, wr] of linhas) acumular(base, b, n, n * wr);
    return linhas.map(([b, e, n, wr]) => {
      const x = base.get(b);
      return { chave: `${b}|${e}`, b, e, n, resto: wr - x.v / x.n + (forca.get(e) ?? 0) };
    });
  });
  const geral = new Map();
  const porModo = new Map();
  mapas.forEach(({ modo }, i) => {
    if (!porModo.has(modo)) porModo.set(modo, new Map());
    for (const r of restos[i]) {
      acumular(geral, r.chave, r.n, r.n * r.resto);
      acumular(porModo.get(modo), r.chave, r.n, r.n * r.resto);
    }
  });
  return mapas.map(({ modo, forca }, i) => {
    const saida = new Map();
    for (const r of restos[i]) {
      // Os degraus de cima vêm sem o próprio mapa.
      const g = geral.get(r.chave);
      const doGeral = (g.v - r.n * r.resto) / (g.n - r.n + peso);
      const m = porModo.get(modo).get(r.chave);
      const doModo = (m.v - r.n * r.resto + peso * doGeral) / (m.n - r.n + peso);
      const efeito = -(forca.get(r.e) ?? 0) + (r.n * r.resto + peso * doModo) / (r.n + peso);
      if (!saida.has(r.b)) saida.set(r.b, []);
      saida.get(r.b).push([r.e, r.n, efeito]);
    }
    return saida;
  });
}

// Os confrontos mais claros pros dois lados, como o resumirConfrontos devolve.
// efeitos: [[inimigo, partidas, efeito]], do confrontosEmCascata.
export const escolherConfrontos = (efeitos, quantos = 5) =>
  lados(efeitos.filter((c) => c[1] >= MIN_CONFRONTO).map(([inimigo, , e]) => [inimigo, e]), quantos);

// Duplas do ranqueado, com todos os mapas de uma vez. A nota é a soma das forças dos
// dois (da tier list) vezes um fator, mais a sinergia (o que sobra) puxada pra zero
// com PESO_SINERGIA. O fator sai dos próprios dados, porque a força de cada um já vem
// puxada pra média; em 2026-10-17 ficou entre 1,2 e 1,4.
// mapas: [{ duplas: { 'A|B': { n, v } }, forca: Map nome -> delta, media }].
// Devolve, por mapa, [{ par, n, wr, nota }] da maior nota pra menor.
export function duplasPelaForca(mapas, peso = PESO_SINERGIA) {
  const soma = (forca, par) => (forca.get(par[0]) ?? 0) + (forca.get(par[1]) ?? 0);
  let xy = 0;
  let xx = 0;
  for (const { duplas, forca, media } of mapas) {
    for (const [k, { n, v }] of Object.entries(duplas)) {
      const x = soma(forca, k.split('|'));
      xy += x * (v - n * media);
      xx += n * x * x;
    }
  }
  const fator = xx ? xy / xx : 1;
  return mapas.map(({ duplas, forca, media }) =>
    Object.entries(duplas)
      .map(([k, { n, v }]) => {
        const par = k.split('|');
        const s = fator * soma(forca, par);
        return { par, n, wr: v / n, nota: s + (v - n * media - n * s) / (n + peso) };
      })
      .sort((a, b) => b.nota - a.nota),
  );
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
