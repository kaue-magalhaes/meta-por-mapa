import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { idDoMapa, montarTabela, faltando, atualizarNomesEImagens, NOME_PT } from './imagens.mjs';

// Recortes dos arquivos da BrawlAPI, no formato de 15/11/2026.
const maps = [
  { id: 15000115, name: 'Double Swoosh', gameMode: { id: 48000000, name: 'Gem Grab' } },
  { id: 15000665, name: 'Double Swoosh', gameMode: { id: 48000000, name: 'Gem Grab' } },
  { id: 15001320, name: 'Double Swoosh', gameMode: { id: 48000000, name: 'Gem Grab' } },
  { id: 15000368, name: 'Belles Rock', gameMode: { id: 48000020, name: 'Knockout' } },
  { id: 15000300, name: 'Ring of Fire', gameMode: { id: 48000017, name: 'Hot Zone' } },
  { id: 15001119, name: 'Kroket', gameMode: { id: 48000006, name: 'Solo Showdown' } },
  { id: 15001125, name: 'Kroket', gameMode: { id: 48000009, name: 'Duo Showdown' } },
];
const locations = {
  GoldRush25: { id: 15000115, TID: 'TID_GOLDRUSH_25' },
  Knockout7: { id: 15000368, TID: 'TID_KNOCKOUT_7' },
};
const gmv = {
  GemGrab: { id: 48000000, Name: 'GemGrab', TID: 'TID_GAME_MODE_0' },
  Knockout: { id: 48000020, Name: 'Knockout', TID: 'TID_GAME_MODE_20' },
  KingOfHill: { id: 48000017, Name: 'KingOfHill', TID: 'TID_GAME_MODE_17' },
  Showdown: { id: 48000006, Name: 'Showdown', TID: 'TID_GAME_MODE_6' },
  DuoShowdown: { id: 48000009, Name: 'DuoShowdown', TID: 'TID_GAME_MODE_9' },
  KillConfirmed: { id: 48000040, Name: 'KillConfirmed', TID: 'TID_GAME_MODE_40' },
  TreasureHunt: { id: 48000056, Name: 'TreasureHunt', TID: 'TID_GAME_MODE_56' },
};
const pt = {
  TID_GOLDRUSH_25: { TID: 'TID_GOLDRUSH_25', PT: 'Arco duplo' },
  TID_KNOCKOUT_7: { TID: 'TID_KNOCKOUT_7', PT: 'Rocha da Belle' },
  TID_GAME_MODE_0: { TID: 'TID_GAME_MODE_0', PT: 'PIQUE-GEMA' },
  TID_GAME_MODE_20: { TID: 'TID_GAME_MODE_20', PT: 'NOCAUTE' },
  TID_GAME_MODE_17: { TID: 'TID_GAME_MODE_17', PT: 'ZONA ESTRATÉGICA' },
  TID_GAME_MODE_6: { TID: 'TID_GAME_MODE_6', PT: 'COMBATE SOLITÁRIO' },
  TID_GAME_MODE_9: { TID: 'TID_GAME_MODE_9', PT: 'COMBATE DUPLO' },
  TID_GAME_MODE_40: { TID: 'TID_GAME_MODE_40', PT: 'COLECIONADOR DE ALMAS' },
  TID_GAME_MODE_56: { TID: 'TID_GAME_MODE_56', PT: 'CAÇA AO TESOURO' },
};
const brawlers = [
  { id: 16000038, name: 'Surge' },
  { id: 16000000, name: 'Shelly' },
  { id: 16000084, name: 'Larry & Lawrie' },
];
const api = { maps, locations, pt, gmv, brawlers };

// O passo escreve no log da rodada; nos testes, só o aviso de falha é conferido.
mock.method(console, 'log', () => {});
const avisos = mock.method(console, 'warn', () => {});

test('idDoMapa prefere o id do BTN quando ele existe na lista', () => {
  assert.equal(idDoMapa({ modo: 'gemGrab', mapa: 'Double Swoosh', id: 15000665 }, maps), 15000665);
});

