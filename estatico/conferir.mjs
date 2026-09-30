// Confere a versão estática contra a API: para uma bateria de URLs /api/..., compara a resposta dos handlers da API
// (chamados direto, sem HTTP) com a do resolvedor do front em modo estático (web/src/lib/estatico.js) lendo os JSON
// exportados. Serve para garantir que filtros, busca, ordenação e paginação no navegador dão o mesmo resultado.
//   node estatico/conferir.mjs [pasta dos dados = estatico/saida/dados] [--amostra 80]
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { pool, q } from "../api/db.js"
import { fontes, CARGOS } from "../api/dominio.js"
import { listar, filtros, busca } from "../api/rotas/candidatos.js"
import { ficha } from "../api/rotas/ficha.js"
import { inicio } from "../api/rotas/inicio.js"
import * as sec from "../api/rotas/secoes.js"

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const DADOS = path.resolve(process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : path.join(AQUI, "saida", "dados"))
const iA = process.argv.indexOf("--amostra")
const AMOSTRA = iA > 0 ? Number(process.argv[iA + 1]) : 80

// fetch dos arquivos /dados/... direto do disco
globalThis.fetch = async (url) => {
  const rel = decodeURIComponent(String(url).replace(/^\/dados\//, ""))
  const arq = path.join(DADOS, rel)
  const existe = arq.startsWith(DADOS) && fs.existsSync(arq)
  return {
    ok: existe,
    status: existe ? 200 : 404,
    headers: { get: () => (existe ? "application/json" : "text/html") },
    json: async () => JSON.parse(fs.readFileSync(arq, "utf8")),
  }
}
const { resolverEstatico } = await import("../web/src/lib/estatico.js")

const SECOES = { visao: sec.visao, patrimonio: sec.patrimonio, campanha: sec.campanha, "campanha/despesas": sec.campanhaDespesas, atuacao: sec.atuacao,
  "atuacao/votos": sec.atuacaoVotos, "atuacao/proposicoes": sec.atuacaoProposicoes, emendas: sec.emendas, "emendas/lista": sec.emendasLista,
  cota: sec.cota, "cota/notas": sec.cotaNotas, atencao: sec.atencao, trajetoria: sec.trajetoria, fontes: sec.fontesUsadas }

/** Mesmo roteamento de api/server.js, chamando os handlers em processo. */
async function api(url) {
  const u = new URL(url, "http://local")
  const query = {}
  for (const [k, v] of u.searchParams) if (!(k in query)) query[k] = v
  const partes = u.pathname.replace(/^\/api\//, "").split("/")
  let handler
  let params = {}
  if (partes[0] === "inicio") handler = inicio
  else if (partes[0] === "fontes") handler = async (_r, res) => res.json({ itens: (await fontes()).lista })
  else if (partes[0] === "busca") handler = busca
  else if (partes[0] === "filtros") handler = filtros
  else if (partes[0] === "candidatos" && partes.length === 1) handler = listar
  else if (partes[0] === "candidatos" && partes.length === 2) [handler, params] = [ficha, { slug: partes[1] }]
  else [handler, params] = [SECOES[partes.slice(2).join("/")], { slug: partes[1] }]
  if (!handler) return { status: 404, corpo: { erro: "rota não encontrada" } }
  let status = 200
  let corpo
  await handler({ params, query }, { status(s) { status = s; return this }, set() { return this }, json(d) { corpo = d; return this } })
  return { status, corpo }
}

/** Diferença entre dois JSON (números com tolerância de centavo). Facetas empatadas podem vir em outra ordem. */
function diferenca(a, b, caminho = "") {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 0.006 ? null : `${caminho}: ${a} ≠ ${b}`
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return a === b ? null : `${caminho}: ${JSON.stringify(a)?.slice(0, 80)} ≠ ${JSON.stringify(b)?.slice(0, 80)}`
  if (Array.isArray(a) !== Array.isArray(b)) return `${caminho}: tipo`
  if (Array.isArray(a)) {
    if (a.length !== b.length) return `${caminho}: ${a.length} ≠ ${b.length} itens`
    if (/facetas|partidos|generos|cores_raca/.test(caminho)) {
      const k = (x) => JSON.stringify(x)
      a = [...a].sort((x, y) => (k(x) < k(y) ? -1 : 1))
      b = [...b].sort((x, y) => (k(x) < k(y) ? -1 : 1))
    }
    for (let i = 0; i < a.length; i++) {
      const d = diferenca(a[i], b[i], `${caminho}[${i}]`)
      if (d) return d
    }
    return null
  }
  const ks = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of ks) {
    if (!(k in a) || !(k in b)) return `${caminho}.${k}: só em ${k in a ? "api" : "estático"}`
    const d = diferenca(a[k], b[k], `${caminho}.${k}`)
    if (d) return d
  }
  return null
}

const urls = ["/api/inicio", "/api/fontes"]
const TERMOS = ["jose", "maria", "mar", "silva", "joão", "wagner", "jaqes vagner", "felx mendonca", "13", "4040", "pt", "zz", "neto"]
for (const grupo of ["senado", "deputado-federal", "deputado-estadual", "parlamentar"]) {
  const variantes = [{}, { situacao: "todas" }, { situacao: "indeferida" }, { mandato: "sim" }, { mandato: "nao", genero: "feminino" },
    { cor_raca: "parda", faixa_patrimonio: "1mi_5mi" }, { partido: "PT" }, { partido: "PL", situacao: "todas" }, { municipio: "38490" },
    { pagina: "2" }, { pagina: "3", por_pagina: "30" }, { por_pagina: "500" }, { pagina: "abc" }, { ordem: "invalida" },
    ...["patrimonio", "emendas", "cota", "arrecadacao", "idade", "numero"].map((ordem) => ({ ordem })),
    ...TERMOS.map((t) => ({ q: t })), { q: "ma", ordem: "patrimonio", pagina: "2" }]
  for (const v of variantes) {
    const sp = new URLSearchParams({ grupo, ...v }).toString()
    urls.push(`/api/candidatos?${sp}`)
    const { ordem: _o, pagina: _p, por_pagina: _pp, ...semOrdem } = v
    urls.push(`/api/filtros?${new URLSearchParams({ grupo, ...semOrdem })}`)
  }
}
for (const t of [...TERMOS, "a", "Otto", "lidice", "angelo coronel", "leo prates", "ze neto"]) urls.push(`/api/busca?${new URLSearchParams({ q: t })}`, `/api/busca?${new URLSearchParams({ q: t, limite: "20" })}`)
urls.push("/api/candidatos/nao-existe", "/api/candidatos/nao-existe/cota")

// candidatos: os de interesse + amostra dos que têm listas grandes + amostra geral
const fixos = ["felix-mendonca", "jaques-wagner", "robinson", "alice-portugal", "angelo-coronel", "kel-torres"]
const comListas = (await q(`SELECT slug FROM candidato_resumo WHERE cargo = ANY($1) AND (tem_cota OR tem_votos OR tem_emendas) ORDER BY md5(slug) LIMIT $2`, [CARGOS, AMOSTRA])).map((r) => r.slug)
const gerais = (await q(`SELECT slug FROM candidato_resumo WHERE cargo = ANY($1) ORDER BY md5(slug || 'x') LIMIT $2`, [CARGOS, AMOSTRA])).map((r) => r.slug)
const slugs = [...new Set([...fixos, ...comListas, ...gerais])]
for (const slug of slugs) {
  const b = `/api/candidatos/${slug}`
  urls.push(b, ...["visao", "patrimonio", "campanha", "atuacao", "emendas", "cota", "atencao", "trajetoria", "fontes", "gestao"].map((s) => `${b}/${s}`))
  urls.push(`${b}/campanha?ano=2022`, `${b}/campanha?ano=1999`)
  const listas = {
    "campanha/despesas": [{}, { ordem: "data" }, { ordem: "data_asc" }, { ordem: "fornecedor" }, { ordem: "valor_asc", pagina: "2" }, { ano: "2022" }, { q: "ltda" }, { q: "combust" }, { categoria: "Publicidade por materiais impressos" }, { por_pagina: "100", pagina: "2" }],
    "atuacao/votos": [{}, { ordem: "data_asc" }, { pagina: "3" }, { ano: "2023" }, { chave: "1" }, { voto: "Não" }, { alinhamento: "sim" }, { alinhamento: "nao", ano: "2021" }, { q: "reforma" }, { q: "previdencia" }, { tema: "Saúde" }],
    "atuacao/proposicoes": [{}, { pagina: "2" }, { tipo: "PL" }, { ano: "2025" }, { principais: "1" }, { q: "saude" }, { q: "PL 1" }],
    "emendas/lista": [{}, { ordem: "empenhado" }, { ordem: "pago" }, { ordem: "ano_asc" }, { ano: "2024" }, { area: "Saúde" }, { q: "salvador" }, { q: "2024" }],
    "cota/notas": [{}, { ordem: "data" }, { ordem: "data_asc" }, { ordem: "fornecedor" }, { ordem: "valor_asc" }, { pagina: "4" }, { ano: "2025" }, { ano: "2024", mes: "3" }, { casa: "camara" }, { grupo: "aeronave" }, { grupo: "combustivel" }, { q: "posto" }, { q: "gol" }, { q: "0001" }],
  }
  for (const [rota, vs] of Object.entries(listas)) for (const v of vs) urls.push(`${b}/${rota}${Object.keys(v).length ? `?${new URLSearchParams(v)}` : ""}`)
}

let ok = 0
const falhas = []
for (const url of urls) {
  const a = await api(url)
  let e
  try {
    e = { status: 200, corpo: await resolverEstatico(url) }
  } catch (erro) {
    e = { status: erro.status ?? 500, corpo: null, erro: erro.message }
  }
  if (a.status !== e.status) falhas.push(`${url}: status ${a.status} ≠ ${e.status} ${e.erro ?? ""}`)
  else if (a.status !== 200) ok++
  else {
    const d = diferenca(a.corpo, e.corpo)
    if (d) falhas.push(`${url}: ${d}`)
    else ok++
  }
}
console.log(`${urls.length} URLs (${slugs.length} candidatos): ${ok} iguais, ${falhas.length} diferentes`)
for (const f of falhas.slice(0, 40)) console.log("  ✗", f)
await pool.end()
process.exitCode = falhas.length ? 1 : 0
