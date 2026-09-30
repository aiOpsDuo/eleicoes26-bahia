// Gera a versão estática completa do site em publicar/ (qualquer servidor de arquivos estáticos serve):
//   1. exporta o banco para JSON (estatico/exportar.mjs → estatico/saida/dados)
//   2. build do front com VITE_MODO=estatico (→ estatico/saida/web; não mexe em web/dist, usado pela API)
//   3. monta publicar/ = build (com /fotos e /hero) + /dados + _headers (cache e
//      segurança), no formato aceito por várias hospedagens estáticas (inofensivos nas demais)
//
//   npm run estatico                 (na raiz)   ou   node estatico/gerar.mjs [--sem-exportar]
// Não publica nada.
import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.resolve(AQUI, "..")
const SAIDA = path.join(AQUI, "saida")
const PUBLICAR = path.join(RAIZ, "publicar")
const SEM_EXPORTAR = process.argv.includes("--sem-exportar")

// limites usuais de hospedagem estática (quantidade de arquivos, tamanho por arquivo, regras de cabeçalho)
const MAX_ARQUIVOS = 20_000
const MAX_BYTES_ARQUIVO = 25 * 1024 * 1024
const MAX_REGRAS_HEADERS = 100
const MAX_CHARS_HEADERS = 2_000

const rodar = (cmd, args, opcoes = {}) => execFileSync(cmd, args, { stdio: "inherit", cwd: RAIZ, ...opcoes })

// dependências (como start.sh)
for (const d of ["api", "web"]) if (!fs.existsSync(path.join(RAIZ, d, "node_modules"))) rodar("npm", ["--prefix", d, "ci", "--no-audit", "--no-fund"])

// 1. dados
if (!SEM_EXPORTAR) rodar(process.execPath, [path.join(AQUI, "exportar.mjs"), "--saida", path.join(SAIDA, "dados")])
if (!fs.existsSync(path.join(SAIDA, "dados", "inicio.json"))) throw new Error("faltam os dados exportados: rode sem --sem-exportar")

// 2. front em modo estático
rodar("npx", ["vite", "build", "--outDir", path.join(SAIDA, "web"), "--emptyOutDir"], {
  cwd: path.join(RAIZ, "web"),
  env: { ...process.env, VITE_MODO: "estatico" },
})

// 3. publicar/
const { CSP, CABECALHOS, CACHE_FRONT } = await import("../api/seguranca.js")
fs.rmSync(PUBLICAR, { recursive: true, force: true })
fs.cpSync(path.join(SAIDA, "web"), PUBLICAR, { recursive: true })
fs.cpSync(path.join(SAIDA, "dados"), path.join(PUBLICAR, "dados"), { recursive: true })
if (!fs.existsSync(path.join(PUBLICAR, "fotos"))) throw new Error("build sem /fotos (web/public/fotos)")

// SPA: toda rota do front devolve o index.html (arquivos existentes têm prioridade)
// sem _redirects: sem 404.html na raiz, o Pages já serve index.html para as rotas do SPA
fs.rmSync(path.join(PUBLICAR, "_redirects"), { force: true })

const regras = [
  ["/*", { ...CABECALHOS, "Content-Security-Policy": CSP }],
  ["/assets/*", { "Cache-Control": CACHE_FRONT.assets }],
  ["/fotos/*", { "Cache-Control": CACHE_FRONT.fotos }],
  ["/hero/*", { "Cache-Control": CACHE_FRONT.hero }],
  ["/dados/*", { "Cache-Control": "public, max-age=3600", "X-Robots-Tag": "noindex" }],
]
const headers = regras.map(([rota, h]) => `${rota}\n${Object.entries(h).map(([k, v]) => `  ${k}: ${v}`).join("\n")}\n`).join("\n")
if (regras.length > MAX_REGRAS_HEADERS || headers.length > MAX_CHARS_HEADERS) throw new Error(`_headers passou do limite (${regras.length} regras, ${headers.length} caracteres)`)
fs.writeFileSync(path.join(PUBLICAR, "_headers"), headers)

// conferência dos limites
let n = 0
let total = 0
let maior = [0, ""]
const porPasta = {}
;(function andar(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) andar(p)
    else {
      const b = fs.statSync(p).size
      n++
      total += b
      if (b > maior[0]) maior = [b, path.relative(PUBLICAR, p)]
      const partes = path.relative(PUBLICAR, p).split(path.sep)
      const k = partes.length > 1 ? partes[0] : "(raiz)"
      porPasta[k] = porPasta[k] ?? { n: 0, b: 0 }
      porPasta[k].n++
      porPasta[k].b += b
    }
  }
})(PUBLICAR)
const mb = (b) => `${(b / 1048576).toFixed(1)} MB`
console.log(`\npublicar/: ${n} arquivos, ${mb(total)} (maior: ${maior[1]}, ${mb(maior[0])})`)
for (const [k, v] of Object.entries(porPasta).sort()) console.log(`  ${k.padEnd(8)} ${String(v.n).padStart(6)} arquivos  ${mb(v.b).padStart(9)}`)
console.log(`  _headers: ${regras.length} regras, ${headers.length} caracteres`)
if (n > MAX_ARQUIVOS) throw new Error(`mais de ${MAX_ARQUIVOS} arquivos`)
if (maior[0] > MAX_BYTES_ARQUIVO) throw new Error(`${maior[1]} passa de 25 MiB`)
console.log("\nPara testar: npm run estatico:servir  (http://localhost:4173)")
