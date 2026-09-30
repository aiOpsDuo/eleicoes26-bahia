# API (`api/`)

API Node (Express 5 + pg) somente leitura sobre o banco `ba2026`. Só `GET`/`HEAD` (outros métodos → 405), respostas
JSON, consultas parametrizadas (nenhuma entrada do usuário é interpolada em SQL; ordenações e grupos são listas
fechadas) e sessão do Postgres em modo `read only` com tempo máximo por consulta.

```bash
npm --prefix api i
npm --prefix api run dev      # http://localhost:3333/api (sem servir o front, sem limite de taxa)
```

Em produção (`start.sh` na raiz) o mesmo processo serve `/api/*` e o build do front (`web/dist`), com fallback do
SPA, cabeçalhos de segurança (`seguranca.js`: CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`,
`Permissions-Policy`), cache longo para `/assets`, 7 dias para `/fotos`, 1 dia para `/hero`, 5 min para `/api` e limite
de 600 requisições/min por IP em `/api`.

| variável | padrão |
|---|---|
| `PORT`, `HOST` | 3333, todas as interfaces |
| `BA2026_DSN` (ou `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`) | socket `/tmp`, 5432, `ba2026`, `pedrostriquer` |
| `STATIC_DIR` / `SERVIR_FRONT=0` | `web/dist` / serve se o `index.html` existir |
| `LIMITE_POR_MINUTO` (0 desliga), `TRUST_PROXY` (atrás de proxy reverso) | 600, desligado |

## Rotas

| rota | o que devolve |
|---|---|
| `GET /api/saude` | `{ ok, candidatos }` |
| `GET /api/inicio` | totais, contagens por cargo/grupo, calendário, prévia do Senado com chapa e destaques (maiores patrimônios, emendas, cota Câmara, verba ALBA, arrecadação), cada um com a fonte |
| `GET /api/candidatos?grupo=…` | lista paginada (`candidato_resumo`). `grupo` (`senado`, `deputado-federal`, `deputado-estadual`, `parlamentar`) ou `cargo` (lista separada por vírgula), `q`, `partido`, `situacao` (`na_disputa` padrão, `deferida`, `em_julgamento`, `indeferida`, `renuncia`, `todas` ou o valor exato), `mandato` (`sim`/`nao`), `genero`, `cor_raca`, `faixa_patrimonio`, `municipio` (código TSE do município‑base), `ordem` (`nome`, `patrimonio`, `arrecadacao`, `emendas`, `cota`, `idade`, `numero`), `pagina`, `por_pagina` (≤ 100). Traz `chapa` (suplentes) no Senado e `fontes` das métricas |
| `GET /api/filtros?grupo=…` | valores de cada filtro com contagem (facetado: aceita os mesmos filtros da lista) |
| `GET /api/busca?q=…&limite=8` | busca global por nome/número (sem acento, aproximada por trigramas) |
| `GET /api/candidatos/:slug` | ficha: `{ ficha (candidato + resumo + contagens por seção), chapa, titular, redes, fontes }`; 404 se o slug não existe |
| `GET /api/fontes` | tabela `fonte` completa |

### Seções da ficha (`rotas/secoes.js`)

Todas em `GET /api/candidatos/:slug/<secao>` (404 se o slug não existe). Listas grandes são paginadas
(`pagina`, `por_pagina` ≤ 100) e devolvem `{ linhas, total, soma?, facetas?, pagina, por_pagina }`; busca `q` sem acento.

| rota | conteúdo | filtros |
|---|---|---|
| `visao` | última campanha, votações‑chave recentes | – |
| `patrimonio` | evolução por eleição (variação), bens de todos os anos | – |
| `campanha` | resumos por eleição, doadores (pessoa física só pelo nome), fornecedores, categorias, receitas por tipo | `ano` |
| `campanha/despesas` | despesas contratadas linha a linha | `ano, categoria, q, ordem` (`valor`, `valor_asc`, `data`, `data_asc`, `fornecedor`) |
| `atuacao` | votos por ano/voto/tema, % de alinhamento, votações‑chave (com “sem voto” no período), resumo das proposições | – |
| `atuacao/votos` | voto a voto com link oficial | `ano, tema, voto, chave=1, alinhamento=sim\|nao, q, ordem` |
| `atuacao/proposicoes` | proposições de autoria | `tipo, ano, tema, principais=1, q` |
| `emendas` | por ano, por área, municípios de destino (com per capita), favorecidos, intermediários, convênios, Pix, shows | – |
| `emendas/lista` | emenda a emenda com link do Portal da Transparência | `ano, area, q, ordem` |
| `cota` | por ano, por categoria, fornecedores, destaques (alimentação, hospedagem, combustível, aeronave) | – |
| `cota/notas` | nota a nota com link do documento | `casa, ano, mes, grupo (inclui aeronave), q, ordem` |
| `atencao` | sanções (CEIS/CNEP do Portal da Transparência) | – |
| `trajetoria` | candidaturas anteriores, trocas de partido, votos de 2022 por município (25 maiores) | – |
| `fontes` | fontes usadas na ficha, com onde aparecem e quantos registros | – |

A versão estática (`estatico/`) reaproveita estes handlers para exportar os JSON; `rotas/secoes.js` exporta o símbolo
`TODAS`, que só a exportação usa, para devolver todas as linhas de uma lista sem paginação.
