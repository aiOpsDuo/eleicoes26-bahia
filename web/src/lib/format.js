// Formatação pt-BR. Regra: null/undefined => "—" (ausência ≠ zero).

const nf = (opts) => new Intl.NumberFormat("pt-BR", opts)
const inteiro = nf({ maximumFractionDigits: 0 })
const brl = nf({ style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = nf({ style: "currency", currency: "BRL", maximumFractionDigits: 0 })
const dec1 = nf({ minimumFractionDigits: 0, maximumFractionDigits: 1 })

export const TRACO = "—"

export function vazio(v) {
  return v === null || v === undefined || (typeof v === "number" && Number.isNaN(v))
}

/** Inteiro com separador de milhar: 1.237 */
export function fmtInt(v) {
  return vazio(v) ? TRACO : inteiro.format(v)
}

/** Moeda completa: R$ 1.234.567,89 */
export function fmtBRL(v, { centavos = true } = {}) {
  if (vazio(v)) return TRACO
  return (centavos ? brl : brl0).format(v)
}

/** Moeda compacta: R$ 1,2 mi · R$ 350 mil · R$ 2,3 bi · R$ 820 */
export function fmtBRLCompacto(v) {
  if (vazio(v)) return TRACO
  const a = Math.abs(v)
  const s = v < 0 ? "−" : ""
  if (a >= 1e9) return `${s}R$ ${dec1.format(a / 1e9)} bi`
  if (a >= 1e6) return `${s}R$ ${dec1.format(a / 1e6)} mi`
  if (a >= 1e3) return `${s}R$ ${inteiro.format(Math.round(a / 1e3))} mil`
  return `${s}R$ ${inteiro.format(Math.round(a))}`
}

/** Número compacto sem moeda: 1,2 mi · 35 mil */
export function fmtCompacto(v) {
  if (vazio(v)) return TRACO
  const a = Math.abs(v)
  if (a >= 1e9) return `${dec1.format(v / 1e9)} bi`
  if (a >= 1e6) return `${dec1.format(v / 1e6)} mi`
  if (a >= 1e4) return `${inteiro.format(Math.round(v / 1e3))} mil`
  return inteiro.format(v)
}

/** Percentual: 12,5% (com sinal opcional) */
export function fmtPct(v, { sinal = false } = {}) {
  if (vazio(v)) return TRACO
  const t = `${dec1.format(Math.abs(v))}%`
  if (!sinal) return v < 0 ? `−${t}` : t
  return v > 0 ? `+${t}` : v < 0 ? `−${t}` : t
}

/** Data dd/mm/aaaa a partir de 'YYYY-MM-DD' (ou ISO), sem conversão de fuso. */
export function fmtData(v) {
  if (!v) return TRACO
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return String(v)
  return `${m[3]}/${m[2]}/${m[1]}`
}

/** mm/aaaa */
export function fmtMesAno(v) {
  if (!v) return TRACO
  const m = String(v).match(/^(\d{4})-(\d{2})/)
  return m ? `${m[2]}/${m[1]}` : String(v)
}

/** Primeira letra maiúscula (categorias do banco vêm em minúsculas). */
export function capitalizar(s) {
  if (!s) return ""
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Plural simples: plural(3, "candidato") => "3 candidatos" */
export function plural(n, singular, pluralForma) {
  const p = pluralForma ?? `${singular}s`
  return `${fmtInt(n)} ${n === 1 ? singular : p}`
}

/** Iniciais para avatar: "Maria da Silva" => "MS" */
export function iniciais(nome) {
  if (!nome) return "?"
  const partes = nome.replace(/[^\p{L}\s]/gu, " ").split(/\s+/).filter((p) => p.length > 1 || /\p{Lu}/u.test(p))
  const sel = partes.length > 1 ? [partes[0], partes[partes.length - 1]] : partes
  return sel.map((p) => p[0].toUpperCase()).join("").slice(0, 2) || "?"
}

/** Domínio curto de uma URL: https://www.tse.jus.br/x => tse.jus.br */
export function dominio(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

/** CNPJ 14 dígitos => 00.000.000/0000-00 (outros formatos passam como estão). */
export function fmtCNPJ(v) {
  const d = String(v ?? "").replace(/\D/g, "")
  if (d.length !== 14) return v ?? TRACO
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
/** mês curto: 3 => "mar" */
export function nomeMes(m) {
  return MESES_CURTOS[(Number(m) || 0) - 1] ?? String(m ?? "")
}

/** Competência AAAAMM (texto) => mm/aaaa */
export function fmtCompetencia(v) {
  const m = String(v ?? "").match(/^(\d{4})(\d{2})$/)
  return m ? `${m[2]}/${m[1]}` : v ? String(v) : TRACO
}

/** Rótulo a partir de snake_case: "fundo_eleitoral" => "Fundo eleitoral" */
export function rotuloSnake(s) {
  if (!s) return ""
  return capitalizar(String(s).replace(/_/g, " "))
}

/** Título em caixa mista para nomes que vêm em CAIXA ALTA (mantém siglas curtas). */
export function caixaTitulo(s) {
  if (!s) return s
  if (s !== s.toUpperCase()) return s
  const minus = new Set(["de", "da", "do", "das", "dos", "e", "a", "o", "em", "para", "com"])
  return s
    .toLowerCase()
    .split(/(\s+)/)
    .map((p, i) => (i > 0 && minus.has(p) ? p : /^(ltda|me|epp|sa|s\/a|eireli|ss)$/.test(p) ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1)))
    .join("")
}

// ---- DivulgaCandContas (TSE): página pública do candidato de 2026 (padrão de URL conferido em 30/09/2026).
// Eleição Geral Federal 2026 = 20322002026. Candidaturas da Bahia: região NORDESTE/UF BA.
const ELEICAO_TSE_2026 = "20322002026"
export function urlDivulgaCand(ficha, secao = null) {
  const sq = ficha?.sq_candidato_2026
  if (!sq || !/^\d+$/.test(String(sq))) return null
  const uf = ficha.uf || "BA"
  const base = `https://divulgacandcontas.tse.jus.br/divulga/#/candidato/NORDESTE/${uf}/${ELEICAO_TSE_2026}/${sq}/2026/${uf}`
  return secao === "despesas" ? `${base}/concentracao/despesas` : base
}
