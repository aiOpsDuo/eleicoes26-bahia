-- =====================================================================
-- ba2026 — views de apoio à API. Rodar depois da carga (run_all.sh faz isso).
-- candidato_resumo é MATERIALIZED: a lista precisa ser rápida.
-- Depois de recarregar dados: REFRESH MATERIALIZED VIEW candidato_resumo;
-- =====================================================================

DROP MATERIALIZED VIEW IF EXISTS candidato_resumo CASCADE;
CREATE MATERIALIZED VIEW candidato_resumo AS
WITH pat AS (
  SELECT candidato_id,
         max(valor_total) FILTER (WHERE ano_eleicao = 2026) AS patrimonio_2026,
         max(valor_total) FILTER (WHERE ano_eleicao = 2022) AS patrimonio_2022,
         max(valor_total) FILTER (WHERE ano_eleicao = 2018) AS patrimonio_2018,
         bool_or(ano_eleicao = 2026 AND declarou_bens IS FALSE) AS declarou_sem_bens_2026
  FROM patrimonio GROUP BY 1),
pat_ant AS (  -- declaração anterior mais recente (para variação)
  SELECT DISTINCT ON (candidato_id) candidato_id, ano_eleicao AS ano_anterior, valor_total AS patrimonio_anterior
  FROM patrimonio WHERE ano_eleicao < 2026 AND valor_total IS NOT NULL
  ORDER BY candidato_id, ano_eleicao DESC),
camp AS (
  SELECT candidato_id, total_receitas, fundo_eleitoral, fundo_partidario, pessoas_fisicas, recursos_proprios,
         despesas_contratadas, despesas_pagas, n_doadores, n_fornecedores
  FROM campanha_resumo WHERE ano_eleicao = 2026),
em AS (
  SELECT candidato_id, count(DISTINCT codigo_emenda) AS n_emendas, sum(empenhado) AS emendas_empenhado,
         sum(pago) AS emendas_pago, sum(pago_total) AS emendas_pago_total,
         sum(empenhado) FILTER (WHERE ano >= 2023) AS emendas_empenhado_2023_2026,
         min(ano) AS emendas_ano_min, max(ano) AS emendas_ano_max
  FROM emenda GROUP BY 1),
pix AS (SELECT candidato_id, count(*) AS n_planos_pix, sum(valor_plano) AS pix_valor FROM emenda_pix WHERE valido GROUP BY 1),
cota AS (
  SELECT candidato_id, sum(valor_liquido) AS cota_total,
         sum(valor_liquido) FILTER (WHERE ano >= 2023) AS cota_total_2023_2026,
         string_agg(DISTINCT casa, ',') AS cota_casas, min(ano) AS cota_ano_min, max(ano) AS cota_ano_max
  FROM cota_despesa GROUP BY 1),
vt AS (
  SELECT v.candidato_id, count(*) AS n_votos,
         count(*) FILTER (WHERE vo.eh_chave) AS n_votacoes_chave,
         round(100.0 * count(*) FILTER (WHERE v.alinhado_governo) / nullif(count(v.alinhado_governo), 0), 1) AS pct_alinhamento_governo,
         count(v.alinhado_governo) AS n_votos_com_orientacao_governo
  FROM voto v JOIN votacao vo ON vo.id = v.votacao_id GROUP BY 1),
pr AS (SELECT candidato_id, count(*) AS n_proposicoes, count(*) FILTER (WHERE tipo_principal) AS n_proposicoes_principais FROM proposicao GROUP BY 1),
proc AS (SELECT candidato_id, count(*) AS n_processos, count(*) FILTER (WHERE tipo = 'criminal') AS n_processos_criminais FROM processo GROUP BY 1),
sanc AS (SELECT candidato_id, count(*) AS n_sancoes FROM sancao GROUP BY 1),
pa AS (SELECT candidato_id, count(*) AS n_pontos_atencao,
              count(*) FILTER (WHERE origem = 'pesquisa') AS n_pontos_pesquisa FROM ponto_atencao GROUP BY 1),
