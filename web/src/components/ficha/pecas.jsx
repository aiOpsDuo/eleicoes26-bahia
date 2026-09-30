// Peças compartilhadas das abas da ficha: cabeçalho de bloco, cartão de número, aviso, selos,
// link de documento/CNPJ, busca com atraso, estado na URL e a tabela paginada no servidor.
import { useEffect, useId, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router"
import { ArrowRight, ArrowLeft, ArrowUpRight, FileText, Info, Search, TriangleAlert, X, ChevronDown } from "lucide-react"
import { useApi, urlApi } from "../../lib/api.js"
import { fmtCNPJ, fmtInt, fmtBRL, TRACO } from "../../lib/format.js"
import { Eyebrow, Selo, BarraCarregando, Esqueleto, juntar } from "../ui/base.jsx"
import { EstadoErro } from "../ui/estados.jsx"
import { MenuEscolha } from "../ui/seletores.jsx"

// ---------------------------------------------------------------- textos e blocos

/** Cabeçalho de bloco dentro de uma aba: rótulo mono + título + descrição + ação à direita. */
export function Bloco({ id, eyebrow, titulo, descricao, acao, children, className }) {
  const hid = useId()
  return (
    <section aria-labelledby={titulo ? `${hid}-t` : undefined} id={id} className={juntar("min-w-0 scroll-mt-32", className)}>
      {(eyebrow || titulo || acao) && (
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
            {titulo && (
              <h3 id={`${hid}-t`} className="mt-2 font-heading text-[22px] uppercase leading-[0.95] text-foreground sm:text-[26px]">
                {titulo}
              </h3>
            )}
          </div>
          {acao}
        </header>
      )}
      {descricao && <p className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-muted-foreground">{descricao}</p>}
      <div className={eyebrow || titulo || descricao ? "mt-5" : undefined}>{children}</div>
    </section>
  )
}

/** Título da aba (grande). */
export function TituloAba({ eyebrow, titulo, children }) {
  return (
    <div className="mb-8 sm:mb-10">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-3 font-heading text-[length:var(--text-heading)] uppercase leading-[0.92] text-foreground sm:text-[length:var(--text-heading-lg)] lg:text-[44px]">
        {titulo}
      </h2>
      {children && <div className="mt-3 max-w-3xl text-[14px] leading-relaxed text-muted-foreground">{children}</div>}
    </div>
  )
}

/** Grade de cartões de número (dl). */
export function GradeNumeros({ children, className, colunas = "sm:grid-cols-2 lg:grid-cols-4" }) {
  // cada célula desenha a própria borda (esquerda/topo, deslocada 1px): células vazias no fim ficam brancas, sem “buraco” cinza
  return <dl className={juntar("grid overflow-hidden rounded-[var(--radius)] border border-grid bg-surface", colunas, className)}>{children}</dl>
}

/** Cartão de número: valor grande + rótulo + detalhe + fonte. `onClick` torna o cartão um botão. */
export function Numero({ rotulo, valor, sub, fonte, onClick, icone: Icone, tom, className }) {
  const corpo = (
    <>
      <dt className="order-2 flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
        {Icone && <Icone aria-hidden="true" className="size-3.5 shrink-0" />}
        {rotulo}
      </dt>
      <dd className={juntar("numero order-1 text-[22px] font-medium leading-none sm:text-[26px]", tom === "danger" ? "text-danger" : tom === "warn" ? "text-warn" : "text-foreground")}>
        {valor ?? TRACO}
      </dd>
      {sub && <dd className="order-3 text-[12px] leading-snug text-muted-foreground">{sub}</dd>}
    </>
  )
  return (
    <div className={juntar("relative -ml-px -mt-px flex min-w-0 flex-col gap-1.5 border-l border-t border-grid bg-surface px-4 py-4 sm:px-5", onClick && "group transition-colors hover:bg-surface-2", className)}>
      {corpo}
      {fonte && <dd className="order-4">{fonte}</dd>}
      {onClick && (
        <dd className="order-5">
          <button type="button" onClick={onClick} className="inline-flex items-center gap-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-accent-strong after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-[-2px] focus-visible:after:outline-ring">
            Ver seção <ArrowRight aria-hidden="true" className="size-3 transition-transform group-hover:translate-x-0.5" />
          </button>
        </dd>
      )}
    </div>
  )
}

const AVISO = {
  warn: { box: "border-warn/30 bg-warn-soft", icone: TriangleAlert, cor: "text-warn" },
  danger: { box: "border-danger/30 bg-danger-soft", icone: TriangleAlert, cor: "text-danger" },
  accent: { box: "border-accent/25 bg-accent-soft", icone: Info, cor: "text-accent-strong" },
  neutral: { box: "border-grid-strong bg-surface", icone: Info, cor: "text-muted-foreground" },
}
/** Painel de aviso (alerta de variação, dado parcial, explicações). */
export function Aviso({ tom = "neutral", titulo, eyebrow, children, className, role = "note" }) {
  const a = AVISO[tom] ?? AVISO.neutral
  const Icone = a.icone
  return (
    <div role={role} className={juntar("flex gap-3 rounded-[var(--radius)] border px-4 py-3", a.box, className)}>
      <Icone aria-hidden="true" className={juntar("mt-0.5 size-4 shrink-0", a.cor)} />
      <div className="min-w-0 text-[13px] leading-relaxed text-foreground">
        {eyebrow && <p className={juntar("font-mono text-[10.5px] uppercase tracking-[0.08em]", a.cor)}>{eyebrow}</p>}
        {titulo && <p className="font-semibold">{titulo}</p>}
        {children && <div className={titulo || eyebrow ? "mt-1 text-muted-foreground" : "text-muted-foreground"}>{children}</div>}
      </div>
    </div>
  )
}

/** Link "Abrir" para o documento específico (nota, emenda, votação, ato). Sem URL => traço com explicação. */
export function LinkDoc({ href, rotulo = "Abrir", descricao = "documento", semLink = "A fonte não publica link deste documento" }) {
  if (!href) return <span className="text-subtle-foreground" title={semLink}>—</span>
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1 whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.04em] text-accent-strong hover:underline">
      <FileText aria-hidden="true" className="size-3.5" /> {rotulo}
      <span className="sr-only"> {descricao} (abre em nova aba)</span>
    </a>
  )
}

