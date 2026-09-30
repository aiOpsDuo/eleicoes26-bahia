// Lista por grupo: grade de cards (senado) ou lista densa paginada (deputados).
// Todos os filtros ficam na URL (query string): compartilhável e com "voltar" do navegador.
import { useEffect, useId, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router"
import { NavLink } from "../lib/nav.jsx"
import { LayoutGrid, List as ListIcon, Search, SlidersHorizontal, X } from "lucide-react"
import { useApi, urlApi } from "../lib/api.js"
import { fmtInt } from "../lib/format.js"
import { GRUPOS, GRUPO_POR_SLUG, ORDENS, GENERO_ROTULO, COR_ROTULO } from "../lib/rotulos.js"
import { Moldura, Secao, PAD, Eyebrow, BarraCarregando, Esqueleto, Botao, juntar } from "../components/ui/base.jsx"
import { Segmentos, Alternador, Paginacao } from "../components/ui/controles.jsx"
import { ComboFiltro, MenuEscolha } from "../components/ui/seletores.jsx"
import { EstadoVazio, EstadoErro } from "../components/ui/estados.jsx"
import { CandidatoCard, CandidatoLinha, COLUNAS_LISTA } from "../components/candidato.jsx"
import { Fonte } from "../components/Fonte.jsx"

// parâmetros de filtro aceitos na URL (e repassados à API)
const FILTROS = ["q", "partido", "situacao", "mandato", "genero", "cor_raca", "faixa_patrimonio", "municipio", "ordem"]
const PADRAO = { situacao: "na_disputa", ordem: "nome" }

function useDebounce(valor, ms) {
  const [v, setV] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return v
}

export function Lista({ grupo }) {
  const cfg = GRUPO_POR_SLUG[grupo]
  const [params, setParams] = useSearchParams()
  const filtrosId = useId()
  const topoRef = useRef(null)
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)

  const f = Object.fromEntries(FILTROS.map((k) => [k, params.get(k) ?? PADRAO[k] ?? ""]))
  const pagina = Math.max(1, Number(params.get("pagina")) || 1)
  const visao = params.get("visao") ?? (cfg.layout === "grade" ? "grade" : "lista")
  const porPagina = cfg.layout === "grade" ? 60 : 30

  // busca local (digitação) -> URL com debounce
  const [texto, setTexto] = useState(f.q)
  const textoDebounced = useDebounce(texto, 280)
  const qUrl = params.get("q") ?? ""
  useEffect(() => setTexto(qUrl), [qUrl])
  useEffect(() => {
    if ((params.get("q") ?? "") !== textoDebounced.trim()) atualizar({ q: textoDebounced.trim() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textoDebounced])

  function atualizar(mudancas, { manterPagina = false } = {}) {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(mudancas)) {
      if (v === "" || v == null || v === PADRAO[k] || (k === "visao" && v === (cfg.layout === "grade" ? "grade" : "lista"))) p.delete(k)
      else p.set(k, v)
    }
    if (!manterPagina) p.delete("pagina")
    setParams(p, { replace: true, preventScrollReset: true })
  }

  const filtrosApi = { grupo, ...Object.fromEntries(FILTROS.map((k) => [k, f[k]])) }
  const lista = useApi(urlApi("candidatos", { ...filtrosApi, pagina, por_pagina: porPagina }))
  const { ordem: _o, ...semOrdem } = filtrosApi
  const filtros = useApi(urlApi("filtros", semOrdem))

  useEffect(() => {
    document.title = `${cfg.titulo} · Eleições 2026 · Bahia`
  }, [cfg.titulo])

  // ao trocar de página, volta ao topo da lista
  const paginaAnterior = useRef(pagina)
  useEffect(() => {
    if (paginaAnterior.current !== pagina) topoRef.current?.scrollIntoView({ block: "start" })
    paginaAnterior.current = pagina
  }, [pagina])

  const fo = filtros.dados
  const opcoesPartido = useMemo(() => (fo?.partidos ?? []).map((p) => ({ value: p.valor, label: p.valor, n: p.n })), [fo])
  const opcoesMunicipio = useMemo(() => (fo?.municipios ?? []).map((m) => ({ value: m.valor, label: m.rotulo, n: m.n })), [fo])
  const temMunicipio = cfg.layout === "lista"

  const ativos = [
    f.partido && { k: "partido", rotulo: `Partido: ${f.partido}` },
    f.mandato && { k: "mandato", rotulo: f.mandato === "sim" ? "Com mandato atual" : "Sem mandato" },
    f.genero && { k: "genero", rotulo: GENERO_ROTULO[f.genero] ?? f.genero },
    f.cor_raca && { k: "cor_raca", rotulo: `Cor/raça: ${COR_ROTULO[f.cor_raca] ?? f.cor_raca}` },
    f.faixa_patrimonio && { k: "faixa_patrimonio", rotulo: fo?.faixas_patrimonio?.find((x) => x.valor === f.faixa_patrimonio)?.rotulo ?? f.faixa_patrimonio },
    f.municipio && { k: "municipio", rotulo: `Base: ${opcoesMunicipio.find((m) => m.value === f.municipio)?.label ?? f.municipio}` },
    f.situacao !== "na_disputa" && { k: "situacao", rotulo: `Situação: ${fo?.situacoes?.find((s) => s.valor === f.situacao)?.rotulo ?? f.situacao}` },
    f.q && { k: "q", rotulo: `Busca: “${f.q}”` },
  ].filter(Boolean)
  const limparTudo = () => {
    setTexto("")
    const p = new URLSearchParams()
    if (params.get("visao")) p.set("visao", params.get("visao"))
    if (f.ordem !== "nome") p.set("ordem", f.ordem)
    setParams(p, { replace: true, preventScrollReset: true })
  }

  const ordemAtual = ORDENS.find((o) => o.valor === f.ordem) ?? ORDENS[0]
  const d = lista.dados
  const total = d?.total
  const carregandoNovo = lista.carregando

  const hrefPagina = (n) => {
    const p = new URLSearchParams(params)
    if (n <= 1) p.delete("pagina")
    else p.set("pagina", String(n))
    const s = p.toString()
    return s ? `?${s}` : "?"
  }

  const controlesFiltro = (
    <>
      <ComboFiltro rotulo="Partido" placeholder="Partido…" opcoes={opcoesPartido} valor={f.partido} onChange={(v) => atualizar({ partido: v })} largura="w-full sm:w-[170px]" />
      <MenuEscolha
        rotulo="Gênero" prefixo="Gênero" valor={f.genero} onChange={(v) => atualizar({ genero: v })} className="w-full sm:w-auto"
        opcoes={[{ value: "", label: "Todos" }, ...(fo?.generos ?? []).map((g) => ({ value: g.valor, label: GENERO_ROTULO[g.valor] ?? g.valor, n: g.n }))]}
      />
      <MenuEscolha
        rotulo="Cor/raça" prefixo="Cor/raça" valor={f.cor_raca} onChange={(v) => atualizar({ cor_raca: v })} className="w-full sm:w-auto"
        opcoes={[{ value: "", label: "Todas" }, ...(fo?.cores_raca ?? []).map((g) => ({ value: g.valor, label: COR_ROTULO[g.valor] ?? g.valor, n: g.n }))]}
      />
      <MenuEscolha
        rotulo="Faixa de patrimônio" prefixo="Patrimônio" valor={f.faixa_patrimonio} onChange={(v) => atualizar({ faixa_patrimonio: v })} className="w-full sm:w-auto"
        opcoes={[{ value: "", label: "Todas" }, ...(fo?.faixas_patrimonio ?? []).map((g) => ({ value: g.valor, label: g.rotulo, n: g.n }))]}
      />
      {temMunicipio && (
        <ComboFiltro rotulo="Município-base" placeholder="Município-base…" opcoes={opcoesMunicipio} valor={f.municipio} onChange={(v) => atualizar({ municipio: v })} largura="w-full sm:w-[200px]" />
      )}
    </>
  )

  return (
    <Moldura>
      {/* cabeçalho */}
      <Secao semLinha className={`${PAD} intro-grupo pb-6 pt-8 sm:pt-12`}>
        <Eyebrow>{cfg.ambito === "Nacional" ? "Eleições 2026 · Nacional" : "Eleições 2026 · Bahia"}</Eyebrow>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <h1 className="font-heading pt-[0.1em] text-[clamp(40px,9vw,96px)] uppercase leading-[0.92] text-foreground">
            {cfg.titulo.split(" ")[0]}{" "}
            {cfg.titulo.split(" ").slice(1).length > 0 && <span className="texto-gradiente">{cfg.titulo.split(" ").slice(1).join(" ")}</span>}
          </h1>
          <p className="numero pb-1 text-[13px] text-muted-foreground">
            {total != null ? <><span className="text-[22px] text-foreground">{fmtInt(total)}</span> {total === 1 ? "candidatura" : "candidaturas"}</> : "…"}
          </p>
        </div>
        <p className="mt-3 max-w-2xl text-[14px] text-muted-foreground">{cfg.eyebrow}. {cfg.slug === "senado" && "Duas vagas em 2026; cada chapa tem dois suplentes."}</p>
      </Secao>

      {/* troca de grupo */}
      <Secao as="nav" aria-label="Cargos" className="overflow-x-auto scrollbar-none">
        <ul className="flex min-w-max">
          {GRUPOS.map((g) => (
            <li key={g.slug} className="border-r border-grid last:border-r-0">
              <NavLink
                to={`/${g.slug}`}
                className={({ isActive }) =>
                  juntar("relative flex min-h-12 items-center px-4 font-mono text-[11.5px] uppercase tracking-[0.06em] transition-colors sm:px-6",
                    isActive ? "bg-accent-soft/60 text-accent-strong after:absolute after:inset-x-0 after:top-0 after:h-[3px] after:bg-accent" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground")
                }
              >
                {g.rotulo}
              </NavLink>
            </li>
          ))}
        </ul>
      </Secao>

      {/* ferramentas */}
      <Secao className={`${PAD} py-5`} aria-label="Filtros">
        <div ref={topoRef} className="scroll-mt-20" />
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="relative min-w-0 flex-1 lg:max-w-md">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Nome, número, partido"
                aria-label={`Buscar em ${cfg.titulo.toLowerCase()} por nome, número ou partido`}
                className="h-11 w-full rounded-[var(--radius)] border border-grid-strong bg-surface pl-9 pr-10 text-base outline-none placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-accent/20 md:h-10 md:text-[13px] [&::-webkit-search-cancel-button]:appearance-none"
              />
              {texto && (
                <button type="button" onClick={() => setTexto("")} aria-label="Limpar busca" className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-[2px] text-muted-foreground hover:bg-surface-2">
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setFiltrosAbertos((a) => !a)}
              aria-expanded={filtrosAbertos}
              aria-controls={filtrosId}
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-[var(--radius)] border border-grid-strong bg-surface px-3 font-mono text-[11.5px] uppercase tracking-[0.05em] text-foreground sm:hidden"
            >
              <SlidersHorizontal aria-hidden="true" className="size-4" /> Filtros
              {ativos.length > 0 && <span className="numero flex size-5 items-center justify-center rounded-[2px] bg-accent text-[10px] text-white">{ativos.length}</span>}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MenuEscolha
              rotulo="Ordenar" valor={f.ordem} onChange={(v) => atualizar({ ordem: v })} destacarAtivo={false} className="min-w-0 flex-1 sm:flex-none"
              opcoes={ORDENS.map((o) => ({ value: o.valor, label: o.rotulo, curto: `Ordem: ${o.curto}` }))}
            />
            <div className="inline-flex h-11 shrink-0 md:h-10" role="group" aria-label="Visualização">
              {[{ v: "grade", I: LayoutGrid, r: "grade" }, { v: "lista", I: ListIcon, r: "lista" }].map(({ v, I, r }, i) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={visao === v}
                  aria-label={`Ver em ${r}`}
                  onClick={() => atualizar({ visao: v }, { manterPagina: true })}
                  className={juntar("flex w-11 items-center justify-center border md:w-10", i === 0 ? "rounded-l-[var(--radius)]" : "-ml-px rounded-r-[var(--radius)]",
                    visao === v ? "z-10 border-accent bg-accent text-white" : "border-grid-strong bg-surface text-foreground hover:text-accent-strong")}
                >
                  <I aria-hidden="true" className="size-4" />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div id={filtrosId} className={juntar("mt-3 flex-col gap-3 sm:flex", filtrosAbertos ? "flex" : "hidden")}>
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
            {controlesFiltro}
            <Alternador ligado={f.mandato === "sim"} onChange={(on) => atualizar({ mandato: on ? "sim" : "" })} n={fo?.mandato?.sim}>
              Com mandato atual
            </Alternador>
          </div>
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
            <span className="shrink-0 whitespace-nowrap font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">Situação do registro</span>
            <Segmentos
              rotulo="Situação da candidatura"
              valor={f.situacao}
              onChange={(v) => atualizar({ situacao: v })}
              opcoes={(fo?.situacoes ?? [{ valor: "na_disputa", rotulo: "Na disputa" }]).map((s) => ({ value: s.valor, label: s.rotulo, n: s.n }))}
            />
            <Fonte fonte={d?.fontes?.situacao} className="shrink-0 sm:ml-auto" />
          </div>
        </div>

        {/* filtros ativos + resumo */}
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground" aria-live="polite">
          <span className="numero">{total != null ? `${fmtInt(total)} ${total === 1 ? "resultado" : "resultados"}` : "Carregando…"}</span>
          {ativos.map((a) => (
            <button
              key={a.k}
              type="button"
              onClick={() => {
                if (a.k === "q") setTexto("")
                atualizar({ [a.k]: "" })
              }}
              className="inline-flex min-h-8 items-center gap-1 rounded-[2px] border border-accent/30 bg-accent-soft px-2 font-mono text-[10.5px] uppercase tracking-[0.04em] text-accent-strong hover:border-accent"
              aria-label={`Remover filtro ${a.rotulo}`}
            >
              {a.rotulo} <X aria-hidden="true" className="size-3" />
            </button>
          ))}
          {ativos.length > 1 && (
            <button type="button" onClick={limparTudo} className="min-h-8 px-1 font-mono text-[10.5px] uppercase tracking-[0.04em] text-foreground underline underline-offset-2">
              Limpar filtros
            </button>
          )}
        </div>
        <p className="mt-2 max-w-3xl text-[12px] text-muted-foreground">{ordemAtual.descricao}</p>
      </Secao>

      {/* resultados */}
      <Secao className="pb-10" aria-label="Resultados" aria-busy={carregandoNovo}>
        <BarraCarregando ativo={carregandoNovo && Boolean(d)} />
        <div className={juntar(PAD, "pt-5 transition-opacity", carregandoNovo && d && "opacity-60")}>
          {lista.erro && !d ? (
            <EstadoErro erro={lista.erro} onTentar={lista.recarregar} />
          ) : !d ? (
            visao === "grade" ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Esqueleto key={i} className="aspect-[3/5]" />)}</div>
            ) : (
              <div className="space-y-2">{Array.from({ length: 8 }, (_, i) => <Esqueleto key={i} className="h-[88px]" />)}</div>
            )
          ) : d.itens.length === 0 ? (
            <EstadoVazio
              titulo="Nenhuma candidatura com esses filtros"
              acao={ativos.length > 0 && <Botao variante="secundario" onClick={limparTudo}>Limpar filtros</Botao>}
            >
              {f.q ? `Nada encontrado para “${f.q}”. Confira a grafia ou busque pelo número de urna.` : "Tente remover algum filtro ou mudar a situação do registro para “Todas”."}
            </EstadoVazio>
          ) : visao === "grade" ? (
            <div className="revelar grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
              {d.itens.map((c, i) => <CandidatoCard key={c.slug} c={c} indice={i} eager={i < 4} />)}
            </div>
          ) : (
            <div className="revelar @container border border-grid bg-surface">
              <div className="hidden grid-cols-[48px_minmax(0,1.6fr)_104px_repeat(4,minmax(0,0.8fr))] gap-x-4 border-b border-grid bg-surface-2 px-4 py-2 @4xl:grid" aria-hidden="true">
                <span />
                <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">Candidato</span>
                <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">Nº / partido</span>
                {COLUNAS_LISTA.map((c) => (
                  <span key={c.id} title={c.dica} className={juntar("text-right font-mono text-[10.5px] uppercase tracking-[0.06em]", f.ordem === (c.id === "arrecadacao" ? "arrecadacao" : c.id) ? "text-accent-strong" : "text-muted-foreground")}>
                    {c.rotulo}
                  </span>
                ))}
              </div>
              <ul className="divide-y divide-grid" aria-label={`Candidaturas a ${cfg.titulo.toLowerCase()}`}>
                {d.itens.map((c) => <CandidatoLinha key={c.slug} c={c} />)}
              </ul>
            </div>
          )}

          {d && d.itens.length > 0 && (
            <>
              <div className="mt-6">
                <Paginacao pagina={d.pagina} paginas={d.paginas} hrefPagina={hrefPagina} rotulo={`Páginas de ${cfg.titulo.toLowerCase()}`} />
              </div>
              <div className="mt-6 flex flex-col gap-1.5 border-t border-dashed border-grid pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
                <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">Fontes desta lista</span>
                <Fonte fonte={d.fontes.identificacao} rotulo="Candidaturas" />
                <Fonte fonte={d.fontes.patrimonio} rotulo="Patrimônio" />
                <Fonte fonte={d.fontes.arrecadacao} rotulo="Arrecadação" />
                <Fonte fonte={d.fontes.emendas} rotulo="Emendas" />
                {d.fontes.cota && <Fonte fonte={d.fontes.cota} rotulo="Cota" />}
                {temMunicipio && <Fonte fonte={d.fontes.municipio_base} rotulo="Município-base (votos 2022)" />}
              </div>
            </>
          )}
        </div>
      </Secao>
    </Moldura>
  )
}
