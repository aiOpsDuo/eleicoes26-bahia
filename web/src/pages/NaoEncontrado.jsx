import { useEffect } from "react"
import { Botao, Eyebrow, Moldura, PAD } from "../components/ui/base.jsx"

export function NaoEncontrado({ titulo = "Página não encontrada", children }) {
  useEffect(() => {
    document.title = `${titulo} · Eleições 2026 · Bahia`
  }, [titulo])
  return (
    <Moldura className={`${PAD} py-20 sm:py-28`}>
      <Eyebrow>Erro 404</Eyebrow>
      <h1 className="mt-4 pt-[0.1em] font-heading text-[clamp(40px,8vw,88px)] uppercase leading-[0.94] text-foreground">{titulo}</h1>
      <p className="mt-4 max-w-prose text-muted-foreground">{children ?? "O endereço pode ter mudado. Use a busca no topo ou volte ao início."}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Botao para="/" seta>Ir para o início</Botao>
        <Botao para="/fontes" variante="secundario">Ver fontes</Botao>
      </div>
    </Moldura>
  )
}
