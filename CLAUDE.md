# Meta por Mapa

Site estático que diz quais brawlers escolher em cada mapa de Brawl Stars, no Ranqueado e no Troféu, com counters, duplas e um modo Draft. Um script Node coleta as estatísticas do Brawl Time Ninja (BTN) e gera a página. Um timer na máquina do Kauê publica no GitHub Pages de hora em hora.

O `README.md` explica as fontes de dados, os tokens, o deploy e o que fazer depois de um balanceamento. Leia a parte certa dele antes de mexer nesses assuntos. Código, comentários, nomes e commits são em português.

## Como conferir o trabalho

- `node --test` na raiz roda todos os testes, inclusive os da Worker. Sem rede, em menos de 1 segundo (121 testes em 26/11/2026).
- Um arquivo: `node --test calculo.test.mjs`. Um caso: `node --test --test-name-pattern="freioDeUso"`.
- Leia o número de testes na saída. Fora da raiz, `node --test` não acha nenhum arquivo e sai com sucesso e `tests 0`.
- Mudança no `modelo.html` ou no `draft.mjs` só aparece depois de gerar a página. Peça ao Kauê para rodar `! node atualizar.mjs --so-pagina` (o plugin descrito abaixo não deixa você rodar). Depois sirva a pasta com `python3 -m http.server 8765 --bind 127.0.0.1 -d site` e confira a tela.
- Pronto é: testes verdes com o número esperado, teste novo para conta nova ou alterada e, quando a tela mudou, a página gerada e conferida.

## Onde mora cada regra

- `calculo.mjs`: todas as contas da tier list (cascata, peso por idade, efeito dos patches, freio por uso, duplas, counters). Só contas, sem rede nem arquivo.
- `draft.mjs`: as contas do modo Draft. O gerador cola este arquivo dentro da página sem as palavras `export `, por isso ele não pode ter `import`, DOM nem nome que já exista no `modelo.html`.
- `modelo.html`: a página inteira, inclusive os cortes de cada tier (`FAIXAS`) e os selos. Não tem teste.
- `montagem.mjs`: as contas do gerador, que transformam as linhas cruas do BTN em cada parte do site (a lista de cada mapa, as duplas e os counters de cada parte, a escolha dos mapas). Recebe as linhas já buscadas e o "agora"; não faz pedido, não grava arquivo e não lê o relógio.
- `atualizar.mjs`: só o que fala com o mundo: argumentos, pedidos, arquivos, relógio, log e a montagem dos arquivos do site. Importar o arquivo já dispara a coleta, por isso ele não tem teste. Conta nova vai para o `montagem.mjs` ou para o `calculo.mjs`, com teste.
- `publicacao.mjs`: o que vai em cada arquivo do site e a versão dos dados.
- `perfil.mjs`: o perfil pela tag. A Worker (`worker/`) importa este arquivo e, por ele, o `nomeBonito` do `calculo.mjs`.
- `config.json`: o que muda sem mexer em código (patches, faixa do Ranqueado, endereço da Worker).

Gerados, fora do git, nunca editados à mão: a pasta `site/`, o `dados.json`, o `nomes.json` e o `atributos.json`. Para mudar a página, edite o `modelo.html` ou o `draft.mjs` e gere de novo.

## Armadilhas

