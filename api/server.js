// API somente leitura do ba2026 (Express 5 + pg). Só GET/HEAD, só JSON.
// Porta 3333 (PORT). Em desenvolvimento o front (Vite, 5173) faz proxy de /api para cá.
// Em produção (start.sh) este mesmo processo também serve o front estático de web/dist
// (STATIC_DIR), com cabeçalhos de segurança, cache para /assets, /fotos e /hero e fallback do SPA.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import express from "express"
import { pool } from "./db.js"
import { fontes } from "./dominio.js"
import { listar, filtros, busca } from "./rotas/candidatos.js"
import { ficha } from "./rotas/ficha.js"
import { inicio } from "./rotas/inicio.js"
import * as sec from "./rotas/secoes.js"
import { CSP, CABECALHOS, CACHE_FRONT } from "./seguranca.js"

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const STATIC_DIR = process.env.STATIC_DIR ?? path.resolve(AQUI, "../web/dist")
const SERVIR_FRONT = process.env.SERVIR_FRONT !== "0" && fs.existsSync(path.join(STATIC_DIR, "index.html"))
// limite simples por IP (janela de 1 min) só para /api; 0 desliga
const LIMITE_MIN = Number(process.env.LIMITE_POR_MINUTO ?? 600)

const app = express()
app.disable("x-powered-by")
app.set("etag", "strong")
app.set("query parser", "simple")
if (process.env.TRUST_PROXY) app.set("trust proxy", process.env.TRUST_PROXY) // atrás de proxy reverso: IP real

// somente leitura + cabeçalhos de segurança em tudo
app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return res.status(405).set("Allow", "GET, HEAD").json({ erro: "somente leitura" })
  res.set(CABECALHOS)
  if (SERVIR_FRONT) res.set("Content-Security-Policy", CSP)
  next()
})

// ---- limite de taxa por IP (memória; suficiente para uma instância)
const janelas = new Map()
function limitarTaxa(req, res, next) {
  if (!LIMITE_MIN) return next()
  const agora = Date.now()
  const ip = req.ip ?? "?"
  let j = janelas.get(ip)
  if (!j || agora - j.inicio >= 60_000) {
    j = { inicio: agora, n: 0 }
    janelas.set(ip, j)
  }
  j.n++
  res.set("RateLimit-Limit", String(LIMITE_MIN))
  res.set("RateLimit-Remaining", String(Math.max(0, LIMITE_MIN - j.n)))
  if (j.n > LIMITE_MIN) {
    res.set("Retry-After", String(Math.ceil((j.inicio + 60_000 - agora) / 1000)))
    return res.status(429).json({ erro: "muitas requisições; tente de novo em instantes" })
  }
  next()
}
setInterval(() => {
  const limite = Date.now() - 60_000
  for (const [ip, j] of janelas) if (j.inicio < limite) janelas.delete(ip)
}, 60_000).unref()

const api = express.Router()
api.use(limitarTaxa)
api.use((_req, res, next) => {
  res.set("Cache-Control", "public, max-age=300")
  next()
})
api.get("/saude", async (_req, res) => {
  const r = await pool.query("SELECT count(*)::int AS n FROM candidato")
  res.set("Cache-Control", "no-store")
  res.json({ ok: true, candidatos: r.rows[0].n })
})
api.get("/inicio", inicio)
api.get("/candidatos", listar)
api.get("/candidatos/:slug", ficha)
// seções da ficha; listas grandes paginadas no servidor
api.get("/candidatos/:slug/visao", sec.visao)
api.get("/candidatos/:slug/patrimonio", sec.patrimonio)
api.get("/candidatos/:slug/campanha", sec.campanha)
api.get("/candidatos/:slug/campanha/despesas", sec.campanhaDespesas)
api.get("/candidatos/:slug/atuacao", sec.atuacao)
api.get("/candidatos/:slug/atuacao/votos", sec.atuacaoVotos)
api.get("/candidatos/:slug/atuacao/proposicoes", sec.atuacaoProposicoes)
api.get("/candidatos/:slug/emendas", sec.emendas)
api.get("/candidatos/:slug/emendas/lista", sec.emendasLista)
api.get("/candidatos/:slug/cota", sec.cota)
api.get("/candidatos/:slug/cota/notas", sec.cotaNotas)
api.get("/candidatos/:slug/atencao", sec.atencao)
api.get("/candidatos/:slug/trajetoria", sec.trajetoria)
api.get("/candidatos/:slug/fontes", sec.fontesUsadas)
api.get("/filtros", filtros)
api.get("/busca", busca)
api.get("/fontes", async (_req, res) => {
  const { lista } = await fontes()
  res.json({ itens: lista })
})
api.use((_req, res) => res.status(404).set("Cache-Control", "no-store").json({ erro: "rota não encontrada" }))

app.use("/api", api)

// ---- front estático (produção)
if (SERVIR_FRONT) {
  app.use(
    express.static(STATIC_DIR, {
      index: false,
      dotfiles: "ignore",
      setHeaders(res, arquivo) {
        const rel = path.relative(STATIC_DIR, arquivo).split(path.sep).join("/")
        if (rel.startsWith("assets/")) res.set("Cache-Control", CACHE_FRONT.assets)
        else if (rel.startsWith("fotos/")) res.set("Cache-Control", CACHE_FRONT.fotos)
        else if (rel.startsWith("hero/") || rel === "favicon.svg") res.set("Cache-Control", CACHE_FRONT.hero)
        else res.set("Cache-Control", "no-cache")
      },
    }),
  )
  // arquivos que não existem em /assets, /fotos, /hero: 404 de verdade (não o index.html)
  app.get(/^\/(assets|fotos|hero)\//, (_req, res) => res.status(404).type("text/plain").send("não encontrado"))
  // SPA: qualquer outra rota GET devolve o index.html (o front mostra a página 404 quando não existe)
  const indexHtml = path.join(STATIC_DIR, "index.html")
  app.get(/.*/, (_req, res) => {
    res.set("Cache-Control", "no-cache")
    res.sendFile(indexHtml)
  })
}

// erros: sem vazar SQL/stack para o cliente
app.use((err, req, res, _next) => {
  console.error(`[api] ${req.method} ${req.originalUrl}:`, err.message)
  res.status(500).set("Cache-Control", "no-store").json({ erro: "erro interno ao consultar os dados" })
})

const PORT = Number(process.env.PORT || 3333)
const HOST = process.env.HOST || undefined
app.listen(PORT, HOST, () => {
  console.log(`API ba2026 em http://localhost:${PORT}/api`)
  if (SERVIR_FRONT) console.log(`Site (build de produção de ${STATIC_DIR}) em http://localhost:${PORT}/`)
})
