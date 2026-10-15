# Meta por Mapa

Quais brawlers escolher em cada mapa de Brawl Stars, no ranqueado e no troféu,
com counters, duplas e especialistas por mapa. Os membros do clube escolhem o
próprio nome na página e veem só os brawlers que têm no máximo.

Os dados vêm das partidas registradas pelo [Brawl Time Ninja](https://brawltime.ninja).
As contas (vitória ajustada, tiers, duplas, counters) são deste projeto. Não é um
site oficial da Supercell.

## Como funciona

`atualizar.mjs` puxa os dados e gera `site/index.html` a partir de `modelo.html`.
A automação em `.github/workflows/atualizar.yml` roda isso a cada 3 horas e publica
no GitHub Pages.

Para gerar na sua máquina (Node 24, sem dependências):

```bash
node atualizar.mjs            # tudo, uns 15 minutos
node atualizar.mjs --limite 2 # 2 mapas por parte, pra testar rápido
node --test                   # testes das contas
```

As opções estão no começo de `atualizar.mjs`. O padrão fica em `config.json`.
