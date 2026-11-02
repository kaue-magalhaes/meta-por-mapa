# Meta por Mapa

Quais brawlers escolher em cada mapa de Brawl Stars, no ranqueado e no troféu,
com counters, duplas e especialistas por mapa, e um modo Draft para o ranqueado
do Mítico pra cima, que recomenda o brawler conforme os bloqueios e as escolhas
digitados. Os membros do clube escolhem o próprio nome na página e veem só os
brawlers que têm no máximo.

Os dados vêm das partidas registradas pelo [Brawl Time Ninja](https://brawltime.ninja).
As contas (vitória ajustada, tiers, duplas, counters) são deste projeto. Não é um
site oficial da Supercell.

## Como funciona

`atualizar.mjs` puxa os dados e gera `site/index.html` a partir de `modelo.html`.
`deploy/publicar.sh` gera e publica na branch `gh-pages`, que o GitHub Pages serve.
Um timer do systemd (`deploy/meta-por-mapa.timer`) roda isso a cada hora.

As estatísticas do Brawl Time Ninja são coletadas uma vez por dia, com o token que o
dono do site cedeu, em `~/.config/brawltime-ninja/token`. Cada pedido leva o nome do
projeto e um contato, e os pedidos saem um a cada 20 segundos. Nas outras rodadas
mudam só a rotação do troféu e o clube.

A publicação roda numa máquina de casa, e não no GitHub Actions: o Brawl Time Ninja
fica atrás do Cloudflare, que barra os servidores do GitHub.

A rotação, os membros do clube e o que cada um tem no máximo vêm da API oficial da Supercell.
A chave, criada em developer.brawlstars.com e presa ao IP de casa, fica em
`~/.config/brawlstars-api/token`. Se o Brawl Time Ninja falhar, o site sai mesmo
assim, com as estatísticas da última vez e o clube atualizado.

Um robô do GitHub Actions (`.github/workflows/aviso-site-parado.yml`) confere a
cada hora a data das estatísticas e abre uma issue quando ela passa de 30 horas.

Para ligar o timer:

```bash
systemctl --user link ~/codes/personal/brawl-meta/deploy/meta-por-mapa.service
systemctl --user enable --now ~/codes/personal/brawl-meta/deploy/meta-por-mapa.timer
journalctl --user -u meta-por-mapa  # log das rodadas
```

Para gerar na sua máquina (Node 24, sem dependências):

```bash
node atualizar.mjs --parte ranqueado # coleta agora, alguns minutos (precisa do token do BTN)
node atualizar.mjs                   # coleta só se a última passou de 23 horas
node --test                   # testes das contas
```

As opções estão no começo de `atualizar.mjs`. O padrão fica em `config.json`.

## Depois de um balanceamento

Logo depois de um patch, quase todas as partidas do período são de antes dele, e a lista do ranqueado erra justamente nos brawlers alterados. Para corrigir isso, anote o patch em `patches`, no `config.json`: a data (dia do patch, em UTC) e, para cada brawler alterado, a direção (`nerf`, `buff` ou `misto`) e o tamanho (`pequena`, `media` ou `grande`), lidos nas notas.

As partidas de antes do patch andam o efeito estimado dele, igual em todos os mapas, e o dia do patch sai. O Brawl Time Ninja dá as partidas em blocos de duas semanas, então elas são divididas igualmente pelos dias do bloco; o bloco que tem o patch no meio não entra na medida do efeito. O efeito começa no tamanho típico daquela mudança (`CHUTE_PATCH` em `calculo.mjs`) e vira o efeito medido conforme chegam os dias de depois. Patch que já saiu das 6 semanas pode ser apagado da lista.
