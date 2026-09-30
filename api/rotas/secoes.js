// Seções da ficha: GET /api/candidatos/:slug/<secao>[/<lista>]
// Regras: só SELECT parametrizado; ordenações e filtros por lista fechada; tabelas grandes paginadas no
// servidor (?pagina=&por_pagina=); nada de CPF (o banco não tem; documentos só CNPJ); cada linha leva
// fonte_id e, quando existe, o link do documento específico (nota, emenda, votação, proposição).
import { q, q1 } from "../db.js"
import { fontes } from "../dominio.js"
import { carregarBase } from "./ficha.js"

// ---------------------------------------------------------------- utilitários

const PORTAL_EMENDA = "https://portaldatransparencia.gov.br/emendas/detalhe?codigoEmenda="

function str(v, max = 120) {
  if (v == null) return null
  const s = String(Array.isArray(v) ? v[0] : v).trim()
  return s ? s.slice(0, max) : null
}
function int(v, { min = -Infinity, max = Infinity } = {}) {
  const s = str(v, 12)
  if (!s || !/^-?\d+$/.test(s)) return null
  const n = Number(s)
  return n < min || n > max ? null : n
}
/** Exportação estática (estatico/exportar.mjs): com query[TODAS], as listas devolvem todas as linhas, sem LIMIT.
 *  Um símbolo nunca chega por uma requisição HTTP, então a API pública continua limitada a 100 por página. */
export const TODAS = Symbol("todas")
function paginacao(query, padrao = 25) {
  if (query[TODAS]) return { por: null, pagina: 1, offset: 0, limite: "" }
  const por = int(query.por_pagina, { min: 1, max: 100 }) ?? padrao
  const pagina = int(query.pagina, { min: 1, max: 100000 }) ?? 1
  const offset = (pagina - 1) * por
  return { por, pagina, offset, limite: `LIMIT ${por} OFFSET ${offset}` }
}
/** Condições WHERE montadas com placeholders numerados. */
function filtro(baseParams) {
  const cond = []
  const params = [...baseParams]
  return {
    params,
    cond,
    add(sql, ...valores) {
      let s = sql
      for (const v of valores) {
        params.push(v)
        s = s.replace("$?", `$${params.length}`)
      }
      cond.push(s)
    },
    where(prefixo = "") {
      return cond.length ? `${prefixo} ${cond.join(" AND ")}` : ""
    },
  }
}
/** Texto de busca sem acento, com curingas do LIKE escapados. */
function termo(v) {
  const s = str(v, 80)
  if (!s) return null
  return s.replace(/[\\%_]/g, (m) => `\\${m}`)
}
const LIKE = (col) => `f_normaliza(coalesce(${col}, '')) LIKE '%' || f_normaliza($?) || '%'`

/** Envolve um handler: resolve o candidato pelo slug (404 se não existe). */
const secao = (fn) => async (req, res) => {
  const base = await carregarBase(req.params.slug)
  if (!base) return res.status(404).json({ erro: "candidato não encontrado", slug: req.params.slug })
  const { porChave } = await fontes()
  const dados = await fn(base, req.query, porChave)
  res.json(dados)
}

// ---------------------------------------------------------------- visão geral

export const visao = secao(async (b) => {
  const [ultimaCampanha, chave, casas] = await Promise.all([
    q1(
      `SELECT ano_eleicao, total_receitas, despesas_contratadas, despesas_pagas, tipo_prestacao, origem, fonte_id
         FROM campanha_resumo WHERE candidato_id = $1 ORDER BY ano_eleicao DESC LIMIT 1`,
      [b.id],
    ),
    b.tem_votos
      ? q(
          `SELECT vo.rotulo_chave, vo.data, v.voto, vo.orientacao_governo, vo.url, vo.fonte_id
             FROM voto v JOIN votacao vo ON vo.id = v.votacao_id
            WHERE v.candidato_id = $1 AND vo.eh_chave ORDER BY vo.data DESC LIMIT 6`,
          [b.id],
        )
      : [],
    b.tem_votos ? q(`SELECT DISTINCT vo.casa FROM voto v JOIN votacao vo ON vo.id = v.votacao_id WHERE v.candidato_id = $1`, [b.id]) : [],
  ])
  return { ultima_campanha: ultimaCampanha, votos_chave: chave, casas_votos: casas.map((c) => c.casa) }
})

// ---------------------------------------------------------------- patrimônio