/** CNPJ formatado com link para o cadastro na Receita (minhareceita.org). PF: nada (sem CPF). */
export function Cnpj({ cnpj, pf }) {
  if (pf) return <span className="text-[11px] text-muted-foreground">pessoa física</span>
  if (!cnpj) return <span className="text-subtle-foreground">—</span>
  const d = String(cnpj).replace(/\D/g, "")
  return (
    <a href={`https://minhareceita.org/${d}`} target="_blank" rel="noopener noreferrer" title="Cadastro na Receita Federal (via minhareceita.org)" className="numero whitespace-nowrap text-[12px] text-muted-foreground underline decoration-grid-strong underline-offset-2 hover:text-accent-strong">
      {fmtCNPJ(d)}
    </a>
  )
}

/** Link externo simples (texto). */
export function LinkExterno({ href, children, className }) {
  if (!href) return <>{children}</>
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={juntar("text-foreground underline decoration-grid-strong underline-offset-2 hover:text-accent-strong hover:decoration-accent", className)}>
      {children}
      <ArrowUpRight aria-hidden="true" className="ml-0.5 inline size-3 -translate-y-px text-muted-foreground" />
      <span className="sr-only"> (abre em nova aba)</span>
    </a>
  )
}

/** Texto longo com "ver mais". */
export function TextoExpansivel({ texto, limite = 220, className }) {
  const [aberto, setAberto] = useState(false)
  if (!texto) return null
  const longo = texto.length > limite
  return (
    <p className={juntar("whitespace-pre-line", className)}>
      {longo && !aberto ? `${texto.slice(0, limite).trimEnd()}…` : texto}
      {longo && (
        <button type="button" onClick={() => setAberto((a) => !a)} className="ml-1 font-mono text-[10.5px] uppercase tracking-[0.05em] text-accent-strong hover:underline">
          {aberto ? "ver menos" : "ver mais"}
        </button>
      )}
    </p>
  )
}

// ---------------------------------------------------------------- estado na URL

/**
 * Parâmetros de uma tabela/aba na URL, com prefixo (ex.: "n_" => ?n_ano=2024&n_q=...).
 * Trocar qualquer filtro volta a página para 1. `replace` para não poluir o histórico.
 */
export function useParamsUrl(prefixo) {
  const [params, setParams] = useSearchParams()
  const valores = useMemo(() => {
    const out = {}
    for (const [k, v] of params) if (k.startsWith(prefixo)) out[k.slice(prefixo.length)] = v
    return out
  }, [params, prefixo])
  const definir = (mudancas, { manterPagina = false } = {}) => {
    setParams(
      (atual) => {
        const p = new URLSearchParams(atual)
        for (const [k, v] of Object.entries(mudancas)) {
          if (v === null || v === undefined || v === "") p.delete(prefixo + k)
          else p.set(prefixo + k, String(v))
        }
        if (!manterPagina && !("pagina" in mudancas)) p.delete(`${prefixo}pagina`)
        return p
      },
      { replace: true, preventScrollReset: true },
    )
  }
  return [valores, definir]
}

