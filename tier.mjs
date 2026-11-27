// Regras da tier list: os cortes de cada tier, os quatro selos de confiança e os textos que
// dependem de número. O atualizar.mjs cola este arquivo na página sem as palavras
// "export ", como o draft.mjs, então ele roda também como script comum: nada de import, de
// DOM nem de nome que já exista no modelo.html ou no draft.mjs.

// Porcentagem com vírgula e d casas ("0,5%").
export const pct = (x, d = 1) => (x * 100).toFixed(d).replace('.', ',') + '%';

// A calibragem da tier list: os pesos do freio por uso (freioDeUso, no calculo.mjs) e os
// cortes de cada tier foram ajustados juntos em 23/11/2026, e mudar um lado sem o outro
// desmonta a tier list. O teste "cortes e freio" do tier.test.mjs confere a mediana de S
// por mapa; quem muda a calibragem de propósito muda a faixa daquele teste no mesmo commit.
//
// Pesos do freio: com os dados de 23/11, o S por mapa foi de 13 para 7 no Troféu e ficou
// em 7 no Ranqueado; a concordância com a presença no Mundial de 2026 foi de -0,16 para
// +0,27 no Ranqueado e de -0,04 para +0,11 no Troféu. PESO_USO 0,005 mexia quase nada nela
// (+0,06); 0,02 chega a +0,43, mas dobra o S por mapa. Primeiro chute, ajustado no jogo.
export const USO_FREIO = 0.005;
export const PESO_USO = 0.01;

// Onde cada tier começa, em diferença pra média do mapa, já com o freio por uso
// (freioDeUso, no calculo.mjs).
export const FAIXAS = { S: 0.04, A: 0.02, B: -0.01 };

export function tierDe(delta) {
  if (delta >= FAIXAS.S) return 'S';
  if (delta >= FAIXAS.A) return 'A';
  if (delta >= FAIXAS.B) return 'B';
  return 'C';
}

export const forte = (b, m) => b.adj - m.media >= FAIXAS.A;

// O que cada tier quer dizer, em pontos de vitória contra a média, saído das FAIXAS.
export const ptsFaixa = (x) => Math.round(Math.abs(x) * 100);
export const TEXTO_TIER = {
  S: `${ptsFaixa(FAIXAS.S)} pontos ou mais acima da média`,
  A: `de ${ptsFaixa(FAIXAS.A)} a ${ptsFaixa(FAIXAS.S)} pontos acima`,
  B: `perto da média, de −${ptsFaixa(FAIXAS.B)} a +${ptsFaixa(FAIXAS.A)} pontos`,
  C: `mais de ${ptsFaixa(FAIXAS.B)} ponto abaixo da média`,
};

// Distribuição normal acumulada (aproximação de Abramowitz e Stegun, erro abaixo de 1e-7).
export function normal(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

// Só no ranqueado (o Troféu não tem sd): S com mais que essa chance de ser B ou pior,
// pela margem da conta.
export const CHANCE_INCERTO = 0.1;
export const TEXTO_INCERTO = `Pode não ser S: com as partidas que tem, a chance de ser B ou pior passa de ${pct(CHANCE_INCERTO, 0)}.`;
export const incerto = (b, m) => b.sd != null && tierDe(b.adj - m.media) === 'S'
  && normal((FAIXAS.A - (b.adj - m.media)) / b.sd) > CHANCE_INCERTO;

// Só no ranqueado. Escondido: força de S, quase ninguém escolhe e sem dúvida de ser S.
// Em 10/11, com 58 mil partidas do Lendário+, o confronto real desses brawlers foi até
// um pouco pior que contra um time sorteado: a vitória é força, não sorte de confronto.
export const USO_ESCONDIDO = 0.01;
export const TEXTO_ESCONDIDO = `Ganha como um S e quase ninguém escolhe aqui (menos de ${pct(USO_ESCONDIDO, 0)} das escolhas). Parte da vitória pode ser a mão de quem treina ele: se você não joga com ele, treine antes de levar à ranqueada.`;
export const escondido = (b, m) => m.parte === 'ranqueado' && tierDe(b.adj - m.media) === 'S'
  && b.uso < USO_ESCONDIDO && !incerto(b, m);

// Só no ranqueado. Popular: entre os mais escolhidos do mapa inteiro e abaixo da média.
// O top não muda com "só os meus", bloqueio ou Draft: é um fato do mapa.
export const TOP_POPULAR = 10;
export const TEXTO_POPULAR = `Está entre os ${TOP_POPULAR} mais escolhidos deste mapa e ganha menos que a média. Não precisa ir com ele só porque todo mundo vai.`;
const topDoMapa = new WeakMap();
export function maisUsados(m) {
  if (!topDoMapa.has(m)) topDoMapa.set(m, new Set([...m.brawlers].sort((a, b) => b.uso - a.uso).slice(0, TOP_POPULAR).map((b) => b.nome)));
  return topDoMapa.get(m);
}
export const popular = (b, m) => m.parte === 'ranqueado' && b.adj < m.media && maisUsados(m).has(b.nome);

// Só no troféu: brawler raro a 1.000 troféus costuma estar na mão de especialista.
export const LIMITE_NICHO = 0.005;
export const TEXTO_NICHO = `Menos de ${pct(LIMITE_NICHO)} de uso. Quem leva brawler pouco usado a 1.000 troféus costuma ser especialista nele, então a vitória mede também a mão desses jogadores.`;
export const nicho = (b, m) => m.parte === 'trofeu' && b.uso < LIMITE_NICHO;

// Os quatro selos de confiança. Na tier list viram um "!" só; a folha do brawler diz qual é
// e por quê. O Pegue usa os dois que cabem no topo da lista (incerto e escondido).
export const SELOS = {
  incerto: { titulo: 'Incerto', texto: TEXTO_INCERTO, vale: incerto },
  escondido: { titulo: 'Escondido', texto: TEXTO_ESCONDIDO, vale: escondido },
  popular: { titulo: 'Popular', texto: TEXTO_POPULAR, vale: popular },
  nicho: { titulo: 'Nicho', texto: TEXTO_NICHO, vale: nicho },
};
export const selosDe = (b, m) => Object.entries(SELOS).filter(([, s]) => s.vale(b, m)).map(([chave, s]) => ({ chave, ...s }));