export const patrimonio = secao(async (b) => {
  const [evolucao, bens, snapshot] = await Promise.all([
    q(
      `SELECT ano_eleicao AS ano, valor_total, qtd_bens, declarou_bens, origem, cargo_na_eleicao, fonte_id,
              valor_total - lag(valor_total) OVER w AS variacao_abs,
              CASE WHEN lag(valor_total) OVER w > 0 THEN round(100.0 * (valor_total - lag(valor_total) OVER w) / lag(valor_total) OVER w, 1) END AS variacao_pct,
              lag(ano_eleicao) OVER w AS ano_anterior
         FROM patrimonio WHERE candidato_id = $1 AND valor_total IS NOT NULL
       WINDOW w AS (ORDER BY ano_eleicao) ORDER BY ano_eleicao`,
      [b.id],
    ),
    q(
      `SELECT id, ano_eleicao AS ano, ordem, tipo, descricao, valor, fonte_id FROM bem
        WHERE candidato_id = $1 ORDER BY ano_eleicao DESC, valor DESC NULLS LAST, ordem`,
      [b.id],
    ),
    q1(`SELECT dt_snapshot, bens_total, declarou_bens, fonte_id FROM candidatura_snapshot WHERE candidato_id = $1 ORDER BY dt_snapshot DESC LIMIT 1`, [b.id]),
  ])
  return { evolucao, bens, snapshot }
})

// ---------------------------------------------------------------- campanha

export const campanha = secao(async (b, query) => {
  const resumos = await q(
    `SELECT ano_eleicao AS ano, cargo_na_eleicao, tipo_prestacao, dt_prestacao, total_receitas, fundo_eleitoral, fundo_partidario,
            pessoas_fisicas, recursos_proprios, outros_candidatos_partidos, outras_receitas, despesas_contratadas, despesas_pagas,
            n_receitas, n_doadores, n_despesas, n_fornecedores, origem, fonte_id
       FROM campanha_resumo WHERE candidato_id = $1 ORDER BY ano_eleicao DESC`,
    [b.id],
  )
  const anos = resumos.map((r) => r.ano)
  const ano = anos.includes(int(query.ano)) ? int(query.ano) : anos[0] ?? null
  if (ano == null) return { resumos, anos, ano: null }
  const [doadores, fornecedores, categorias, receitasTipo, nDesp] = await Promise.all([
    q(
      `SELECT doador_nome AS nome, CASE WHEN doador_pf THEN NULL ELSE doador_cnpj END AS cnpj, doador_pf AS pf, doador_tipo AS tipo,
              n_doacoes, valor, origem, fonte_id
         FROM campanha_doador WHERE candidato_id = $1 AND ano_eleicao = $2 ORDER BY valor DESC NULLS LAST LIMIT 30`,
      [b.id, ano],
    ),
    q(
      `SELECT fornecedor_nome AS nome, CASE WHEN fornecedor_pf THEN NULL ELSE fornecedor_cnpj END AS cnpj, fornecedor_pf AS pf,
              categoria_principal, n_despesas, valor, fonte_id
         FROM campanha_fornecedor WHERE candidato_id = $1 AND ano_eleicao = $2 ORDER BY valor DESC NULLS LAST LIMIT 20`,
      [b.id, ano],
    ),
    q(`SELECT categoria, n_despesas, valor, origem, fonte_id FROM campanha_despesa_categoria WHERE candidato_id = $1 AND ano_eleicao = $2 ORDER BY valor DESC NULLS LAST`, [b.id, ano]),
    q(
      `SELECT coalesce(doador_tipo, 'outros') AS tipo, count(*)::int AS n, sum(valor) AS valor,
              sum(valor) FILTER (WHERE natureza ILIKE 'estim%') AS estimavel
         FROM campanha_receita WHERE candidato_id = $1 AND ano_eleicao = $2 GROUP BY 1 ORDER BY 3 DESC NULLS LAST`,
      [b.id, ano],
    ),
    q1(`SELECT count(*)::int AS n FROM campanha_despesa WHERE candidato_id = $1 AND ano_eleicao = $2`, [b.id, ano]),
  ])
  return { resumos, anos, ano, doadores, fornecedores, categorias, receitas_por_tipo: receitasTipo, n_despesas_linhas: nDesp.n }
})

const ORDEM_DESPESA = {
  valor: "valor DESC NULLS LAST, id",
  valor_asc: "valor ASC NULLS LAST, id",
  data: "dt_despesa DESC NULLS LAST, id",
  data_asc: "dt_despesa ASC NULLS LAST, id",
  fornecedor: "fornecedor_nome ASC, id",
}

