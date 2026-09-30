// Tela inicial: hero + números, seletor Senado | Deputado federal | Deputado estadual, destaques do banco.
import { useEffect, useId } from "react"
import { useSearchParams } from "react-router"
import { useApi, urlApi } from "../lib/api.js"
import { fmtInt, fmtBRLCompacto, fmtData, plural } from "../lib/format.js"
import { GRUPO_POR_SLUG } from "../lib/rotulos.js"
import { Botao, Eyebrow, Moldura, Secao, PAD, TituloSecao, Esqueleto, juntar } from "../components/ui/base.jsx"
import { Segmentos } from "../components/ui/controles.jsx"
import { EstadoErro } from "../components/ui/estados.jsx"
import { HeroArte } from "../components/Hero.jsx"
import { Fonte } from "../components/Fonte.jsx"
import { CandidatoCard, CandidatoLinha, CandidatoMini } from "../components/candidato.jsx"
import { SITE } from "../config.js"

const ABAS = [
  { id: "senado", rotulo: "Senado", sub: "2 vagas" },
  { id: "deputado-federal", rotulo: "Dep. federal", sub: "Câmara" },
  { id: "deputado-estadual", rotulo: "Dep. estadual", sub: "ALBA" },
]

export function Inicio() {
  const [params, setParams] = useSearchParams()
  const cargo = params.get("cargo")
  const aba = ABAS.some((a) => a.id === cargo) ? cargo : "senado"
  const { dados, erro, carregando, recarregar } = useApi("/api/inicio")

  useEffect(() => {
    document.title = SITE.titulo
  }, [])

  const escolher = (novo) => {
    const p = new URLSearchParams(params)
    p.set("cargo", novo)
    setParams(p, { replace: true, preventScrollReset: true })
  }

  return (
    <Moldura>
      <Hero dados={dados} />
      <Numeros dados={dados} carregando={carregando} />

      <Secao aria-labelledby="titulo-seletor" className={`${PAD} py-12 sm:py-16`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Eyebrow>Escolha o cargo</Eyebrow>
            <TituloSecao id="titulo-seletor" className="mt-3">
              Quem está na <span className="texto-gradiente">disputa</span>
            </TituloSecao>
          </div>
          <p className="max-w-sm text-[13px] text-muted-foreground">
            Tudo é Bahia: Senado, Câmara dos Deputados e Assembleia Legislativa.
          </p>
        </div>
        <SeletorCargo aba={aba} dados={dados} onEscolher={escolher} />
        <div key={aba} id={`painel-${aba}`} role="tabpanel" aria-labelledby={`aba-${aba}`} className="revelar mt-8">
          {erro && !dados ? (
            <EstadoErro erro={erro} onTentar={recarregar} />
          ) : aba !== "senado" ? (
            <PainelDeputados grupo={aba} dados={dados} />
          ) : (
            <PainelGrade grupo="senado" dados={dados} />
          )}
        </div>
      </Secao>

      <Destaques dados={dados} />
      <ComoLer />
    </Moldura>
  )
}

function Hero({ dados }) {
  const turno = dados?.calendario?.find((c) => /1º/.test(c.marco))
  return (
    <Secao semLinha className="relative overflow-hidden">
      <HeroArte className="intro-fundo h-[210px] sm:h-[300px] lg:h-[380px]" />
      <div className={`${PAD} intro-grupo relative z-10 pb-[190px] pt-10 sm:pb-[250px] sm:pt-16 lg:pb-[290px] lg:pt-20`}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Eyebrow>Eleições 2026 · Bahia</Eyebrow>
          {turno && (
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              1º turno em <span className="text-foreground">{fmtData(turno.data)}</span>{" "}
              <Fonte id={turno.fonte_id} mostrarData={false} className="ml-1" />
            </span>
          )}
        </div>
        <h1 className="mt-5 max-w-5xl font-heading text-[clamp(44px,10.5vw,124px)] uppercase leading-[0.96] tracking-[-0.01em] text-foreground">
          <span className="block">Quem pede seu voto</span>
          <span className="intro-linha mt-[0.08em] block pb-[0.04em]"><span className="texto-gradiente">na Bahia</span></span>
        </h1>
        <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-foreground sm:text-[17px]">
          Fichas dos candidatos da Bahia ao Senado, à Câmara dos Deputados e à Assembleia Legislativa, montadas só com dados públicos oficiais:
          patrimônio, campanha, emendas, cota parlamentar e atuação. <span className="text-muted-foreground">Cada informação tem link para a fonte.</span>
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Botao para="/deputado-federal" seta>Deputados federais</Botao>
          <Botao para="/senado" variante="secundario">Senado</Botao>
        </div>
      </div>
    </Secao>
  )
}

function Numeros({ dados, carregando }) {
  const t = dados?.totais
  const f = dados?.fontes
  const itens = [
    { rotulo: "candidaturas", valor: fmtInt(t?.candidatos), fonte: f?.identificacao, detalhe: "Senado, Câmara e Assembleia (Bahia)" },
    { rotulo: "patrimônio declarado (BA)", valor: fmtBRLCompacto(t?.patrimonio_ba_2026), fonte: f?.patrimonio, detalhe: "soma dos bens declarados ao TSE" },
    { rotulo: "arrecadado nas campanhas (BA)", valor: fmtBRLCompacto(t?.arrecadado_ba_2026), fonte: f?.arrecadacao, detalhe: "prestação parcial até 29/09" },
    { rotulo: "com mandato atual", valor: fmtInt(t?.com_mandato), fonte: f?.mandato ?? f?.identificacao, detalhe: "deputados e senadores (Câmara, Senado, ALBA)" },
  ]
  return (
    <Secao aria-label="Números gerais">
      <dl className="intro-grupo grid grid-cols-2 lg:grid-cols-4" style={{ "--base": "420ms" }}>
        {itens.map((it, i) => (
          <div key={it.rotulo} className={juntar("flex flex-col gap-1.5 px-4 py-6 sm:px-6 lg:px-10", i % 2 === 1 && "border-l border-grid", i >= 2 && "border-t border-grid lg:border-t-0", i === 2 && "lg:border-l")}>
            <dt className="order-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">{it.rotulo}</dt>
            <dd className="numero order-1 whitespace-nowrap text-[24px] font-medium leading-none text-foreground sm:text-[32px] xl:text-[40px]">
              {carregando && !t ? <Esqueleto className="h-8 w-24 sm:h-10" /> : it.valor}
            </dd>
            <dd className="order-3 hidden text-[12px] text-muted-foreground sm:block">{it.detalhe}</dd>
            <dd className="order-4">{it.fonte && <Fonte fonte={it.fonte} />}</dd>
          </div>
        ))}
      </dl>
    </Secao>
  )
}

function SeletorCargo({ aba, dados, onEscolher }) {
  const g = dados?.grupos
  const total = Object.fromEntries(ABAS.map((a) => [a.id, g?.[a.id]?.total]))
  const onKey = (e, i) => {
    if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return
    e.preventDefault()
    const prox = ABAS[(i + (e.key === "ArrowRight" ? 1 : ABAS.length - 1)) % ABAS.length]
    onEscolher(prox.id)
    requestAnimationFrame(() => document.getElementById(`aba-${prox.id}`)?.focus())
  }
  return (
    <>
      <div role="tablist" aria-label="Cargo em disputa" className="mt-8 grid grid-cols-3 border border-grid bg-surface">
        {ABAS.map((a, i) => {
          const ativo = a.id === aba
          return (
            <button
              key={a.id}
              id={`aba-${a.id}`}
              type="button"
              role="tab"
              aria-selected={ativo}
              aria-controls={`painel-${a.id}`}
              tabIndex={ativo ? 0 : -1}
              onKeyDown={(e) => onKey(e, i)}
              onClick={() => onEscolher(a.id)}
              className={juntar(
                "group relative flex min-h-[92px] flex-col items-start justify-between gap-2 px-3 py-3 text-left transition-colors sm:min-h-[128px] sm:px-5 sm:py-5",
                i > 0 && "border-l border-grid",
                ativo ? "bg-accent-soft/60" : "hover:bg-surface-2",
              )}
            >
              <span aria-hidden="true" className={juntar("absolute inset-x-0 top-0 h-[3px] transition-colors", ativo ? "bg-accent" : "bg-transparent group-hover:bg-grid-strong")} />
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground sm:text-[11px]">{a.sub}</span>
              <span className={juntar("whitespace-nowrap font-heading text-[clamp(16px,4.6vw,56px)] uppercase leading-[0.9] [overflow-wrap:normal]", ativo ? "text-accent" : "text-foreground")}>
                {a.rotulo}
              </span>
              <span className="numero text-[11px] text-muted-foreground sm:text-[13px]">
                {total[a.id] != null ? plural(total[a.id], "candidato") : "…"}
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}

function PainelGrade({ grupo, dados }) {
  const cfg = GRUPO_POR_SLUG[grupo]
  const lista = dados?.previas?.[grupo]
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <Eyebrow as="h3">{cfg.eyebrow}</Eyebrow>
        {dados?.fontes && <Fonte fonte={dados.fontes.identificacao} />}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {lista
          ? lista.map((c, i) => <CandidatoCard key={c.slug} c={c} indice={i} eager={i < 4} />)
          : Array.from({ length: 8 }, (_, i) => <Esqueleto key={i} className="aspect-[3/5]" />)}
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-muted-foreground">
          Mostrando candidaturas na disputa (deferidas ou em julgamento). Renúncias e indeferidas estão na lista completa.
        </p>
        <Botao para={`/${grupo}`} seta>Abrir lista completa</Botao>
      </div>
    </div>
  )
}

function PainelDeputados({ grupo, dados }) {
  const cfg = GRUPO_POR_SLUG[grupo]
  const ordem = grupo === "deputado-federal" ? "emendas" : "cota"
  const { dados: lista } = useApi(urlApi("candidatos", { grupo, mandato: "sim", ordem, por_pagina: 8 }))
  const c = dados?.por_cargo?.[cfg.cargo]
  const stats = [
    { r: "na disputa", v: c?.na_disputa },
    { r: "com mandato atual", v: c?.com_mandato },
    { r: "mulheres", v: c?.mulheres },
    { r: "partidos", v: c?.partidos },
  ]
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div>
        <Eyebrow as="h3">{cfg.eyebrow}</Eyebrow>
        <dl className="mt-5 grid grid-cols-2 border border-grid bg-surface">
          {stats.map((s, i) => (
            <div key={s.r} className={juntar("flex flex-col-reverse gap-1 p-4", i % 2 === 1 && "border-l border-grid", i >= 2 && "border-t border-grid")}>
              <dt className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">{s.r}</dt>
              <dd className="numero text-[28px] leading-none text-foreground">{fmtInt(s.v)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
          Centenas de nomes: a lista completa tem busca, filtro por partido, situação, gênero, cor/raça, faixa de
          patrimônio e município-base (onde teve mais votos em 2022).
        </p>
        <Botao para={`/${grupo}`} seta className="mt-5">Ver todos os {fmtInt(c?.na_disputa)}</Botao>
      </div>
      <div>
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
          Com mandato atual · maiores {ordem === "emendas" ? "emendas empenhadas" : "gastos de verba indenizatória"}
        </p>
        <ul className="@container divide-y divide-grid border border-grid bg-surface">
          {lista ? lista.itens.map((x) => <CandidatoLinha key={x.slug} c={x} />) : Array.from({ length: 5 }, (_, i) => <li key={i} className="p-3"><Esqueleto className="h-16" /></li>)}
        </ul>
        {lista?.fontes && (
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            <Fonte fonte={lista.fontes.patrimonio} rotulo="Patrimônio: TSE" />
            <Fonte fonte={lista.fontes.emendas} rotulo="Emendas: Portal da Transparência" />
            {lista.fontes.cota && <Fonte fonte={lista.fontes.cota} rotulo={`Cota: ${grupo === "deputado-estadual" ? "ALBA" : "Câmara"}`} />}
          </p>
        )}
      </div>
    </div>
  )
}

function Destaques({ dados }) {
  const [params, setParams] = useSearchParams()
  const lista = dados?.destaques ?? []
  const id = params.get("destaque") ?? "patrimonio"
  const atual = lista.find((d) => d.id === id) ?? lista[0]
  const tituloId = useId()
  const escolher = (novo) => {
    const p = new URLSearchParams(params)
    p.set("destaque", novo)
    setParams(p, { replace: true, preventScrollReset: true })
  }
  return (
    <Secao aria-labelledby={tituloId} className={`${PAD} py-12 sm:py-16`}>
      <Eyebrow>Destaques dos dados</Eyebrow>
      <div className="mt-3 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-14">
        <div>
          <TituloSecao id={tituloId}>
            O que os números <span className="texto-gradiente">mostram</span>
          </TituloSecao>
          <p className="mt-4 max-w-md text-[14px] leading-relaxed text-muted-foreground">
            Rankings calculados direto das bases oficiais, só com candidaturas da Bahia na disputa. Posição não é
            juízo de valor: abra a ficha e confira a fonte de cada número.
          </p>
          {lista.length > 0 && (
            <Segmentos
              rotulo="Escolha o destaque"
              className="mt-6"
              valor={atual?.id}
              onChange={escolher}
              opcoes={lista.map((d) => ({ value: d.id, label: rotuloCurto(d.id) }))}
            />
          )}
        </div>
        <div aria-live="polite">
          {!atual ? (
            <Esqueleto className="h-80" />
          ) : (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-grid pb-3">
                <h3 className="text-[17px] font-semibold text-foreground">{atual.titulo}</h3>
                <Fonte fonte={atual.fonte} />
              </div>
              <p className="mt-2 text-[13px] text-muted-foreground">{atual.descricao}</p>
              <ol className="mt-4">
                {atual.itens.map((c, i) => (
                  <li key={c.slug} className="linha-hover flex items-center gap-3 border-b border-dashed border-grid py-3 pl-2 sm:gap-5">
                    <span className="numero w-6 shrink-0 text-[13px] text-subtle-foreground">{String(i + 1).padStart(2, "0")}</span>
                    <CandidatoMini
                      c={c}
                      className="flex-1"
                      direita={<span className="numero shrink-0 text-right text-[15px] font-medium text-foreground sm:text-[18px]">{fmtBRLCompacto(c.valor)}</span>}
                    />
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </div>
    </Secao>
  )
}

function rotuloCurto(id) {
  return { patrimonio: "Patrimônio", emendas: "Emendas", cota_camara: "Cota Câmara", verba_alba: "Verba ALBA", arrecadacao: "Arrecadação" }[id] ?? id
}

function ComoLer() {
  const itens = [
    { n: "01", t: "Fonte em cada dado", d: "Todo valor traz um link pequeno para a base oficial (TSE, Portal da Transparência, Câmara, Senado, ALBA) e a data da coleta." },
    { n: "02", t: "Ausência não é zero", d: "“—” significa que não há dado público para aquele candidato. Zero só aparece quando foi declarado zero (ex.: declarou não ter bens)." },
    { n: "03", t: "Dado não é acusação", d: "O site mostra o que as fontes oficiais publicam, sem juízo de valor. Gasto, emenda ou sanção registrada não prova irregularidade." },
  ]
  return (
    <Secao className={`${PAD} py-12 sm:py-16`} aria-labelledby="como-ler">
      <Eyebrow aria-hidden="true">Como ler as fichas</Eyebrow>
      <h2 id="como-ler" className="sr-only">Como ler as fichas</h2>
      <ol className="mt-6 grid gap-px overflow-hidden border border-grid bg-grid sm:grid-cols-3">
        {itens.map((it) => (
          <li key={it.n} className="bg-surface p-5">
            <p className="numero text-[13px] text-accent">{it.n}</p>
            <p className="mt-3 text-[16px] font-semibold text-foreground">{it.t}</p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{it.d}</p>
          </li>
        ))}
      </ol>
      <Botao para="/fontes" variante="secundario" seta className="mt-6">Ver todas as fontes</Botao>
    </Secao>
  )
}