ges AS (SELECT candidato_id, count(*) AS n_gestao FROM gestao_gasto GROUP BY 1),
ref AS (SELECT candidato_id FROM candidato_referencia)
SELECT
  k.id, k.slug, k.nome_urna, k.nome_completo, k.cargo, k.cargo_tse, k.uf, k.partido, k.numero, k.federacao, k.coligacao,
  k.situacao, k.genero, k.cor_raca, k.idade,
  CASE WHEN k.idade IS NULL THEN NULL WHEN k.idade < 30 THEN '18-29' WHEN k.idade < 40 THEN '30-39' WHEN k.idade < 50 THEN '40-49'
       WHEN k.idade < 60 THEN '50-59' WHEN k.idade < 70 THEN '60-69' ELSE '70+' END AS faixa_etaria,
  k.ocupacao, k.grau_instrucao, k.foto_url, k.municipio_base, k.cd_municipio_base,
  k.mandato_atual, (k.mandato_atual IS NOT NULL) AS tem_mandato_atual, k.titular_id,
  k.id_camara, k.id_senado, k.id_alba,
  pat.patrimonio_2026, pat.patrimonio_2022, pat.patrimonio_2018, coalesce(pat.declarou_sem_bens_2026, false) AS declarou_sem_bens_2026,
  pat_ant.ano_anterior AS patrimonio_ano_anterior, pat_ant.patrimonio_anterior,
  CASE WHEN pat_ant.patrimonio_anterior > 0 AND pat.patrimonio_2026 IS NOT NULL
       THEN round(100.0 * (pat.patrimonio_2026 - pat_ant.patrimonio_anterior) / pat_ant.patrimonio_anterior, 1) END AS variacao_patrimonio_pct,
  CASE WHEN pat.patrimonio_2026 IS NULL THEN 'sem_informacao'
       WHEN pat.patrimonio_2026 = 0 THEN 'zero'
       WHEN pat.patrimonio_2026 < 100000 THEN 'ate_100mil'
       WHEN pat.patrimonio_2026 < 1000000 THEN '100mil_1mi'
       WHEN pat.patrimonio_2026 < 5000000 THEN '1mi_5mi'
       ELSE 'acima_5mi' END AS faixa_patrimonio,
  camp.total_receitas AS arrecadado_2026, camp.fundo_eleitoral AS fundo_eleitoral_2026, camp.fundo_partidario AS fundo_partidario_2026,
  camp.pessoas_fisicas AS pessoas_fisicas_2026, camp.recursos_proprios AS recursos_proprios_2026,
  camp.despesas_contratadas AS despesas_contratadas_2026, camp.despesas_pagas AS despesas_pagas_2026,
  camp.n_doadores AS n_doadores_2026, camp.n_fornecedores AS n_fornecedores_2026,
  em.n_emendas, em.emendas_empenhado, em.emendas_pago, em.emendas_pago_total, em.emendas_empenhado_2023_2026, em.emendas_ano_min, em.emendas_ano_max,
  pix.n_planos_pix, pix.pix_valor,
  cota.cota_total, cota.cota_total_2023_2026, cota.cota_casas, cota.cota_ano_min, cota.cota_ano_max,
  vt.n_votos, vt.n_votacoes_chave, vt.pct_alinhamento_governo, vt.n_votos_com_orientacao_governo,
  pr.n_proposicoes, pr.n_proposicoes_principais,
  coalesce(proc.n_processos, 0) AS n_processos, coalesce(proc.n_processos_criminais, 0) AS n_processos_criminais,
  coalesce(sanc.n_sancoes, 0) AS n_sancoes, coalesce(pa.n_pontos_atencao, 0) AS n_pontos_atencao, coalesce(pa.n_pontos_pesquisa, 0) AS n_pontos_pesquisa,
  (ref.candidato_id IS NOT NULL) AS tem_ficha_referencia,
  (pat.patrimonio_2026 IS NOT NULL) AS tem_patrimonio,
  (camp.candidato_id IS NOT NULL) AS tem_campanha_2026,
  (em.candidato_id IS NOT NULL) AS tem_emendas,
  (cota.candidato_id IS NOT NULL) AS tem_cota,
  (vt.candidato_id IS NOT NULL) AS tem_votos,
  (pr.candidato_id IS NOT NULL) AS tem_proposicoes,
  (ges.candidato_id IS NOT NULL) AS tem_gestao,
  f_normaliza(k.nome_urna || ' ' || coalesce(k.nome_completo, '') || ' ' || coalesce(k.nome_social, '') || ' ' || coalesce(k.partido, '')) AS busca
FROM candidato k
LEFT JOIN pat ON pat.candidato_id = k.id
LEFT JOIN pat_ant ON pat_ant.candidato_id = k.id
LEFT JOIN camp ON camp.candidato_id = k.id
LEFT JOIN em ON em.candidato_id = k.id
LEFT JOIN pix ON pix.candidato_id = k.id
LEFT JOIN cota ON cota.candidato_id = k.id
LEFT JOIN vt ON vt.candidato_id = k.id
LEFT JOIN pr ON pr.candidato_id = k.id
LEFT JOIN proc ON proc.candidato_id = k.id
LEFT JOIN sanc ON sanc.candidato_id = k.id
LEFT JOIN pa ON pa.candidato_id = k.id
LEFT JOIN ges ON ges.candidato_id = k.id
LEFT JOIN ref ON ref.candidato_id = k.id;