export const campanhaDespesas = secao(async (b, query) => {
  const ano = int(query.ano, { min: 1990, max: 2100 })
  const { por, pagina, limite } = paginacao(query)
  const f = filtro([b.id])
  f.cond.push("candidato_id = $1")
  if (ano) f.add("ano_eleicao = $?", ano)
  const cat = str(query.categoria)
  const t = termo(query.q)
  if (t) f.add(`(${LIKE("fornecedor_nome")} OR ${LIKE("descricao")} OR fornecedor_cnpj LIKE '%' || $? || '%' OR ${LIKE("numero_documento")})`, t, t, t.replace(/\D/g, "") || "#", t)
  const semCat = f.where("WHERE")
  if (cat) f.add("categoria = $?", cat)
  const ordem = ORDEM_DESPESA[str(query.ordem)] ?? ORDEM_DESPESA.valor
  const [linhas, tot, facetas] = await Promise.all([
    q(
      `SELECT id, ano_eleicao AS ano, dt_despesa AS data, fornecedor_nome AS fornecedor,
              CASE WHEN fornecedor_pf THEN NULL ELSE fornecedor_cnpj END AS cnpj, fornecedor_pf AS pf, fornecedor_tipo,
              fornecedor_municipio, fornecedor_uf, categoria, descricao, tipo_documento, numero_documento, valor, fonte_id
         FROM campanha_despesa ${f.where("WHERE")} ORDER BY ${ordem} ${limite}`,
      f.params,
    ),
    q1(`SELECT count(*)::int AS total, sum(valor) AS soma FROM campanha_despesa ${f.where("WHERE")}`, f.params),
    q(
      `SELECT categoria AS valor, count(*)::int AS n, sum(valor) AS soma FROM campanha_despesa ${semCat}
        GROUP BY 1 ORDER BY 3 DESC NULLS LAST`,
      f.params.slice(0, f.params.length - (cat ? 1 : 0)),
    ),
  ])
  return { linhas, total: tot.total, soma: tot.soma, pagina, por_pagina: por, facetas: { categoria: facetas } }
})

// ---------------------------------------------------------------- atuação (votações + proposições)

export const atuacao = secao(async (b) => {
  const [porAno, porVoto, temas, casas, chave, propTipos, propAnos, propTemas] = await Promise.all([
    q(
      `SELECT ano, count(*)::int AS n,
              count(*) FILTER (WHERE voto = 'Sim')::int AS sim, count(*) FILTER (WHERE voto = 'Não')::int AS nao,
              count(*) FILTER (WHERE voto NOT IN ('Sim', 'Não'))::int AS outros,
              count(alinhado_governo)::int AS com_orientacao, count(*) FILTER (WHERE alinhado_governo)::int AS alinhados,
              round(100.0 * count(*) FILTER (WHERE alinhado_governo) / nullif(count(alinhado_governo), 0), 1) AS pct_alinhamento
         FROM v_voto_detalhe WHERE candidato_id = $1 GROUP BY ano ORDER BY ano`,
      [b.id],
    ),
    q(`SELECT voto AS valor, count(*)::int AS n FROM voto WHERE candidato_id = $1 GROUP BY 1 ORDER BY 2 DESC`, [b.id]),
    q(`SELECT tema AS valor, count(*)::int AS n FROM v_voto_detalhe WHERE candidato_id = $1 AND tema IS NOT NULL AND tema <> '' GROUP BY 1 ORDER BY 2 DESC`, [b.id]),
    q(`SELECT casa, count(*)::int AS n, min(data) AS de, max(data) AS ate FROM v_voto_detalhe WHERE candidato_id = $1 GROUP BY casa`, [b.id]),
    // votações-chave da(s) casa(s) e da mesma base (Câmara/Senado) em que há votos dele, dentro do período
    // em que há votos (fora disso não dá para inferir ausência)
    q(
      `WITH per AS (SELECT casa, split_part(votacao_id, ':', 1) AS origem, min(data) AS de, max(data) AS ate
                     FROM v_voto_detalhe WHERE candidato_id = $1 GROUP BY 1, 2)
       SELECT vo.id, vo.casa, vo.data, vo.rotulo_chave, vo.descricao, vo.proposicao, vo.proposicao_ementa, vo.resultado, vo.aprovada,
              vo.votos_sim, vo.votos_nao, vo.orientacao_governo, vo.url, vo.url_api, vo.fonte_id,
              v.voto, v.partido_na_epoca, v.alinhado_governo, v.contradicao
         FROM votacao vo JOIN per ON per.casa = vo.casa AND per.origem = split_part(vo.id, ':', 1) AND vo.data BETWEEN per.de AND per.ate
         LEFT JOIN voto v ON v.votacao_id = vo.id AND v.candidato_id = $1
        WHERE vo.eh_chave
       UNION
       SELECT vo.id, vo.casa, vo.data, vo.rotulo_chave, vo.descricao, vo.proposicao, vo.proposicao_ementa, vo.resultado, vo.aprovada,
              vo.votos_sim, vo.votos_nao, vo.orientacao_governo, vo.url, vo.url_api, vo.fonte_id,
              v.voto, v.partido_na_epoca, v.alinhado_governo, v.contradicao
         FROM voto v JOIN votacao vo ON vo.id = v.votacao_id WHERE v.candidato_id = $1 AND vo.eh_chave
       ORDER BY data DESC`,
      [b.id],
    ),
    q(
      `SELECT sigla_tipo AS valor, count(*)::int AS n, bool_or(tipo_principal) AS principal FROM proposicao
        WHERE candidato_id = $1 GROUP BY 1 ORDER BY 2 DESC`,
      [b.id],
    ),
    q(`SELECT ano AS valor, count(*)::int AS n FROM proposicao WHERE candidato_id = $1 AND ano IS NOT NULL GROUP BY 1 ORDER BY 1 DESC`, [b.id]),
    q(`SELECT tema AS valor, count(*)::int AS n FROM proposicao WHERE candidato_id = $1 AND tema IS NOT NULL AND tema <> '' GROUP BY 1 ORDER BY 2 DESC`, [b.id]),
  ])
  return {
    votos: { por_ano: porAno, por_voto: porVoto, temas, casas, chave },
    proposicoes: { tipos: propTipos, anos: propAnos, temas: propTemas },
  }
})