- Um plugin de privacidade recusa todo comando Bash que contenha o nome do gerador (`atualizar.mjs`), porque o arquivo guarda o e-mail do User-Agent do BTN. Leia e edite esse arquivo pelas ferramentas Read e Edit. Rodar o gerador é com o Kauê, pelo `!`. Não contorne o plugin com outro nome ou script equivalente.
- Pedido ao BTN gasta a cota que o dono do site cedeu. Só com o ok do Kauê e fora dos minutos 8 a 35 de cada hora: o timer começa no minuto 10, com até 5 de atraso, e a rodada com a coleta do dia levou 16 minutos de 21 a 25/11/2026 (journal do timer). As regras do dono estão no comentário de `API_BTN`. Toda rodada do gerador sem `--so-pagina` faz pelo menos um pedido.
- Os cortes de tier (`FAIXAS`, no `modelo.html`) foram calibrados junto com `USO_FREIO` e `PESO_USO` (`calculo.mjs`). Mudar um lado sem o outro desmonta a tier list, e nenhum teste avisa.
- Campo do `site/estado.json` pode entrar, nunca sair. O robô `.github/workflows/aviso-site-parado.yml` lê `estatisticasEm` para abrir a issue de site parado. Sem o campo, ele usa a data do último commit do `gh-pages`, que muda toda hora, e o aviso nunca mais abre.
- Mudou o `nomeBonito`? A Worker precisa de deploy novo (`cd worker && npx wrangler deploy`), com o ok do Kauê. O timer só publica a página, nunca a Worker.
- O Chrome emulado no PC não mostra defeito do Safari, e todo navegador de iPhone usa o motor do Safari. Em 26/11/2026 as folhas sem altura fixa abriam só com o topo no iPhone e inteiras no Chrome (`2026-11-26-pesquisa-folhas-celular.md`, na pasta de specs). Mudança de layout nas folhas ou no `<dialog>` se confere também no iPhone do Kauê, servindo a página na rede de casa.
- O timer gera e publica a partir desta pasta (`deploy/publicar.sh`), com o que estiver no disco, commitado ou não. Mudança no `modelo.html`, no `draft.mjs`, no `config.json` ou nas contas vai ao ar na rodada seguinte, entre os minutos 10 e 15. Confira a tela antes disso, ou guarde a mudança com `git stash` até a rodada passar.

## Antes de afirmar ou decidir

- Antes de afirmar como um trecho funciona, abra o trecho. Comentário, handoff e diagnóstico antigos podem estar errados: em 24/11 um diagnóstico disse que o freio por uso era aplicado duas vezes, e não era.
- Todo número que você escreve (comentário, commit, resposta) diz de onde veio: o teste, os dados de uma data, a fonte. Sem a fonte, ninguém refaz a conta quando os dados mudam. Os comentários do `calculo.mjs` mostram o padrão.
- O que você não conseguiu conferir, diga que não conferiu. Não complete com o que parece plausível: o Kauê decide pelo que você relata, e palpite dito como fato vira decisão errada.
- Regra de negócio nova (o que entra na nota, um corte, um peso, quem aparece no S) é decisão do Kauê, porque é ele quem testa a tier list no jogo e responde pelo que o site recomenda. Leve como pergunta curta, "A ou B?", com a sua sugestão. Ajuste de peso vem do teste dele no jogo.
- Dependência nova, framework ou troca de tecnologia também é decisão dele.
- Comentário explica o porquê que o código não diz, com a data e o dado. Não conte a conversa nem as tentativas descartadas.

## Decisões já tomadas

Não reabra sem o Kauê pedir. Cada uma diz onde está o porquê.

- A tier list é para o jogador comum: o uso entra na nota (`freioDeUso`) para especialista raro não virar S (23/11/2026). Porquê e pendências: memória `tier-list-para-jogador-comum` e o comentário do `freioDeUso`.
- Troféu e Ranqueado usam o mesmo período, a mesma meia-vida e a mesma correção de patch, e mudança numa parte entra nas duas. Cada parte mede o efeito do patch nas próprias partidas (22/11/2026). Porquê: memória `mesmo-peso-nas-duas-partes`.
- A rotação mora só no `site/estado.json`, e a versão dos dados é um resumo do conteúdo (22/11/2026). Porquê: o comentário do topo do `publicacao.mjs` e `2026-11-22-cache-da-pagina.md`.
- Quem decide não buscar um dado de um modo grava `null` no Map, e a montagem trata modo ausente como erro, nunca como lista vazia (26/11/2026). Porquê: memória `modo-sem-dado-grava-null` e o comentário do `doModoNaCasca`.
- Função do `montagem.mjs` não recebe opção que muda o caminho da conta: ela devolve os valores do meio e cada parte decide o que é dela. Opção que é dado, como o `limite` do `mapasDoTrofeu`, pode (26/11/2026). Porquê: memória `montagem-nucleo-puro`.

## Onde está o resto

- Designs, planos, pesquisas e handoffs, com data no nome: `~/.claude/spec/brawl-meta/ferramenta-meta/`. Antes de mudar a nota, um peso ou a coleta, procure ali o documento do assunto.
- Memória do projeto, com o histórico de cada decisão: `~/.claude/projects/-home-kaue-codes-personal-brawl-meta/memory/`.
