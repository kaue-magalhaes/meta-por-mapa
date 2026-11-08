// Liga a lógica ao mundo: o fetch da Cloudflare, a chave do segredo e o limitador.
// O fetch vai dentro de uma função porque passado solto ele perde o this no runtime.
import { responder } from './responder.mjs';

export default {
  fetch: (pedido, env) =>
    responder(pedido, { chave: env.SUPERCELL_KEY, buscar: (url, init) => fetch(url, init), limite: env.LIMITE }),
};
