# Coleta — como reconstruir o banco `ba2026` do zero

Tudo o que o site mostra vem de **fontes oficiais** (TSE, Câmara dos Deputados, Senado Federal, Portal da
Transparência/CGU, Transferegov, Assembleia Legislativa da Bahia e IBGE). Esta pasta tem os scripts que baixam
essas fontes, montam as tabelas e carregam o Postgres. Quem clonar o repositório reconstrói os dados só rodando
os scripts; o único ponto de partida versionado são os JSONs pequenos de `base/`.

Escopo: candidaturas de 2026 na Bahia para **Senado (senador e suplentes), Deputado Federal e Deputado Estadual**.

```
coleta/
  run_all.sh            orquestra tudo: download -> montagem -> carga -> validação
  requirements.txt      dependências Python (duckdb, psycopg)
  base/                 dados-base versionados (pequenos, sem CPF)
    candidatos_ids.json   SQ_CANDIDATO 2026 -> slug, id Câmara, id Senado, id ALBA, códigos de autor de emenda (~140 KB)
    votacoes_chave.json   14 votações nominais da Câmara destacadas como "votações-chave" (id oficial + rótulo)
    fontes.json           catálogo das fontes oficiais (vira a tabela `fonte`)
  baixar/               downloads (Node): tse, camara, senado, portal, transferegov, ibge, alba + lib.mjs
  montar/               montagem (Python + DuckDB): 10_fontes, 20_candidatos, 30_tse, 40_parlamentar + lib.py
  carregar/             carga no Postgres: 90_carregar_pg.py, 91_pos_carga.sql, 92_fotos_tse.py, 95_validar.py
  ferramentas/          semear_cache.py, conferir_ids.py, exportar_candidatos_ids.py, conferir_emendas_api.mjs
```

## 1. Pré-requisitos

- **Node 20+** (os downloads usam o `fetch` do Node: o CDN do TSE recusa `curl`/`wget`/`urllib`).
- **Python 3.10+** com `duckdb` e `psycopg`:
  ```bash
  python3 -m venv .venv && .venv/bin/pip install -r coleta/requirements.txt
  ```
  (`run_all.sh` usa `.venv/bin/python` se existir; senão `python3`; ou defina `PYTHON=`.)
- **`unzip`** (vem no macOS e na maioria das distribuições Linux).
- **PostgreSQL 16+** com `psql`, `createdb`, `dropdb` e `pg_dump` no `PATH` (no macOS com Postgres.app o script
  acrescenta `/Applications/Postgres.app/Contents/Versions/latest/bin`; outro lugar: `PGBIN=`).
- **Disco:** ~4,5 GB para o cache completo (dá para apagar os zips grandes depois, ver §5). **Rede:** ~3 GB na primeira vez.

### Chave da API do Portal da Transparência (opcional)

