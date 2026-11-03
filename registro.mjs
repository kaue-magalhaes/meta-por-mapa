// Partidas do Ranqueado dos membros do clube, guardadas a cada rodada. A API oficial
// devolve só as 25 últimas de cada jogador, então quem não guarda perde. O arquivo serve
// pra, com algumas semanas, medir a vitória de cada um com cada brawler.
// Formato igual ao da validação 8: times com o vencedor primeiro, cada jogador com tag,
// brawler e nivel (no Ranqueado, o "trophies" do brawler é a liga da partida).

const DIAS_GUARDADOS = 90;

// itens: o items do /players/{tag}/battlelog. Empate e partida sem os dois times saem.
export function partidasRanqueadas(itens, tag) {
  const saida = [];
  for (const it of itens ?? []) {
    const b = it.battle;
    if (b?.type !== 'soloRanked' || !Array.isArray(b.teams) || b.teams.length !== 2) continue;
    if (b.result !== 'victory' && b.result !== 'defeat') continue;
    const meu = b.teams.findIndex((t) => t.some((j) => j.tag === tag));
    if (meu < 0) continue;
    const times = b.teams.map((t) => t.map((j) => ({ tag: j.tag, b: j.brawler.name, nivel: j.brawler.trophies })));
    const venceu = b.result === 'victory' ? meu : 1 - meu;
    saida.push({ quando: it.battleTime, modo: it.event?.mode ?? b.mode, mapa: it.event?.map, vencedor: times[venceu], perdedor: times[1 - venceu] });
  }
  return saida;
}

// Dois membros na mesma partida trazem a mesma partida duas vezes: a chave é o horário
// mais as seis tags.
const chave = (p) => `${p.quando}|${[...p.vencedor, ...p.perdedor].map((j) => j.tag).sort().join(',')}`;
const dataDe = (quando) => Date.parse(quando.replace(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)/, '$1-$2-$3T$4:$5:$6'));

export function juntarPartidas(antigas, novas, agora) {
  const limite = agora - DIAS_GUARDADOS * 864e5;
  const todas = new Map();
  for (const p of [...antigas, ...novas]) if (dataDe(p.quando) >= limite) todas.set(chave(p), p);
  return [...todas.values()].sort((a, b) => a.quando.localeCompare(b.quando));
}