test('idDoMapa cai no menor id com o mesmo nome', () => {
  assert.equal(idDoMapa({ modo: 'gemGrab', mapa: 'Double Swoosh' }, maps), 15000115);
  // O id do BTN que a BrawlAPI não conhece também cai no nome.
  assert.equal(idDoMapa({ modo: 'gemGrab', mapa: 'Double Swoosh', id: 15009999 }, maps), 15000115);
  // A BrawlAPI escreve "Belles Rock"; o BTN, "Belle's Rock".
  assert.equal(idDoMapa({ modo: 'knockout', mapa: "Belle's Rock" }, maps), 15000368);
  assert.equal(idDoMapa({ modo: 'gemGrab', mapa: 'Mapa Novo' }, maps), null);
});

test('montarTabela traduz mapa e modo pelo TID', () => {
  const tabela = montarTabela(api, [{ modo: 'gemGrab', mapa: 'Double Swoosh' }, { modo: 'knockout', mapa: "Belle's Rock" }], []);
  assert.deepEqual(tabela.mapas['gemGrab|Double Swoosh'], { id: 15000115, pt: 'Arco duplo' });
  assert.deepEqual(tabela.mapas["knockout|Belle's Rock"], { id: 15000368, pt: 'Rocha da Belle' });
  assert.equal(tabela.modos.gemGrab.pt, 'Pique-Gema');
  assert.deepEqual(tabela.modos.knockout, { pt: 'Nocaute', icone: 48000020 });
});

test('montarTabela acha o modo pelo nome interno e, sem ele, pelo modo do mapa', () => {
  const tabela = montarTabela(
    api,
    [
      { modo: 'soloShowdown', mapa: 'Kroket' },
      { modo: 'duoShowdown', mapa: 'Kroket' },
      { modo: 'hotZone', mapa: 'Ring of Fire' },
      { modo: 'bounty', mapa: 'Mapa Novo' },
    ],
    [],
  );
  // O Kroket do Duplo tem o mesmo id do Solitário, mas o modo vem do nome DuoShowdown.
  assert.deepEqual(tabela.modos.duoShowdown, { pt: 'Combate Duplo', icone: 48000009 });
  // O jogo chama de Showdown e KingOfHill: esses saem do modo do mapa.
  assert.deepEqual(tabela.modos.soloShowdown, { pt: 'Combate Solitário', icone: 48000006 });
  assert.deepEqual(tabela.modos.hotZone, { pt: 'Zona Estratégica', icone: 48000017 });
  assert.equal(tabela.modos.bounty, undefined);
});

test('montarTabela deixa a preposição do nome do modo em minúscula', () => {
  const doSite = ['killConfirmed', 'treasureHunt', 'gemGrab'].map((modo) => ({ modo, mapa: 'Mapa Novo' }));
  const { modos } = montarTabela(api, doSite, []);
  assert.equal(modos.killConfirmed.pt, 'Colecionador de Almas');
  assert.equal(modos.treasureHunt.pt, 'Caça ao Tesouro');
  assert.equal(modos.gemGrab.pt, 'Pique-Gema');
});

test('montarTabela deixa de fora o mapa que a BrawlAPI não conhece', () => {
  const tabela = montarTabela(api, [{ modo: 'gemGrab', mapa: 'Double Swoosh' }, { modo: 'gemGrab', mapa: 'Mapa Novo' }], []);
  assert.deepEqual(Object.keys(tabela.mapas), ['gemGrab|Double Swoosh']);
});

test('montarTabela usa NOME_PT e liga Larry & Lawrie ao id', () => {
  const tabela = montarTabela(api, [], ['Surge', 'Shelly', 'Larry & Lawrie', 'Brawler Novo']);
  assert.deepEqual(tabela.brawlers, {
    Surge: { id: 16000038, pt: 'Wattson' },
    Shelly: { id: 16000000, pt: 'Shelly' },
    'Larry & Lawrie': { id: 16000084, pt: NOME_PT['Larry & Lawrie'] },
  });
});

