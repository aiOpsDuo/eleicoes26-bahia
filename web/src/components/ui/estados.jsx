// Estados vazio / erro / indisponível.
import { SearchX, TriangleAlert, Database } from "lucide-react"
import { Botao, juntar } from "./base.jsx"
import { MODO } from "../../lib/api.js"

export function EstadoVazio({ titulo = "Nada encontrado", children, acao, className }) {
  return (
    <div className={juntar("flex flex-col items-center gap-3 px-5 py-14 text-center", className)}>
      <span className="flex size-10 items-center justify-center rounded-[var(--radius)] border border-grid bg-surface text-subtle-foreground">
        <SearchX aria-hidden="true" className="size-5" />
      </span>
      <p className="font-semibold text-foreground">{titulo}</p>
      {children && <div className="max-w-md text-[length:var(--text-body)] text-muted-foreground">{children}</div>}
      {acao}
    </div>
  )
}

export function EstadoErro({ erro, onTentar, className }) {
  const offline = !erro?.status
  return (
    <div role="alert" className={juntar("flex flex-col items-center gap-3 px-5 py-14 text-center", className)}>
      <span className="flex size-10 items-center justify-center rounded-[var(--radius)] border border-danger/25 bg-danger-soft text-danger">
        <TriangleAlert aria-hidden="true" className="size-5" />
      </span>
      <p className="font-semibold text-foreground">Não foi possível carregar os dados</p>
      <p className="max-w-md text-[length:var(--text-body)] text-muted-foreground">
        {offline ? (MODO === "api" ? "A API não respondeu. Verifique se ela está rodando (porta 3333)." : "Verifique a conexão e tente de novo.") : erro.message}
      </p>
      {onTentar && <Botao variante="secundario" onClick={onTentar}>Tentar de novo</Botao>}
    </div>
  )
}

/** Dado indisponível numa seção (ausência ≠ zero). */
export function DadoIndisponivel({ children = "Não há dado público para esta seção nesta ficha.", className }) {
  return (
    <div className={juntar("flex items-start gap-3 rounded-[var(--radius)] border border-dashed border-grid-strong bg-surface px-4 py-4 text-[length:var(--text-body)] text-muted-foreground", className)}>
      <Database aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-subtle-foreground" />
      <div>{children}</div>
    </div>
  )
}