export const atuacaoVotos = secao(async (b, query) => {
  const { por, pagina, limite } = paginacao(query)
  const f = filtro([b.id])
  f.cond.push("candidato_id = $1")
  const ano = int(query.ano, { min: 1990, max: 2100 })
  if (ano) f.add("ano = $?", ano)
  const tema = str(query.tema)
  if (tema) f.add("tema = $?", tema)
  const voto = str(query.voto, 30)
  if (voto) f.add("voto = $?", voto)
  if (str(query.chave) === "1") f.cond.push("eh_chave")
  const al = str(query.alinhamento, 10)
  if (al === "sim") f.cond.push("alinhado_governo IS TRUE")
  if (al === "nao") f.cond.push("alinhado_governo IS FALSE")
  const t = termo(query.q)
  if (t) f.add(`(${LIKE("descricao")} OR ${LIKE("proposicao")} OR ${LIKE("proposicao_ementa")} OR ${LIKE("rotulo_chave")})`, t, t, t, t)
  const ordem = str(query.ordem) === "data_asc" ? "data ASC, votacao_id" : "data DESC, votacao_id"
  const [linhas, tot] = await Promise.all([
    q(
      `SELECT votacao_id AS id, casa, data, ano, descricao, proposicao, proposicao_ementa, tema, aprovada, resultado,
              orientacao_governo, eh_chave, rotulo_chave, url, url_api, fonte_id, voto, partido_na_epoca, alinhado_governo, contradicao
         FROM v_voto_detalhe ${f.where("WHERE")} ORDER BY ${ordem} ${limite}`,
      f.params,
    ),
    q1(`SELECT count(*)::int AS total FROM v_voto_detalhe ${f.where("WHERE")}`, f.params),
  ])
  return { linhas, total: tot.total, pagina, por_pagina: por }
})

