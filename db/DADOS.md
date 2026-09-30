# ba2026 — contrato de dados (para quem faz a API e o front)

Banco Postgres `ba2026` com as fichas dos candidatos de 2026 na **Bahia** ao **Senado (senador e suplentes),
Deputado Federal e Deputado Estadual**. Site só visual: sem login, sem escrita, sem atualização automática.
Recarga = rodar a coleta de novo. **Todo dado vem de fonte oficial**, baixado e montado por scripts.

- Esquema: `db/schema.sql` (tabelas) + `db/views.sql` (views e a materialized view da lista).
- Coleta e carga: `coleta/run_all.sh` recria tudo do zero (download com cache em `.cache/`, montagem num
  DuckDB de trabalho, carga, fotos, views, validação). Guia completo: `coleta/COLETA.md`.
- Dados-base versionados: `coleta/base/candidatos_ids.json` (identidades), `votacoes_chave.json`, `fontes.json`.
- Dump: `db/ba2026.dump`, gerado por `coleta/run_all.sh --dump` (fora do git; restaurar com
  `pg_restore --no-owner --no-privileges -d ba2026 db/ba2026.dump`).
- API/front: `api/README.md` (porta 3333) e `web/README.md` (porta 5173); versão estática: `estatico/README.md`.
- Conexão local: `psql -h /tmp -d ba2026`. A coleta lê `BA2026_DSN` se definido.
- Data de referência da carga: **30/09/2026** (idade calculada nesta data; `DATA_REFERENCIA`).

## 1. Convenções (leia antes de tudo)

| Regra | Como aparece no banco |
|---|---|
| **Todo dado tem fonte** | Toda tabela de fato tem `fonte_id → fonte(id)` (nome, URL oficial, data de coleta, licença). Quando existe documento específico, há também `fonte_url` / `url_documento` / `url` (nota fiscal da cota, página da emenda no Portal, proposição na Câmara, matéria no Senado, PDF da nota na ALBA, perfil do parlamentar). **Exiba sempre** “Fonte: {fonte.nome}, coletado em {fonte.coletado_em}” + link. |
| **Só fonte oficial** | TSE, Câmara, Senado, Portal da Transparência (CGU), Transferegov, ALBA e IBGE. Não há curadoria de terceiros, pesquisa própria, imprensa nem biografia. |
| **Sem CPF** | Não existe coluna de CPF. Documento de fornecedor/doador/favorecido só aparece quando é **CNPJ** (`*_cnpj`, 14 dígitos). Pessoa física: só o nome + flag `*_pf = true`. Em textos livres, qualquer sequência com formato de CPF foi trocada por `***CPF***` (isso também pega alguns nº de processo de 11 dígitos — é intencional). Nº de documento de fornecedor pessoa física com 11 dígitos (o TSE/ALBA às vezes usa o CPF do prestador como nº do recibo) também vira `***CPF***` (`coleta/carregar/91_pos_carga.sql`). O CPF só existe no DuckDB de trabalho da coleta, para ligar registros. |
| **Ausência ≠ zero** | `NULL` = não há dado. `0` = valor declarado zero (ex.: `patrimonio.valor_total = 0` com `declarou_bens = false` → declarou ao TSE que não tem bens). |
| **Origem** | `trajetoria.origem` ∈ `tse` (candidaturas) / `senado` (mandatos da API do Senado); nas demais tabelas com `origem`, sempre `tse`. |
| **Chave pública** | `candidato.slug` (estável, legível; vem de `base/candidatos_ids.json`). `candidato.id` é interno e pode mudar entre cargas — **use o slug nas URLs**. |
| Valores | `numeric(18,2)` em reais. Datas `date`. Textos em pt-BR, categorias em minúsculas/snake_case. |

## 2. `fonte`

| coluna | significado |
|---|---|
| id, chave | chave estável; `id` = posição em `coleta/base/fontes.json` |
| nome, url | nome exibível e URL oficial (arquivo/API/página; `{ano}` quando há um arquivo por ano) |
| coletado_em | data da coleta (do cache da coleta, `<cache>/_fontes/<chave>.json`) |
| descricao, licenca | o que é e termos de uso |

