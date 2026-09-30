# Eleições 2026 · Bahia — fichas de candidatos

**Site no ar:** https://eleicoes26.pages.dev

<a href="https://eleicoes26.pages.dev"><img src="docs/tela-inicial.png" alt="Tela inicial do site" width="320"></a>

Site de consulta, somente leitura, com as fichas das candidaturas da Bahia em 2026 ao **Senado (senador e suplentes)**,
à **Câmara dos Deputados (deputado federal)** e à **Assembleia Legislativa (deputado estadual)**: patrimônio declarado,
dinheiro de campanha, emendas parlamentares, cota parlamentar/verba indenizatória, votações, proposições, sanções e
trajetória. Cada número traz o link para a fonte oficial e, quando existe, para o documento específico (nota fiscal,
emenda, votação, proposição).

> **Dado não é acusação.** O site reproduz o que as fontes oficiais publicam, sem juízo de valor: um gasto, uma emenda
> ou um registro de sanção não prova irregularidade. **CPF não é exibido** nem guardado no banco: pessoa física aparece
> só pelo nome, e documentos só quando são CNPJ.

## Fontes

Só fontes oficiais e públicas, baixadas por script:

- **TSE** — candidaturas, bens declarados, prestação de contas (2022 e 2026), votação de 2022, fotos, redes sociais.
- **Câmara dos Deputados** — deputados, votações nominais, proposições e cota parlamentar (CEAP).
- **Senado Federal** — senadores, votações, matérias e cota parlamentar (CEAPS).
- **Portal da Transparência (CGU)** — emendas parlamentares e cadastros de sanções (CEIS/CNEP).
- **Transferegov** — transferências especiais (“emendas Pix”).
- **Assembleia Legislativa da Bahia** — verba indenizatória dos deputados estaduais.
- **IBGE** — população dos municípios.

A lista completa, com URL, data de coleta e licença, está na página “Fontes” do site e em `coleta/base/fontes.json`.

> **Nota sobre o MCP do Portal da Transparência.** Durante o desenvolvimento usamos como referência o
> [`mcp-portal-transparencia`](https://github.com/dutradotdev/mcp-portal-transparencia) para explorar a API do
> Portal da Transparência. Ele não é nosso, o sistema não depende dele e não nos responsabilizamos por qualquer
> uso dele.

## Estrutura

```
coleta/     scripts que baixam as fontes oficiais e recriam o banco (guia: coleta/COLETA.md)
db/         esquema do Postgres (schema.sql, views.sql) e contrato de dados (DADOS.md)
api/        API Node somente leitura (Express + pg); em produção também serve o front (api/README.md)
web/        front React + Vite + Tailwind (web/README.md)
estatico/   exportação para JSON e montagem da versão estática, sem servidor (estatico/README.md)
start.sh    sobe o site (build do front + API) numa porta só
CONFERENCIA.md  valores do site conferidos contra as fontes oficiais
```

## Rodar localmente (modo servidor)

Pré-requisitos: Node 20+ e PostgreSQL 16+ com o banco `ba2026` (conexão padrão: socket `/tmp`, porta 5432; ajuste
com `BA2026_DSN` ou `PGHOST`/`PGPORT`/`PGUSER`).

```bash
./start.sh                  # instala dependências se faltarem, compila o front e sobe tudo em http://localhost:3333
PORT=8080 ./start.sh        # outra porta
./start.sh --sem-build      # reaproveita web/dist
```

Desenvolvimento, com recarga automática:

```bash
npm --prefix api i && npm --prefix api run dev    # API em http://localhost:3333/api
npm --prefix web i && npm --prefix web run dev    # site em http://localhost:5173 (proxy /api → 3333)
```

## Refazer os dados

O banco é reconstruído do zero a partir das fontes oficiais; o único ponto de partida versionado são os JSON
pequenos de `coleta/base/`.

```bash
python3 -m venv .venv && .venv/bin/pip install -r coleta/requirements.txt
coleta/run_all.sh           # baixa o que falta (~4,5 GB de cache em .cache/ na primeira vez), monta, carrega e valida
coleta/run_all.sh --dump    # idem e gera db/ba2026.dump (pg_dump -Fc, fora do git)
```

Pré-requisitos, tempos, cache, opções e validações: [`coleta/COLETA.md`](coleta/COLETA.md). Para levar o banco a
outra máquina sem refazer a coleta, gere o dump e restaure com
`createdb ba2026 && pg_restore --no-owner --no-privileges -d ba2026 db/ba2026.dump`.

## Versão estática

O site também pode ser gerado como arquivos estáticos (JSON + front compilado), com os mesmos filtros, busca e
paginação feitos no navegador:

```bash
npm run estatico            # gera publicar/ (~3.600 arquivos, ~100 MB)
npm run estatico:servir     # serve publicar/ em http://localhost:4173
```

Detalhes, formato dos arquivos e conferência contra a API: [`estatico/README.md`](estatico/README.md).

## Licença

Código sob a licença [MIT](LICENSE). Os dados vêm de fontes públicas oficiais e seguem os termos de cada fonte (ver página “Fontes” do site).
