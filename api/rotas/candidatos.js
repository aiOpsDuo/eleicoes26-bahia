// Lista paginada, filtros disponíveis e busca global — tudo sobre candidato_resumo.
import { q } from "../db.js"
import {
  CARGOS, GRUPOS, SITUACOES, SITUACAO_PADRAO, SITUACAO_ROTULOS, FAIXAS, ORDENS,
  grupoSituacao, chavesMetricas, resolverFontes,
} from "../dominio.js"

// colunas enviadas para cards/linhas (id interno não sai; a chave pública é o slug)
export const COLS_ITEM = `
  id, slug, nome_urna, nome_completo, cargo, partido, numero, federacao, coligacao, situacao, genero, cor_raca, idade,
  ocupacao, grau_instrucao, foto_url, municipio_base, cd_municipio_base, mandato_atual, tem_mandato_atual,
  patrimonio_2026, declarou_sem_bens_2026, patrimonio_ano_anterior, patrimonio_anterior, variacao_patrimonio_pct,
  arrecadado_2026, emendas_empenhado, emendas_pago_total, emendas_ano_min, emendas_ano_max, n_emendas,
  cota_total, cota_total_2023_2026, cota_casas, cota_ano_min, cota_ano_max,
  n_pontos_atencao, n_processos`

export function limparItem(r) {
  const { id, total, ...resto } = r
  return { ...resto, situacao_grupo: grupoSituacao(r.situacao) }
}

/** Resolve os cargos a partir de ?grupo= ou ?cargo= (lista separada por vírgula). */
export function cargosDe(query) {
  if (query.grupo && GRUPOS[query.grupo]) return GRUPOS[query.grupo].cargos
  if (query.cargo) {
    const cs = String(query.cargo).split(",").map((s) => s.trim()).filter((c) => CARGOS.includes(c))
    if (cs.length) return cs
  }
  return null
}

function str(v, max = 80) {
  if (v == null) return null
  const s = String(Array.isArray(v) ? v[0] : v).trim()
  return s ? s.slice(0, max) : null
}

/** Monta WHERE parametrizado. `ignorar` permite contar facetas sem o próprio filtro. */
function montarFiltro(query, cargos, ignorar = null) {
  const cond = ["cargo = ANY($1)"]
  const params = [cargos]
  const add = (sqlComParam, valor) => {
    params.push(valor)
    cond.push(sqlComParam.replaceAll("$?", `$${params.length}`))
  }
  const qtxt = str(query.q)
  if (qtxt && ignorar !== "q") {
    if (/^\d{2,6}$/.test(qtxt)) add("(numero = $? OR busca LIKE '%' || f_normaliza($?) || '%')", qtxt)
    else add("(busca LIKE '%' || replace(replace(replace(f_normaliza($?), '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' OR f_normaliza($?) <% busca)", qtxt)
  }
  const partido = str(query.partido, 20)
  if (partido && ignorar !== "partido") add("partido = $?", partido)
  const situacao = str(query.situacao, 60) || SITUACAO_PADRAO
  if (situacao !== "todas" && ignorar !== "situacao") {
    add("situacao = ANY($?)", SITUACOES[situacao] ?? [situacao])
  }
  const mandato = str(query.mandato, 5)
  if ((mandato === "sim" || mandato === "nao") && ignorar !== "mandato") add("tem_mandato_atual = $?", mandato === "sim")
  const genero = str(query.genero, 20)
  if (genero && ignorar !== "genero") add("genero = $?", genero)
  const cor = str(query.cor_raca, 20)
  if (cor && ignorar !== "cor_raca") add("cor_raca = $?", cor)
  const faixa = str(query.faixa_patrimonio, 20)
  if (faixa && FAIXAS.includes(faixa) && ignorar !== "faixa_patrimonio") add("faixa_patrimonio = $?", faixa)
  const mun = str(query.municipio, 10)
  if (mun && /^\d+$/.test(mun) && ignorar !== "municipio") add("cd_municipio_base = $?", Number(mun))
  return { where: cond.join(" AND "), params }
}

/** Chapa (vice/suplentes) de vários titulares, numa consulta. */
export async function chapasDe(ids) {
  if (!ids.length) return {}
  const rows = await q(
    `SELECT c.candidato_id, c.papel, c.nome_urna, c.partido, m.slug AS membro_slug, m.foto_url AS membro_foto_url
       FROM chapa_membro c LEFT JOIN candidato m ON m.id = c.membro_id
      WHERE c.candidato_id = ANY($1) ORDER BY c.papel`,
    [ids],
  )
  const out = {}
  for (const r of rows) (out[r.candidato_id] ??= []).push({
    papel: r.papel, nome_urna: r.nome_urna, partido: r.partido, slug: r.membro_slug, foto_url: r.membro_foto_url,
  })
  return out
}