export const atuacaoProposicoes = secao(async (b, query) => {
  const { por, pagina, limite } = paginacao(query)
  const f = filtro([b.id])
  f.cond.push("candidato_id = $1")
  const tipo = str(query.tipo, 20)
  if (tipo) f.add("sigla_tipo = $?", tipo)
  const ano = int(query.ano, { min: 1900, max: 2100 })
  if (ano) f.add("ano = $?", ano)
  const tema = str(query.tema)
  if (tema) f.add("tema = $?", tema)
  if (str(query.principais) === "1") f.cond.push("tipo_principal")
  const t = termo(query.q)
  if (t) f.add(`(${LIKE("ementa")} OR ${LIKE("sigla_tipo || ' ' || numero || '/' || ano")})`, t, t)
  const [linhas, tot] = await Promise.all([
    q(
      `SELECT id, casa, sigla_tipo, numero, ano, data_apresentacao, ementa, tema, situacao, autor_principal, tipo_principal, destaque,
              url, url_inteiro_teor, fonte_id
         FROM proposicao ${f.where("WHERE")} ORDER BY data_apresentacao DESC NULLS LAST, id ${limite}`,
      f.params,
    ),
    q1(`SELECT count(*)::int AS total FROM proposicao ${f.where("WHERE")}`, f.params),
  ])
  return { linhas, total: tot.total, pagina, por_pagina: por }
})

// ---------------------------------------------------------------- emendas

export const emendas = secao(async (b) => {
  const [porAno, porArea, municipios, favorecidos, intermediarios, convenios, pix, shows, tipos] = await Promise.all([
    q(`SELECT ano, n_emendas::int, empenhado, pago, restos_pagar_pagos, pago_total FROM v_emenda_por_ano WHERE candidato_id = $1 ORDER BY ano`, [b.id]),
    q(`SELECT coalesce(area, 'Não informada') AS area, empenhado, pago_total, n_emendas::int FROM v_emenda_por_area WHERE candidato_id = $1 ORDER BY empenhado DESC NULLS LAST`, [b.id]),
    q(
      `SELECT d.municipio, d.uf, d.valor_recebido, d.n_favorecidos::int, d.n_emendas::int, d.primeiro_mes, d.ultimo_mes,
              m.populacao_2024 AS populacao, m.cod_ibge,
              CASE WHEN m.populacao_2024 > 0 THEN round(d.valor_recebido / m.populacao_2024, 2) END AS per_capita
         FROM v_emenda_municipio_destino d
         LEFT JOIN municipio m ON d.uf = 'BA' AND f_normaliza(m.nome) = f_normaliza(d.municipio)
        WHERE d.candidato_id = $1 ORDER BY d.valor_recebido DESC NULLS LAST`,
      [b.id],
    ),
    q(
      `SELECT favorecido AS nome, CASE WHEN favorecido_pf THEN NULL ELSE favorecido_cnpj END AS cnpj, favorecido_pf AS pf,
              max(tipo_favorecido) AS tipo, max(natureza_juridica) AS natureza_juridica, bool_or(privado) AS privado,
              max(municipio) AS municipio, max(uf) AS uf, sum(valor) AS valor, count(DISTINCT codigo_emenda)::int AS n_emendas,
              (array_agg(codigo_emenda ORDER BY valor DESC NULLS LAST))[1] AS codigo_emenda_maior
         FROM emenda_favorecido WHERE candidato_id = $1 AND NOT intermediario
        GROUP BY favorecido, CASE WHEN favorecido_pf THEN NULL ELSE favorecido_cnpj END, favorecido_pf
        ORDER BY sum(valor) DESC NULLS LAST LIMIT 60`,
      [b.id],
    ),
    q(
      `SELECT favorecido AS nome, favorecido_cnpj AS cnpj, sum(valor) AS valor, count(DISTINCT codigo_emenda)::int AS n_emendas
         FROM emenda_favorecido WHERE candidato_id = $1 AND intermediario GROUP BY 1, 2 ORDER BY 3 DESC`,
      [b.id],
    ),
    q(
      `SELECT id, codigo_emenda, numero_convenio, convenente, objeto, data_publicacao, localidade, funcao, valor,
              coalesce(nullif(fonte_url, ''), '${PORTAL_EMENDA}' || codigo_emenda) AS url, fonte_id
         FROM emenda_convenio WHERE candidato_id = $1 ORDER BY valor DESC NULLS LAST`,
      [b.id],
    ),
    q(
      `SELECT id, id_plano_acao, codigo_plano_acao, codigo_emenda, ano, situacao, beneficiario, beneficiario_cnpj AS cnpj, municipio,
              valor_plano, custeio, investimento, areas, objeto, detalhamento, executores, finalidades, metas, empenhado,
              situacao_relatorio_gestao, tem_relatorio_gestao, tem_show_evento,
              coalesce(nullif(fonte_url, ''), '${PORTAL_EMENDA}' || codigo_emenda) AS url, fonte_id
         FROM emenda_pix WHERE candidato_id = $1 AND valido ORDER BY ano DESC, valor_plano DESC NULLS LAST`,
      [b.id],
    ),
    q(`SELECT id, ano, municipio, meta, descricao, valor, fonte_id FROM emenda_pix_show WHERE candidato_id = $1 ORDER BY valor DESC NULLS LAST`, [b.id]),
    q(`SELECT tipo_emenda AS valor, count(DISTINCT codigo_emenda)::int AS n, sum(empenhado) AS empenhado FROM emenda WHERE candidato_id = $1 GROUP BY 1 ORDER BY 3 DESC NULLS LAST`, [b.id]),
  ])
  return { por_ano: porAno, por_area: porArea, municipios, favorecidos, intermediarios, convenios, pix, shows, tipos }
})

