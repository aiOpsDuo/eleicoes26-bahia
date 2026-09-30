// Gera public/hero/relevo.svg: relevo em "pixels" azul-claro (visual próprio, claro, sem dados).
// Determinístico (semente fixa). Uso: npm run hero  [-- --seed 7 --cols 168 --rows 64]
// Para trocar o hero por uma foto/ilustração, coloque o arquivo em public/hero/ e
// ajuste HERO.imagem em src/config.js (ou VITE_HERO_IMAGEM no .env).
import { writeFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const args = Object.fromEntries(process.argv.slice(2).join(" ").split("--").filter(Boolean).map((s) => s.trim().split(/\s+/)))
const COLS = Number(args.cols ?? 168)
const ROWS = Number(args.rows ?? 64)
let seed = Number(args.seed ?? 11)
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)

// ruído de valor 1D/2D suave
const grade = Array.from({ length: 512 }, rand)
const lerp = (a, b, t) => a + (b - a) * t
const suave = (t) => t * t * (3 - 2 * t)
const ruido1 = (x) => { const i = Math.floor(x), f = x - i; return lerp(grade[i & 511], grade[(i + 1) & 511], suave(f)) }
const ruido2 = (x, y) => {
  const i = Math.floor(x), j = Math.floor(y), fx = suave(x - i), fy = suave(y - j)
  const g = (a, b) => grade[(a * 57 + b * 131) & 511]
  return lerp(lerp(g(i, j), g(i + 1, j), fx), lerp(g(i, j + 1), g(i + 1, j + 1), fx), fy)
}
const passo = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return suave(t) }

// altura do relevo (0 = base, 1 = topo), sobe para a direita com um pico central
const altura = (x) =>
  0.1 + 0.62 * passo(0.15, 1.02, x) + 0.3 * Math.exp(-(((x - 0.6) / 0.09) ** 2)) +
  0.12 * Math.exp(-(((x - 0.8) / 0.06) ** 2)) + 0.07 * (ruido1(x * 14) - 0.5) + 0.03 * (ruido1(x * 45) - 0.5)

const CORES = ["#EEF3FD", "#DDE7FB", "#C7D7F7", "#A9C1F3", "#86A6EE", "#5F88E8", "#3B6FE0"]
const TAM = [0.46, 0.56, 0.64, 0.7, 0.74, 0.78, 0.8]
const caminhos = CORES.map(() => [])

for (let cy = 0; cy < ROWS; cy++) {
  for (let cx = 0; cx < COLS; cx++) {
    const x = cx / (COLS - 1)
    const yy = 1 - cy / (ROWS - 1) // 1 = topo
    const h = altura(x)
    const prof = h - yy // > 0 abaixo da crista
    let nivel = -1
    if (prof > 0) {
      const estrato = Math.sin((x * 2.6 - yy * 3.4) * 6 + ruido2(x * 8, yy * 8) * 3)
      let s = 0.05 + 0.55 * x ** 1.6 + 0.9 * prof * (0.4 + x) + 0.18 * estrato + 0.25 * (ruido2(x * 22, yy * 22) - 0.5)
      s *= passo(-0.05, 0.5, x) // lado esquerdo claro (texto do hero fica ali)
      if (rand() < 0.08) s += 0.25 * (rand() - 0.3) // pontilhado
      if (s > 0.07) nivel = Math.min(CORES.length - 1, Math.floor(s * 6.2))
    } else if (prof > -0.05 && rand() < 0.35) {
      nivel = 0 // poeira logo acima da crista
    } else if (rand() < 0.012 * passo(0.3, 1, x)) {
      nivel = 0
    }
    if (nivel < 0) continue
    const t = TAM[nivel]
    const o = (1 - t) / 2
    caminhos[nivel].push(`M${cx + o} ${cy + o}h${t}v${t}h-${t}z`)
  }
}

const arred = (s) => s.replace(/(\d+\.\d{2})\d+/g, "$1")
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COLS} ${ROWS}" preserveAspectRatio="xMidYMax slice" shape-rendering="crispEdges">
${caminhos.map((c, i) => (c.length ? `<path fill="${CORES[i]}" d="${arred(c.join(""))}"/>` : "")).join("\n")}
</svg>
`
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "hero", "relevo.svg")
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, svg)
console.log(`hero: ${out} (${(svg.length / 1024).toFixed(0)} KB, ${caminhos.reduce((s, c) => s + c.length, 0)} células)`)