37 fontes: `tse_cand_2026, tse_bens_2026, tse_cand_compl_2026, tse_rede_social_2026, tse_cand_{2006,2010,2014,2018,2022}, tse_bens_{2006,2010,2014,2018,2022}, tse_votacao_2022, tse_eleitorado_2026, tse_pesquisa_2026, tse_coligacao_2026, tse_vagas_2026, tse_calendario_2026, tse_prestacao_2026, tse_prestacao_2022, tse_fotos_2026, portal_emendas, portal_sancoes, transferegov_pix, camara_ceap, camara_votacoes, camara_proposicoes, camara_deputados, senado_ceaps, senado_votacoes, senado_processos, senado_senadores, alba_verba, alba_deputados, ibge_pop`.

## 3. `candidato` (entidade central)

1.210 linhas: senador 10 · suplente 22 · deputado_federal 535 · deputado_estadual 643
(= todos os registros de candidatura da BA a esses cargos no TSE, inclusive renúncias/indeferidos).

| coluna | significado / origem |
|---|---|
| id, **slug** | slug: de `base/candidatos_ids.json`; candidatura nova recebe o nome de urna normalizado (`jaques-wagner`); colisão → `-dep-federal`, `-dep-estadual`, `-suplente`, depois `-{numero}` |
| nome_urna | nome de urna oficial (TSE) em caixa de título; quando igual ao nome parlamentar da Câmara/Senado, usa a grafia oficial deles (guardada no JSON-base) |
| nome_completo, nome_social | TSE |
| cargo | `senador, suplente, deputado_federal, deputado_estadual` (o CHECK ainda aceita os cargos executivos, sem uso); `cargo_tse` é a grafia do TSE (`1º SUPLENTE`); `ordem_suplencia` 1/2 |
| titular_id | suplente → senador titular (mesmo número; se houver dois titulares com o número, o não renunciante) |
| uf | `BA` |
| partido, partido_nome, numero, federacao, coligacao, composicao_coligacao | TSE 2026 |
| situacao, situacao_data | situação do registro (julgamento) em minúsculas, do arquivo complementar do TSE (`situacao_data` = data de geração do arquivo) |
| genero, cor_raca, data_nascimento, idade, uf_nascimento, municipio_nascimento, naturalidade, ocupacao, grau_instrucao, estado_civil | TSE (minúsculas) |
| foto_url, foto_credito, foto_fonte_url | foto oficial da Câmara/Senado para quem tem id; **demais: foto oficial do TSE** em `/fotos/tse/{sq_candidato_2026}.jpg` (arquivo em `web/public/`) |
| bio, bio_fonte_id, site_campanha, slug_referencia | sem uso nesta edição (NULL) |
| sq_candidato_2026 | chave do TSE (útil para links ao DivulgaCand) |
| id_camara, id_senado, id_alba | ids oficiais (Câmara, Senado, portal da ALBA), de `base/candidatos_ids.json` |
| cods_autor_emenda | códigos de autor no Portal da Transparência / Transferegov (text[]) |
| mandato_atual, mandato_atual_descricao | `deputado_federal` (id na legislatura 57 da Câmara), `senador` (em exercício pela BA na lista do Senado), `deputado_estadual` (id na ALBA) ou NULL |
| municipio_base, cd_municipio_base | município onde o candidato teve mais votos em 2022 (só deputados que concorreram em 2022) |
| origem_dados | text[]: `tse_2026`, `candidatos_ids` |

Tabelas-filho diretas:
- `chapa_membro` (candidato_id = senador titular, papel `suplente_1|suplente_2`, membro_id → ficha do suplente).
- `candidato_rede_social` (plataforma normalizada: instagram, facebook, x, youtube, tiktok, kwai, threads, site...; TSE, deduplicado por URL).
- `candidato_referencia`, `candidatura_snapshot`: **vazias** (mantidas no esquema; o site não as exibe).

## 4. Lista: `candidato_resumo` (MATERIALIZED VIEW)

Uma linha por candidato, com tudo que a lista precisa filtrar/ordenar. Índices em `slug`, `(cargo, partido)`, trigram em `busca`, e `(cargo, X desc)` para as ordenações.