export async function listar(req, res) {
  const cargos = cargosDe(req.query)
  if (!cargos) return res.status(400).json({ erro: "informe ?grupo= (senado, deputado-federal, deputado-estadual, parlamentar) ou ?cargo=" })
  const porPagina = Math.min(100, Math.max(1, parseInt(req.query.por_pagina, 10) || 24))
  const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1)
  const ordemKey = ORDENS[req.query.ordem] ? req.query.ordem : "nome"
  const { where, params } = montarFiltro(req.query, cargos)
  params.push(porPagina, (pagina - 1) * porPagina)
  const rows = await q(
    `SELECT ${COLS_ITEM}, count(*) OVER () AS total
       FROM candidato_resumo WHERE ${where}
      ORDER BY ${ORDENS[ordemKey]}
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )
  const total = rows[0]?.total ?? 0
  const temChapa = cargos.includes("senador")
  const chapas = temChapa ? await chapasDe(rows.map((r) => r.id)) : {}
  const itens = rows.map((r) => ({ ...limparItem(r), chapa: chapas[r.id] ?? [] }))
  const casa = cargos.includes("deputado_estadual") && cargos.length === 1 ? "alba" : cargos.includes("senador") && cargos.length === 1 ? "senado" : "camara"
  res.json({
    cargos,
    total,
    pagina,
    por_pagina: porPagina,
    paginas: Math.max(1, Math.ceil(total / porPagina)),
    ordem: ordemKey,
    itens,
    fontes: await resolverFontes(chavesMetricas(casa)),
  })
}

export const ROTULO_FAIXA = {
  sem_informacao: "Sem informação", zero: "Declarou não ter bens", ate_100mil: "Até R$ 100 mil",
  "100mil_1mi": "R$ 100 mil a 1 mi", "1mi_5mi": "R$ 1 mi a 5 mi", acima_5mi: "Acima de R$ 5 mi",
}

/** Valores disponíveis para cada filtro, com contagem (facetas: cada uma ignora o próprio filtro). */
export async function filtros(req, res) {
  const cargos = cargosDe(req.query)
  if (!cargos) return res.status(400).json({ erro: "informe ?grupo= ou ?cargo=" })
  const faceta = async (col, ignorar, extra = "") => {
    const { where, params } = montarFiltro(req.query, cargos, ignorar)
    return q(`SELECT ${col} AS valor, count(*)::int AS n FROM candidato_resumo WHERE ${where} ${extra} GROUP BY 1 ORDER BY 2 DESC, 1`, params)
  }
  const [partidos, generos, cores, faixas, mandato, municipios, situacoesBrutas] = await Promise.all([
    faceta("partido", "partido"),
    faceta("genero", "genero"),
    faceta("cor_raca", "cor_raca"),
    faceta("faixa_patrimonio", "faixa_patrimonio"),
    faceta("tem_mandato_atual", "mandato"),
    (async () => {
      const { where, params } = montarFiltro(req.query, cargos, "municipio")
      return q(
        `SELECT cd_municipio_base AS valor, municipio_base AS rotulo, count(*)::int AS n FROM candidato_resumo
          WHERE ${where} AND cd_municipio_base IS NOT NULL GROUP BY 1, 2 ORDER BY 2`, params)
    })(),
    faceta("situacao", "situacao"),
  ])
  const porSituacao = Object.fromEntries(situacoesBrutas.map((r) => [r.valor, r.n]))
  const soma = (lista) => lista.reduce((s, v) => s + (porSituacao[v] ?? 0), 0)
  const situacoes = ["na_disputa", "deferida", "em_julgamento", "indeferida", "renuncia"].map((valor) => ({
    valor, rotulo: SITUACAO_ROTULOS[valor], n: soma(SITUACOES[valor]),
  }))
  situacoes.push({ valor: "todas", rotulo: "Todas", n: situacoesBrutas.reduce((s, r) => s + r.n, 0) })
  const ordemFaixa = (v) => FAIXAS.indexOf(v)
  res.json({
    cargos,
    partidos: partidos.filter((p) => p.valor),
    situacoes,
    generos: generos.filter((g) => g.valor),
    cores_raca: cores.filter((c) => c.valor),
    faixas_patrimonio: faixas.sort((a, b) => ordemFaixa(a.valor) - ordemFaixa(b.valor)).map((f) => ({ ...f, rotulo: ROTULO_FAIXA[f.valor] })),
    mandato: {
      sim: mandato.find((m) => m.valor === true)?.n ?? 0,
      nao: mandato.find((m) => m.valor === false)?.n ?? 0,
    },
    municipios: municipios.map((m) => ({ valor: String(m.valor), rotulo: m.rotulo, n: m.n })),
  })
}

// colunas devolvidas pela busca global (também usadas pelo índice da versão estática)
export const COLS_BUSCA = "slug, nome_urna, nome_completo, cargo, partido, numero, foto_url, situacao, municipio_base, tem_mandato_atual"

/** Busca global rápida por nome (sem acento, aproximada). */
export async function busca(req, res) {
  const texto = str(req.query.q, 80)
  if (!texto || texto.length < 2) return res.json({ q: texto ?? "", itens: [] })
  const limite = Math.min(20, Math.max(1, parseInt(req.query.limite, 10) || 8))
  const rows = await q(
    `WITH n AS (SELECT f_normaliza($1) AS t,
                       replace(replace(replace(f_normaliza($1), '\\', '\\\\'), '%', '\\%'), '_', '\\_') AS tl)
     SELECT ${COLS_BUSCA}
       FROM candidato_resumo, n
      WHERE (busca LIKE '%' || n.tl || '%' OR n.t <% busca OR numero = $1) AND cargo = ANY($3)
      ORDER BY (f_normaliza(nome_urna) = n.t) DESC,
               (f_normaliza(nome_urna) LIKE n.tl || '%') DESC,
               (' ' || f_normaliza(nome_urna) LIKE '% ' || n.tl || '%') DESC,
               (busca LIKE '%' || n.tl || '%') DESC,
               array_position(ARRAY['senador','deputado_federal','deputado_estadual','suplente'], cargo),
               tem_mandato_atual DESC,
               word_similarity(n.t, busca) DESC,
               nome_urna
      LIMIT $2`,
    [texto, limite, CARGOS],
  )
  res.json({ q: texto, itens: rows.map((r) => ({ ...r, situacao_grupo: grupoSituacao(r.situacao) })) })
}
