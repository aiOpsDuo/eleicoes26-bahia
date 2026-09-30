// Primitivos visuais: botão, rótulo (eyebrow), seção com grade, selo, esqueleto, títulos.
import { Link } from "../../lib/nav.jsx"
import { ArrowRight } from "lucide-react"

const juntar = (...c) => c.filter(Boolean).join(" ")

const BOTAO = {
  base: "inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius)] px-4 font-mono text-[12px] font-medium uppercase tracking-[0.06em] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40",
  primario: "bg-accent text-white hover:bg-accent-strong",
  secundario: "border border-grid-strong bg-surface text-foreground hover:border-accent hover:text-accent-strong",
  fantasma: "text-foreground hover:bg-surface-2",
}

/** Botão retangular. `para` => Link interno; `href` => link externo; senão <button>. `seta` adiciona →. */
export function Botao({ variante = "primario", para, href, seta = false, className, children, ...props }) {
  const cls = juntar(BOTAO.base, BOTAO[variante], className)
  const conteudo = (
    <>
      {children}
      {seta && <ArrowRight aria-hidden="true" className="size-3.5" />}
    </>
  )
  if (para) return <Link to={para} className={cls} {...props}>{conteudo}</Link>
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" className={cls} {...props}>{conteudo}</a>
  return <button type="button" className={cls} {...props}>{conteudo}</button>
}

/** Rótulo mono maiúsculo com quadradinho azul. */
export function Eyebrow({ as: Tag = "p", className, children, ...props }) {
  return <Tag className={juntar("eyebrow", className)} {...props}>{children}</Tag>
}

/** Container com linhas verticais nas bordas (moldura da página). */
export function Moldura({ className, children, ...props }) {
  return <div className={juntar("moldura", className)} {...props}>{children}</div>
}

/**
 * Seção com linha de grade no topo e cruzes "+" nas interseções com a moldura.
 * Use dentro de <Moldura>. `semLinha` remove a linha (primeira seção da página).
 */
export function Secao({ as: Tag = "section", semLinha = false, className, children, ...props }) {
  return (
    <Tag className={juntar(semLinha ? "relative" : "secao-grade", className)} {...props}>
      {!semLinha && (
        <>
          <span aria-hidden="true" className="cruz cruz-esq" />
          <span aria-hidden="true" className="cruz cruz-dir" />
        </>
      )}
      {children}
    </Tag>
  )
}

/** Padding horizontal padrão do conteúdo dentro da moldura. */
export const PAD = "px-4 sm:px-6 lg:px-10"

/** Título de seção (Anton, maiúsculas). */
export function TituloSecao({ as: Tag = "h2", className, children, ...props }) {
  return (
    <Tag className={juntar("font-heading text-[length:var(--text-heading-sm)] uppercase leading-[0.95] text-foreground sm:text-[length:var(--text-heading)] lg:text-[length:var(--text-heading-lg)]", className)} {...props}>
      {children}
    </Tag>
  )
}

const SELO = {
  ok: "border-ok/25 bg-ok-soft text-ok",
  warn: "border-warn/25 bg-warn-soft text-warn",
  danger: "border-danger/25 bg-danger-soft text-danger",
  accent: "border-accent/25 bg-accent-soft text-accent-strong",
  neutral: "border-grid-strong bg-surface-2 text-muted-foreground",
}
/** Selo pequeno (mono, maiúsculo). */
export function Selo({ tom = "neutral", className, children, ...props }) {
  return (
    <span className={juntar("inline-flex items-center gap-1 rounded-[2px] border px-1.5 py-0.5 font-mono text-[10.5px] font-medium uppercase leading-4 tracking-[0.06em]", SELO[tom], className)} {...props}>
      {children}
    </span>
  )
}

export function Esqueleto({ className }) {
  return <div aria-hidden="true" className={juntar("animate-pulse rounded-[var(--radius)] bg-surface-2", className)} />
}

/** Barra fina de carregamento no topo de um bloco. */
export function BarraCarregando({ ativo }) {
  return (
    <div role="status" aria-live="polite" className={juntar("h-0.5 w-full", ativo ? "barra-carregando bg-accent-soft" : "bg-transparent")}>
      <span className="sr-only">{ativo ? "Carregando…" : ""}</span>
    </div>
  )
}

/** Card branco com borda fina. */
export function Cartao({ as: Tag = "div", className, children, ...props }) {
  return <Tag className={juntar("rounded-[var(--radius)] border border-grid bg-surface", className)} {...props}>{children}</Tag>
}

export { juntar }
