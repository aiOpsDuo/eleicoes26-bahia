-- =====================================================================
-- ba2026 — camada de dados do site de fichas de candidatos 2026 (foco Bahia)
-- PostgreSQL 16+. Recriado do zero por coleta/run_all.sh (só fontes oficiais; ver coleta/COLETA.md).
--
-- Regras:
--   * TODO dado exibível tem FONTE: `fonte_id` (-> fonte) e, quando existe um
--     documento específico (nota fiscal, votação, emenda, DOE, processo),
--     `fonte_url` com o link direto desse documento.
--   * NENHUMA coluna de CPF (nem de candidato, nem de doador/fornecedor PF).
--     Documento de fornecedor/doador/favorecido só aparece quando é CNPJ
--     (14 dígitos); pessoa física fica só com o nome e `*_pf = true`.
--   * Ausência de dado é NULL, nunca zero.
--   * Contrato para API/front em db/DADOS.md.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- unaccent() não é IMMUTABLE; este wrapper permite índice funcional.
CREATE OR REPLACE FUNCTION f_normaliza(t text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
$$ SELECT lower(public.unaccent('public.unaccent'::regdictionary, t)) $$;

-- ---------------------------------------------------------------------
-- Proveniência
-- ---------------------------------------------------------------------
CREATE TABLE fonte (
  id           integer PRIMARY KEY,
  chave        text    NOT NULL UNIQUE,     -- identificador estável (ex.: 'tse_cand_2026')
  nome         text    NOT NULL,            -- nome exibível da fonte oficial
  url          text    NOT NULL,            -- página/arquivo/endpoint oficial
  coletado_em  date,                        -- data da coleta pelo projeto
  descricao    text,
  licenca      text
);

-- ---------------------------------------------------------------------
-- Candidato (entidade central)
-- ---------------------------------------------------------------------
CREATE TABLE candidato (
  id                     integer PRIMARY KEY,
  slug                   text    NOT NULL UNIQUE,
  nome_urna              text    NOT NULL,
  nome_completo          text,
  nome_social            text,
  cargo                  text    NOT NULL CHECK (cargo IN ('presidente','governador','vice_governador','senador','suplente','deputado_federal','deputado_estadual')),
  cargo_tse              text,               -- como o TSE escreve (ex.: '1º SUPLENTE')
  ordem_suplencia        smallint,           -- 1 ou 2 (só suplentes)
  titular_id             integer REFERENCES candidato(id), -- vice/suplente -> titular da chapa
  uf                     char(2),            -- NULL para presidente
  partido                text,
  partido_nome           text,
  numero                 text,
  federacao              text,
  coligacao              text,
  composicao_coligacao   text,
  situacao               text,               -- situação do registro (julgamento), normalizada em minúsculas
  situacao_data          date,               -- data do dado de situação
  genero                 text,
  cor_raca               text,
  data_nascimento        date,
  idade                  smallint,           -- na data de referência da carga (ver DADOS.md)
  uf_nascimento          char(2),
  municipio_nascimento   text,
  naturalidade           text,
  ocupacao               text,
  grau_instrucao         text,
  estado_civil           text,
  foto_url               text,
  foto_credito           text,               -- texto pronto (autor, licença)
  foto_fonte_url         text,
  bio                    text,               -- (sem uso: não há biografia de fonte oficial; sempre NULL)
  bio_fonte_id           integer REFERENCES fonte(id),
  site_campanha          text,
  sq_candidato_2026      text UNIQUE,        -- chave do TSE no pleito de 2026
  id_camara              integer,            -- id na API da Câmara
  id_senado              integer,            -- CodigoParlamentar do Senado
  id_alba                integer,            -- id no portal de transparência da ALBA
  cods_autor_emenda      text[],             -- códigos de autor no Portal da Transparência
  mandato_atual          text,               -- 'deputado_federal','senador','deputado_estadual','governador','presidente' ou NULL
  mandato_atual_descricao text,
  municipio_base         text,               -- município com mais votos do candidato em 2022 (quando houve)
  cd_municipio_base      integer,
  slug_referencia        text,               -- (sem uso nesta edição; sempre NULL)
  origem_dados           text[] NOT NULL DEFAULT '{}',  -- 'tse_2026', 'candidatos_ids' (ids de base/candidatos_ids.json)
  fonte_id               integer REFERENCES fonte(id),   -- fonte da identificação (TSE)
  atualizado_em          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_cand_cargo     ON candidato (cargo, partido);
CREATE INDEX ix_cand_titular   ON candidato (titular_id);
CREATE INDEX ix_cand_nome_trgm ON candidato USING gin (f_normaliza(nome_urna || ' ' || coalesce(nome_completo,'')) gin_trgm_ops);
CREATE INDEX ix_cand_camara    ON candidato (id_camara);
CREATE INDEX ix_cand_senado    ON candidato (id_senado);
CREATE INDEX ix_cand_alba      ON candidato (id_alba);

-- Chapa: vice (governador/presidente) e suplentes (senador). O membro pode ou
-- não ter ficha própria (membro_id). Para presidente, o vice só existe aqui.
CREATE TABLE chapa_membro (
  id              serial  PRIMARY KEY,
  candidato_id    integer NOT NULL REFERENCES candidato(id) ON DELETE CASCADE,  -- titular
  papel           text    NOT NULL CHECK (papel IN ('vice','suplente_1','suplente_2')),
  membro_id       integer REFERENCES candidato(id),
  nome_urna       text,
  nome_completo   text,
  partido         text,
  sq_candidato    text,
  fonte_id        integer REFERENCES fonte(id),
  UNIQUE (candidato_id, papel)
);

CREATE TABLE candidato_rede_social (
  id            serial  PRIMARY KEY,
  candidato_id  integer NOT NULL REFERENCES candidato(id) ON DELETE CASCADE,
  plataforma    text,
  url           text    NOT NULL,
  fonte_id      integer REFERENCES fonte(id),
  UNIQUE (candidato_id, url)
);

-- (Sem uso nesta edição: tabela mantida vazia para não quebrar a API.)
CREATE TABLE candidato_referencia (
  candidato_id        integer PRIMARY KEY REFERENCES candidato(id) ON DELETE CASCADE,
  slug_referencia     text    NOT NULL,
  url_api             text    NOT NULL,
  consultado_em       timestamptz,
  ultima_atualizacao  timestamptz,
  fontes_declaradas   jsonb,     -- fonte_dados da ficha
  frescor_secoes      jsonb,     -- section_freshness
  verificacoes        jsonb,     -- *_verificacao (sancoes, processos, filiacao, tcu, trajetoria, patrimonio, votacoes)
  doadores_recorrentes jsonb,    -- doadores que também financiaram outras candidaturas (sem CPF)
  indicadores_estaduais jsonb
);

-- Snapshot de status da candidatura (histórico). Vazia: não há fonte oficial reproduzível de datas passadas.
CREATE TABLE candidatura_snapshot (
  id            serial  PRIMARY KEY,
  candidato_id  integer NOT NULL REFERENCES candidato(id) ON DELETE CASCADE,
  dt_snapshot   date    NOT NULL,
  partido       text,
  coligacao     text,
  situacao      text,
  declarou_bens boolean,
  bens_total    numeric(18,2),
  fonte_id      integer REFERENCES fonte(id)
);

-- ---------------------------------------------------------------------
-- Trajetória
-- ---------------------------------------------------------------------
-- Candidaturas anteriores do mesmo candidato na BA (TSE 2006–2022, casadas por CPF
-- dentro da montagem) + mandatos de senador (API do Senado).
CREATE TABLE trajetoria (
  id              serial  PRIMARY KEY,
  candidato_id    integer NOT NULL REFERENCES candidato(id) ON DELETE CASCADE,
  origem          text    NOT NULL CHECK (origem IN ('tse','senado','camara')),
  tipo_evento     text,             -- 'candidatura','mandato','cargo_executivo', ...
  ano_inicio      smallint,
  ano_fim         smallint,
  cargo           text,
  partido         text,
  uf              text,
  numero          text,
  resultado       text,             -- ex.: 'ELEITO POR QP', 'SUPLENTE', 'NÃO ELEITO'
  eleito          boolean,
  votos           bigint,           -- total de votos nominais (TSE 2022, 1º turno)
  observacoes     text,
  fonte_id        integer REFERENCES fonte(id),
  fonte_url       text
);
CREATE INDEX ix_traj_cand ON trajetoria (candidato_id, ano_inicio);

CREATE TABLE mudanca_partido (
  id                serial  PRIMARY KEY,
  candidato_id      integer NOT NULL REFERENCES candidato(id) ON DELETE CASCADE,
  partido_anterior  text,
  partido_novo      text,
  data_mudanca      date,
  ano               smallint,
  contexto          text,
  fonte_id          integer REFERENCES fonte(id),
  fonte_url         text
);
CREATE INDEX ix_mudpart_cand ON mudanca_partido (candidato_id);

-- Votos de 2022 por município (candidatos que também concorreram em 2022).
CREATE TABLE votos_municipio_2022 (
  candidato_id   integer NOT NULL REFERENCES candidato(id) ON DELETE CASCADE,
  cd_municipio   integer NOT NULL,        -- código TSE do município
  municipio      text,
  turno          smallint NOT NULL,
  cargo          text,
  votos          bigint  NOT NULL,
  fonte_id       integer REFERENCES fonte(id),
  PRIMARY KEY (candidato_id, cd_municipio, turno)
);

-- ---------------------------------------------------------------------
-- Patrimônio
-- ---------------------------------------------------------------------
-- Uma linha por candidato x eleição (TSE: 2026 e candidaturas anteriores na BA, ligadas pelo CPF).
CREATE TABLE patrimonio (
  candidato_id   integer  NOT NULL REFERENCES candidato(id) ON DELETE CASCADE,
  ano_eleicao    smallint NOT NULL,
  valor_total    numeric(18,2),           -- NULL = sem dado; 0 = declarou zero
  qtd_bens       integer,
  declarou_bens  boolean,                 -- TSE st_declarar_bens (2026)
  origem         text     NOT NULL,       -- 'tse'
  cargo_na_eleicao text,
  fonte_id       integer REFERENCES fonte(id),
  PRIMARY KEY (candidato_id, ano_eleicao)
);

CREATE TABLE bem (
  id             serial   PRIMARY KEY,
  candidato_id   integer  NOT NULL REFERENCES candidato(id) ON DELETE CASCADE,
  ano_eleicao    smallint NOT NULL,
  ordem          smallint,
  tipo           text,
  descricao      text,
  valor          numeric(18,2),
  fonte_id       integer REFERENCES fonte(id)
);
CREATE INDEX ix_bem_cand ON bem (candidato_id, ano_eleicao);

-- ---------------------------------------------------------------------
-- Financiamento de campanha (TSE, prestação de contas 2022 e 2026)
-- ---------------------------------------------------------------------
CREATE TABLE campanha_resumo (
  candidato_id            integer  NOT NULL REFERENCES candidato(id) ON DELETE CASCADE,
  ano_eleicao             smallint NOT NULL,
  cargo_na_eleicao        text,
  tipo_prestacao          text,           -- 'PARCIAL'/'FINAL'/'Relatório Financeiro' (TSE) ou NULL
  dt_prestacao            date,
  total_receitas          numeric(18,2),
  fundo_eleitoral         numeric(18,2),  -- FEFC
  fundo_partidario        numeric(18,2),
  pessoas_fisicas         numeric(18,2),
  recursos_proprios       numeric(18,2),
  outros_candidatos_partidos numeric(18,2), -- recursos de partido/candidato fora dos fundos
  outras_receitas         numeric(18,2),
  despesas_contratadas    numeric(18,2),
  despesas_pagas          numeric(18,2),
  n_receitas              integer,
  n_doadores              integer,
  n_despesas              integer,
  n_fornecedores          integer,
  origem                  text     NOT NULL,  -- 'tse'
  fonte_id                integer REFERENCES fonte(id),
  PRIMARY KEY (candidato_id, ano_eleicao)
);

-- Receitas linha a linha (TSE). Doador PF: só nome (sem CPF).
CREATE TABLE campanha_receita (
  id               serial   PRIMARY KEY,
  candidato_id     integer  NOT NULL REFERENCES candidato(id) ON DELETE CASCADE,
  ano_eleicao      smallint NOT NULL,
  dt_receita       date,
  doador_nome      text,
  doador_cnpj      text,                  -- só quando o doador é PJ/partido (14 dígitos)
  doador_pf        boolean,
  doador_tipo      text,                  -- categoria derivada: fundo_eleitoral, fundo_partidario, pessoa_fisica, recursos_proprios, partido_candidato, outros
  fonte_recurso    text,                  -- DS_FONTE_RECEITA
  origem_receita   text,                  -- DS_ORIGEM_RECEITA
  especie          text,
  natureza         text,                  -- Financeiro / Estimável
  descricao        text,
  valor            numeric(18,2),
  fonte_id         integer REFERENCES fonte(id)
);
CREATE INDEX ix_rec_cand ON campanha_receita (candidato_id, ano_eleicao, valor DESC);

-- Doadores agregados (TSE).
CREATE TABLE campanha_doador (
  id              serial   PRIMARY KEY,
  candidato_id    integer  NOT NULL REFERENCES candidato(id) ON DELETE CASCADE,
  ano_eleicao     smallint NOT NULL,
  doador_nome     text     NOT NULL,
  doador_cnpj     text,
  doador_pf       boolean,
  doador_tipo     text,
  n_doacoes       integer,
  valor           numeric(18,2),
  origem          text     NOT NULL,
  fonte_id        integer REFERENCES fonte(id)
);
CREATE INDEX ix_doador_cand ON campanha_doador (candidato_id, ano_eleicao, valor DESC);

-- Despesas contratadas linha a linha (TSE). Fornecedor PF: só nome.
CREATE TABLE campanha_despesa (
  id                 serial   PRIMARY KEY,
  candidato_id       integer  NOT NULL REFERENCES candidato(id) ON DELETE CASCADE,
  ano_eleicao        smallint NOT NULL,
  dt_despesa         date,
  fornecedor_nome    text,
  fornecedor_cnpj    text,
  fornecedor_pf      boolean,
  fornecedor_tipo    text,
  fornecedor_cnae    text,
  fornecedor_municipio text,
  fornecedor_uf      text,
  categoria          text,                -- DS_ORIGEM_DESPESA (categoria oficial do TSE)
  descricao          text,
  tipo_documento     text,
  numero_documento   text,
  valor              numeric(18,2),
  fonte_id           integer REFERENCES fonte(id)
);
CREATE INDEX ix_desp_cand ON campanha_despesa (candidato_id, ano_eleicao, categoria);

-- Fornecedores agregados (TSE).
CREATE TABLE campanha_fornecedor (
  id               serial   PRIMARY KEY,
  candidato_id     integer  NOT NULL REFERENCES candidato(id) ON DELETE CASCADE,
  ano_eleicao      smallint NOT NULL,
  fornecedor_nome  text     NOT NULL,
  fornecedor_cnpj  text,
  fornecedor_pf    boolean,
  categoria_principal text,
  n_despesas       integer,
  valor            numeric(18,2),
  fonte_id         integer REFERENCES fonte(id)
);
CREATE INDEX ix_forn_cand ON campanha_fornecedor (candidato_id, ano_eleicao, valor DESC);

-- Despesas por categoria (TSE agregado).
CREATE TABLE campanha_despesa_categoria (
  candidato_id   integer  NOT NULL REFERENCES candidato(id) ON DELETE CASCADE,
  ano_eleicao    smallint NOT NULL,
  categoria      text     NOT NULL,
  n_despesas     integer,
  valor          numeric(18,2),
  origem         text     NOT NULL,
  fonte_id       integer REFERENCES fonte(id),
  PRIMARY KEY (candidato_id, ano_eleicao, categoria)
);

-- ---------------------------------------------------------------------
-- Processos, sanções, pontos de atenção
-- ---------------------------------------------------------------------
-- processo: vazia nesta edição (não há coleta oficial reproduzível por script de processos por candidato).
CREATE TABLE processo (
  id               serial  PRIMARY KEY,
  candidato_id     integer NOT NULL REFERENCES candidato(id) ON DELETE CASCADE,
  tipo             text,              -- criminal, civil, eleitoral, improbidade...
  tribunal         text,
  numero_processo  text,
  descricao        text,
  status           text,
  data_inicio      date,
  data_decisao     date,
  gravidade        text,
  fonte_nivel      text,              -- 'oficial' | 'imprensa' | ...
  fonte_nome       text,
  fonte_url        text,
  fonte_id         integer REFERENCES fonte(id)
);
CREATE INDEX ix_proc_cand ON processo (candidato_id);

CREATE TABLE sancao (
  id             serial  PRIMARY KEY,
  candidato_id   integer NOT NULL REFERENCES candidato(id) ON DELETE CASCADE,
  cadastro       text,               -- CEIS, CNEP (Portal da Transparência; pessoa física casada pelo CPF na montagem)
  descricao      text,
  orgao          text,
  data_inicio    date,
  data_fim       date,
  dados          jsonb,
  fonte_url      text,
  fonte_id       integer REFERENCES fonte(id)
);

-- Pontos de atenção: vazia nesta edição (o site só publica dado de fonte oficial).
CREATE TABLE ponto_atencao (
  id               serial  PRIMARY KEY,
  candidato_id     integer NOT NULL REFERENCES candidato(id) ON DELETE CASCADE,
  origem           text    NOT NULL CHECK (origem IN ('referencia','pesquisa')),
  categoria        text,             -- alerta, feito_positivo, cruzamento, polemica, emenda_empresa_sancionada...
  titulo           text    NOT NULL,
  descricao        text,
  natureza         text,             -- FATO / INFERÊNCIA / ALEGAÇÃO (quando a pesquisa classificou)
  gravidade        text,
  data_referencia  date,
  valor            numeric(18,2),
  fontes           jsonb,            -- [{titulo, url, data}]
  fonte_url        text,             -- principal
  fonte_id         integer REFERENCES fonte(id)
);
CREATE INDEX ix_ponto_cand ON ponto_atencao (candidato_id);

-- ---------------------------------------------------------------------
-- Atuação parlamentar
-- ---------------------------------------------------------------------
CREATE TABLE votacao (
  id                 text    PRIMARY KEY,   -- 'camara:<id>' | 'senado:<codigoSessaoVotacao>-<codigoMateria>' | 'ref:<id>'
  casa               text    NOT NULL,      -- 'camara' | 'senado'
  data               date,
  orgao              text,
  descricao          text,
  proposicao         text,                  -- ex.: 'PL 2630/2020'
  proposicao_ementa  text,
  tema               text,
  aprovada           boolean,
  resultado          text,
  votos_sim          integer,
  votos_nao          integer,
  votos_outros       integer,
  orientacao_governo text,                  -- 'Sim'/'Não'/'Liberado'/'Obstrução' (Câmara)
  eh_chave           boolean NOT NULL DEFAULT false,
  rotulo_chave       text,                  -- nome curto da votação-chave
  url                text,                  -- página oficial (proposição/matéria)
  url_api            text,
  fonte_id           integer REFERENCES fonte(id)
);
CREATE INDEX ix_votacao_data ON votacao (casa, data);
CREATE INDEX ix_votacao_chave ON votacao (eh_chave) WHERE eh_chave;

CREATE TABLE voto (
  candidato_id       integer NOT NULL REFERENCES candidato(id) ON DELETE CASCADE,
  votacao_id         text    NOT NULL REFERENCES votacao(id) ON DELETE CASCADE,
  voto               text    NOT NULL,      -- 'Sim','Não','Abstenção','Obstrução','Art. 17', códigos do Senado...
  partido_na_epoca   text,
  alinhado_governo   boolean,               -- NULL quando não há orientação Sim/Não do governo
  contradicao        text,                  -- (referência) descrição de contradição, se houver
  PRIMARY KEY (candidato_id, votacao_id)
);
CREATE INDEX ix_voto_votacao ON voto (votacao_id);

CREATE TABLE proposicao (
  id                 text    NOT NULL,      -- 'camara:<id>' | 'senado:<codigoMateria>' | 'ref:<id>'
  candidato_id       integer NOT NULL REFERENCES candidato(id) ON DELETE CASCADE,
  casa               text,
  sigla_tipo         text,
  numero             text,
  ano                smallint,
  data_apresentacao  date,
  ementa             text,
  tema               text,
  situacao           text,
  autor_principal    boolean,
  tipo_principal     boolean,               -- PL, PLP, PEC, PDL, PLS, PLV...
  destaque           boolean,
  url                text,
  url_inteiro_teor   text,
  fonte_id           integer REFERENCES fonte(id),
  PRIMARY KEY (id, candidato_id)
);
CREATE INDEX ix_prop_cand ON proposicao (candidato_id, data_apresentacao DESC);

-- Emendas parlamentares (Portal da Transparência), uma linha por emenda x localidade/ação.
CREATE TABLE emenda (
  id                 serial  PRIMARY KEY,
  candidato_id       integer NOT NULL REFERENCES candidato(id) ON DELETE CASCADE,
  codigo_emenda      text    NOT NULL,
  ano                smallint,
  tipo_emenda        text,
  numero_emenda      text,
  autor_codigo       text,
  autor_nome         text,                  -- autor no Portal (individual, bancada, comissão)
  localidade         text,
  municipio          text,
  uf                 text,
  cod_ibge           text,
  funcao             text,
  subfuncao          text,
  programa           text,
  acao               text,
  empenhado          numeric(18,2),
  liquidado          numeric(18,2),
  pago               numeric(18,2),
  restos_pagar_pagos numeric(18,2),
  pago_total         numeric(18,2),         -- pago + restos a pagar pagos
  fonte_url          text,                  -- página da emenda no Portal
  fonte_id           integer REFERENCES fonte(id)
);
CREATE INDEX ix_emenda_cand ON emenda (candidato_id, ano);
CREATE INDEX ix_emenda_cod  ON emenda (codigo_emenda);

-- Para quem o dinheiro foi (arquivo por favorecido), agregado por emenda x favorecido.
CREATE TABLE emenda_favorecido (
  id                  serial  PRIMARY KEY,
  candidato_id        integer NOT NULL REFERENCES candidato(id) ON DELETE CASCADE,
  codigo_emenda       text    NOT NULL,
  ano                 smallint,
  favorecido          text,
  favorecido_cnpj     text,                 -- só CNPJ; PF sem documento
  favorecido_pf       boolean,
  tipo_favorecido     text,
  natureza_juridica   text,
  municipio           text,
  uf                  text,
  intermediario       boolean NOT NULL DEFAULT false,  -- Banco do Brasil (Pix) / Caixa (repasse): NÃO é destino real
  privado             boolean,              -- entidade não governamental
  valor               numeric(18,2),
  primeiro_mes        text,
  ultimo_mes          text,
  fonte_url           text,
  fonte_id            integer REFERENCES fonte(id)
);
CREATE INDEX ix_emfav_cand ON emenda_favorecido (candidato_id, intermediario);

CREATE TABLE emenda_convenio (
  id                 serial  PRIMARY KEY,
  candidato_id       integer NOT NULL REFERENCES candidato(id) ON DELETE CASCADE,
  codigo_emenda      text    NOT NULL,
  numero_convenio    text,
  convenente         text,
  objeto             text,
  data_publicacao    date,
  localidade         text,
  funcao             text,
  valor              numeric(18,2),
  fonte_url          text,
  fonte_id           integer REFERENCES fonte(id)
);
CREATE INDEX ix_emconv_cand ON emenda_convenio (candidato_id);

-- Emendas Pix (transferências especiais), plano de ação por beneficiário.
CREATE TABLE emenda_pix (
  id                  serial  PRIMARY KEY,
  candidato_id        integer NOT NULL REFERENCES candidato(id) ON DELETE CASCADE,
  id_plano_acao       bigint,
  codigo_plano_acao   text,
  codigo_emenda       text,
  ano                 smallint,
  situacao            text,
  valido              boolean,
  beneficiario        text,
  beneficiario_cnpj   text,
  municipio           text,
  cod_ibge            text,
  valor_plano         numeric(18,2),
  custeio             numeric(18,2),
  investimento        numeric(18,2),
  areas               text,
  objeto              text,
  detalhamento        text,
  executores          text,
  finalidades         text,
  metas               text,
  empenhado           numeric(18,2),
  situacao_relatorio_gestao text,
  tem_relatorio_gestao boolean,
  tem_show_evento     boolean,
  fonte_url           text,
  fonte_id            integer REFERENCES fonte(id)
);
CREATE INDEX ix_pix_cand ON emenda_pix (candidato_id, ano);

-- Metas de planos Pix que financiam shows/festas.
CREATE TABLE emenda_pix_show (
  id             serial  PRIMARY KEY,
  candidato_id   integer NOT NULL REFERENCES candidato(id) ON DELETE CASCADE,
  ano            smallint,
  municipio      text,
  meta           text,
  descricao      text,
  valor          numeric(18,2),
  fonte_id       integer REFERENCES fonte(id)
);

-- Cota parlamentar / verba indenizatória (Câmara CEAP, Senado CEAPS, ALBA).
CREATE TABLE cota_despesa (
  id                 bigserial PRIMARY KEY,
  candidato_id       integer NOT NULL REFERENCES candidato(id) ON DELETE CASCADE,
  casa               text    NOT NULL CHECK (casa IN ('camara','senado','alba')),
  ano                smallint NOT NULL,
  mes                smallint,
  data_documento     date,
  categoria          text,               -- categoria oficial
  categoria_grupo    text,               -- normalizada: alimentacao, hospedagem, combustivel, passagem_aerea, locacao_veiculo, divulgacao, escritorio, consultoria, telefonia, seguranca, outros
  especificacao      text,
  fornecedor         text,
  fornecedor_cnpj    text,               -- só CNPJ
  fornecedor_pf      boolean,
  numero_documento   text,
  valor_documento    numeric(18,2),
  valor_glosa        numeric(18,2),
  valor_liquido      numeric(18,2),      -- o que soma
  passageiro         text,
  trecho             text,
  detalhamento       text,               -- (Senado) texto livre do gabinete
  processo           text,               -- (ALBA) processo administrativo
  url_documento      text,               -- link da nota fiscal (Câmara/ALBA)
  fonte_id           integer REFERENCES fonte(id)
);
CREATE INDEX ix_cota_cand ON cota_despesa (candidato_id, casa, ano);
CREATE INDEX ix_cota_grupo ON cota_despesa (candidato_id, categoria_grupo, valor_liquido DESC);

-- ---------------------------------------------------------------------
-- Gestão (governador em exercício): vazia nesta edição (governador fora do escopo)
-- ---------------------------------------------------------------------
CREATE TABLE gestao_gasto (
  id               serial  PRIMARY KEY,
  candidato_id     integer NOT NULL REFERENCES candidato(id) ON DELETE CASCADE,
  tema             text    NOT NULL,   -- diarias_governador, comitiva_viagem_internacional, adiantamento, adiantamento_resumo, fornecedor_unidade, total_unidade_ano, aeronave, fretamento_aeronave, eventos_mais_acoes, eventos_mais_acoes_instrumento, hospedagem_alimentacao, agencia_viagem, contrato, palacio_ondina, orcamento_acao, doe_ato, doe_ausencia
  data             date,
  ano              smallint,
  orgao            text,
  categoria        text,
  favorecido       text,               -- fornecedor ou servidor (sem CPF)
  favorecido_cnpj  text,
  valor            numeric(18,2),
  quantidade       integer,
  descricao        text,
  documento        text,               -- nº de pagamento/instrumento
  processo         text,               -- nº SEI
  extra            jsonb,              -- demais colunas do achado
  fonte_url        text,
  fonte_id         integer REFERENCES fonte(id)
);
CREATE INDEX ix_gestao_cand ON gestao_gasto (candidato_id, tema);

-- Atos do mandato executivo — vazia nesta edição.
CREATE TABLE ato_executivo (
  id             serial  PRIMARY KEY,
  candidato_id   integer NOT NULL REFERENCES candidato(id) ON DELETE CASCADE,
  tipo_relacao   text,
  tipo_norma     text,
  numero         text,
  ano            smallint,
  data_norma     date,
  ementa         text,
  signatario     text,
  fonte_url      text,
  fonte_id       integer REFERENCES fonte(id)
);

-- Cartão corporativo por órgão — vazia nesta edição.
CREATE TABLE gasto_cartao_executivo (
  id             serial  PRIMARY KEY,
  candidato_id   integer NOT NULL REFERENCES candidato(id) ON DELETE CASCADE,
  orgao          text,
  unidade_gestora text,
  mes            date,
  valor_total    numeric(18,2),
  qtd_transacoes integer,
  dados          jsonb,
  fonte_url      text,
  fonte_id       integer REFERENCES fonte(id)
);

-- Cota parlamentar anual resumida de mandatos antigos — vazia nesta edição.
CREATE TABLE cota_resumo_referencia (
  candidato_id   integer  NOT NULL REFERENCES candidato(id) ON DELETE CASCADE,
  casa           text,
  ano            smallint,
  total          numeric(18,2),
  detalhamento   jsonb,
  fonte_id       integer REFERENCES fonte(id),
  PRIMARY KEY (candidato_id, casa, ano)
);

-- Relatórios em markdown — vazia nesta edição.
CREATE TABLE relatorio_pesquisa (
  id             serial  PRIMARY KEY,
  candidato_id   integer NOT NULL REFERENCES candidato(id) ON DELETE CASCADE,
  titulo         text    NOT NULL,
  markdown       text    NOT NULL,
  fontes         jsonb,
  gerado_em      date,
  fonte_id       integer REFERENCES fonte(id)
);

-- ---------------------------------------------------------------------
-- Contexto eleitoral (não é por candidato)
-- ---------------------------------------------------------------------
CREATE TABLE municipio (
  cd_municipio_tse  integer PRIMARY KEY,
  cod_ibge          text,
  nome              text    NOT NULL,
  eleitores_2026    bigint,
  populacao_2024    bigint,
  fonte_id          integer REFERENCES fonte(id)
);

CREATE TABLE vaga (
  cargo        text PRIMARY KEY,
  qt_vagas     integer,
  dt_posse     date,
  fonte_id     integer REFERENCES fonte(id)
);

CREATE TABLE coligacao (
  id                     serial PRIMARY KEY,
  cargo                  text,
  tipo                   text,
  partido                text,
  federacao              text,
  nome_coligacao         text,
  composicao             text,
  situacao               text,
  fonte_id               integer REFERENCES fonte(id)
);

CREATE TABLE pesquisa_eleitoral (
  protocolo            text PRIMARY KEY,
  dt_registro          date,
  empresa              text,
  empresa_cnpj         text,
  contratante_propria  boolean,
  cargos               text,
  dt_inicio            date,
  dt_fim               date,
  dt_divulgacao        date,
  entrevistados        integer,
  valor                numeric(18,2),
  metodologia          text,
  abrangencia          text,
  fonte_id             integer REFERENCES fonte(id)
);

CREATE TABLE calendario_eleitoral (
  id          serial PRIMARY KEY,
  dt_inicio   date   NOT NULL,
  dt_fim      date,
  marco       text   NOT NULL,
  destaque    boolean NOT NULL DEFAULT false,
  fonte_id    integer REFERENCES fonte(id)
);

-- Relatório de casamento de identidades (auditoria do ETL).
CREATE TABLE etl_casamento (
  id            serial PRIMARY KEY,
  origem        text NOT NULL,     -- 'camara','senado','alba','candidatos_ids'
  chave_origem  text,
  nome_origem   text,
  candidato_id  integer REFERENCES candidato(id),
  metodo        text,              -- 'id_oficial_cpf','nome_normalizado','sem_match' (ver base/candidatos_ids.json)
  confianca     text,
  observacao    text
);
