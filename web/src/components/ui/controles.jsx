// Controles simples de filtro: segmentos (chips), alternador e paginação por links.
import { Link } from "../../lib/nav.jsx"
import { Check, ArrowLeft, ArrowRight } from "lucide-react"
import { fmtInt } from "../../lib/format.js"
import { juntar } from "./base.jsx"

/** Segmentos (chips de escolha única), com contagem. opcoes: [{ value, label, n }]. */
export function Segmentos({ opcoes, valor, onChange, rotulo, className }) {
  return (
    <div role="radiogroup" aria-label={rotulo} className={juntar("flex min-w-0 flex-wrap gap-1.5", className)}>
      {opcoes.map((o) => {
        const ativo = o.value === valor
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={ativo}
            onClick={() => onChange(o.value)}
            disabled={!ativo && o.n === 0}
            className={juntar(
              "inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius)] border px-2.5 font-mono text-[11.5px] font-medium uppercase tracking-[0.04em] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
              ativo ? "border-accent bg-accent text-white" : "border-grid-strong bg-surface text-foreground hover:border-accent hover:text-accent-strong",
            )}
          >
            {o.label}
            {o.n != null && <span className={juntar("numero text-[10.5px]", ativo ? "text-white/80" : "text-muted-foreground")}>{fmtInt(o.n)}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** Alternador (liga/desliga) em forma de chip. */
export function Alternador({ ligado, onChange, children, n, className }) {
  return (
    <button
      type="button"
      aria-pressed={ligado}
      onClick={() => onChange(!ligado)}
      className={juntar(
        "inline-flex min-h-9 items-center gap-2 rounded-[var(--radius)] border px-2.5 font-mono text-[11.5px] font-medium uppercase tracking-[0.04em] transition-colors",
        ligado ? "border-accent bg-accent-soft text-accent-strong" : "border-grid-strong bg-surface text-foreground hover:border-accent",
        className,
      )}
    >
      <span aria-hidden="true" className={juntar("flex size-3.5 items-center justify-center rounded-[2px] border", ligado ? "border-accent bg-accent text-white" : "border-grid-strong")}>
        {ligado && <Check className="size-3" />}
      </span>
      {children}
      {n != null && <span className="numero text-[10.5px] text-muted-foreground">{fmtInt(n)}</span>}
    </button>
  )
}

/** Paginação por links (?pagina=N), acessível e compartilhável. */
export function Paginacao({ pagina, paginas, hrefPagina, rotulo = "Paginação" }) {
  if (paginas <= 1) return null
  const nums = new Set([1, paginas, pagina - 1, pagina, pagina + 1].filter((p) => p >= 1 && p <= paginas))
  const lista = [...nums].sort((a, b) => a - b)
  const btn = "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-[var(--radius)] border border-grid-strong bg-surface px-3 font-mono text-[12px] uppercase tracking-[0.05em] text-foreground hover:border-accent hover:text-accent-strong aria-disabled:pointer-events-none aria-disabled:opacity-40"
  return (
    <nav aria-label={rotulo} className="flex flex-wrap items-center justify-between gap-3">
      <Link to={hrefPagina(pagina - 1)} aria-disabled={pagina <= 1} tabIndex={pagina <= 1 ? -1 : undefined} className={btn} preventScrollReset={false}>
        <ArrowLeft aria-hidden="true" className="size-3.5" /> <span className="hidden sm:inline">Anterior</span>
      </Link>
      <ol className="flex items-center gap-1">
        {lista.map((p, i) => (
          <li key={p} className="flex items-center gap-1">
            {i > 0 && p - lista[i - 1] > 1 && <span aria-hidden="true" className="px-1 text-muted-foreground">…</span>}
            <Link
              to={hrefPagina(p)}
              aria-current={p === pagina ? "page" : undefined}
              aria-label={`Página ${p}`}
              className={juntar(btn, "numero px-2", p === pagina && "border-accent bg-accent text-white hover:text-white")}
            >
              {p}
            </Link>
          </li>
        ))}
      </ol>
      <Link to={hrefPagina(pagina + 1)} aria-disabled={pagina >= paginas} tabIndex={pagina >= paginas ? -1 : undefined} className={btn}>
        <span className="hidden sm:inline">Próxima</span> <ArrowRight aria-hidden="true" className="size-3.5" />
      </Link>
    </nav>
  )
}