Colunas: identificação (`id, slug, nome_urna, nome_completo, cargo, cargo_tse, uf, partido, numero, federacao, coligacao, situacao, genero, cor_raca, idade, faixa_etaria, ocupacao, grau_instrucao, foto_url, municipio_base, cd_municipio_base, mandato_atual, tem_mandato_atual, titular_id, id_camara, id_senado, id_alba`),
patrimônio (`patrimonio_2026, patrimonio_2022, patrimonio_2018, declarou_sem_bens_2026, patrimonio_ano_anterior, patrimonio_anterior, variacao_patrimonio_pct, faixa_patrimonio` ∈ `sem_informacao|zero|ate_100mil|100mil_1mi|1mi_5mi|acima_5mi`),
campanha 2026 (`arrecadado_2026, fundo_eleitoral_2026, fundo_partidario_2026, pessoas_fisicas_2026, recursos_proprios_2026, despesas_contratadas_2026, despesas_pagas_2026, n_doadores_2026, n_fornecedores_2026`),
emendas (`n_emendas, emendas_empenhado, emendas_pago` = pago no exercício, `emendas_pago_total` = pago + restos a pagar pagos, `emendas_empenhado_2023_2026, emendas_ano_min/max, n_planos_pix, pix_valor`),
cota (`cota_total` = todas as casas e anos disponíveis, `cota_total_2023_2026, cota_casas, cota_ano_min/max`),
atuação (`n_votos, n_votacoes_chave, pct_alinhamento_governo, n_votos_com_orientacao_governo, n_proposicoes, n_proposicoes_principais`),
riscos (`n_processos, n_processos_criminais, n_sancoes, n_pontos_atencao, n_pontos_pesquisa` — só `n_sancoes` pode ser > 0 nesta edição),
flags (`tem_ficha_referencia` (sempre false), `tem_patrimonio, tem_campanha_2026, tem_emendas, tem_cota, tem_votos, tem_proposicoes, tem_gestao` (sempre false)),
`busca` (texto normalizado sem acento: nome de urna + nome completo + nome social + partido).

Depois de qualquer recarga: `REFRESH MATERIALIZED VIEW candidato_resumo;` (o `run_all.sh` recria).

### Exemplo: lista com filtros (parâmetros nomeados; NULL = sem filtro)

```sql
SELECT id, slug, nome_urna, cargo, partido, numero, situacao, foto_url, municipio_base,
       patrimonio_2026, emendas_empenhado, cota_total, arrecadado_2026, tem_mandato_atual,
       count(*) OVER () AS total
FROM candidato_resumo
WHERE cargo = ANY(:cargos)                                   -- ex.: '{deputado_federal,deputado_estadual,senador}' (tela "Parlamentar")
  AND (:q IS NULL OR busca LIKE '%' || f_normaliza(:q) || '%' OR busca % f_normaliza(:q))   -- busca sem acento + aproximada
  AND (:partido IS NULL OR partido = :partido)
  AND (:situacao IS NULL OR situacao = :situacao)
  AND (:mandato IS NULL OR tem_mandato_atual = :mandato)
  AND (:faixa IS NULL OR faixa_patrimonio = :faixa)
  AND (:genero IS NULL OR genero = :genero)
  AND (:cor IS NULL OR cor_raca = :cor)
  AND (:municipio IS NULL OR cd_municipio_base = :municipio)
ORDER BY
  CASE :ordem WHEN 'patrimonio' THEN patrimonio_2026 WHEN 'emendas' THEN emendas_empenhado
              WHEN 'cota' THEN cota_total WHEN 'arrecadacao' THEN arrecadado_2026 END DESC NULLS LAST,
  nome_urna
LIMIT :limite OFFSET :offset;
```
Telas: **Senado** → `'{senador}'` (suplentes na chapa); **Deputado federal** / **Deputado estadual** → o cargo. Por padrão, sugerimos esconder `situacao IN ('renúncia','indeferido')` com um toggle.

## 5. Ficha por slug

