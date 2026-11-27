// Contas do Draft: a nota de cada brawler, a lista recomendada, o empate, o bloqueio, a
// chance do time e a leitura da partida. O atualizar.mjs cola este arquivo na página sem
// as palavras "export ", então ele roda também como script comum: nada de import, de
// DOM nem de nome que já exista no modelo.html ou no tier.mjs.

// Coeficientes da regressão logística ajustada em 2026-10-20 com 33.221 partidas do Ranqueado
// (Mítico a Mestre), que acertou 56,5% delas. A força pesa quase 4 vezes o confronto
// porque o número de confronto tem mais ruído.
export const COEF_FORCA = 3.88;
export const COEF_CONFRONTO = 1.04;
// O "quase 4 vezes" da ajuda da página (3,88 / 1,04 = 3,7, arredondado).
export const FORCA_VEZES_CONFRONTO = Math.round(COEF_FORCA / COEF_CONFRONTO);

// Empate: a conta não separa nomes com diferença de nota menor que a margem da força (o
// sd da tier list, o mesmo do selo "incerto"). Brawler sem sd, com poucas partidas no
// mapa, usa 0,03, acima de todo sd medido em 2026-11-02 (o maior era 0,024). Nos mapas do
// ranqueado de 02/11, o grupo empatado com o 1º teve de 1 a 4 nomes.
export const SD_SEM_MARGEM = 0.03;

// Corte de 1,5 ponto pra caçar ou evitar: perto dos 10% de confrontos mais fortes
// (1,9 ponto, medido em 2026-11-01). Abaixo disso a linha diz "nada claro".
export const CORTE_LEITURA = 0.015;

// Quanto um brawler soma na nota do time dele contra esses inimigos: a força no mapa e,
// pra cada inimigo, a linha dele contra o inimigo menos a do inimigo contra ele. O
// confronto entra com a força do inimigo de volta, porque a tabela já a desconta.
// Brawler fora do mapa e confronto sem número contam zero.
export function pesoNoDraft(m) {
  const f = (n) => m.forca[n] ?? 0;
  const contra = (x, e) => (m.tabela?.[x]?.[e] == null ? 0 : m.tabela[x][e] + f(e));
  return (x, inimigos) => COEF_FORCA * f(x) + COEF_CONFRONTO * inimigos.reduce((s, e) => s + contra(x, e) - contra(e, x), 0);
}

// A nota que ordena a recomendação: a do pesoNoDraft com a força trocada pela nota da
// tier list (m.nota), que tem o freio por uso desde 23/11 (freioDeUso, no calculo.mjs).
// Sem isso, o Draft punha no topo brawler raro que a lista já tinha tirado do S. A chance
// continua com o pesoNoDraft puro: foi ele que a regressão calibrou.
export function notaNoDraft(m) {
  const peso = pesoNoDraft(m);
  if (!m.nota) return peso;
  return (x, inimigos) => peso(x, inimigos) + COEF_FORCA * ((m.nota[x] ?? 0) - (m.forca[x] ?? 0));
}

// Confronto de x contra e na leitura da partida: a média das linhas que existem no
// mapa, a de x contra e e a de e contra x com o sinal trocado, cada uma com a força do
// adversário de volta, como no pesoNoDraft. A chance conta a linha que falta como zero;
// aqui isso esconderia par forte que só tem número de um lado, como o Griff contra o
// Mortis no Layer Cake. null quando nenhuma das duas existe.
export function confrontoLido(m, x, e) {
  const f = (n) => m.forca[n] ?? 0;
  const linha = (a, b) => (m.tabela?.[a]?.[b] == null ? null : m.tabela[a][b] + f(b));
  const ida = linha(x, e);
  const volta = linha(e, x);
  const lados = [ida, volta == null ? null : -volta].filter((v) => v != null);
  return lados.length ? lados.reduce((s, v) => s + v, 0) / lados.length : null;
}

// Os brawlers livres com a maior nota (notaNoDraft): a conta da chance, com a força da
// tier list. O próprio time não entra: em 2026-10-17 a dupla quase não rendeu além
// da força dos dois. São 5 porque nem todo colega tem cada um. Entra todo brawler com
// força, não só os da tier list: em mapa novo ela tem dois ou três nomes.
//
// motivo é o confronto que explica a nota, pro texto ao lado do nome: o maior a favor
// ou, sem nenhum a favor, o pior contra. Usa o confrontoLido, que é o termo de confronto
// da nota dividido por dois quando há as duas linhas, então o sinal sempre bate com a
// conta. Até 15/11 o motivo lia só a linha do brawler contra o inimigo, e a tela dizia
// "contra Emz −5,3" no Mr. P em Double Swoosh, que pela conta ganha da Emz.
export function recomendar(m, fora, inimigos, quantos = 5) {
  const peso = notaNoDraft(m);
  const posicao = new Map(m.brawlers.map((b, i) => [b.nome, i + 1]));
  const sd = new Map(m.brawlers.map((b) => [b.nome, b.sd]));
  const motivo = (nome) => {
    const lidos = inimigos.map((e) => [e, confrontoLido(m, nome, e)]).filter(([, v]) => v != null);
    const melhor = lidos.reduce((a, c) => (c[1] > (a?.[1] ?? 0) ? c : a), null);
    if (melhor) return { tipo: 'ganha', contra: melhor[0], valor: melhor[1] };
    const pior = lidos.reduce((a, c) => (c[1] < (a?.[1] ?? 0) ? c : a), null);
    return pior ? { tipo: 'perde', contra: pior[0], valor: pior[1] } : { tipo: 'sem' };
  };
  return Object.keys(m.forca)
    .filter((nome) => !fora.has(nome))
    .map((nome) => ({ nome, pos: posicao.get(nome), nota: peso(nome, inimigos), sd: sd.get(nome) ?? SD_SEM_MARGEM, motivo: motivo(nome) }))
    .sort((a, b) => b.nota - a.nota)
    .slice(0, quantos);
}

