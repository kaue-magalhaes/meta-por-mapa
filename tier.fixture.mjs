// Refaz a entrada gravada do teste "cortes e freio" (tier.test.mjs) a partir de um dados.json.
// Uso, na raiz: node tier.fixture.mjs dados.json > tier.fixture.json
// Rode antes de mudar USO_FREIO ou PESO_USO: o delta do Troféu é desfeito com os pesos que
// geraram o dados.json, e pesos já mudados dão uma entrada errada sem nenhum aviso.
//
// Cada mapa vira uma lista de pares [delta, uso]: a força antes do freio e o uso.
// O uso é n / total do mapa, e não o campo uso, arredondado em 4 casas: no Ranqueado de
// 26/11, com o uso arredondado a força desfeita errava até 0,057; com n / total, até 0,0027.
// Ranqueado: o delta é o campo forca do mapa. Troféu: o dados.json não guarda a força, e o
// delta sai da conta do freio desfeita a partir do adj. Entram os mapas do Ranqueado e
// os 2 primeiros mapas de cada modo do Troféu: em 26/11 essa amostra deu a mesma mediana
// de S que os 179 mapas publicados (a conferência no fim imprime as duas).
import { readFileSync } from 'node:fs';
import { USO_FREIO, PESO_USO, tierDe } from './tier.mjs';
import { freioDeUso } from './calculo.mjs';

const d = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const r5 = (x) => Math.round(x * 1e5) / 1e5;
// O mesmo piso de uso do freioDeUso, no calculo.mjs.
const lg = (u) => Math.log(Math.max(u, 1e-4));

function pares(m, parte) {
  if (m.estimada) throw new Error(`${m.mapa}: mapa estimado não tem freio`);
  const usos = m.brawlers.map((b) => b.n / m.total);
  const tipico = usos.reduce((s, u) => s + lg(u), 0) / usos.length;
  return m.brawlers.map((b, i) => {
    const uso = usos[i];
    const delta = parte === 'ranqueado'
      ? m.forca[b.nome]
      : (b.adj - m.media - PESO_USO * (lg(uso) - tipico)) * (uso + USO_FREIO) / uso;
    return [r5(delta), r5(uso)];
  });
}

const porModo = new Map();
for (const m of d.partes.trofeu.mapas) porModo.set(m.modo, [...(porModo.get(m.modo) ?? []), m]);
const amostra = [...porModo.values()].flatMap((ms) => ms.slice(0, 2));

const saida = {
  origem: `dados.json gerado em ${d.geradoEm}; coleta do Ranqueado de ${d.partes.ranqueado.geradoEm} e do Troféu de ${d.partes.trofeu.geradoEm}. `
    + 'Pares [delta, uso]: força antes do freio e uso (n / total). Ranqueado: delta do campo forca. '
    + `Troféu: delta desfeito a partir do adj com USO_FREIO ${USO_FREIO} e PESO_USO ${PESO_USO} (os 2 primeiros mapas de cada modo). `
    + 'Script: tier.fixture.mjs, na raiz do repositório.',
  ranqueado: d.partes.ranqueado.mapas.map((m) => pares(m, 'ranqueado')),
  trofeu: amostra.map((m) => pares(m, 'trofeu')),
};

// Conferência: mediana de S por mapa nos pares e nos mapas publicados, pela mesma conta do teste.
const mediana = (xs) => {
  const s = xs.slice().sort((a, b) => a - b);
  const meio = s.length / 2;
  return Number.isInteger(meio) ? (s[meio - 1] + s[meio]) / 2 : s[Math.floor(meio)];
};
const sDoPar = (ps) => { const f = freioDeUso(ps.map(([, u]) => u)); return ps.filter(([dl, u]) => tierDe(f(dl, u)) === 'S').length; };
const sPublicado = (m) => m.brawlers.filter((b) => tierDe(b.adj - m.media) === 'S').length;
for (const parte of ['ranqueado', 'trofeu']) {
  console.error(`${parte}: ${saida[parte].length} mapas na amostra; mediana de S nos pares ${mediana(saida[parte].map(sDoPar))}; `
    + `nos ${d.partes[parte].mapas.length} mapas publicados ${mediana(d.partes[parte].mapas.map(sPublicado))}`);
}
process.stdout.write(JSON.stringify(saida) + '\n');
