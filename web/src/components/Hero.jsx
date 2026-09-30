// Hero com slot de imagem configurável (src/config.js -> HERO). Padrão: relevo em pixels azul-claro.
import { HERO } from "../config.js"
import { juntar } from "./ui/base.jsx"

/** Arte do hero. modo "arte": ocupa a base, à direita. modo "foto": cobre o hero com um véu claro. */
export function HeroArte({ className }) {
  if (!HERO.imagem) return null
  if (HERO.modo === "foto") {
    return (
      <div aria-hidden="true" className={juntar("pointer-events-none absolute inset-0", className)}>
        <img src={HERO.imagem} alt="" className="size-full object-cover" style={{ objectPosition: HERO.posicao }} fetchPriority="high" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/30" />
      </div>
    )
  }
  return (
    <div aria-hidden="true" className={juntar("pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden", className)}>
      <img src={HERO.imagem} alt="" className="size-full object-cover" style={{ objectPosition: HERO.posicao }} fetchPriority="high" />
      {/* véu no topo para a arte "nascer" do fundo */}
      <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-background to-transparent" />
    </div>
  )
}