// ---------------------------------------------------------------- controles

/** Campo de busca com atraso (350 ms) — valor controlado pela URL. */
export function CampoBusca({ valor, onChange, placeholder = "Buscar…", rotulo = "Buscar", className }) {
  const [texto, setTexto] = useState(valor ?? "")
  const ultimo = useRef(valor ?? "")
  useEffect(() => {
    if ((valor ?? "") !== ultimo.current) {
      ultimo.current = valor ?? ""
      setTexto(valor ?? "")
    }
  }, [valor])
  useEffect(() => {
    if (texto === ultimo.current) return
    const t = setTimeout(() => {
      ultimo.current = texto
      onChange(texto.trim())
    }, 350)
    return () => clearTimeout(t)
  }, [texto]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={juntar("relative min-w-0", className)}>
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={placeholder}
        aria-label={rotulo}
        className="h-11 w-full rounded-[var(--radius)] border border-grid-strong bg-surface pl-9 pr-9 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25 md:h-10 md:text-[13px] [&::-webkit-search-cancel-button]:hidden"
      />
      {texto && (
        <button type="button" onClick={() => { setTexto(""); ultimo.current = ""; onChange("") }} aria-label="Limpar busca" className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-[2px] text-muted-foreground hover:bg-surface-2 hover:text-foreground">
          <X aria-hidden="true" className="size-4" />
        </button>
      )}
    </div>
  )
}

/** Seletor simples (menu) com opção "todos". opcoes: [{ value, label, n? }] */
export function Seletor({ rotulo, valor, opcoes, onChange, todos = "Todos", className }) {
  const lista = [{ value: "", label: todos }, ...opcoes.map((o) => ({ ...o, value: String(o.value) }))]
  return <MenuEscolha rotulo={rotulo} prefixo={rotulo} opcoes={lista} valor={valor ?? ""} onChange={(v) => onChange(v)} className={juntar("w-full sm:w-auto", className)} />
}

/** Chip que remove um filtro ativo. */
export function ChipFiltro({ children, onRemover }) {
  return (
    <button type="button" onClick={onRemover} className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius)] border border-accent bg-accent-soft px-2 font-mono text-[11px] uppercase tracking-[0.04em] text-accent-strong hover:bg-surface" title="Remover filtro">
      {children} <X aria-hidden="true" className="size-3.5" />
    </button>
  )
}

/** Paginação por botões (estado na URL via callback). */
export function PaginacaoBotoes({ pagina, total, porPagina, onPagina }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina))
  if (paginas <= 1) return null
  const btn = "inline-flex min-h-10 min-w-10 items-center justify-center gap-1.5 rounded-[var(--radius)] border border-grid-strong bg-surface px-3 font-mono text-[11.5px] uppercase tracking-[0.05em] text-foreground hover:border-accent hover:text-accent-strong disabled:pointer-events-none disabled:opacity-40"
  return (
    <nav aria-label="Paginação da tabela" className="flex items-center justify-between gap-2">
      <button type="button" className={btn} disabled={pagina <= 1} onClick={() => onPagina(pagina - 1)}>
        <ArrowLeft aria-hidden="true" className="size-3.5" /> <span className="hidden sm:inline">Anterior</span>
      </button>
      <span className="numero text-[12px] text-muted-foreground">
        página {fmtInt(pagina)} de {fmtInt(paginas)}
      </span>
      <button type="button" className={btn} disabled={pagina >= paginas} onClick={() => onPagina(pagina + 1)}>
        <span className="hidden sm:inline">Próxima</span> <ArrowRight aria-hidden="true" className="size-3.5" />
      </button>
    </nav>
  )
}

// ---------------------------------------------------------------- tabela

/**
 * Tabela responsiva: <table> a partir de 640px; cartões empilhados no celular.
 * colunas: [{ id, rotulo, valor: (l) => node, alinhar?: "direita", classe?, principal?: bool, esconderCelular?: bool }]
 * documento: (l) => url | null (última coluna "Documento")
 */
