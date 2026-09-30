// Estrutura da página: link "pular para o conteúdo", navbar fixa, conteúdo, rodapé mínimo.
import { Suspense, useEffect, useRef, useState } from "react"
import { Outlet, ScrollRestoration, useLocation } from "react-router"
import { Link, NavLink } from "../../lib/nav.jsx"
import { Menu as MenuIcon, X, Search } from "lucide-react"
import { BuscaGlobal } from "./BuscaGlobal.jsx"
import { GRUPOS } from "../../lib/rotulos.js"
import { SITE } from "../../config.js"
import { IconeGithub } from "../IconeGithub.jsx"
import { juntar } from "../ui/base.jsx"

export function Marca({ className }) {
  return (
    <Link to="/" className={juntar("flex min-h-11 shrink-0 items-center gap-2.5 pr-2", className)} aria-label={`${SITE.titulo} — início`}>
      <svg aria-hidden="true" viewBox="0 0 16 16" className="size-6">
        <rect x="1" y="9" width="4" height="6" fill="var(--accent-light)" />
        <rect x="6" y="5" width="4" height="10" fill="#6f95ea" />
        <rect x="11" y="1" width="4" height="14" fill="var(--accent)" />
      </svg>
      <span className="flex flex-col leading-none">
        <span className="font-heading text-[17px] uppercase leading-[1.15] tracking-[0.02em] text-foreground">Eleições 2026</span>
        <span className="mt-[6px] font-mono text-[9.5px] uppercase leading-none tracking-[0.18em] text-muted-foreground">Bahia · fichas</span>
      </span>
    </Link>
  )
}

const LINKS = [...GRUPOS.map((g) => ({ para: `/${g.slug}`, rotulo: g.curto ?? g.rotulo })), { para: "/fontes", rotulo: "Fontes" }]

function linkCls({ isActive }) {
  return juntar(
    "relative inline-flex h-16 items-center whitespace-nowrap px-2.5 font-mono text-[11.5px] font-medium uppercase tracking-[0.06em] transition-colors xl:px-3",
    isActive ? "text-accent-strong after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:bg-accent" : "text-muted-foreground hover:text-foreground",
  )
}

function Navbar() {
  const [menu, setMenu] = useState(false)
  const [busca, setBusca] = useState(false)
  const { pathname } = useLocation()
  const botaoRef = useRef(null)

  useEffect(() => {
    setMenu(false)
    setBusca(false)
  }, [pathname])

  useEffect(() => {
    if (!menu) return
    const onKey = (e) => {
      if (e.key === "Escape") {
        setMenu(false)
        botaoRef.current?.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [menu])

  return (
    <header className="fixed inset-x-0 top-0 z-header border-b border-grid bg-background/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-10">
        <Marca />
        <nav aria-label="Principal" className="ml-2 hidden min-w-0 flex-1 xl:block">
          <ul className="flex items-center">
            {LINKS.map((l) => (
              <li key={l.para}><NavLink to={l.para} className={linkCls}>{l.rotulo}</NavLink></li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto hidden w-[260px] md:block xl:w-[260px]">
          <BuscaGlobal />
        </div>
        <div className="ml-auto flex items-center gap-1 md:ml-2 xl:hidden">
          <button
            type="button"
            onClick={() => setBusca((b) => !b)}
            aria-expanded={busca}
            aria-controls="busca-movel"
            aria-label={busca ? "Fechar busca" : "Abrir busca"}
            className="flex size-11 items-center justify-center rounded-[var(--radius)] border border-grid-strong bg-surface text-foreground md:hidden"
          >
            {busca ? <X aria-hidden="true" className="size-4" /> : <Search aria-hidden="true" className="size-4" />}
          </button>
          <button
            ref={botaoRef}
            type="button"
            onClick={() => setMenu((m) => !m)}
            aria-expanded={menu}
            aria-controls="menu-movel"
            aria-label={menu ? "Fechar menu" : "Abrir menu"}
            className="flex h-11 items-center gap-2 rounded-[var(--radius)] border border-grid-strong bg-surface px-3 font-mono text-[11.5px] uppercase tracking-[0.06em] text-foreground"
          >
            {menu ? <X aria-hidden="true" className="size-4" /> : <MenuIcon aria-hidden="true" className="size-4" />}
            <span className="hidden sm:inline">Menu</span>
          </button>
        </div>
      </div>
      {busca && (
        <div id="busca-movel" className="border-t border-grid bg-background px-4 py-3 md:hidden">
          <BuscaGlobal autoFocus atalho={false} onNavegar={() => setBusca(false)} />
        </div>
      )}
      {menu && (
        <nav id="menu-movel" aria-label="Menu" className="h-[calc(100dvh-4rem)] overflow-y-auto border-t border-grid bg-background xl:hidden">
          <ul className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
            <li>
              <NavLink to="/" end className={({ isActive }) => juntar("flex min-h-14 items-center justify-between border-b border-grid font-heading text-[28px] uppercase", isActive ? "text-accent" : "text-foreground")}>
                Início
              </NavLink>
            </li>
            {LINKS.map((l) => (
              <li key={l.para}>
                <NavLink to={l.para} className={({ isActive }) => juntar("flex min-h-14 items-center justify-between border-b border-grid font-heading text-[28px] uppercase", isActive ? "text-accent" : "text-foreground")}>
                  {l.rotulo}
                  <span aria-hidden="true" className="font-mono text-[14px] text-muted-foreground">→</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  )
}

function Rodape() {
  return (
    <footer className="border-t border-grid">
      <div className="moldura flex flex-col gap-3 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10">
        <p className="eyebrow">{SITE.rodape}</p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <a href={SITE.repositorio} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 font-mono text-[12px] uppercase tracking-[0.06em] text-muted-foreground hover:text-foreground hover:underline">
            <IconeGithub className="size-4" /> Código aberto no GitHub
          </a>
          <Link to="/fontes" className="inline-flex min-h-11 items-center gap-1 font-mono text-[12px] uppercase tracking-[0.06em] text-accent-strong hover:underline">
            Ver todas as fontes →
          </Link>
        </div>
      </div>
    </footer>
  )
}

/** Troca de página: com View Transitions o navegador faz o cruzamento (ver index.css);
 *  sem suporte, um fade só de opacidade (sem transform, para não afetar elementos fixos/sticky). */
const TEM_VT = typeof document !== "undefined" && "startViewTransition" in document
function PaginaAnimada() {
  const { pathname } = useLocation()
  if (TEM_VT) return <Outlet />
  return (
    <div key={pathname} className="pagina-entrada">
      <Outlet />
    </div>
  )
}

export function Layout() {
  return (
    <>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-skip-link focus:rounded-[var(--radius)] focus:bg-foreground focus:px-4 focus:py-3 focus:text-[13px] focus:font-semibold focus:text-background"
      >
        Ir para o conteúdo
      </a>
      <Navbar />
      <main id="conteudo" tabIndex={-1} className="min-h-[70vh] pt-16 outline-none">
        <Suspense fallback={<div className="moldura min-h-[60vh]"><div role="status" className="barra-carregando h-0.5 bg-accent-soft"><span className="sr-only">Carregando…</span></div></div>}>
          <PaginaAnimada />
        </Suspense>
      </main>
      <Rodape />
      {/* chave = caminho + busca: trocar filtro/aba (?...) com preventScrollReset não "restaura" a posição antiga
          por cima de uma rolagem programada (ex.: clicar num gráfico e rolar até a tabela filtrada) */}
      <ScrollRestoration getKey={(loc) => loc.pathname + loc.search} />
    </>
  )
}