CREATE UNIQUE INDEX ix_resumo_id    ON candidato_resumo (id);
CREATE UNIQUE INDEX ix_resumo_slug  ON candidato_resumo (slug);
CREATE INDEX ix_resumo_cargo        ON candidato_resumo (cargo, partido);
CREATE INDEX ix_resumo_busca        ON candidato_resumo USING gin (busca gin_trgm_ops);
CREATE INDEX ix_resumo_patrimonio   ON candidato_resumo (cargo, patrimonio_2026 DESC NULLS LAST);
CREATE INDEX ix_resumo_emendas      ON candidato_resumo (cargo, emendas_empenhado DESC NULLS LAST);
CREATE INDEX ix_resumo_cota         ON candidato_resumo (cargo, cota_total DESC NULLS LAST);
CREATE INDEX ix_resumo_arrecadado   ON candidato_resumo (cargo, arrecadado_2026 DESC NULLS LAST);

-- Emendas: destino real por município (exclui Banco do Brasil/Caixa, que são intermediários)
CREATE OR REPLACE VIEW v_emenda_municipio_destino AS
SELECT candidato_id, municipio, uf, sum(valor) AS valor_recebido, count(DISTINCT favorecido) AS n_favorecidos,
       count(DISTINCT codigo_emenda) AS n_emendas, min(primeiro_mes) AS primeiro_mes, max(ultimo_mes) AS ultimo_mes
FROM emenda_favorecido WHERE NOT intermediario
GROUP BY candidato_id, municipio, uf;

CREATE OR REPLACE VIEW v_emenda_por_ano AS
SELECT candidato_id, ano, count(DISTINCT codigo_emenda) AS n_emendas, sum(empenhado) AS empenhado, sum(pago) AS pago,
       sum(restos_pagar_pagos) AS restos_pagar_pagos, sum(pago_total) AS pago_total
FROM emenda GROUP BY candidato_id, ano;

CREATE OR REPLACE VIEW v_emenda_por_area AS
SELECT candidato_id, funcao AS area, sum(empenhado) AS empenhado, sum(pago_total) AS pago_total, count(DISTINCT codigo_emenda) AS n_emendas
FROM emenda GROUP BY candidato_id, funcao;

CREATE OR REPLACE VIEW v_cota_por_categoria AS
SELECT candidato_id, casa, categoria_grupo, categoria, count(*) AS n_notas, sum(valor_liquido) AS total,
       min(ano) AS ano_min, max(ano) AS ano_max
FROM cota_despesa GROUP BY candidato_id, casa, categoria_grupo, categoria;

CREATE OR REPLACE VIEW v_cota_fornecedor AS
SELECT candidato_id, casa, coalesce(fornecedor_cnpj, fornecedor) AS chave_fornecedor, max(fornecedor) AS fornecedor, fornecedor_cnpj,
       bool_or(fornecedor_pf) AS fornecedor_pf, count(*) AS n_notas, sum(valor_liquido) AS total, string_agg(DISTINCT categoria_grupo, ',') AS grupos
FROM cota_despesa GROUP BY candidato_id, casa, coalesce(fornecedor_cnpj, fornecedor), fornecedor_cnpj;

CREATE OR REPLACE VIEW v_voto_detalhe AS
SELECT v.candidato_id, v.voto, v.partido_na_epoca, v.alinhado_governo, v.contradicao,
       vo.id AS votacao_id, vo.casa, vo.data, extract(year FROM vo.data)::int AS ano, vo.descricao, vo.proposicao, vo.proposicao_ementa,
       vo.tema, vo.aprovada, vo.resultado, vo.orientacao_governo, vo.eh_chave, vo.rotulo_chave, vo.url, vo.url_api, vo.fonte_id
FROM voto v JOIN votacao vo ON vo.id = v.votacao_id;

CREATE OR REPLACE VIEW v_patrimonio_evolucao AS
SELECT p.candidato_id, p.ano_eleicao, p.valor_total, p.qtd_bens, p.origem, p.cargo_na_eleicao,
       p.valor_total - lag(p.valor_total) OVER w AS variacao_abs,
       CASE WHEN lag(p.valor_total) OVER w > 0 THEN round(100.0 * (p.valor_total - lag(p.valor_total) OVER w) / lag(p.valor_total) OVER w, 1) END AS variacao_pct,
       f.nome AS fonte_nome, f.url AS fonte_url
FROM patrimonio p LEFT JOIN fonte f ON f.id = p.fonte_id
WINDOW w AS (PARTITION BY p.candidato_id ORDER BY p.ano_eleicao);

ANALYZE;
