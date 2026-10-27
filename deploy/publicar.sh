#!/usr/bin/env bash
# Gera o site e publica no GitHub Pages.
#
# Roda na máquina do Kauê, e não no GitHub Actions: o Brawl Time Ninja fica atrás
# do Cloudflare, que barra os servidores do GitHub com a tela "Just a moment...".
#
# O site vai pra branch gh-pages, que guarda só a página mais recente: cada
# publicação troca o único commit dela, então o histórico não cresce.
set -euo pipefail
cd "$(dirname "$0")/.."

REMOTO=git@github.com:kaue-magalhaes/meta-por-mapa.git

# Uma rodada por vez: se a anterior ainda está rodando, esta desiste.
exec 9>"${XDG_RUNTIME_DIR:-/tmp}/meta-por-mapa.lock"
flock -n 9 || { echo "outra rodada em andamento, saindo"; exit 0; }

timeout 45m node atualizar.mjs

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp site/index.html site/estado.json "$tmp/"
touch "$tmp/.nojekyll"
git -C "$tmp" init -q -b gh-pages
git -C "$tmp" add -A
git -C "$tmp" commit -q -m "site: $(date -u +%Y-%m-%dT%H:%MZ)"
# Só substitui a gh-pages se ela ainda estiver como a gente viu (vazio = não existe).
antes=$(git ls-remote "$REMOTO" refs/heads/gh-pages | cut -f1)
git -C "$tmp" push -q --force-with-lease="gh-pages:${antes}" "$REMOTO" gh-pages
echo "publicado em https://kaue-magalhaes.github.io/meta-por-mapa/"