A coleta **não precisa** de chave: emendas e sanções vêm dos arquivos de download do Portal. A chave só é usada
na conferência opcional `ferramentas/conferir_emendas_api.mjs`. Ela é pessoal e gratuita
(cadastro em https://portaldatransparencia.gov.br/api-de-dados/cadastrar-email) e é lida **somente** da variável
de ambiente `PORTAL_API_KEY`:

```bash
export PORTAL_API_KEY=...        # no seu shell; nunca grave a chave em arquivo versionado
```

> **Nota sobre o MCP do Portal da Transparência.** Durante o desenvolvimento usamos como referência o
> [`mcp-portal-transparencia`](https://github.com/dutradotdev/mcp-portal-transparencia) para explorar a API do
> Portal da Transparência. Ele não é nosso, o sistema não depende dele e não nos responsabilizamos por qualquer
> uso dele.

## 2. Passo a passo

```bash
coleta/run_all.sh            # baixa o que falta no cache, monta, recria o banco ba2026 e valida
coleta/run_all.sh --dump     # idem e regrava db/ba2026.dump
```

Opções: `--sem-baixar` (só o que já está no cache, sem rede), `--so-baixar` (só a etapa de download),
`--forcar` (rebaixa tudo, ignorando o cache). Cada script também roda sozinho, por exemplo:

```bash
node coleta/baixar/tse.mjs                  # só o TSE
node coleta/baixar/alba.mjs --forcar        # recoleta a ALBA inteira
(cd coleta/montar && python 30_tse.py)      # remonta só os dados do TSE (depois rode a carga)
```

A etapa de carga derruba conexões abertas (`dropdb --force`), recria o banco com `db/schema.sql`, copia as
tabelas, extrai as fotos do TSE para `web/public/fotos/tse/`, cria as views (`db/views.sql`) e roda
`95_validar.py`. Se o site estiver rodando como serviço, reinicie-o depois.

### Ordem, tamanho e tempo aproximado (primeira coleta)

| script | fonte oficial | o que baixa | tamanho | tempo |
|---|---|---|---|---|
| `baixar/tse.mjs` | TSE — Portal de Dados Abertos (`cdn.tse.jus.br/estatistica/sead/odsele/...`) | `consulta_cand` e `bem_candidato` 2006, 2010, 2014, 2018, 2022, 2026 (~5 MB cada); complementar, redes sociais, coligações, vagas e pesquisas 2026 (~8 MB); votação por município e zona 2022 (**560 MB**); perfil do eleitorado 2026 (**390 MB**); prestação de contas 2022 (**~450 MB**) e 2026 (~150 MB); fotos da BA (7 MB). Extrai só os CSVs `_BA` | ~1,6 GB | 3–10 min |
| `baixar/camara.mjs` | Câmara — Dados Abertos (`dadosabertos.camara.leg.br/arquivos`, `/api/v2`) e cota (`camara.leg.br/cotas/Ano-{ano}.csv.zip`) | votações, votos, orientações, proposições votadas, proposições, autores e temas 2019–2026 (CSVs anuais); CEAP 2019–2026; deputados da BA (legislaturas 55–57), detalhe e histórico | ~1,6 GB (CSVs extraídos) | 3–8 min |
| `baixar/senado.mjs` | Senado — CEAPS (`senado.leg.br/transparencia/LAI/verba`) e Dados Abertos (`legis.senado.leg.br/dadosabertos`) | CEAPS 2019–2026; senadores da BA; mandatos, filiações, votações nominais (por semestre) e matérias de autoria dos senadores do `candidatos_ids.json` | ~75 MB | ~1 min |
| `baixar/portal.mjs` | Portal da Transparência — download de dados | emendas parlamentares (arquivo UNICO: emendas, por favorecido, convênios); CEIS e CNEP do dia | 36 MB (zip) / 250 MB extraído | ~1 min |
| `baixar/transferegov.mjs` | Transferegov — API pública de transferências especiais | beneficiários da BA e, inteiras (paginadas), as tabelas de planos de ação, executores, finalidades, metas, relatórios de gestão e empenhos; grava o recorte BA | ~350 MB (≈2.600 páginas) | 10–15 min |
| `baixar/ibge.mjs` | IBGE — API de agregados (tabela 6579) | população estimada 2024 dos 417 municípios | < 1 MB | segundos |
| `baixar/alba.mjs` | ALBA — portal de transparência (`al.ba.gov.br/transparencia/verbas-idenizatorias`) | verba indenizatória 2023–2026 dos deputados com `id_alba` no JSON: lista por deputado×ano + página de detalhe de cada lançamento (fornecedor, CNPJ/CPF, glosa, link do PDF da nota) | ~4 MB de saída (≈16 mil páginas) | 5–12 min |
| `montar/*.py` | — | monta as tabelas no DuckDB de trabalho | ~200 MB | ~1,5 min |
| `carregar/*` | — | Postgres, fotos, views, validação | banco ~150 MB | ~30 s |

Com o cache completo, `run_all.sh` inteiro leva ~1,5 min.

## 3. Onde fica o cache e como ele registra a fonte

Diretório: `$COLETA_CACHE` (padrão `.cache/`, fora do git). Nada fora dele é lido pelos scripts, exceto `base/`.

| caminho | conteúdo |
|---|---|
| `tse/zip/*.zip`, `tse/csv/*_BA.csv` | zips do TSE e os CSVs da BA extraídos (latin-1, `;`, como publicados) |
| `camara/arquivos/*.csv`, `camara/ceap/Ano-*.csv(.zip)`, `camara/deputados_ba.json` | arquivos da Câmara |
| `senado/ceaps/despesa_ceaps_*.csv` (+ `utf8/`, convertido na montagem) | CEAPS (Windows-1252 na origem) |
| `portal/EmendasParlamentares.zip`, `portal/emendas/*.csv`, `portal/sancoes/{ceis,cnep}.zip` e `/{ceis,cnep}/*.csv` | Portal da Transparência |
| `transferegov/*_ba.json` | recorte BA das transferências especiais |
| `ibge/populacao_ba.json` | população 2024 |
| `alba/deputados.csv`, `alba/verba.csv`, `alba/partes/<id>_<ano>.json` | ALBA (as partes permitem retomar uma coleta interrompida) |
| `<grupo>/api/<sha1(url)[:16]>.json` | cada resposta de API: `{fonte, url, consultado_em, dados}` |
| `_fontes/<chave>.json` | data da coleta mais recente de cada fonte (vira `fonte.coletado_em`) |
| `trabalho.duckdb` | DuckDB de trabalho da montagem (único lugar onde o CPF existe, para casar registros) |

Todo arquivo baixado tem ao lado um `<arquivo>.meta.json` com `url`, `consultado_em`, `bytes`, `sha256` e
`last_modified` do servidor. Para atualizar uma fonte, apague o arquivo (e o `.meta.json`) ou rode o script com `--forcar`.

### Reaproveitar downloads que você já tem

Se já existem os arquivos oficiais em outra pasta (mesmos nomes publicados pelas fontes), `ferramentas/semear_cache.py`
cria links simbólicos (ou cópias, `--copiar`) no cache, com o `.meta.json` (data = data do arquivo), e os scripts de
download passam a encontrá-los:

```bash
python coleta/ferramentas/semear_cache.py --de /pasta/downloads [--de outra] [--simular]
```

CSVs já convertidos para UTF-8 são ignorados (os scripts esperam o arquivo como publicado). Nada disso é necessário:
sem semear, `run_all.sh` baixa tudo.

## 4. Dados-base (`base/`)

- **`candidatos_ids.json`** — casamento de identidade já resolvido por candidatura de 2026 (chave = `SQ_CANDIDATO`
  do TSE): `slug` (estável, é a URL da ficha), `id_camara`, `id_senado`, `id_alba`, `cods_autor_emenda` (Portal da
  Transparência e Transferegov), `nome_ceaps` (grafia do senador no arquivo CEAPS) e `casamento` (como cada id foi
  obtido: CPF igual na API da Câmara e no TSE; lista do Senado; nome normalizado no portal da ALBA). Sem CPF.
  Candidatura nova (fora do arquivo) entra com slug calculado e sem ids; para revisar:
  ```bash
  python coleta/ferramentas/conferir_ids.py            # aponta divergências e casamentos que faltam (não altera nada)
  # corrija o JSON à mão, ou corrija no banco e exporte:
  python coleta/ferramentas/exportar_candidatos_ids.py
  ```
- **`votacoes_chave.json`** — ids oficiais (`idVotacao`) das votações da Câmara destacadas no site, com o rótulo curto.
- **`fontes.json`** — catálogo de fontes (nome, URL oficial, descrição, licença). O `id` da tabela `fonte` é a posição
  na lista: acrescente sempre no fim.

## 5. Variáveis de ambiente

| variável | padrão | uso |
|---|---|---|
| `COLETA_CACHE` | `.cache` | diretório do cache |
| `PYTHON` | `.venv/bin/python` ou `python3` | interpretador da montagem/carga |
| `BA2026_DB`, `BA2026_DSN`, `PGHOST`, `PGPORT`, `PGUSER`, `PGBIN` | `ba2026`, socket `/tmp`, 5432, `$USER` | Postgres |
| `PORTAL_API_KEY` | — | só para `conferir_emendas_api.mjs` |
| `TSE_ANOS_ANTERIORES` | `2006,2010,2014,2018,2022` | eleições anteriores usadas na trajetória/patrimônio (mesma lista em `tse.mjs` e `30_tse.py`) |
| `CAMARA_ANOS`, `SENADO_ANOS` | 2019–2026 | anos dos arquivos da Câmara e do CEAPS |
| `ALBA_ANOS`, `ALBA_REFAZER_ANOS`, `ALBA_CONC`, `ALBA_TODOS`, `ALBA_DEPS` | 2023–2026, –, 6, –, – | coleta da ALBA (`ALBA_DEPS=910635` é um teste rápido de um gabinete) |
| `COLETA_APAGAR_ZIPS=1` | – | apaga os zips grandes do TSE depois de extrair (os CSVs `_BA` bastam) |
| `DATA_REFERENCIA` | `2026-09-30` | data em que a idade é calculada |

## 6. Como conferir

1. `95_validar.py` (roda no fim do `run_all.sh`): cargos no escopo, emendas 2024 de Félix Mendonça Júnior
   (R$ 37.872.992,39 empenhado), senador com CEAPS, deputados estaduais com verba da ALBA e link do PDF, tabela
   `fonte` igual ao catálogo, nenhuma coluna de CPF, nenhum CPF de candidato em texto, nº de documento de pessoa
   física mascarado, toda linha com `fonte_id`.
2. `ferramentas/conferir_ids.py` — casamento de identidades contra as listas oficiais.
3. `ferramentas/conferir_emendas_api.mjs` — totais de emendas do arquivo UNICO contra a API do Portal (com `PORTAL_API_KEY`).
4. `CONFERENCIA.md` — valores do site conferidos contra os documentos oficiais.

## 7. Regras que a montagem segue

- Candidaturas de anos diferentes são ligadas **pelo CPF** (TSE), só dentro do DuckDB de trabalho; o CPF nunca vai
  para o Postgres. Em texto livre, qualquer sequência com formato de CPF vira `***CPF***`; nº de documento de
  fornecedor pessoa física com 11 dígitos também. O site não exibe CPF.
- Sanções (CEIS/CNEP) de pessoa física entram quando o CPF do cadastro é o CPF da candidatura.
- Emendas Pix: metas que financiam shows/festas são marcadas por palavras-chave na descrição da meta (regra em `40_parlamentar.py`).
- Troca de partido: filiações do Senado e histórico do deputado na Câmara; mudança de sigla por fusão ou renomeação
  do partido (ex.: PRB → REPUBLICANOS) não conta como troca.
- Não há biografia, processos judiciais nem pontos de atenção: não existe fonte oficial reproduzível por script para
  isso por candidato. As tabelas continuam no esquema, vazias (a API e o site não as leem).
