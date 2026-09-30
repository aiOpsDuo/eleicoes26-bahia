// Tela inicial: contagens por grupo, prévia do Senado (com chapa) e destaques do banco.
import { q, q1 } from "../db.js"
import { CARGOS, SITUACOES, fontes, resolverFontes, chavesMetricas } from "../dominio.js"
import { COLS_ITEM, limparItem, chapasDe } from "./candidatos.js"

const NA_DISPUTA = SITUACOES.na_disputa

async function previa(cargo) {
  const rows = await q(
    `SELECT ${COLS_ITEM} FROM candidato_resumo WHERE cargo = $1 AND situacao = ANY($2) ORDER BY nome_urna`,
    [cargo, NA_DISPUTA],
  )
  const chapas = await chapasDe(rows.map((r) => r.id))
  return rows.map((r) => ({ ...limparItem(r), chapa: chapas[r.id] ?? [] }))
}

// ranking: `valor` = coluna whitelisted; filtros fixos (sem entrada do usuário)
async function ranking(valor, extra = "", limite = 6) {
  const rows = await q(
    `SELECT slug, nome_urna, cargo, partido, numero, foto_url, situacao, cota_casas, emendas_ano_min, emendas_ano_max,
            cota_ano_min, cota_ano_max, ${valor} AS valor
       FROM candidato_resumo
      WHERE uf = 'BA' AND situacao = ANY($1) AND cargo = ANY($3) AND ${valor} IS NOT NULL AND ${valor} > 0 ${extra}
      ORDER BY ${valor} DESC LIMIT $2`,
    [NA_DISPUTA, limite, CARGOS],
  )
  return rows
}

export async function inicio(_req, res) {
  const [calendario, porCargo, totais, senado, rPat, rEmendas, rCota, rAlba, rArrec] = await Promise.all([
    q(`SELECT dt_inicio AS data, marco, fonte_id FROM calendario_eleitoral WHERE destaque ORDER BY dt_inicio`),
    q(`SELECT cargo, count(*)::int AS total,
              count(*) FILTER (WHERE situacao = ANY($1))::int AS na_disputa,
              count(*) FILTER (WHERE tem_mandato_atual)::int AS com_mandato,
              count(*) FILTER (WHERE genero = 'feminino' AND situacao = ANY($1))::int AS mulheres,
              count(DISTINCT partido) FILTER (WHERE situacao = ANY($1))::int AS partidos
         FROM candidato_resumo WHERE cargo = ANY($2) GROUP BY cargo`, [NA_DISPUTA, CARGOS]),
    q1(`SELECT count(*)::int AS candidatos,
               count(*) FILTER (WHERE uf = 'BA')::int AS candidatos_ba,
               count(*) FILTER (WHERE situacao = ANY($1))::int AS na_disputa,
               sum(patrimonio_2026) FILTER (WHERE uf = 'BA')::numeric AS patrimonio_ba_2026,
               sum(arrecadado_2026) FILTER (WHERE uf = 'BA')::numeric AS arrecadado_ba_2026,
               sum(emendas_empenhado)::numeric AS emendas_empenhado,
               count(*) FILTER (WHERE tem_mandato_atual)::int AS com_mandato
          FROM candidato_resumo WHERE cargo = ANY($2)`, [NA_DISPUTA, CARGOS]),
    previa("senador"),
    ranking("patrimonio_2026"),
    ranking("emendas_empenhado"),
    ranking("cota_total_2023_2026", "AND cota_casas = 'camara'"),
    ranking("cota_total_2023_2026", "AND cota_casas = 'alba'"),
    ranking("arrecadado_2026"),
  ])
  const cargo = Object.fromEntries(porCargo.map((r) => [r.cargo, r]))
  const f = await resolverFontes({
    ...chavesMetricas(),
    mandato: "camara_deputados",
  })
  const { porChave } = await fontes()
  res.json({
    totais,
    calendario,
    por_cargo: cargo,
    grupos: {
      senado: { total: cargo.senador?.na_disputa ?? 0 },
      "deputado-federal": { total: cargo.deputado_federal?.na_disputa ?? 0 },
      "deputado-estadual": { total: cargo.deputado_estadual?.na_disputa ?? 0 },
    },
    previas: { senado },
    destaques: [
      { id: "patrimonio", titulo: "Maiores patrimônios declarados", descricao: "Soma dos bens declarados ao TSE em 2026. Candidatos da Bahia na disputa.", itens: rPat, fonte: porChave.tse_bens_2026, formato: "moeda" },
      { id: "emendas", titulo: "Mais emendas empenhadas", descricao: "Emendas individuais empenhadas no Orçamento federal, 2015–2026 (autores com código no Portal da Transparência).", itens: rEmendas, fonte: porChave.portal_emendas, formato: "moeda" },
      { id: "cota_camara", titulo: "Maiores gastos de cota (Câmara)", descricao: "Cota parlamentar (CEAP) de deputados federais, 2023–2026. Cada nota tem link na ficha.", itens: rCota, fonte: porChave.camara_ceap, formato: "moeda" },
      { id: "verba_alba", titulo: "Maior verba indenizatória (ALBA)", descricao: "Verba indenizatória de deputados estaduais, 2023–2026, com PDF da nota no portal da ALBA.", itens: rAlba, fonte: porChave.alba_verba, formato: "moeda" },
      { id: "arrecadacao", titulo: "Quem mais arrecadou em 2026", descricao: "Receitas de campanha declaradas até 29/09/2026 (prestação parcial).", itens: rArrec, fonte: porChave.tse_prestacao_2026, formato: "moeda" },
    ],
    fontes: f,
  })
}