const ORDEM_EMENDA = {
  empenhado: "empenhado DESC NULLS LAST, id",
  pago: "pago_total DESC NULLS LAST, id",
  ano: "ano DESC, empenhado DESC NULLS LAST, id",
  ano_asc: "ano ASC, empenhado DESC NULLS LAST, id",
}
export const emendasLista = secao(async (b, query) => {
  const { por, pagina, limite } = paginacao(query)
  const f = filtro([b.id])
  f.cond.push("candidato_id = $1")
  const ano = int(query.ano, { min: 1990, max: 2100 })
  if (ano) f.add("ano = $?", ano)
  const area = str(query.area)
  if (area) f.add("funcao = $?", area)
  const t = termo(query.q)
  if (t) f.add(`(${LIKE("localidade")} OR ${LIKE("acao")} OR ${LIKE("programa")} OR codigo_emenda LIKE '%' || $? || '%')`, t, t, t, t)
  const ordem = ORDEM_EMENDA[str(query.ordem)] ?? ORDEM_EMENDA.ano
  const [linhas, tot] = await Promise.all([
    q(
      `SELECT id, codigo_emenda, ano, tipo_emenda, numero_emenda, autor_nome, localidade, municipio, uf, funcao, subfuncao, programa, acao,
              empenhado, liquidado, pago, restos_pagar_pagos, pago_total,
              coalesce(nullif(fonte_url, ''), '${PORTAL_EMENDA}' || codigo_emenda) AS url, fonte_id
         FROM emenda ${f.where("WHERE")} ORDER BY ${ordem} ${limite}`,
      f.params,
    ),
    q1(`SELECT count(*)::int AS total, sum(empenhado) AS empenhado, sum(pago_total) AS pago_total FROM emenda ${f.where("WHERE")}`, f.params),
  ])
  return { linhas, total: tot.total, soma: { empenhado: tot.empenhado, pago_total: tot.pago_total }, pagina, por_pagina: por }
})

// ---------------------------------------------------------------- cota parlamentar

const AERONAVE = "(categoria ILIKE '%aeronave%' OR categoria ILIKE '%fretamento%' AND categoria ILIKE '%a_reo%')"
const DESTAQUES = {
  alimentacao: "categoria_grupo = 'alimentacao'",
  hospedagem: "categoria_grupo = 'hospedagem'",
  combustivel: "categoria_grupo = 'combustivel'",
  aeronave: AERONAVE,
  locomocao: "categoria_grupo = 'locomocao_hospedagem_alimentacao_combustivel'",
}
const COLS_NOTA = `id, casa, ano, mes, data_documento, categoria, categoria_grupo, especificacao, fornecedor,
  CASE WHEN fornecedor_pf THEN NULL ELSE fornecedor_cnpj END AS cnpj, fornecedor_pf AS pf, numero_documento,
  valor_documento, valor_glosa, valor_liquido, passageiro, trecho, detalhamento, processo, nullif(url_documento, '') AS url_documento, fonte_id`