test('montarTabela deixa de fora o id que não é inteiro, que viraria caminho de arquivo e src', () => {
  const estranho = {
    ...api,
    maps: [...maps, { id: '../m', name: 'Mapa Torto', gameMode: { id: 48000000 } }],
    gmv: { ...gmv, Heist: { id: '"><img src=x>', Name: 'Heist', TID: 'TID_GAME_MODE_0' } },
    brawlers: [...brawlers, { id: '../x', name: 'Torto' }, { id: 16000001.5, name: 'Quebrado' }],
  };
  const tabela = montarTabela(estranho, [{ modo: 'gemGrab', mapa: 'Mapa Torto' }, { modo: 'heist', mapa: 'Double Swoosh' }], ['Shelly', 'Torto', 'Quebrado']);
  assert.deepEqual(Object.keys(tabela.brawlers), ['Shelly']);
  assert.equal(tabela.mapas['gemGrab|Mapa Torto'], undefined);
  assert.equal(tabela.modos.heist, undefined);
  assert.deepEqual(faltando(tabela, () => false).map((i) => i.caminho).filter((c) => !/^(m|modo|b)\/\d+\.png$/.test(c)), []);
});

test('faltando lista só as imagens que não existem', () => {
  const tabela = {
    // Kroket é o mesmo mapa nos três Showdown: uma imagem só.
    mapas: { 'soloShowdown|Kroket': { id: 15001119, pt: 'Kroket' }, 'duoShowdown|Kroket': { id: 15001119, pt: 'Kroket' }, 'gemGrab|Double Swoosh': { id: 15000115, pt: 'Arco duplo' } },
    modos: { gemGrab: { pt: 'Pique-Gema', icone: 48000000 } },
    brawlers: { Surge: { id: 16000038, pt: 'Wattson' } },
  };
  const existe = (caminho) => caminho === 'm/15000115.png';
  assert.deepEqual(faltando(tabela, existe), [
    { url: 'https://cdn.brawlify.com/maps/regular/15001119.png', caminho: 'm/15001119.png' },
    { url: 'https://cdn.brawlify.com/game-modes/regular/48000000.png', caminho: 'modo/48000000.png' },
    { url: 'https://cdn.brawlify.com/brawlers/borderless/16000038.png', caminho: 'b/16000038.png' },
  ]);
});

// Responde como a BrawlAPI e o CDN, sem rede, e anota cada pedido.
function servidor() {
  const pedidos = [];
  const respostas = {
    'https://api.brawlapi.com/v1/maps': { list: maps },
    'https://api.brawlapi.com/v1/brawlers': { list: brawlers },
    'https://api.brawlapi.com/game/csv_logic/locations': locations,
    'https://api.brawlapi.com/game/csv_logic/game_mode_variations': gmv,
    'https://api.brawlapi.com/game/localization/pt': pt,
  };
  const buscar = async (url, opcoes) => {
    pedidos.push({ url, agente: opcoes.headers['User-Agent'] });
    if (url in respostas) return new Response(JSON.stringify(respostas[url]));
    return new Response(new Uint8Array([137, 80, 78, 71]));
  };
  return { pedidos, buscar };
}

const pasta = async () => pathToFileURL(join(await mkdtemp(join(tmpdir(), 'imagens-')), '/'));
const doSite = [{ modo: 'gemGrab', mapa: 'Double Swoosh' }];

test('atualizarNomesEImagens baixa uma vez e na segunda rodada não pede nada', async () => {
  const dir = await pasta();
  const { pedidos, buscar } = servidor();
  const tabela = await atualizarNomesEImagens(dir, doSite, ['Surge'], { buscar });
  assert.deepEqual(tabela.mapas['gemGrab|Double Swoosh'], { id: 15000115, pt: 'Arco duplo' });
  assert.equal(pedidos.length, 5 + 3);
  assert.ok(pedidos.every((p) => !p.agente.includes('@')));
  assert.deepEqual(await readdir(new URL('site/img/m/', dir)), ['15000115.png']);

  pedidos.length = 0;
  assert.deepEqual(await atualizarNomesEImagens(dir, doSite, ['Surge'], { buscar }), tabela);
  assert.equal(pedidos.length, 0);
});

