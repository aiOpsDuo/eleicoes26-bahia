// Barra de abas da ficha: desktop rola na horizontal com fade nas bordas;
// celular mostra 3 abas + menu "Mais". Teclado: ←/→/Home/End (roving tabindex). Fica fixa abaixo da navbar.
import { useEffect, useRef, useState } from "react"
import { Check, ChevronDown, MoreHorizontal } from "lucide-react"
import { juntar } from "../ui/base.jsx"

const MOBILE_PRIMARIAS = ["geral", "patrimonio", "campanha"]
const ROTULO_MOBILE = { geral: "Visão", patrimonio: "Patrim.", campanha: "Campanha" }
// rótulo curto da aba atual no botão "Mais" (o nome completo vai no aria-label e no menu)
const ROTULO_CURTO = { cota: "Cota", atencao: "Sanções", trajetoria: "Trajet.", atuacao: "Atuação", emendas: "Emendas", fontes: "Fontes" }

function Contagem({ n, invertido = false }) {
  if (n == null || n <= 0) return null
  return (
    <span className={juntar("numero inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-[2px] px-1 text-[10px]", invertido ? "bg-white text-accent-strong" : "bg-accent-soft text-accent-strong")}>
      {n > 999 ? "999+" : n}
    </span>
  )
}

function aoTeclar(e, i, abas, prefixo, onTroca) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return
  e.preventDefault()
  const prox = e.key === "Home" ? 0 : e.key === "End" ? abas.length - 1 : e.key === "ArrowLeft" ? (i - 1 + abas.length) % abas.length : (i + 1) % abas.length
  const aba = abas[prox]
  if (!aba) return
  onTroca(aba.id)
  requestAnimationFrame(() => document.getElementById(`${prefixo}${aba.id}`)?.focus())
}

function BotaoAba({ aba, i, abas, ativa, prefixo, classe, rotulo, onTroca, semContagem = false }) {
  const eAtiva = ativa === aba.id
  const focavel = eAtiva || (i === 0 && !abas.some((a) => a.id === ativa))
  return (
    <button
      id={`${prefixo}${aba.id}`}
      type="button"
      role="tab"
      aria-selected={eAtiva}
      aria-controls={`painel-${aba.id}`}
      tabIndex={focavel ? 0 : -1}
      aria-label={aba.n > 0 ? `${aba.rotulo} (${aba.n})` : aba.rotulo}
      onClick={() => onTroca(aba.id)}
      onKeyDown={(e) => aoTeclar(e, i, abas, prefixo, onTroca)}
      className={classe(eAtiva)}
    >
      {rotulo}
      {!semContagem && <Contagem n={aba.n} />}
    </button>
  )
}

function useTransbordo(ref, ativa) {
  const [bordas, setBordas] = useState({ esq: false, dir: false })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const atualizar = () => setBordas({ esq: el.scrollLeft > 1, dir: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 })
    atualizar()
    el.addEventListener("scroll", atualizar, { passive: true })
    const ro = new ResizeObserver(atualizar)
    ro.observe(el)
    return () => {
      el.removeEventListener("scroll", atualizar)
      ro.disconnect()
    }
  }, [ref])
  useEffect(() => {
    const el = ref.current
    const btn = document.getElementById(`aba-desktop-${ativa}`)
    if (!el || !btn) return
    const ini = btn.offsetLeft - el.offsetLeft
    const fim = ini + btn.offsetWidth
    if (ini < el.scrollLeft) el.scrollTo({ left: Math.max(0, ini - 24) })
    else if (fim > el.scrollLeft + el.clientWidth) el.scrollTo({ left: fim - el.clientWidth + 24 })
  }, [ativa, ref])
  return bordas
}

/** Barra azul sob a aba ativa, deslizando entre as abas. */
function useIndicador(ref, ativa, abas) {
  const [pos, setPos] = useState(null)
  useEffect(() => {
    const medir = () => {
      const btn = document.getElementById(`aba-desktop-${ativa}`)
      if (!btn || !ref.current?.contains(btn)) return setPos(null)
      setPos({ x: btn.offsetLeft, w: btn.offsetWidth })
    }
    medir()
    const ro = new ResizeObserver(medir)
    if (ref.current) ro.observe(ref.current)
    return () => ro.disconnect()
  }, [ref, ativa, abas])
  return pos
}

function AbasDesktop({ abas, ativa, onTroca }) {
  const ref = useRef(null)
  const b = useTransbordo(ref, ativa)
  const ind = useIndicador(ref, ativa, abas)
  return (
    <div className="relative hidden sm:block">
      <div ref={ref} role="tablist" aria-label="Seções da ficha" className="relative -mb-px flex w-full overflow-x-auto scrollbar-none">
        {ind && <span aria-hidden="true" className="indicador-aba" style={{ width: ind.w, transform: `translateX(${ind.x}px)` }} />}
        {abas.map((aba, i) => (
          <BotaoAba
            key={aba.id} aba={aba} i={i} abas={abas} ativa={ativa} prefixo="aba-desktop-" rotulo={aba.rotulo} onTroca={onTroca}
            classe={(on) => juntar(
              "inline-flex min-h-12 shrink-0 items-center gap-1.5 border-b-2 px-4 font-mono text-[11.5px] font-medium uppercase tracking-[0.06em] outline-none transition-colors focus-visible:bg-accent-soft focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
              on ? "border-transparent text-accent-strong" : "border-transparent text-muted-foreground hover:border-grid-strong hover:text-foreground",
            )}
          />
        ))}
      </div>
      <div aria-hidden="true" className={juntar("pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-background to-transparent transition-opacity", b.esq ? "opacity-100" : "opacity-0")} />
      <div aria-hidden="true" className={juntar("pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent transition-opacity", b.dir ? "opacity-100" : "opacity-0")} />
    </div>
  )
}