export function Tabela({ colunas, linhas, documento, rotuloDocumento = "Documento", legenda, vazio = "Sem registros.", chave = (l, i) => l.id ?? i, minLargura = 640, carregando = false }) {
  if (!linhas?.length) return <p className="rounded-[var(--radius)] border border-dashed border-grid-strong bg-surface py-8 text-center text-[13px] text-muted-foreground">{vazio}</p>
  const principal = colunas.find((c) => c.principal) ?? colunas[0]
  const resto = colunas.filter((c) => c !== principal && !c.esconderCelular)
  return (
    <div className={juntar("transition-opacity", carregando && "opacity-60")}>
      {/* desktop/tablet */}
      <div className="hidden w-full overflow-x-auto rounded-[var(--radius)] border border-grid bg-surface sm:block">
        <table className="w-full border-collapse text-left text-[13px]" style={{ minWidth: minLargura }}>
          {legenda && <caption className="sr-only">{legenda}</caption>}
          <thead>
            <tr className="border-b border-grid bg-surface-2">
              {colunas.map((c) => (
                <th key={c.id} scope="col" className={juntar("px-3 py-2 font-mono text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground", c.alinhar === "direita" && "text-right")}>
                  {c.rotulo}
                </th>
              ))}
              {documento && <th scope="col" className="px-3 py-2 text-right font-mono text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{rotuloDocumento}</th>}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={chave(l, i)} className="border-b border-grid align-top last:border-0 hover:bg-surface-2">
                {colunas.map((c) => {
                  // a coluna principal identifica a linha: cabeçalho de linha para leitores de tela
                  const Cel = c === principal ? "th" : "td"
                  return (
                    <Cel key={c.id} scope={c === principal ? "row" : undefined} className={juntar("px-3 py-2 font-normal", c.alinhar === "direita" && "numero whitespace-nowrap text-right", c.classe)}>{c.valor(l)}</Cel>
                  )
                })}
                {documento && <td className="px-3 py-2 text-right"><LinkDoc href={documento(l)} rotulo="Abrir" /></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* celular: cartões */}
      <ul className="flex flex-col gap-2 sm:hidden" aria-label={legenda}>
        {linhas.map((l, i) => (
          <li key={chave(l, i)} className="rounded-[var(--radius)] border border-grid bg-surface px-3 py-3">
            <div className="text-[13.5px] font-medium text-foreground"><span className="sr-only">{principal.rotulo}: </span>{principal.valor(l)}</div>
            <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12.5px]">
              {resto.map((c) => (
                <div key={c.id} className="contents">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">{c.rotulo}</dt>
                  <dd className={juntar("min-w-0 text-foreground", c.alinhar === "direita" && "numero")}>{c.valor(l)}</dd>
                </div>
              ))}
            </dl>
            {documento && <div className="mt-2 border-t border-dashed border-grid pt-1"><LinkDoc href={documento(l)} rotulo="Abrir documento" /></div>}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Tabela paginada no servidor, com busca, filtros e ordenação na URL.
 * api: rota sem /api (ex.: `candidatos/felix/cota/notas`)
 * prefixo: prefixo dos parâmetros na URL (ex.: "n_")
 * filtros: [{ id, rotulo, opcoes?: [{value,label,n}], faceta?: "grupo" (usa resposta.facetas[faceta]), rotuloOpcao?: (v)=>label, todos? }]
 * fixos: parâmetros sempre enviados (não aparecem na URL)
 * resumo: (dados) => node exibido acima da tabela
 */
export function TabelaServidor({ api, prefixo, filtros = [], busca, ordens, ordemPadrao, fixos = {}, colunas, documento, rotuloDocumento, legenda, vazio, resumo, porPagina = 25, minLargura, extraFiltros }) {
  const [p, definir] = useParamsUrl(prefixo)
  const pagina = Math.max(1, Number(p.pagina) || 1)
  const consulta = { ...fixos, pagina, por_pagina: porPagina, q: p.q, ordem: p.ordem ?? ordemPadrao }
  for (const f of filtros) consulta[f.id] = p[f.id]
  const { dados, erro, carregando, recarregar } = useApi(urlApi(api, consulta))
  const topo = useRef(null)
  const irPagina = (n) => {
    definir({ pagina: n > 1 ? n : null })
    setTimeout(() => topo.current?.scrollIntoView({ block: "start" }), 60)
  }
  const ativos = filtros.filter((f) => p[f.id])
  return (
    <div ref={topo} className="scroll-mt-36">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:flex-wrap sm:items-center [&>*]:min-w-0">
        {busca && <CampoBusca valor={p.q} onChange={(v) => definir({ q: v })} placeholder={busca.placeholder} rotulo={busca.rotulo ?? busca.placeholder} className="col-span-2 sm:min-w-[260px] sm:flex-1" />}
        {filtros.map((f) => {
          const opcoes = f.opcoes ?? (dados?.facetas?.[f.faceta ?? f.id] ?? []).map((o) => ({ value: o.valor, label: f.rotuloOpcao ? f.rotuloOpcao(o.valor) : String(o.valor ?? "—"), n: o.n }))
          if (!opcoes.length && !p[f.id]) return null
          const comAtual = p[f.id] && !opcoes.some((o) => String(o.value) === p[f.id]) ? [...opcoes, { value: p[f.id], label: f.rotuloOpcao ? f.rotuloOpcao(p[f.id]) : p[f.id] }] : opcoes
          return <Seletor key={f.id} rotulo={f.rotulo} valor={p[f.id]} opcoes={comAtual} todos={f.todos ?? "Todos"} onChange={(v) => definir({ [f.id]: v })} />
        })}
        {ordens && <MenuEscolha rotulo="Ordenar" prefixo="Ordem" opcoes={ordens} valor={p.ordem ?? ordemPadrao} onChange={(v) => definir({ ordem: v === ordemPadrao ? null : v })} destacarAtivo={false} className="col-span-2 w-full sm:w-auto" />}
        {extraFiltros?.(p, definir)}
      </div>
      {(ativos.length > 0 || p.q) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {p.q && <ChipFiltro onRemover={() => definir({ q: null })}>“{p.q}”</ChipFiltro>}
          {ativos.map((f) => (
            <ChipFiltro key={f.id} onRemover={() => definir({ [f.id]: null })}>
              {f.rotulo}: {f.rotuloOpcao ? f.rotuloOpcao(p[f.id]) : p[f.id]}
            </ChipFiltro>
          ))}
          <button type="button" onClick={() => definir(Object.fromEntries([["q", null], ...filtros.map((f) => [f.id, null])]))} className="min-h-8 px-2 font-mono text-[11px] uppercase tracking-[0.04em] text-muted-foreground underline underline-offset-2 hover:text-foreground">
            Limpar tudo
          </button>
        </div>
      )}
      <div className="mt-3">
        <BarraCarregando ativo={carregando} />
        {erro && !dados ? (
          <EstadoErro erro={erro} onTentar={recarregar} />
        ) : !dados ? (
          <div className="space-y-2 pt-2">
            <Esqueleto className="h-9 w-full" />
            <Esqueleto className="h-9 w-full" />
            <Esqueleto className="h-9 w-full" />
          </div>
        ) : (
          <>
            <p className="mb-2 mt-1 flex flex-wrap items-baseline gap-x-3 font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground" aria-live="polite">
              <span><span className="numero text-foreground">{fmtInt(dados.total)}</span> {dados.total === 1 ? "registro" : "registros"}</span>
              {dados.soma != null && typeof dados.soma === "number" && <span>soma do filtro <span className="numero text-foreground">{fmtBRL(dados.soma)}</span></span>}
              {resumo?.(dados)}
            </p>
            <Tabela colunas={colunas} linhas={dados.linhas} documento={documento} rotuloDocumento={rotuloDocumento} legenda={legenda} vazio={vazio ?? "Nenhum registro com esses filtros."} minLargura={minLargura} carregando={carregando} />
            <div className="mt-3">
              <PaginacaoBotoes pagina={dados.pagina} total={dados.total} porPagina={dados.por_pagina} onPagina={irPagina} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** Detalhes recolhíveis (<details>) no estilo da ficha. */
export function Recolhivel({ titulo, children, aberto = false, className }) {
  return (
    <details open={aberto} className={juntar("group rounded-[var(--radius)] border border-grid bg-surface", className)}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-[13.5px] font-medium text-foreground [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">{titulo}</span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-grid px-4 py-3">{children}</div>
    </details>
  )
}

/** Carregamento de uma seção (GET /api/candidatos/:slug/<secao>). */
export function useSecao(slug, secao, params) {
  return useApi(slug ? urlApi(`candidatos/${encodeURIComponent(slug)}/${secao}`, params) : null)
}

/** Esqueleto/erro padrão de uma aba enquanto a seção carrega. */
export function EstadoSecao({ erro, recarregar }) {
  if (erro) return <EstadoErro erro={erro} onTentar={recarregar} />
  return (
    <div aria-busy="true" className="space-y-4">
      <span className="sr-only" role="status">Carregando…</span>
      <Esqueleto className="h-8 w-64" />
      <div className="grid gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Esqueleto key={i} className="h-24" />)}
      </div>
      <Esqueleto className="h-56 w-full" />
    </div>
  )
}

/** Rola até um bloco depois que a URL/estado atualizou (filtro clicado num gráfico, por exemplo). */
export function rolarPara(id) {
  setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start" }), 60) // instantâneo: a rolagem suave é cancelada pela re-renderização da tabela
}
