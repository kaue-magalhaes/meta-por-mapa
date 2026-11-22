// O que vai em cada arquivo do site, separado pela frequência com que muda.
//
// A rotação do Troféu muda de hora em hora; as estatísticas, uma vez por dia. Até 22/11 a
// rotação ia dentro do dados.js e do dados-trofeu.js, e a versão no endereço deles mudava a
// cada hora: quem voltava ao site baixava de novo os 340 KB, e uma aba aberta desde ontem
// mostrava a rotação de ontem. Agora a rotação vai só no estado.json, que a página consulta
// sem cache (conferirVersao, no modelo.html), e os dados levam uma versão que muda só
// quando o conteúdo muda.

import { createHash } from 'node:crypto';

const chaveDoMapa = (m) => `${m.modo}|${m.mapa}`;

// dados: o mesmo objeto do dados.json. Devolve o conteúdo do dados.js (principal) e do
// dados-trofeu.js (trofeu), os dois sem a rotação, e a rotação à parte. A tabela de
// confrontos sai como compactar devolver.
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

// O estado.json. publicadoEm e estatisticasEm são lidos pelo robô de site parado
// (.github/workflows/aviso-site-parado.yml): os campos podem crescer, nunca sumir.
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
