import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partidasRanqueadas, juntarPartidas } from './registro.mjs';

const jogador = (tag, b, nivel = 14) => ({ tag: `#${tag}`, brawler: { name: b, trophies: nivel } });
const item = (quando, result, tipo = 'soloRanked') => ({
  battleTime: quando,
  event: { mode: 'gemGrab', map: 'Hard Rock Mine' },
  battle: {
    type: tipo, result,
    teams: [[jogador('EU', 'AMBER'), jogador('A1', 'GUS'), jogador('A2', 'ASH')], [jogador('B1', 'SHADE'), jogador('B2', 'TARA'), jogador('B3', 'EMZ')]],
  },
});

test('partidasRanqueadas guarda o vencedor primeiro e ignora o que não é Ranqueado', () => {
  const p = partidasRanqueadas([item('20261102T120000.000Z', 'defeat'), item('20261102T110000.000Z', 'victory', 'ranked'), item('20261102T100000.000Z', 'draw')], '#EU');
  assert.equal(p.length, 1);
  assert.equal(p[0].quando, '20261102T120000.000Z');
  assert.equal(p[0].mapa, 'Hard Rock Mine');
  assert.deepEqual(p[0].vencedor.map((j) => j.b), ['SHADE', 'TARA', 'EMZ']);
  assert.deepEqual(p[0].perdedor[0], { tag: '#EU', b: 'AMBER', nivel: 14 });
});

test('partidasRanqueadas ignora partida em que o jogador não está', () => {
  assert.equal(partidasRanqueadas([item('20261102T120000.000Z', 'victory')], '#OUTRO').length, 0);
});

test('juntarPartidas não repete partida vista por dois membros e corta as velhas', () => {
  const agora = Date.parse('2026-11-02T12:00:00Z');
  const nova = partidasRanqueadas([item('20261102T120000.000Z', 'victory')], '#EU')[0];
  const velha = { ...nova, quando: '20260701T120000.000Z' };
  const j = juntarPartidas([velha, nova], [nova, { ...nova }], agora);
  assert.equal(j.length, 1);
  assert.equal(j[0].quando, '20261102T120000.000Z');
});
