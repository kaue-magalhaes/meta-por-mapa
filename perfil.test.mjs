// perfil.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarTag, resumirPerfil } from './perfil.mjs';

test('normalizarTag aceita # repetido, minúscula, espaço e a letra O no lugar do zero', () => {
  assert.equal(normalizarTag('#2pu0yl92j'), '2PU0YL92J');
  assert.equal(normalizarTag('  ##2PUOYL92J '), '2PU0YL92J');
  assert.equal(normalizarTag('2PU0YL92J'), '2PU0YL92J');
});

test('normalizarTag recusa caractere fora do alfabeto, tag curta, tag longa e vazio', () => {
  assert.equal(normalizarTag('ABC123'), null);
  assert.equal(normalizarTag('2PU0YL92J!'), null);
  assert.equal(normalizarTag('2P'), null);
  assert.equal(normalizarTag('2'.repeat(15)), null);
  assert.equal(normalizarTag(''), null);
  assert.equal(normalizarTag(undefined), null);
  assert.equal(normalizarTag('#'), null);
});

const brawler = (name, power, extra = {}) => ({
  name, power, highestTrophies: 500,
  gadgets: [{ id: 1 }], starPowers: [{ id: 2 }], hyperCharges: [{ id: 3 }], ...extra,
});

test('resumirPerfil marca no máximo só nível 11 com gadget, star power e hipercarga', () => {
  const p = resumirPerfil('2PU0YL92J', {
    name: 'k a u e',
    brawlers: [
      brawler('BIBI', 11),
      brawler('EL PRIMO', 11),
      brawler('AMBER', 10),
      brawler('EMZ', 11, { hyperCharges: [] }),
      brawler('BROCK', 11, { gadgets: undefined }),
    ],
  });
  assert.deepEqual(p.maximizados, ['Bibi', 'El Primo']);
  assert.equal(p.nome, 'k a u e');
  assert.equal(p.tag, '2PU0YL92J');
});

test('resumirPerfil guarda o recorde de troféus e ignora valor inválido da API', () => {
  const p = resumirPerfil('2PU0YL92J', {
    name: 'x',
    brawlers: [
      brawler('BIBI', 11, { highestTrophies: 900 }),
      brawler('AMBER', -1, { highestTrophies: -1 }),
      brawler('EMZ', 9, { highestTrophies: 0 }),
      { power: 11 },
    ],
  });
  assert.deepEqual(p.recordes, { Bibi: 900 });
});

test('resumirPerfil não quebra com resposta vazia ou nome nulo', () => {
  assert.deepEqual(resumirPerfil('2PU0YL92J', null), { tag: '2PU0YL92J', nome: '#2PU0YL92J', maximizados: [], recordes: {} });
  assert.equal(resumirPerfil('2PU0YL92J', { name: null, brawlers: 'lixo' }).nome, '#2PU0YL92J');
});
