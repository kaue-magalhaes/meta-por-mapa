// O que vai em cada arquivo do site, separado pela frequência com que muda.
//
// A rotação do Troféu muda de hora em hora; as estatísticas, uma vez por dia. Até 22/11 a
// rotação ia dentro do dados.js e do dados-trofeu.js, e a versão no endereço deles mudava a
// cada hora: quem voltava ao site baixava de novo os 340 KB, e uma aba aberta desde ontem
// mostrava a rotação de ontem. Agora a rotação vai só no estado.json, que a página consulta
// sem cache (conferirVersao, no modelo.html), e os dados levam uma versão que muda só
// quando o conteúdo muda.

import { createHash } from 'node:crypto';
import { nomeBonito } from './calculo.mjs';

const chaveDoMapa = (m) => `${m.modo}|${m.mapa}`;

// dados: o objeto do dados.json, mais o que a montagem da página acrescenta (a lista do
// listaDoMaximo e o endereço do enderecoDaWorker). Devolve o conteúdo do dados.js (principal) e do dados-trofeu.js
// (trofeu), os dois sem a rotação, e a rotação à parte. A tabela de confrontos sai como
// compactar devolver.
export function separarRotacao(dados, compactar = (tabela) => tabela) {
  const compactos = (mapas) => mapas.map(({ rotacao, ...m }) => (m.tabela ? { ...m, tabela: compactar(m.tabela) } : m));
  const doTrofeu = dados.partes.trofeu;
  // geradoEm muda a cada rodada e não diz nada sobre o conteúdo: fica no estado.json.
  const { geradoEm, ...resto } = dados;
  const principal = {
    ...resto,
    // Todo brawler que aparece em algum mapa, na ordem dos mapas: a busca do Draft acha
    // também quem só aparece no Troféu, antes de os mapas dele chegarem.
    brawlers: [...new Set(Object.values(dados.partes).flatMap((p) => p.mapas.flatMap((m) => m.brawlers.map((b) => b.nome))))],
    partes: Object.fromEntries(Object.entries(dados.partes).map(([id, p]) => {
      if (id !== 'trofeu') return [id, { ...p, mapas: compactos(p.mapas) }];
      const { rotacaoEm, ...semHora } = p;
      return [id, { ...semHora, mapas: [] }];
    })),
  };
  return {
    principal,
    trofeu: compactos(doTrofeu?.mapas ?? []),
    rotacao: {
      // Sem a API oficial nunca ter respondido, não há rotação: a página não marca nada.
      em: doTrofeu?.rotacaoEm ?? null,
      mapas: (doTrofeu?.mapas ?? []).filter((m) => m.rotacao).map(chaveDoMapa),
    },
  };
}

// A versão é um resumo do conteúdo: igual enquanto as estatísticas e o formato não mudam.
export const versaoDe = (...conteudos) => {
  const h = createHash('sha256');
  for (const c of conteudos) h.update(c);
  return h.digest('hex').slice(0, 12);
};

// versaoEm é a hora em que a versão apareceu, e só anda pra frente. A página compara a dela
// com a do estado.json: a borda do GitHub Pages guarda cada arquivo até 10 minutos, então o
// estado.json pode chegar mais velho que a página, e versão só diferente não basta.
export const versaoEm = (anterior, versao, agora) => (anterior?.versao === versao && anterior.versaoEm ? anterior.versaoEm : agora);

// O estado.json. O robô de site parado (.github/workflows/aviso-site-parado.yml) lê o
// estatisticasEm: os campos podem crescer, nunca sumir.
export function montarEstado({ publicadoEm, partes, versao, versaoEm: em, rotacao }) {
  return {
    publicadoEm,
    estatisticasEm: Object.values(partes).map((p) => p.geradoEm).sort()[0],
    versao,
    versaoEm: em,
    rotacaoEm: rotacao.em,
    rotacao: rotacao.mapas,
  };
}

// A lista do máximo no Ranqueado (maxNoRanqueado, no config.json) como o dados.js leva:
// o fim da temporada e os nomes como a página os usa. Config torto não derruba a rodada,
// que deixaria o site sem publicar: sai sem lista, e a página não marca ninguém. Nome que
// não aparece em conhecidos (os brawlers dos dados) entra, mas vai para os avisos, porque
// um erro de digitação faria o brawler nunca ser marcado.
export function listaDoMaximo(max, conhecidos) {
  if (max == null) return { lista: null, avisos: [] };
  if (!Array.isArray(max.brawlers) || Number.isNaN(Date.parse(max.ate))) {
    return { lista: null, avisos: ['precisa de ate (uma data) e brawlers (uma lista); a página não marca ninguém'] };
  }
  const brawlers = max.brawlers.map((n) => nomeBonito(String(n)));
  const existe = new Set(conhecidos);
  const avisos = brawlers.filter((n) => !existe.has(n)).map((n) => `${n} não aparece nos dados`);
  return { lista: { ate: max.ate, brawlers }, avisos };
}

// O endereço da Worker que busca o perfil pela tag (worker, no config.json) como o
// dados.js leva. Entra na montagem, como a listaDoMaximo, para o --so-pagina também levar
// um endereço novo. Sem endereço, ou com um que não é https, a página esconde o campo do
// perfil; o torto vai para os avisos, sem derrubar a rodada.
export function enderecoDaWorker(endereco) {
  if (endereco == null) return { worker: null, avisos: [] };
  const https = typeof endereco === 'string' && URL.parse(endereco)?.protocol === 'https:';
  if (!https) return { worker: null, avisos: [`${JSON.stringify(endereco)} não é um endereço https; a página esconde o perfil`] };
  return { worker: endereco, avisos: [] };
}