test('atualizarNomesEImagens não pergunta de novo pelo mapa que a BrawlAPI não conhece', async () => {
  const dir = await pasta();
  const { pedidos, buscar } = servidor();
  await atualizarNomesEImagens(dir, [...doSite, { modo: 'gemGrab', mapa: 'Mapa Novo' }], [], { buscar });
  pedidos.length = 0;
  await atualizarNomesEImagens(dir, [...doSite, { modo: 'gemGrab', mapa: 'Mapa Novo' }], [], { buscar });
  assert.equal(pedidos.length, 0);
  // O id que chega do BTN depois conta como mapa novo: pergunta uma vez.
  await atualizarNomesEImagens(dir, [{ modo: 'gemGrab', mapa: 'Double Swoosh', id: 15001320 }], [], { buscar });
  assert.equal(pedidos.filter((p) => p.url.includes('api.brawlapi.com')).length, 5);
});

test('atualizarNomesEImagens segue com o cache quando a rede falha', async () => {
  const dir = await pasta();
  await atualizarNomesEImagens(dir, doSite, [], servidor());
  const semRede = async () => {
    throw new Error('sem rede');
  };
  avisos.mock.resetCalls();
  const tabela = await atualizarNomesEImagens(dir, [...doSite, { modo: 'gemGrab', mapa: 'Mapa Novo' }], ['Surge'], { buscar: semRede });
  assert.deepEqual(tabela.mapas, { 'gemGrab|Double Swoosh': { id: 15000115, pt: 'Arco duplo' } });
  assert.match(avisos.mock.calls[0].arguments[0], /nomes da BrawlAPI falharam.*sem rede/);
  // Sem cache nenhum, sai a tabela vazia.
  assert.deepEqual(await atualizarNomesEImagens(await pasta(), doSite, [], { buscar: semRede }), { mapas: {}, modos: {}, brawlers: {} });
});

test('atualizarNomesEImagens para as imagens depois de 3 falhas seguidas', async () => {
  // 2 mapas, 2 modos e 3 brawlers: 7 imagens. falhas: a ordem do que dá errado no CDN.
  const site = [...doSite, { modo: 'knockout', mapa: "Belle's Rock" }];
  const nomes = ['Surge', 'Shelly', 'Larry & Lawrie'];
  const cdn = (falhas) => {
    const { pedidos, buscar } = servidor();
    let i = 0;
    return {
      pedidos: () => pedidos.filter((p) => p.url.includes('cdn.brawlify.com')).length,
      buscar: async (url, opcoes) => {
        if (url.includes('cdn.brawlify.com') && falhas[i++]) {
          pedidos.push({ url });
          throw new Error('o CDN não respondeu');
        }
        return buscar(url, opcoes);
      },
    };
  };

  const fora = cdn([true, true, true, true, true, true, true]);
  avisos.mock.resetCalls();
  await atualizarNomesEImagens(await pasta(), site, nomes, fora);
  assert.equal(fora.pedidos(), 3);
  assert.match(avisos.mock.calls.at(-1).arguments[0], /3 falhas seguidas.*7 imagens ficam para a próxima rodada/);

  // Uma imagem que baixa zera a conta.
  const instavel = cdn([true, true, false, true, true, true, false]);
  avisos.mock.resetCalls();
  await atualizarNomesEImagens(await pasta(), site, nomes, instavel);
  assert.equal(instavel.pedidos(), 6);
  assert.match(avisos.mock.calls.at(-1).arguments[0], /6 imagens ficam para a próxima rodada/);
});
