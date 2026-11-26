import { test } from 'node:test';
import assert from 'node:assert/strict';
import { separarRotacao, versaoDe, versaoEm, montarEstado, listaDoMaximo, enderecoDaWorker } from './publicacao.mjs';

const mapa = (modo, nome, extra = {}) => ({ modo, mapa: nome, brawlers: [{ nome: 'Shelly' }], ...extra });

// Duas rodadas da mesma coleta: as estatísticas iguais, a rotação e a hora diferentes.
const rodada = (hora, rotacao) => ({
  geradoEm: `2026-11-22T${hora}:00:00.000Z`,
  nomes: { mapas: {} },
  partes: {
    ranqueado: { geradoEm: '2026-11-22T07:00:00.000Z', mapas: [mapa('gemGrab', 'Hard Rock Mine', { tabela: [1] })] },
    trofeu: {
      geradoEm: '2026-11-22T07:20:00.000Z',
      rotacaoEm: `2026-11-22T${hora}:00:00.000Z`,
      mapas: [
        mapa('gemGrab', 'Hard Rock Mine', { rotacao: rotacao === 'Hard Rock Mine' }),
        mapa('gemGrab', 'Emotional Detachment', { rotacao: rotacao === 'Emotional Detachment' }),
      ],
    },
  },
});

const conteudo = (d) => {
  const s = separarRotacao(d);
  return [JSON.stringify(s.principal), JSON.stringify(s.trofeu)];
};

test('separarRotacao tira a rotação e a hora dos dados e devolve a rotação à parte', () => {
  const s = separarRotacao(rodada('17', 'Emotional Detachment'), (t) => ({ compacta: t }));
  assert.equal(s.principal.geradoEm, undefined);
  assert.equal(s.principal.partes.trofeu.rotacaoEm, undefined);
  assert.deepEqual(s.principal.partes.trofeu.mapas, []);
  assert.ok(s.trofeu.every((m) => !('rotacao' in m)));
  assert.deepEqual(s.principal.partes.ranqueado.mapas[0].tabela, { compacta: [1] });
  assert.deepEqual(s.principal.brawlers, ['Shelly']);
  assert.deepEqual(s.rotacao, { em: '2026-11-22T17:00:00.000Z', mapas: ['gemGrab|Emotional Detachment'] });
});

test('a versão não muda quando só a rotação muda, e muda quando as estatísticas mudam', () => {
  const v17 = versaoDe(...conteudo(rodada('17', 'Hard Rock Mine')));
  const v18 = versaoDe(...conteudo(rodada('18', 'Emotional Detachment')));
  assert.equal(v17, v18);
  assert.match(v17, /^[0-9a-f]{12}$/);

  const outroDia = rodada('18', 'Emotional Detachment');
  outroDia.partes.ranqueado.geradoEm = '2026-11-23T07:00:00.000Z';
  assert.notEqual(versaoDe(...conteudo(outroDia)), v17);
});

test('separarRotacao sem rotação nem Troféu não quebra', () => {
  const d = rodada('17', null);
  delete d.partes.trofeu.rotacaoEm;
  assert.deepEqual(separarRotacao(d).rotacao, { em: null, mapas: [] });
  delete d.partes.trofeu;
  assert.deepEqual(separarRotacao(d).trofeu, []);
});

test('versaoEm guarda a hora da versão enquanto ela é a mesma', () => {
  const anterior = { versao: 'abc', versaoEm: '2026-11-22T07:20:00.000Z' };
  assert.equal(versaoEm(anterior, 'abc', '2026-11-22T18:00:00.000Z'), '2026-11-22T07:20:00.000Z');
  assert.equal(versaoEm(anterior, 'def', '2026-11-22T18:00:00.000Z'), '2026-11-22T18:00:00.000Z');
  // O estado.json de antes de 22/11 não tem versão.
  assert.equal(versaoEm({ publicadoEm: 'x' }, 'abc', 'agora'), 'agora');
  assert.equal(versaoEm(null, 'abc', 'agora'), 'agora');
});

test('montarEstado mantém os campos que o robô de site parado lê', () => {
  const d = rodada('18', 'Emotional Detachment');
  const estado = montarEstado({ publicadoEm: d.geradoEm, partes: d.partes, versao: 'abc', versaoEm: 'v', rotacao: separarRotacao(d).rotacao });
  assert.deepEqual(estado, {
    publicadoEm: '2026-11-22T18:00:00.000Z',
    estatisticasEm: '2026-11-22T07:00:00.000Z',
    versao: 'abc',
    versaoEm: 'v',
    rotacaoEm: '2026-11-22T18:00:00.000Z',
    rotacao: ['gemGrab|Emotional Detachment'],
  });
});

test('listaDoMaximo leva a lista do config com o nome da página e avisa do que não confere', () => {
  const conhecidos = ['Frank', 'Mr. P'];
  assert.deepEqual(listaDoMaximo({ ate: '2026-12-16T05:00:00-03:00', brawlers: ['FRANK', 'MR. P'] }, conhecidos),
    { lista: { ate: '2026-12-16T05:00:00-03:00', brawlers: ['Frank', 'Mr. P'] }, avisos: [] });
  // Nome digitado errado entra na lista, mas avisa: senão o brawler nunca seria marcado, em silêncio.
  assert.deepEqual(listaDoMaximo({ ate: '2026-12-16', brawlers: ['FRANKK'] }, conhecidos).avisos, ['Frankk não aparece nos dados']);
  // Sem a chave, nada a avisar.
  assert.deepEqual(listaDoMaximo(undefined, conhecidos), { lista: null, avisos: [] });
  // Config torto não derruba a rodada: sai sem lista, com aviso.
  for (const torto of [{ ate: '2026-12-16', brawlers: 'FRANK' }, { ate: 'dia 16', brawlers: ['FRANK'] }]) {
    const r = listaDoMaximo(torto, conhecidos);
    assert.equal(r.lista, null);
    assert.equal(r.avisos.length, 1);
  }
});

test('enderecoDaWorker leva o endereço https do config.json e recusa o torto sem derrubar', () => {
  assert.deepEqual(enderecoDaWorker('https://perfil.exemplo.workers.dev'), { worker: 'https://perfil.exemplo.workers.dev', avisos: [] });
  assert.deepEqual(enderecoDaWorker(undefined), { worker: null, avisos: [] });
  for (const torto of ['http://perfil.exemplo.dev', 'perfil.exemplo.dev', 42]) {
    const { worker, avisos } = enderecoDaWorker(torto);
    assert.equal(worker, null);
    assert.equal(avisos.length, 1);
  }
});
