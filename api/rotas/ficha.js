// Ficha por slug: cabeçalho + resumo. As seções (GET /api/candidatos/:slug/<secao>, rotas/secoes.js)
// reaproveitam `carregarBase`.
import { q, q1 } from "../db.js"
import { CARGOS, fontes, grupoSituacao, chavesMetricas, normalizarRede, chaveUrl } from "../dominio.js"
import { chapasDe } from "./candidatos.js"

const COLS_CANDIDATO = `
  k.id, k.slug, k.nome_urna, k.nome_completo, k.nome_social, k.cargo, k.cargo_tse, k.ordem_suplencia, k.uf,
  k.partido, k.partido_nome, k.numero, k.federacao, k.coligacao, k.composicao_coligacao,
  k.situacao, k.situacao_data, k.genero, k.cor_raca, k.data_nascimento,
  CASE WHEN k.data_nascimento IS NOT NULL THEN extract(year FROM age(current_date, k.data_nascimento))::int ELSE k.idade END AS idade,
  k.uf_nascimento, k.municipio_nascimento, k.naturalidade, k.ocupacao, k.grau_instrucao, k.estado_civil,
  k.foto_url, k.foto_credito, k.foto_fonte_url, k.bio, k.bio_fonte_id, k.site_campanha, k.sq_candidato_2026,
  k.id_camara, k.id_senado, k.id_alba, k.mandato_atual, k.mandato_atual_descricao, k.municipio_base, k.cd_municipio_base,
  k.titular_id, k.fonte_id`

const COLS_RESUMO = `
  r.patrimonio_2026, r.patrimonio_2022, r.patrimonio_2018, r.declarou_sem_bens_2026, r.patrimonio_ano_anterior,
  r.patrimonio_anterior, r.variacao_patrimonio_pct, r.faixa_patrimonio,
  r.arrecadado_2026, r.fundo_eleitoral_2026, r.fundo_partidario_2026, r.pessoas_fisicas_2026, r.recursos_proprios_2026,
  r.despesas_contratadas_2026, r.despesas_pagas_2026, r.n_doadores_2026, r.n_fornecedores_2026,
  r.n_emendas, r.emendas_empenhado, r.emendas_pago, r.emendas_pago_total, r.emendas_empenhado_2023_2026, r.emendas_ano_min, r.emendas_ano_max,
  r.n_planos_pix, r.pix_valor,
  r.cota_total, r.cota_total_2023_2026, r.cota_casas, r.cota_ano_min, r.cota_ano_max,
  r.n_votos, r.n_votacoes_chave, r.pct_alinhamento_governo, r.n_votos_com_orientacao_governo,
  r.n_proposicoes, r.n_proposicoes_principais, r.n_processos, r.n_processos_criminais, r.n_sancoes,
  r.n_pontos_atencao, r.tem_patrimonio, r.tem_campanha_2026, r.tem_emendas,
  r.tem_cota, r.tem_votos, r.tem_proposicoes, r.tem_mandato_atual`

/** Linha base do candidato (candidato + resumo). Retorna null se o slug não existe. */
export async function carregarBase(slug) {
  return q1(
    `SELECT ${COLS_CANDIDATO}, ${COLS_RESUMO}
       FROM candidato k JOIN candidato_resumo r ON r.id = k.id
      WHERE k.slug = $1 AND k.cargo = ANY($2)`,
    [String(slug).slice(0, 120), CARGOS],
  )
}

/** O TSE publica redes em caixa alta e às vezes com espaços ("HTTPS://WWW.FACEBOOK.COM/ FULANO", "WWW.SITE.COM.BR").
 *  Devolve uma URL http(s) utilizável ou null (arrobas soltas, sem plataforma, são descartadas). */
