# Meta por Mapa

Quais brawlers escolher em cada mapa de Brawl Stars, no ranqueado e no troféu,
com counters, duplas e especialistas por mapa. Os membros do clube escolhem o
próprio nome na página e veem só os brawlers que têm no máximo.

Os dados vêm das partidas registradas pelo [Brawl Time Ninja](https://brawltime.ninja).
As contas (vitória ajustada, tiers, duplas, counters) são deste projeto. Não é um
site oficial da Supercell.

## Como funciona

`atualizar.mjs` puxa os dados e gera `site/index.html` a partir de `modelo.html`.
`deploy/publicar.sh` gera e publica na branch `gh-pages`, que o GitHub Pages serve.
Um timer do systemd (`deploy/meta-por-mapa.timer`) roda isso a cada 3 horas.

A publicação roda numa máquina de casa, e não no GitHub Actions: o Brawl Time Ninja
fica atrás do Cloudflare, que barra os servidores do GitHub.

Para ligar o timer:

```bash
systemctl --user link ~/codes/personal/brawl-meta/deploy/meta-por-mapa.service
systemctl --user enable --now ~/codes/personal/brawl-meta/deploy/meta-por-mapa.timer
journalctl --user -u meta-por-mapa  # log das rodadas
```

Para gerar na sua máquina (Node 24, sem dependências):

```bash
node atualizar.mjs            # tudo, uns 15 minutos
node atualizar.mjs --limite 2 # 2 mapas por parte, pra testar rápido
node --test                   # testes das contas
```

As opções estão no começo de `atualizar.mjs`. O padrão fica em `config.json`.