// Põe o grupo empatado com o 1º na frente: primeiro os fortes da pessoa, depois o maior
// recorde. Sem perfil nem marcação, fica a ordem da nota. seuForte e recorde vêm da
// página, que sabe do perfil e do "Sei jogar".
export function comEmpate(lista, { seuForte, recorde }) {
  let n = 1;
  while (n < lista.length && lista[0].nota - lista[n].nota < COEF_FORCA * Math.hypot(lista[0].sd, lista[n].sd)) n++;
  const grupo = lista.slice(0, n).sort((a, b) => seuForte(b.nome) - seuForte(a.nome) || recorde(b.nome) - recorde(a.nome) || b.nota - a.nota);
  return { lista: [...grupo, ...lista.slice(n)], empatados: Math.min(n, lista.length) };
}

// Antes das escolhas, quem bloquear: o uso no mapa vezes o quanto o brawler soma pro
// outro time, pela conta do Draft, na média contra as nossas opções, pra protegê-las.
// Com 3 opções, um bloqueio do outro time numa delas não desperdiça o nosso. Quem
// ninguém escolhe aqui ou soma zero fica de fora, porque bloqueá-lo gasta a vaga à toa.
// contra é o confronto mais forte dele contra uma das opções, pra linha na tela.
export function sugerirBloqueios(m, fora, opcoes, quantos = 3) {
  const peso = pesoNoDraft(m);
  return m.brawlers
    .filter((b) => b.uso > 0 && !fora.has(b.nome) && !opcoes.includes(b.nome))
    .map((b) => {
      const soma = opcoes.length ? opcoes.reduce((s, o) => s + peso(b.nome, [o]), 0) / opcoes.length : peso(b.nome, []);
      const contra = opcoes.map((o) => [o, confrontoLido(m, b.nome, o)]).filter(([, v]) => v != null)
        .reduce((a, c) => (c[1] > (a?.[1] ?? -Infinity) ? c : a), null);
      return { nome: b.nome, uso: b.uso, soma, contra };
    })
    .filter((b) => b.soma > 0)
    .sort((a, b) => b.uso * b.soma - a.uso * a.soma)
    .slice(0, quantos);
}

// Chance de vitória do nosso time, com o que estiver marcado. Os confrontos dos dois
// lados já entram pelo peso dos nossos, então do lado deles fica só a força.
export function chanceDoTime(m, nos, eles) {
  const peso = pesoNoDraft(m);
  const nota = nos.reduce((s, a) => s + peso(a, eles), 0) - eles.reduce((s, e) => s + peso(e, []), 0);
  return 1 / (1 + Math.exp(-nota));
}

// Quem um brawler nosso caça e evita entre os inimigos marcados: o maior confronto a
// favor e o pior contra, só a partir do corte. semDado quando nenhum par tem número.
export function leitura(m, x, eles) {
  const lidos = eles.map((e) => [e, confrontoLido(m, x, e)]).filter(([, v]) => v != null);
  const caca = lidos.filter(([, v]) => v >= CORTE_LEITURA).sort((a, b) => b[1] - a[1])[0] ?? null;
  const evita = lidos.filter(([, v]) => v <= -CORTE_LEITURA).sort((a, b) => a[1] - b[1])[0] ?? null;
  return { caca, evita, semDado: !lidos.length };
}

// O maior perigo é o inimigo mais forte no mapa. Só com dois ou mais inimigos, senão
// seria sempre o único.
export function maiorPerigo(m, eles) {
  return eles.length > 1 ? eles.reduce((a, b) => ((m.forca[b] ?? 0) > (m.forca[a] ?? 0) ? b : a)) : null;
}

// Os brawlers livres que ganham do perigo, do maior confronto pro menor. Só entra quem
// ganha dele: empate e derrota não respondem à ameaça.
export function quemGanhaDele(m, perigo, fora, quantos = 3) {
  return Object.keys(m.forca)
    .filter((nome) => !fora.has(nome))
    .map((nome) => [nome, confrontoLido(m, nome, perigo)])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, quantos);
}

// A tabela de confrontos é a maior parte do dados.js: 108 brawlers contra uns 100, em
// cada mapa, com os dois nomes escritos em cada número. No site ela vai compacta: os
// nomes uma vez, e cada linha como os números em milésimos, separados por vírgula, na
// ordem dos nomes (vazio onde não há número). Os números já vêm com 3 casas, então a
// volta é exata. As linhas são as primeiras entradas de nomes; um nome depois delas só
// aparece como adversário. A página remonta a tabela ao carregar, e as contas acima não
// mudam.
export function compactarTabela(tabela) {
  const linhas = Object.keys(tabela);
  const nomes = [...new Set([...linhas, ...linhas.flatMap((a) => Object.keys(tabela[a]))])];
  return {
    nomes,
    linhas: linhas.map((a) => (Object.keys(tabela[a]).length
      ? nomes.map((b) => (tabela[a][b] == null ? '' : Math.round(tabela[a][b] * 1000))).join(',')
      : '')),
  };
}

export function expandirTabela({ nomes, linhas }) {
  return Object.fromEntries(linhas.map((linha, i) => {
    const contra = {};
    if (linha) linha.split(',').forEach((v, j) => { if (v !== '') contra[nomes[j]] = Number(v) / 1000; });
    return [nomes[i], contra];
  }));
}