```sql
-- cabeçalho
SELECT k.*, r.* FROM candidato k JOIN candidato_resumo r USING (id) WHERE k.slug = :slug;
-- chapa / redes
SELECT c.*, m.slug AS membro_slug FROM chapa_membro c LEFT JOIN candidato m ON m.id = c.membro_id WHERE c.candidato_id = :id ORDER BY papel;
SELECT plataforma, url FROM candidato_rede_social WHERE candidato_id = :id;
-- trajetória
SELECT * FROM trajetoria WHERE candidato_id = :id ORDER BY ano_inicio NULLS LAST;
SELECT * FROM mudanca_partido WHERE candidato_id = :id ORDER BY data_mudanca;
-- patrimônio
SELECT * FROM v_patrimonio_evolucao WHERE candidato_id = :id ORDER BY ano_eleicao;
SELECT tipo, descricao, valor FROM bem WHERE candidato_id = :id AND ano_eleicao = 2026 ORDER BY valor DESC;
-- campanha
SELECT * FROM campanha_resumo WHERE candidato_id = :id ORDER BY ano_eleicao DESC;
SELECT doador_nome, doador_cnpj, doador_pf, doador_tipo, n_doacoes, valor FROM campanha_doador WHERE candidato_id = :id AND ano_eleicao = 2026 ORDER BY valor DESC LIMIT 20;
SELECT fornecedor_nome, fornecedor_cnpj, categoria_principal, n_despesas, valor FROM campanha_fornecedor WHERE candidato_id = :id AND ano_eleicao = 2026 ORDER BY valor DESC LIMIT 20;
SELECT categoria, n_despesas, valor FROM campanha_despesa_categoria WHERE candidato_id = :id AND ano_eleicao = 2026 ORDER BY valor DESC;
-- sanções (CEIS/CNEP)
SELECT * FROM sancao WHERE candidato_id = :id;
-- votações (filtro por ano/tema; chave em destaque)
SELECT * FROM v_voto_detalhe WHERE candidato_id = :id AND (:ano IS NULL OR ano = :ano) AND (:tema IS NULL OR tema = :tema)
ORDER BY eh_chave DESC, data DESC LIMIT 50 OFFSET :offset;
-- proposições
SELECT * FROM proposicao WHERE candidato_id = :id AND (:so_principais IS NOT TRUE OR tipo_principal) ORDER BY data_apresentacao DESC NULLS LAST;
-- emendas
SELECT * FROM v_emenda_por_ano WHERE candidato_id = :id ORDER BY ano;
SELECT * FROM v_emenda_por_area WHERE candidato_id = :id ORDER BY empenhado DESC;
SELECT * FROM v_emenda_municipio_destino WHERE candidato_id = :id ORDER BY valor_recebido DESC LIMIT 20;   -- destino REAL (sem BB/Caixa)
SELECT * FROM emenda_convenio WHERE candidato_id = :id ORDER BY valor DESC;
SELECT * FROM emenda_pix WHERE candidato_id = :id AND valido ORDER BY ano DESC, valor_plano DESC;
SELECT * FROM emenda_pix_show WHERE candidato_id = :id ORDER BY valor DESC;
-- cota parlamentar
SELECT * FROM v_cota_por_categoria WHERE candidato_id = :id ORDER BY total DESC;
SELECT * FROM v_cota_fornecedor WHERE candidato_id = :id ORDER BY total DESC LIMIT 15;
SELECT data_documento, fornecedor, fornecedor_cnpj, valor_liquido, url_documento FROM cota_despesa
  WHERE candidato_id = :id AND categoria_grupo IN ('alimentacao','hospedagem','combustivel') ORDER BY valor_liquido DESC LIMIT 10;
-- fonte de qualquer linha
SELECT nome, url, coletado_em, licenca FROM fonte WHERE id = :fonte_id;   -- cachear a tabela inteira (37 linhas) na API
```

## 6. Tabelas por tema

### Trajetória
- `trajetoria` — `origem='tse'`: candidaturas **na BA** em 2006, 2010, 2014, 2018 e 2022 do mesmo candidato (ligadas pelo CPF dentro da montagem; quando a pessoa tem dois registros no mesmo ano — ex.: candidaturas refeitas do PROS em 2022 — fica um só, o que tem resultado): cargo, partido, número, `resultado` (ELEITO POR QP, SUPLENTE, NÃO ELEITO...), `eleito`, `votos` (total nominal do 1º turno, só 2022). `origem='senado'`: mandatos de senador (API do Senado), com link do perfil. 1.010 linhas, 517 candidatos.
- `mudanca_partido` — trocas de partido registradas nas filiações do Senado e no histórico do deputado na API da Câmara (mudança de sigla por fusão/renomeação do partido não conta). 26 linhas, 17 candidatos.
- `votos_municipio_2022` — votos por município e turno em 2022 (402 candidatos que concorreram em 2022). Base de `municipio_base`.

### Patrimônio
- `patrimonio` (candidato, ano) — `valor_total`, `qtd_bens`, `declarou_bens`, `origem='tse'`, `cargo_na_eleicao`. 2026 (todos) e declarações anteriores na BA: 2022 (304), 2018 (166), 2014 (127), 2010 (93), 2006 (86).
- `bem` — bem a bem (tipo, descrição, valor).
- `v_patrimonio_evolucao` — com variação absoluta/% em relação à declaração anterior e nome/URL da fonte.