export const cota = secao(async (b) => {
  const destaquesSql = Object.entries(DESTAQUES).map(
    ([k, cond]) => `(SELECT '${k}' AS destaque, ${COLS_NOTA} FROM cota_despesa WHERE candidato_id = $1 AND ${cond} ORDER BY valor_liquido DESC NULLS LAST LIMIT 6)`,
  )
  const [porAno, porCategoria, fornecedores, destaques, totais, meses] = await Promise.all([
    q(`SELECT casa, ano, count(*)::int AS n, sum(valor_liquido) AS total FROM cota_despesa WHERE candidato_id = $1 GROUP BY 1, 2 ORDER BY 2, 1`, [b.id]),
    q(
      `SELECT casa, categoria_grupo AS grupo, categoria, n_notas::int AS n, total, ano_min, ano_max FROM v_cota_por_categoria
        WHERE candidato_id = $1 ORDER BY total DESC NULLS LAST`,
      [b.id],
    ),
    q(
      `SELECT casa, fornecedor AS nome, CASE WHEN fornecedor_pf THEN NULL ELSE fornecedor_cnpj END AS cnpj, fornecedor_pf AS pf,
              n_notas::int AS n, total, grupos FROM v_cota_fornecedor WHERE candidato_id = $1 ORDER BY total DESC NULLS LAST LIMIT 15`,
      [b.id],
    ),
    q(destaquesSql.join(" UNION ALL "), [b.id]),
    q(
      `SELECT count(*)::int AS n, sum(valor_liquido) AS total, count(*) FILTER (WHERE nullif(url_documento, '') IS NOT NULL)::int AS n_com_link,
              sum(valor_liquido) FILTER (WHERE ${AERONAVE}) AS aeronave,
              min(ano) AS ano_min, max(ano) AS ano_max FROM cota_despesa WHERE candidato_id = $1`,
      [b.id],
    ),
    q(`SELECT DISTINCT mes AS valor FROM cota_despesa WHERE candidato_id = $1 AND mes IS NOT NULL ORDER BY 1`, [b.id]),
  ])
  return { por_ano: porAno, por_categoria: porCategoria, fornecedores, destaques, totais: totais[0], meses: meses.map((m) => m.valor) }
})

const ORDEM_NOTA = {
  valor: "valor_liquido DESC NULLS LAST, id",
  valor_asc: "valor_liquido ASC NULLS LAST, id",
  data: "coalesce(data_documento, make_date(ano, coalesce(mes, 1), 1)) DESC, id DESC",
  data_asc: "coalesce(data_documento, make_date(ano, coalesce(mes, 1), 1)) ASC, id",
  fornecedor: "fornecedor ASC, id",
}
export const cotaNotas = secao(async (b, query) => {
  const { por, pagina, limite } = paginacao(query)
  const f = filtro([b.id])
  f.cond.push("candidato_id = $1")
  const casa = str(query.casa, 10)
  if (["camara", "senado", "alba"].includes(casa)) f.add("casa = $?", casa)
  const ano = int(query.ano, { min: 1990, max: 2100 })
  if (ano) f.add("ano = $?", ano)
  const mes = int(query.mes, { min: 1, max: 12 })
  if (mes) f.add("mes = $?", mes)
  const t = termo(query.q)
  if (t) {
    f.add(
      `(${LIKE("fornecedor")} OR ${LIKE("categoria")} OR ${LIKE("especificacao")} OR ${LIKE("detalhamento")} OR ${LIKE("trecho")}
        OR ${LIKE("passageiro")} OR fornecedor_cnpj LIKE '%' || $? || '%' OR numero_documento = $?)`,
      t, t, t, t, t, t, t.replace(/\D/g, "") || "#", t,
    )
  }
  const grupo = str(query.grupo, 60)
  const semGrupo = { where: f.where("WHERE"), params: [...f.params] }
  if (grupo === "aeronave") f.cond.push(AERONAVE)
  else if (grupo) f.add("categoria_grupo = $?", grupo)
  const ordem = ORDEM_NOTA[str(query.ordem)] ?? ORDEM_NOTA.valor
  const [linhas, tot, facetas] = await Promise.all([
    q(`SELECT ${COLS_NOTA} FROM cota_despesa ${f.where("WHERE")} ORDER BY ${ordem} ${limite}`, f.params),
    q1(`SELECT count(*)::int AS total, sum(valor_liquido) AS soma FROM cota_despesa ${f.where("WHERE")}`, f.params),
    q(`SELECT categoria_grupo AS valor, count(*)::int AS n, sum(valor_liquido) AS soma FROM cota_despesa ${semGrupo.where} GROUP BY 1 ORDER BY 3 DESC NULLS LAST`, semGrupo.params),
  ])
  return { linhas, total: tot.total, soma: tot.soma, pagina, por_pagina: por, facetas: { grupo: facetas } }
})

// ---------------------------------------------------------------- sanções

export const atencao = secao(async (b) => {
  const sancoes = await q(
    `SELECT id, cadastro, descricao, orgao, data_inicio, data_fim, fonte_url, fonte_id FROM sancao WHERE candidato_id = $1 ORDER BY data_inicio DESC NULLS LAST`,
    [b.id],
  )
  return { sancoes }
})

// ---------------------------------------------------------------- trajetória

