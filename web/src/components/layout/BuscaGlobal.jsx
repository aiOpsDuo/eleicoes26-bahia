// Busca global por nome (navbar), com sugestões da API (/api/busca), teclado e atalho ⌘K / Ctrl+K.
import { useEffect, useId, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { Search, X, Loader2 } from "lucide-react"
import { buscarJSON, urlApi } from "../../lib/api.js"
import { FotoCandidato, SeloSituacao } from "../candidato.jsx"
import { cargoRotulo } from "../../lib/rotulos.js"
import { juntar } from "../ui/base.jsx"

function useDebounce(valor, ms) {
  const [v, setV] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return v
}

const EH_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)

export function BuscaGlobal({ className, autoFocus = false, onNavegar, atalho = true }) {
  const [texto, setTexto] = useState("")
  const [itens, setItens] = useState([])
  const [aberto, setAberto] = useState(false)
  const [ativo, setAtivo] = useState(-1)
  const [carregando, setCarregando] = useState(false)
  const termo = useDebounce(texto.trim(), 140)
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const caixaRef = useRef(null)
  const id = useId()
  const listaId = `${id}-lista`

  useEffect(() => {
    if (termo.length < 2) {
      setItens([])
      return
    }
    const ctrl = new AbortController()
    setCarregando(true)
    buscarJSON(urlApi("busca", { q: termo, limite: 8 }), { signal: ctrl.signal })
      .then((d) => {
        setItens(d.itens)
        setAtivo(d.itens.length ? 0 : -1)
      })
      .catch(() => {})
      .finally(() => setCarregando(false))
    return () => ctrl.abort()
  }, [termo])

  // atalho ⌘K / Ctrl+K e "/"
  useEffect(() => {
    if (!atalho) return
    const onKey = (e) => {
      const alvo = e.target
      const digitando = alvo instanceof HTMLElement && (alvo.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName))
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !digitando)) {
        e.preventDefault()
        inputRef.current?.focus()
        setAberto(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [atalho])

  // fecha ao clicar fora
  useEffect(() => {
    if (!aberto) return
    const fora = (e) => {
      if (!caixaRef.current?.contains(e.target)) setAberto(false)
    }
    document.addEventListener("mousedown", fora)
    return () => document.removeEventListener("mousedown", fora)
  }, [aberto])

  const ir = (item) => {
    if (!item) return
    setAberto(false)
    setTexto("")
    setItens([])
    inputRef.current?.blur()
    onNavegar?.()
    navigate(`/candidato/${item.slug}`, { viewTransition: true })
  }

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setAberto(true)
      setAtivo((a) => Math.min(itens.length - 1, a + 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setAtivo((a) => Math.max(0, a - 1))
    } else if (e.key === "Enter") {
      e.preventDefault()
      ir(itens[ativo] ?? itens[0])
    } else if (e.key === "Escape") {
      if (texto) setTexto("")
      else inputRef.current?.blur()
      setAberto(false)
    }
  }

  const mostrarLista = aberto && termo.length >= 2
  return (
    <div ref={caixaRef} className={juntar("relative", className)}>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={mostrarLista}
          aria-controls={listaId}
          aria-autocomplete="list"
          aria-activedescendant={mostrarLista && ativo >= 0 ? `${id}-op-${ativo}` : undefined}
          aria-label="Buscar candidato por nome ou número"
          placeholder="Buscar candidato…"
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value)
            setAberto(true)
          }}
          onFocus={() => setAberto(true)}
          onKeyDown={onKeyDown}
          className="h-10 w-full rounded-[var(--radius)] border border-grid-strong bg-surface pl-9 pr-16 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-accent/20 md:text-[13px] [&::-webkit-search-cancel-button]:appearance-none"
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {carregando && <Loader2 aria-hidden="true" className="size-3.5 animate-spin text-muted-foreground" />}
          {texto ? (
            <button type="button" onClick={() => { setTexto(""); inputRef.current?.focus() }} aria-label="Limpar busca" className="flex size-7 items-center justify-center rounded-[2px] text-muted-foreground hover:bg-surface-2 hover:text-foreground">
              <X aria-hidden="true" className="size-3.5" />
            </button>
          ) : (
            atalho && <kbd aria-hidden="true" className="hidden rounded-[2px] border border-grid px-1.5 font-mono text-[10px] text-muted-foreground md:inline">{EH_MAC ? "⌘K" : "Ctrl K"}</kbd>
          )}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {mostrarLista && !carregando ? (itens.length ? `${itens.length} ${itens.length === 1 ? "sugestão" : "sugestões"}. Use as setas para escolher.` : `Nenhum candidato encontrado para ${termo}.`) : ""}
      </p>
      {mostrarLista && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-popover overflow-hidden rounded-[var(--radius)] border border-grid bg-surface shadow-lg md:min-w-[360px]">
          <ul id={listaId} role="listbox" aria-label="Sugestões de candidatos" className="max-h-[min(70vh,440px)] overflow-y-auto py-1">
            {itens.map((c, i) => (
              <li
                key={c.slug}
                id={`${id}-op-${i}`}
                role="option"
                aria-selected={i === ativo}
                onMouseEnter={() => setAtivo(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => ir(c)}
                className={juntar("flex cursor-pointer items-center gap-3 px-3 py-2", i === ativo && "bg-accent-soft")}
              >
                <FotoCandidato src={c.foto_url} nome={c.nome_urna} className="h-10 w-[30px] shrink-0 rounded-[2px] border border-grid" iniciaisClassName="text-[11px]" />
                <span className="min-w-0 flex-1">
                  <span className={juntar("block truncate text-[14px] font-semibold", i === ativo ? "text-accent-strong" : "text-foreground")}>{c.nome_urna}</span>
                  <span className="block truncate font-mono text-[10.5px] uppercase tracking-[0.05em] text-muted-foreground">
                    {cargoRotulo(c.cargo)} · {c.partido}{c.numero ? ` · ${c.numero}` : ""}
                  </span>
                </span>
                {c.situacao_grupo && c.situacao_grupo !== "deferida" && <SeloSituacao situacao={c.situacao} grupo={c.situacao_grupo} />}
              </li>
            ))}
            {!carregando && itens.length === 0 && (
              <li className="px-3 py-4 text-[13px] text-muted-foreground" role="presentation">Nenhum candidato encontrado para “{termo}”.</li>
            )}
          </ul>
          <p className="border-t border-grid bg-surface-2 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
            ↑↓ navegar · Enter abrir · Esc fechar
          </p>
        </div>
      )}
    </div>
  )
}