### Campanha (prestação de contas)
- `campanha_resumo` (candidato, ano): receitas por origem (`fundo_eleitoral` = FEFC, `fundo_partidario`, `pessoas_fisicas`, `recursos_proprios`, `outros_candidatos_partidos`, `outras_receitas`), `despesas_contratadas`, `despesas_pagas`, contagens, `tipo_prestacao` e `dt_prestacao`. **2026 é prestação PARCIAL** durante a campanha. 2022: prestação final (BA).
- `campanha_receita` (linha a linha), `campanha_doador` (agregado por doador; PF sem documento), `campanha_despesa` (despesas contratadas linha a linha; exclui a linha‑sentinela de “declarou zero”), `campanha_fornecedor` (agregado), `campanha_despesa_categoria`.
- Contratado ≠ pago: não some as duas medidas. Pagas só existem agregadas (em `campanha_resumo`).

### Sanções, processos, pontos de atenção
- `sancao` — CEIS e CNEP (Portal da Transparência) de **pessoa física** cujo CPF é o da candidatura (casado na montagem). Nesta carga: 0 linhas (nenhum candidato consta). `fonte_url` aponta para a sanção no Portal; `dados` jsonb com processo, fundamentação, publicação.
- `processo`, `ponto_atencao`: **vazias** — não há coleta oficial reproduzível por script de processos por candidato, e o site não publica análises próprias.

### Atuação parlamentar
- `votacao` — `id` = `camara:<idVotacao>` | `senado:<codigoSessaoVotacao>`; data, descrição, proposição votada (`proposicao`, `proposicao_ementa`, `tema` da Câmara), resultado, placar, `orientacao_governo` (Câmara, bancada Governo), `eh_chave` + `rotulo_chave` (14 votações‑chave da Câmara 2019–2026 listadas em `coleta/base/votacoes_chave.json`), `url` (ficha da proposição/matéria) e `url_api`.
- `voto` — voto do candidato (`Sim, Não, Abstenção, Obstrução, Artigo 17, (vazio)`; Senado usa códigos `P-NRV, AP, LS, MIS, NCom, Votou`...), `partido_na_epoca`, `alinhado_governo` (true/false quando o governo orientou Sim/Não e o deputado votou Sim/Não). `contradicao` sem uso.
- `v_voto_detalhe` — voto + votação, com `ano`.
- `proposicao` — Câmara: autoria principal (1º signatário) 2019–2026, todos os tipos (`tipo_principal` marca PL, PLP, PEC, PDL...); Senado: matérias do parlamentar. `url` = ficha de tramitação, `url_inteiro_teor`.
- `emenda` — Portal da Transparência (arquivo UNICO), uma linha por emenda × localidade/ação: `empenhado, liquidado, pago` (exercício), `restos_pagar_pagos`, `pago_total`, função/subfunção/programa/ação, localidade, `fonte_url` = página da emenda no Portal. Conferido: Félix Mendonça Júnior 2024 = R$ 37.872.992,39 empenhado / R$ 36.850.528,99 pago (igual à API do Portal).
- `emenda_favorecido` — para quem o dinheiro foi (agregado por emenda × favorecido). **`intermediario = true` para Banco do Brasil (emendas Pix) e Caixa (contratos de repasse): não são o destino real** — use `v_emenda_municipio_destino` e `emenda_pix`/`emenda_convenio` para o destino. `privado` = entidade não governamental.
- `emenda_convenio` — convênios/contratos de repasse com **objeto**, convenente, data e valor.
- `emenda_pix` — transferências especiais (Transferegov): plano de ação por beneficiário da BA, objeto, executores, metas, empenho, relatório de gestão (`tem_relatorio_gestao`), `tem_show_evento`. `emenda_pix_show` — metas de planos válidos cuja descrição indica show/festa (regra de palavras‑chave em `coleta/montar/40_parlamentar.py`: show, artístico, banda, festejos, festa, festival, São João, São Pedro, carnaval, micareta, atrações).
- `cota_despesa` — nota a nota: Câmara (CEAP 2019–2026, **`url_documento` = link da nota fiscal**), Senado (CEAPS 2019–2026, sem link; tem `detalhamento`), ALBA (verba indenizatória 2023–2026, `url_documento` = PDF no portal da ALBA, `processo`). `categoria_grupo` normalizada: `alimentacao, hospedagem, combustivel, locomocao_hospedagem_alimentacao_combustivel` (Senado junta tudo), `passagem, locacao_veiculo, divulgacao, consultoria, telefonia_postal, seguranca, taxi_pedagio_estacionamento, escritorio, eventos_cursos, outros`. Soma: `valor_liquido`.
- `v_cota_por_categoria`, `v_cota_fornecedor`.

