// Servidor local mínimo para testar publicar/: arquivos estáticos, cabeçalhos do _headers
// e fallback do SPA (_redirects "/* /index.html 200"). Só para teste local, sem dependências.
//   node estatico/servir.mjs [pasta=publicar] [porta=4173]
import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const PASTA = path.resolve(RAIZ, process.argv[2] ?? "publicar")
const PORTA = Number(process.argv[3] ?? process.env.PORT ?? 4173)
const TIPOS = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".woff": "font/woff", ".ico": "image/x-icon", ".txt": "text/plain",
}

// _headers: blocos "rota\n  Nome: valor"
const regras = []
const arqHeaders = path.join(PASTA, "_headers")
if (fs.existsSync(arqHeaders)) {
  let atual = null
  for (const linha of fs.readFileSync(arqHeaders, "utf8").split("\n")) {
    if (!linha.trim()) continue
    if (!/^\s/.test(linha)) regras.push((atual = { padrao: new RegExp(`^${linha.trim().replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`), h: {} }))
    else if (atual) {
      const i = linha.indexOf(":")
      atual.h[linha.slice(0, i).trim()] = linha.slice(i + 1).trim()
    }
  }
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://local")
    let rel = decodeURIComponent(url.pathname)
    let arquivo = path.join(PASTA, rel)
    if (!arquivo.startsWith(PASTA)) return res.writeHead(400).end()
    if (fs.existsSync(arquivo) && fs.statSync(arquivo).isDirectory()) arquivo = path.join(arquivo, "index.html")
    if (!fs.existsSync(arquivo) || path.basename(arquivo).startsWith("_")) {
      arquivo = path.join(PASTA, "index.html") // SPA
      rel = "/index.html"
    }
    const cab = { "Content-Type": TIPOS[path.extname(arquivo).toLowerCase()] ?? "application/octet-stream" }
    for (const r of regras) if (r.padrao.test(url.pathname)) Object.assign(cab, r.h)
    res.writeHead(200, cab)
    if (req.method === "HEAD") return res.end()
    fs.createReadStream(arquivo).pipe(res)
  })
  .listen(PORTA, () => console.log(`publicar/ em http://localhost:${PORTA}`))