export function limparUrlRede(bruta) {
  if (!bruta) return null
  let u = String(bruta).trim().replace(/\s+/g, "")
  if (u === u.toUpperCase()) u = u.toLowerCase() // tudo em caixa alta: a grafia original já se perdeu
  if (/^www\.[^/]+\.[a-z]{2,}/i.test(u)) u = `https://${u}`
  if (!/^https?:\/\/[^/]+\.[a-z]{2,}/i.test(u)) return null
  return u.replace(/^HTTPS?:\/\//i, (m) => m.toLowerCase())
}

export async function ficha(req, res) {
  const base = await carregarBase(req.params.slug)
  if (!base) return res.status(404).json({ erro: "candidato não encontrado", slug: req.params.slug })

  const [chapas, redesBrutas, titular, extras] = await Promise.all([
    chapasDe([base.id]),
    q("SELECT plataforma, url, fonte_id FROM candidato_rede_social WHERE candidato_id = $1 ORDER BY id", [base.id]),
    base.titular_id
      ? q1(`SELECT slug, nome_urna, cargo, partido, numero, foto_url, situacao FROM candidato WHERE id = $1 AND cargo = ANY($2)`, [base.titular_id, CARGOS])
      : null,
    q1(
      `SELECT (SELECT count(*) FROM trajetoria WHERE candidato_id = $1)::int AS n_trajetoria,
              (SELECT count(*) FROM mudanca_partido WHERE candidato_id = $1)::int AS n_mudancas_partido,
              (SELECT count(*) FROM bem WHERE candidato_id = $1 AND ano_eleicao = 2026)::int AS n_bens_2026,
              (SELECT count(*) FROM patrimonio WHERE candidato_id = $1)::int AS n_declaracoes_patrimonio,
              (SELECT count(*) FROM campanha_resumo WHERE candidato_id = $1)::int AS n_prestacoes,
              (SELECT count(*) FROM votos_municipio_2022 WHERE candidato_id = $1)::int AS n_votos_municipio,
              (SELECT count(*) FROM cota_despesa WHERE candidato_id = $1)::int AS n_notas_cota`,
      [base.id],
    ),
  ])

  // companheiros de chapa de um vice/suplente (a chapa do titular)
  let chapa = chapas[base.id] ?? []
  if (base.titular_id) {
    const doTitular = await chapasDe([base.titular_id])
    chapa = (doTitular[base.titular_id] ?? []).filter((m) => m.slug !== base.slug)
  }

  // redes: normaliza plataforma e deduplica por URL; inclui o site de campanha
  const vistos = new Set()
  const redes = []
  const pushRede = (plataforma, bruta, fonte_id) => {
    const url = limparUrlRede(bruta)
    if (!url) return
    const k = chaveUrl(url)
    if (vistos.has(k)) return
    vistos.add(k)
    redes.push({ plataforma: normalizarRede(plataforma, url), url, fonte_id })
  }
  if (base.site_campanha) pushRede("site", base.site_campanha, null)
  for (const r of redesBrutas) pushRede(r.plataforma, r.url, r.fonte_id)

  const { porChave, porId } = await fontes()
  const casa = base.cota_casas?.split(",")[0] ?? null
  const chaves = chavesMetricas(casa)
  const fontesUsadas = {}
  for (const [campo, chave] of Object.entries(chaves)) if (chave && porChave[chave]) fontesUsadas[campo] = porChave[chave]
  if (base.fonte_id && porId[base.fonte_id]) fontesUsadas.identificacao = porId[base.fonte_id]
  if (base.bio_fonte_id && porId[base.bio_fonte_id]) fontesUsadas.bio = porId[base.bio_fonte_id]
  for (const r of redes) if (r.fonte_id && porId[r.fonte_id]) fontesUsadas.redes ??= porId[r.fonte_id]
  // foto: se veio do pacote do TSE, a fonte é o TSE; senão, crédito/URL da própria foto
  if (!base.foto_url?.startsWith("/fotos/tse/")) delete fontesUsadas.foto
  delete fontesUsadas.cota_camara
  delete fontesUsadas.cota_senado
  delete fontesUsadas.cota_alba
  if (!base.municipio_base) delete fontesUsadas.municipio_base

  const { id, titular_id, fonte_id, bio_fonte_id, ...publico } = base
  res.json({
    ficha: { ...publico, situacao_grupo: grupoSituacao(base.situacao), ...extras },
    chapa,
    titular,
    redes: redes.map(({ fonte_id: _f, ...r }) => r),
    fontes: fontesUsadas,
  })
}
