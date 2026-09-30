// /fontes: tabela `fonte` completa (nome, descrição, link, data de coleta, licença).
import { useEffect, useMemo, useState } from "react"
import { Search } from "lucide-react"
import { useFontes } from "../components/Fonte.jsx"
import { Moldura, Secao, PAD, Eyebrow, Esqueleto } from "../components/ui/base.jsx"
import { EstadoVazio } from "../components/ui/estados.jsx"
import { fmtData, dominio } from "../lib/format.js"

const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

export function Fontes() {
  const { lista } = useFontes()
  const [q, setQ] = useState("")
  useEffect(() => {
    document.title = "Fontes · Eleições 2026 · Bahia"
  }, [])
  const filtradas = useMemo(() => {
    const t = semAcento(q.trim())
    if (!t) return lista
    return lista.filter((f) => semAcento(`${f.nome} ${f.descricao} ${f.url} ${f.chave}`).includes(t))
  }, [lista, q])

  return (
    <Moldura>
      <Secao semLinha className={`${PAD} intro-grupo pb-8 pt-8 sm:pt-12`}>
        <Eyebrow>Transparência dos dados</Eyebrow>
        <h1 className="mt-4 font-heading pt-[0.1em] text-[clamp(40px,9vw,96px)] uppercase leading-[0.92] text-foreground">
          Fontes <span className="texto-gradiente">oficiais</span>
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Todas as bases usadas nas fichas, com o link oficial, a data em que foram coletadas e a licença. Nas fichas, cada valor
          aponta para uma destas fontes ou para o documento específico (nota fiscal, emenda, votação, proposição). Dado publicado
          não é acusação: é o que a fonte oficial registra.
        </p>
      </Secao>
      <Secao className={`${PAD} py-6`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filtrar fontes (ex.: TSE, emendas, ALBA)"
              aria-label="Filtrar fontes"
              className="h-11 w-full rounded-[var(--radius)] border border-grid-strong bg-surface pl-9 pr-3 text-base outline-none placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-accent/20 md:h-10 md:text-[13px]"
            />
          </div>
          <p className="numero text-[12px] text-muted-foreground">{filtradas.length} de {lista.length} fontes</p>
        </div>
      </Secao>
      <Secao className="pb-12">
        {lista.length === 0 ? (
          <div className={`${PAD} space-y-3 py-6`}>{Array.from({ length: 6 }, (_, i) => <Esqueleto key={i} className="h-20" />)}</div>
        ) : filtradas.length === 0 ? (
          <EstadoVazio titulo="Nenhuma fonte encontrada">Tente outro termo.</EstadoVazio>
        ) : (
          <ol className="divide-y divide-grid">
            {filtradas.map((f) => (
              <li key={f.id} id={`fonte-${f.chave}`} className={`${PAD} grid gap-3 py-5 md:grid-cols-[48px_minmax(0,1.3fr)_minmax(0,1fr)_120px] md:gap-6`}>
                <span className="numero text-[12px] text-subtle-foreground">{String(f.id).padStart(2, "0")}</span>
                <div className="min-w-0">
                  <h2 className="text-[15px] font-semibold text-foreground">{f.nome}</h2>
                  {f.descricao && <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{f.descricao}</p>}
                  <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-subtle-foreground">{f.chave}</p>
                </div>
                <div className="min-w-0 text-[13px]">
                  <a href={f.url.replace("{ano}", "2026")} target="_blank" rel="noopener noreferrer" className="break-all font-mono text-[12px] text-accent-strong underline decoration-accent/30 underline-offset-2 hover:decoration-accent">
                    {dominio(f.url)} ↗
                  </a>
                  {f.url.includes("{ano}") && <p className="mt-1 text-[12px] text-muted-foreground">Um arquivo por ano; o link abre o de 2026 (troque o ano no endereço para os anteriores).</p>}
                  {f.licenca && <p className="mt-1 text-[12px] text-muted-foreground">Licença: {f.licenca}</p>}
                </div>
                <div className="md:text-right">
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Coletado em</p>
                  <p className="numero text-[14px] text-foreground">{fmtData(f.coletado_em)}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Secao>
    </Moldura>
  )
}