function MenuMais({ abas, ativa, onTroca }) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef(null)
  const botaoRef = useRef(null)
  const atual = abas.find((a) => a.id === ativa)
  useEffect(() => {
    if (!aberto) return
    const itens = () => [...(ref.current?.querySelectorAll('[role="menuitemradio"]') ?? [])]
    requestAnimationFrame(() => (itens().find((b) => b.getAttribute("aria-checked") === "true") ?? itens()[0])?.focus())
    const fora = (e) => !ref.current?.contains(e.target) && setAberto(false)
    const esc = (e) => {
      if (e.key === "Escape") {
        setAberto(false)
        botaoRef.current?.focus()
        return
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return
      const lista = itens()
      if (!lista.length) return
      e.preventDefault()
      const i = lista.indexOf(document.activeElement)
      const prox = e.key === "Home" ? 0 : e.key === "End" ? lista.length - 1 : e.key === "ArrowDown" ? (i + 1) % lista.length : (i - 1 + lista.length) % lista.length
      lista[prox].focus()
    }
    document.addEventListener("mousedown", fora)
    document.addEventListener("keydown", esc)
    return () => {
      document.removeEventListener("mousedown", fora)
      document.removeEventListener("keydown", esc)
    }
  }, [aberto])
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        ref={botaoRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls="abas-mais"
        aria-label={atual ? `Mais seções (atual: ${atual.rotulo})` : "Mais seções"}
        onClick={() => setAberto((a) => !a)}
        className={juntar("inline-flex min-h-12 items-center gap-1 border-b-2 px-3 font-mono text-[11px] font-medium uppercase tracking-[0.05em] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent", atual ? "border-accent text-accent-strong" : "border-transparent text-muted-foreground")}
      >
        <MoreHorizontal aria-hidden="true" className="size-4" />
        {atual ? <span className="max-w-[80px] truncate" title={atual.rotulo}>{ROTULO_CURTO[atual.id] ?? atual.rotulo}</span> : "Mais"}
        <ChevronDown aria-hidden="true" className={juntar("size-3 transition-transform", aberto && "rotate-180")} />
      </button>
      {aberto && (
        <div id="abas-mais" role="menu" aria-label="Mais seções da ficha" className="absolute right-0 top-[calc(100%+6px)] z-popover max-h-[min(65vh,440px)] w-60 overflow-y-auto rounded-[var(--radius)] border border-grid bg-surface p-1 shadow-lg">
          {abas.map((aba) => {
            const on = aba.id === ativa
            return (
              <button
                key={aba.id}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                onClick={() => {
                  onTroca(aba.id)
                  setAberto(false)
                  botaoRef.current?.focus()
                }}
                className={juntar("flex min-h-11 w-full items-center justify-between gap-3 rounded-[2px] px-3 text-left text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent", on ? "bg-accent text-white" : "text-foreground hover:bg-surface-2")}
              >
                <span className="truncate">{aba.rotulo}</span>
                <span className="flex items-center gap-2">
                  <Contagem n={aba.n} invertido={on} />
                  {on && <Check aria-hidden="true" className="size-4" />}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** abas: [{ id, rotulo, n? }] */
export function ProfileTabs({ abas, ativa, onTroca }) {
  const primarias = MOBILE_PRIMARIAS.map((id) => abas.find((a) => a.id === id)).filter(Boolean)
  const mais = abas.filter((a) => !primarias.includes(a))
  return (
    <div className="sticky top-16 z-30 w-full border-y border-grid bg-background/95 backdrop-blur-sm">
      <nav aria-label="Seções da ficha" className="px-4 sm:px-6 lg:px-10">
        <AbasDesktop abas={abas} ativa={ativa} onTroca={onTroca} />
        <div className="-mb-px flex min-w-0 items-stretch sm:hidden">
          <div role="tablist" aria-label="Seções principais da ficha" className="grid min-w-0 flex-1 grid-cols-3">
            {primarias.map((aba, i) => (
              <BotaoAba
                key={aba.id} aba={aba} i={i} abas={primarias} ativa={ativa} prefixo="aba-" onTroca={onTroca} semContagem
                rotulo={<span className="truncate">{ROTULO_MOBILE[aba.id] ?? aba.rotulo}</span>}
                classe={(on) => juntar("inline-flex min-h-12 min-w-0 items-center justify-center gap-1 border-b-2 px-1 font-mono text-[10.5px] font-medium uppercase tracking-[0.04em] outline-none focus-visible:bg-accent-soft focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent", on ? "border-accent text-accent-strong" : "border-transparent text-muted-foreground")}
              />
            ))}
          </div>
          {mais.length > 0 && <MenuMais abas={mais} ativa={ativa} onTroca={onTroca} />}
        </div>
      </nav>
    </div>
  )
}