### Sem uso nesta edição (tabelas vazias, mantidas só no esquema; a API e o site não as leem, exceto `candidatura_snapshot`)
`candidato_referencia`, `candidatura_snapshot`, `processo`, `ponto_atencao`, `gestao_gasto`, `ato_executivo`, `gasto_cartao_executivo`, `cota_resumo_referencia`, `relatorio_pesquisa`.

### Contexto (não é por candidato)
`municipio` (417; código TSE e IBGE, eleitores 2026, população IBGE 2024), `vaga` (senador, suplentes, deputados), `coligacao` (senado e deputados), `pesquisa_eleitoral` (registro no TSE: contratante, custo, metodologia — sem resultados), `calendario_eleitoral` (marcos digitados da Resolução do TSE).

### Auditoria
`etl_casamento` — como cada id oficial foi ligado à candidatura (`origem` camara/senado/alba, `metodo` `id_oficial_cpf` / `nome_normalizado`, `confianca`, `observacao`), a partir de `base/candidatos_ids.json`; candidaturas fora do JSON aparecem com `origem='candidatos_ids', metodo='sem_match'`. Não exibir no site.

## 7. Cobertura (candidatos com a seção, por cargo)

| cargo | total | patrimônio 2026 | campanha 2026 | emendas | cota | votos | proposições | mandato atual | foto | município‑base |
|---|---|---|---|---|---|---|---|---|---|---|
| senador | 10 | 10 | 10 | 4 | 3 | 3 | 3 | 2 | 10 | – |
| suplente | 22 | 22 | 0* | 1 | 1 | 1 | 1 | 0 | 22 | – |
| deputado_federal | 535 | 535 | 513 | 42 | 48 | 42 | 42 | 44 | 535 | 188 |
| deputado_estadual | 643 | 643 | 618 | 1 | 56 | 1 | 1 | 55 | 643 | 207 |

\* suplentes não prestam contas separadas: a campanha é a do titular.
“patrimônio 2026” existe para todos (quem não tem bens declarou `N` ao TSE → `valor_total = 0`, `declarou_bens = false`).
Cota: 46 com CEAP (Câmara), 2 com CEAPS (Senado: Jaques Wagner, Angelo Coronel), 60 com verba ALBA.

## 8. Lacunas conhecidas

1. **Situação da candidatura** é a do arquivo complementar do TSE do dia da coleta (o `consulta_cand` publica `#NE` na situação durante a campanha).
2. **Prestação de contas 2026 é parcial** durante a campanha. Pagamentos só agregados. Campanhas anteriores a 2022 não estão (o arquivo de prestação de 2018 tem ~300 MB e não foi incluído).
3. **Trajetória e patrimônio anteriores**: só eleições gerais na BA (2006–2022). Eleições municipais e candidaturas em outras UFs não estão.
4. **Votações e proposições**: Câmara 2019–2026 e Senado (Wagner, Coronel) — mandatos anteriores a 2019 não estão; a ALBA não tem votações/proposições em dados abertos estruturados. Orientação do governo só na Câmara. Proposições da Câmara: só 1º signatário.
5. **Deputados estaduais**: além da verba indenizatória, não há atuação legislativa estadual. Casamento ALBA↔TSE é por nome (60 casados; 15 com confiança média — ver `candidatos_ids.json`).
6. **Emendas** só para quem tem código de autor (deputados/senadores e ex‑deputados com código conhecido). Emendas de bancada/comissão não são atribuídas a candidatos. `coleta/ferramentas/conferir_ids.py` aponta autores com o mesmo nome de candidaturas sem código, para revisão.
7. **Biografia, processos, pontos de atenção**: não publicados (sem fonte oficial reproduzível por candidato).
8. **Máscara de CPF em texto livre** também esconde alguns números de documento/processo de 11 dígitos.
9. `idade` é calculada em 30/09/2026; recalcule na API se a carga envelhecer.
