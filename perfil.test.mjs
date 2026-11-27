// perfil.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
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

// O nome do jogador é texto livre, escolhido por qualquer pessoa no jogo, e a Worker o
// devolve como veio. Quem impede que ele vire HTML na página de quem buscou a tag é o
// modelo.html, que não tem teste próprio: estes tiram dele só os trechos que importam.
// Revisão de segurança de 27/11/2026 (2026-11-27-pesquisa-seguranca.md, na pasta de specs).
const PAGINA = readFileSync(new URL('modelo.html', import.meta.url), 'utf8');
function daPagina(re, nome) {
  const m = PAGINA.match(re);
  assert.ok(m, `trecho não achado no modelo.html: ${re}`);
  return vm.runInNewContext(`${m[0]}; ${nome}`);
}
const NOME_MALICIOSO = `<img src=x onerror="alert(1)">'&`;

test('esc da página transforma o nome do jogador em texto, sem tag nem aspas', () => {
  const esc = daPagina(/^const esc = .*$/m, 'esc');
  assert.equal(esc(NOME_MALICIOSO), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&#39;&amp;');
});

// Os dois usos sem esc montam texto que só sai por textContent e setAttribute, que não
// interpretam HTML. Uso novo do nome quebra este teste: confira por onde ele sai antes
// de pôr na lista. O teste lê o texto da página, então só vê o nome escrito como
// perfil.nome ou perfil?.nome. Desestruturar (const { nome } = perfil) ou passar o nome
// por outra variável escapa dele: quem fizer isso confere o esc à mão.
test('todo uso do nome do jogador na página passa por esc ou sai por textContent', () => {
  const semEsc = PAGINA.split('\n').map((l) => l.trim()).filter((l) => /(?<!esc\()perfil\??\.nome/.test(l));
  assert.deepEqual(semEsc.map((l) => l.slice(0, 24)), ['if (perfil) frases.push(', 'const rotulo = perfil ? ']);
  assert.match(PAGINA, /getElementById\('info'\)\.textContent = frases\.join/);
  assert.match(PAGINA, /getElementById\('perfilRotulo'\)\.textContent = rotulo;/);
  assert.match(PAGINA, /selo\.setAttribute\('aria-label', `Seu perfil: \$\{rotulo\}`\)/);
});

// Os recordes viram texto do selo "seu recorde" sem esc, porque deveriam ser números. A
// Worker só manda número (resumirPerfil); a página confere de novo para não depender
// dela nem do perfil guardado no navegador.
test('perfilValido da página recusa recorde que não é número', () => {
  const perfilValido = daPagina(/^function perfilValido\(p\) \{[\s\S]*?^\}/m, 'perfilValido');
  const bom = resumirPerfil('2PU0YL92J', { name: NOME_MALICIOSO, brawlers: [{ name: 'SHELLY', highestTrophies: 500 }] });
  assert.equal(perfilValido(bom), true);
  assert.equal(perfilValido({ ...bom, recordes: { Shelly: '<img src=x onerror=alert(1)>' } }), false);
  assert.equal(perfilValido({ ...bom, recordes: { Shelly: Infinity } }), false);
});
