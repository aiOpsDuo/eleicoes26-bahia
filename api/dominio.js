// Vocabulário compartilhado da API: grupos (telas), situações, faixas, fontes das métricas.
import { q } from "./db.js"

// Cargos no escopo do site: Senado (senador e suplentes), Deputado Federal e Deputado Estadual (BA 2026).
export const CARGOS = ["senador", "suplente", "deputado_federal", "deputado_estadual"]

// grupo = tela da lista (slug de URL no front)
export const GRUPOS = {
  senado: { cargos: ["senador"], rotulo: "Senado" },
  "deputado-federal": { cargos: ["deputado_federal"], rotulo: "Deputado federal" },
  "deputado-estadual": { cargos: ["deputado_estadual"], rotulo: "Deputado estadual" },
  parlamentar: { cargos: ["senador", "deputado_federal", "deputado_estadual"], rotulo: "Parlamentar" },
}

// situação do registro agrupada em segmentos (valores do banco em minúsculas)
export const SITUACOES = {
  deferida: ["deferido", "deferido em prazo recursal ou com recurso"],
  em_julgamento: ["aguardando julgamento", "pendente de julgamento", "indeferido em prazo recursal ou com recurso"],
  indeferida: ["indeferido", "pedido não conhecido"],
  renuncia: ["renúncia"],
}
SITUACOES.na_disputa = [...SITUACOES.deferida, ...SITUACOES.em_julgamento]
export const SITUACAO_PADRAO = "na_disputa"
export const SITUACAO_ROTULOS = {
  na_disputa: "Na disputa",
  deferida: "Deferidas",
  em_julgamento: "Em julgamento",
  indeferida: "Indeferidas",
  renuncia: "Renúncias",
  todas: "Todas",
}

export function grupoSituacao(situacao) {
  for (const g of ["deferida", "em_julgamento", "indeferida", "renuncia"]) {
    if (SITUACOES[g].includes(situacao)) return g
  }
  return null
}

export const FAIXAS = ["sem_informacao", "zero", "ate_100mil", "100mil_1mi", "1mi_5mi", "acima_5mi"]

// ordenações permitidas -> expressão SQL (whitelist; nunca interpolar entrada do usuário)
export const ORDENS = {
  nome: "nome_urna ASC",
  patrimonio: "patrimonio_2026 DESC NULLS LAST, nome_urna ASC",
  emendas: "emendas_empenhado DESC NULLS LAST, nome_urna ASC",
  cota: "cota_total_2023_2026 DESC NULLS LAST, nome_urna ASC",
  arrecadacao: "arrecadado_2026 DESC NULLS LAST, nome_urna ASC",
  idade: "idade DESC NULLS LAST, nome_urna ASC",
  numero: "numero ASC NULLS LAST, nome_urna ASC",
}

// ---- fontes (tabela pequena: cache em memória, recarregado a cada 10 min)
let cacheFontes = null
let cacheEm = 0
export async function fontes() {
  if (!cacheFontes || Date.now() - cacheEm > 600_000) {
    const rows = await q("SELECT id, chave, nome, url, coletado_em, descricao, licenca FROM fonte ORDER BY id")
    cacheFontes = { lista: rows, porChave: Object.fromEntries(rows.map((r) => [r.chave, r])), porId: Object.fromEntries(rows.map((r) => [r.id, r])) }
    cacheEm = Date.now()
  }
  return cacheFontes
}

// chave da fonte de cada métrica (a cota depende da casa: Câmara, Senado ou ALBA)
export function chavesMetricas(cotaCasa = null) {
  return {
    identificacao: "tse_cand_2026",
    situacao: "tse_cand_compl_2026",
    patrimonio: "tse_bens_2026",
    arrecadacao: "tse_prestacao_2026",
    emendas: "portal_emendas",
    cota: cotaCasa === "senado" ? "senado_ceaps" : cotaCasa === "alba" ? "alba_verba" : cotaCasa === "camara" ? "camara_ceap" : null,
    cota_camara: "camara_ceap",
    cota_senado: "senado_ceaps",
    cota_alba: "alba_verba",
    foto: "tse_fotos_2026",
    municipio_base: "tse_votacao_2022",
  }
}

export async function resolverFontes(mapa) {
  const { porChave } = await fontes()
  const out = {}
  for (const [k, chave] of Object.entries(mapa)) if (chave && porChave[chave]) out[k] = porChave[chave]
  return out
}

// ---- redes sociais: normaliza plataforma pelo domínio e deduplica
const DOMINIOS = [
  [/instagram\.com/i, "instagram"], [/facebook\.com|fb\.com/i, "facebook"], [/youtube\.com|youtu\.be/i, "youtube"],
  [/tiktok\.com/i, "tiktok"], [/(^|\.)x\.com|twitter\.com/i, "x"], [/kwai/i, "kwai"], [/threads\.(net|com)/i, "threads"],
  [/linkedin\.com/i, "linkedin"], [/t\.me|telegram/i, "telegram"], [/wa\.me|whatsapp/i, "whatsapp"], [/flickr\.com/i, "flickr"],
  [/wikipedia\.org/i, "wikipedia"],
]
export function normalizarRede(plataforma, url) {
  for (const [re, nome] of DOMINIOS) if (re.test(url)) return nome
  const p = (plataforma || "").toLowerCase()
  if (p.startsWith("site") || p === "canal_tse") return "site"
  return p || "site"
}
export function chaveUrl(url) {
  return url.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#]+$/, "")
}