export const trajetoria = secao(async (b) => {
  const [eventos, mudancas, municipios, totais] = await Promise.all([
    q(
      `SELECT id, origem, tipo_evento, ano_inicio, ano_fim, cargo, partido, uf, numero, resultado, eleito, votos, observacoes, fonte_url, fonte_id
         FROM trajetoria WHERE candidato_id = $1 ORDER BY ano_inicio NULLS LAST, ano_fim NULLS LAST, id`,
      [b.id],
    ),
    q(`SELECT id, partido_anterior, partido_novo, data_mudanca, ano, contexto, fonte_url, fonte_id FROM mudanca_partido WHERE candidato_id = $1 ORDER BY ano, data_mudanca`, [b.id]),
    q(
      `SELECT v.cd_municipio, coalesce(m.nome, v.municipio) AS municipio, v.votos, v.cargo, m.eleitores_2026, v.fonte_id
         FROM votos_municipio_2022 v LEFT JOIN municipio m ON m.cd_municipio_tse = v.cd_municipio
        WHERE v.candidato_id = $1 AND v.turno = 1 ORDER BY v.votos DESC LIMIT 25`,
      [b.id],
    ),
    q1(
      `SELECT sum(votos) AS votos, count(*)::int AS n_municipios, max(cargo) AS cargo, min(fonte_id) AS fonte_id,
              (SELECT sum(votos) FROM votos_municipio_2022 WHERE candidato_id = $1 AND turno = 2) AS votos_2t
         FROM votos_municipio_2022 WHERE candidato_id = $1 AND turno = 1`,
      [b.id],
    ),
  ])
  return { eventos, mudancas, votos_2022: { municipios, ...totais } }
})

// ---------------------------------------------------------------- fontes usadas

export const fontesUsadas = secao(async (b) => {
  const tabelas = [
    ["candidato", "Identificação e registro"], ["chapa_membro", "Chapa"], ["candidato_rede_social", "Redes sociais"],
    ["patrimonio", "Patrimônio (totais)"], ["bem", "Patrimônio (bens)"], ["campanha_resumo", "Campanha (totais)"],
    ["campanha_doador", "Campanha (doadores)"], ["campanha_despesa", "Campanha (despesas)"], ["campanha_despesa_categoria", "Campanha (categorias)"],
    ["trajetoria", "Trajetória"], ["mudanca_partido", "Trocas de partido"], ["votos_municipio_2022", "Votos por município 2022"],
    ["sancao", "Sanções"], ["proposicao", "Proposições"],
    ["emenda", "Emendas"], ["emenda_favorecido", "Emendas (favorecidos)"], ["emenda_convenio", "Emendas (convênios)"],
    ["emenda_pix", "Emendas Pix (planos de ação)"], ["emenda_pix_show", "Emendas Pix (shows)"], ["cota_despesa", "Cota parlamentar"],
    ["candidatura_snapshot", "Situação em 21/08/2026"],
  ]
  const partes = tabelas.map(([t, uso]) =>
    t === "candidato"
      ? `SELECT '${uso}' AS uso, fonte_id, 1 AS n FROM candidato WHERE id = $1 AND fonte_id IS NOT NULL`
      : `SELECT '${uso}' AS uso, fonte_id, count(*)::int AS n FROM ${t} WHERE candidato_id = $1 AND fonte_id IS NOT NULL GROUP BY fonte_id`,
  )
  partes.push(`SELECT 'Votações', vo.fonte_id, count(*)::int FROM voto v JOIN votacao vo ON vo.id = v.votacao_id WHERE v.candidato_id = $1 AND vo.fonte_id IS NOT NULL GROUP BY vo.fonte_id`)
  const rows = await q(
    `SELECT u.uso, u.n, f.id, f.chave, f.nome, f.url, f.coletado_em, f.licenca, f.descricao
       FROM (${partes.join(" UNION ALL ")}) u JOIN fonte f ON f.id = u.fonte_id ORDER BY f.nome, u.uso`,
    [b.id],
  )
  // agrupa por fonte
  const porFonte = new Map()
  for (const r of rows) {
    const e = porFonte.get(r.id) ?? { id: r.id, chave: r.chave, nome: r.nome, url: r.url, coletado_em: r.coletado_em, licenca: r.licenca, descricao: r.descricao, usos: [] }
    e.usos.push({ uso: r.uso, n: r.n })
    porFonte.set(r.id, e)
  }
  return { fontes: [...porFonte.values()] }
})
