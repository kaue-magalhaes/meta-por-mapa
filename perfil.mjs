// perfil.mjs
// Perfil de um jogador, do jeito que o Draft usa. Puro e sem nada de Node, porque a
// Worker (worker/) importa este mesmo arquivo: a regra de "no máximo" mora só aqui.
import { nomeBonito } from './calculo.mjs';

// Alfabeto das tags da Supercell. O mínimo de 3 é o do BTN e do SDK brawlstats; o
// máximo de 14 é nosso (as tags de 2026 têm de 8 a 10) e só barra lixo antes da API.
const TAG_VALIDA = /^[0289PYLQGRJCUV]{3,14}$/;

// Tira espaço e # do começo, passa para maiúscula e troca a letra O por zero, como o
// BTN faz. Devolve a tag sem # ou null se ela não pode existir.
export function normalizarTag(texto) {
  const tag = String(texto ?? '').trim().replace(/^#+/, '').toUpperCase().replace(/O/g, '0');
  return TAG_VALIDA.test(tag) ? tag : null;
}

const lista = (x) => (Array.isArray(x) ? x : []);

// "No máximo" = nível 11 com pelo menos um gadget, uma star power e a hipercarga.
// Engrenagem fica de fora porque é barata de comprar. recordes é o maior troféu que a
// pessoa já teve com cada brawler: no Draft, marca quem ela mais jogou. A API às vezes
// manda power -1, troféus -1 ou nome nulo (comentários no código do BTN): campo
// estranho conta como vazio, nunca como erro.
export function resumirPerfil(tag, p) {
  const brawlers = lista(p?.brawlers).filter((b) => typeof b?.name === 'string');
  const tem = (b, k) => lista(b[k]).length > 0;
  return {
    tag,
    nome: typeof p?.name === 'string' && p.name ? p.name : `#${tag}`,
    maximizados: brawlers
      .filter((b) => b.power === 11 && tem(b, 'gadgets') && tem(b, 'starPowers') && tem(b, 'hyperCharges'))
      .map((b) => nomeBonito(b.name))
      .sort(),
    recordes: Object.fromEntries(
      brawlers.filter((b) => Number.isFinite(b.highestTrophies) && b.highestTrophies > 0).map((b) => [nomeBonito(b.name), b.highestTrophies]),
    ),
  };
}
