// Ficha do candidato (/candidato/:slug): cabeçalho completo + números-resumo + abas.
// As abas (pages/ficha/abas.jsx) buscam cada seção em /api/candidatos/:slug/<secao>; estado da aba em ?aba=.
import { Suspense, useEffect, useState } from "react"
import { useParams, useSearchParams } from "react-router"
import { Link } from "../lib/nav.jsx"
import { ArrowLeft, Globe, Landmark, Wallet, HandCoins, Receipt, TriangleAlert } from "lucide-react"
import { useApi } from "../lib/api.js"
import { fmtBRLCompacto, fmtInt, fmtPct, fmtData, capitalizar, vazio, plural } from "../lib/format.js"
import { cargoRotulo, GRUPO_POR_CARGO, PAPEL_ROTULO, REDE_ROTULO } from "../lib/rotulos.js"
import { Moldura, Secao, PAD, Esqueleto, Selo, juntar } from "../components/ui/base.jsx"
import { EstadoErro } from "../components/ui/estados.jsx"
import { FotoCandidato, SeloSituacao } from "../components/candidato.jsx"
import { Fonte } from "../components/Fonte.jsx"
import { ProfileTabs } from "../components/ficha/ProfileTabs.jsx"
import { abasDaFicha } from "./ficha/abas.jsx"
import { NaoEncontrado } from "./NaoEncontrado.jsx"

export function Ficha() {
  const { slug } = useParams()
  const [params, setParams] = useSearchParams()
  const { dados, erro, carregando, recarregar, atual } = useApi(`/api/candidatos/${encodeURIComponent(slug)}`)

  useEffect(() => {
    if (dados?.ficha && atual) document.title = `${dados.ficha.nome_urna} (${dados.ficha.partido}) · ${cargoRotulo(dados.ficha.cargo)} · Eleições 2026`
  }, [dados, atual])

  if (erro?.status === 404) return <NaoEncontrado titulo="Candidato não encontrado">Não há ficha com o endereço “{slug}”. Use a busca no topo.</NaoEncontrado>
  if (erro && !dados) return <Moldura className="py-10"><EstadoErro erro={erro} onTentar={recarregar} /></Moldura>
  if (!dados || (carregando && dados.ficha.slug !== slug)) return <FichaCarregando />

  const f = dados.ficha
  const abas = abasDaFicha(f)
  const abaAtiva = abas.find((a) => a.id === params.get("aba"))?.id ?? "geral"
  const Aba = abas.find((a) => a.id === abaAtiva).componente
  // trocar de aba limpa os filtros da aba anterior (parâmetros com prefixo) e mantém só ?aba=
  const trocarAba = (id, { rolar = false } = {}) => {
    const p = new URLSearchParams()
    if (id !== "geral") p.set("aba", id)
    setParams(p, { replace: true, preventScrollReset: true })
    if (rolar) setTimeout(() => document.getElementById("abas-ficha")?.scrollIntoView({ block: "start" }), 60)
  }

  return (
    <Moldura className="revelar">
      <Cabecalho dados={dados} />
      <Resumo dados={dados} abas={abas} irAba={(id) => trocarAba(id, { rolar: true })} />
      <div id="abas-ficha" className="scroll-mt-16" />
      <ProfileTabs abas={abas} ativa={abaAtiva} onTroca={trocarAba} />
      <div
        id={`painel-${abaAtiva}`}
        role="tabpanel"
        aria-labelledby={`aba-desktop-${abaAtiva}`}
        tabIndex={0}
        className={`${PAD} py-10 outline-none sm:py-14`}
      >
        <Suspense fallback={<AbaCarregando />}>
          <div key={`${f.slug}-${abaAtiva}`} className="aba-entrada">
            <Aba dados={dados} abas={abas} irAba={(id) => trocarAba(id, { rolar: true })} />
          </div>
        </Suspense>
      </div>
    </Moldura>
  )
}

function Cabecalho({ dados }) {
  const { ficha: f, chapa, titular, redes, fontes } = dados
  const grupo = GRUPO_POR_CARGO[f.cargo]
  const credito = f.foto_url && (fontes.foto ? { texto: "Foto: TSE, divulgação de candidaturas", fonte: fontes.foto } : f.foto_credito ? { texto: f.foto_credito.replace(/wikimedia_commons/gi, "Wikimedia Commons"), href: f.foto_fonte_url } : null)
  const fatos = [
    f.idade != null && `${f.idade} anos`,
    f.ocupacao && capitalizar(f.ocupacao),
    f.grau_instrucao && capitalizar(f.grau_instrucao),
    f.naturalidade && `Natural de ${f.naturalidade}`,
  ].filter(Boolean)

  return (
    <Secao semLinha className={`${PAD} pb-8 pt-6 sm:pb-10 sm:pt-8`}>
      <Link to={`/${grupo.slug}`} className="inline-flex min-h-11 items-center gap-2 font-mono text-[11.5px] uppercase tracking-[0.06em] text-muted-foreground hover:text-accent-strong">
        <ArrowLeft aria-hidden="true" className="size-3.5" /> {grupo.titulo}
      </Link>

      <div className="mt-4 grid gap-6 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-8 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-12">
        {/* foto */}
        <figure className="intro-item max-w-[150px] sm:max-w-none">
          <div className="relative aspect-[3/4] overflow-hidden rounded-[var(--radius)] border border-grid bg-surface-2">
            <FotoCandidato src={f.foto_url} nome={f.nome_urna} eager className="absolute inset-0 size-full" iniciaisClassName="text-[80px]" />
            {f.numero && (
              <span className="numero absolute bottom-0 left-0 bg-foreground px-2.5 py-1 text-[20px] font-semibold text-background">{f.numero}</span>
            )}
          </div>
          {credito && (
            <figcaption className="mt-2 text-[11px] leading-snug text-muted-foreground">
              {credito.texto} {credito.fonte ? <Fonte fonte={credito.fonte} mostrarData={false} rotulo="TSE" /> : credito.href && <Fonte href={credito.href} rotulo="Origem" mostrarData={false} />}
            </figcaption>
          )}
        </figure>

        {/* identificação */}
        <div className="intro-grupo min-w-0" style={{ "--base": "80ms" }}>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11.5px] uppercase tracking-[0.08em] text-muted-foreground">
            <span className="text-accent-strong">{f.partido}</span>
            <span aria-hidden="true">·</span>
            <span>{cargoRotulo(f.cargo, f.genero)}{f.uf ? ` · ${f.uf}` : ""}</span>
            {f.numero && (<><span aria-hidden="true">·</span><span>Nº {f.numero}</span></>)}
          </p>
          <h1 className="mt-3 pt-[0.1em] font-heading text-[clamp(40px,8vw,92px)] uppercase leading-[0.98] text-foreground">{f.nome_urna}</h1>
          {f.nome_completo && <p className="mt-2 text-[15px] text-muted-foreground">{f.nome_completo}</p>}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <SeloSituacao situacao={f.situacao} grupo={f.situacao_grupo} completo />
            {f.situacao_data && <span className="font-mono text-[10.5px] uppercase text-muted-foreground" title="Data do arquivo em que a situação foi consultada (não é a data da decisão)">situação em {fmtData(f.situacao_data)}</span>}
            <Fonte fonte={fontes.situacao} mostrarData={false} />
            {f.mandato_atual_descricao && <Selo tom="accent">Mandato atual: {f.mandato_atual_descricao}</Selo>}
          </div>

          {fatos.length > 0 && (
            <p className="mt-4 text-[14px] text-foreground">
              {fatos.join(" · ")} <Fonte fonte={fontes.identificacao} mostrarData={false} className="ml-1" />
            </p>
          )}
          {(f.federacao || f.coligacao) && (
            <p className="mt-2 text-[13px] text-muted-foreground">
              {f.federacao && <span>{f.federacao}</span>}
              {f.federacao && f.coligacao && f.coligacao !== "FEDERAÇÃO" && " · "}
              {f.coligacao && !["PARTIDO ISOLADO", "FEDERAÇÃO"].includes(f.coligacao) && <span>Coligação {f.coligacao}</span>}
              {f.coligacao === "PARTIDO ISOLADO" && <span>Sem coligação</span>}
            </p>
          )}

          {/* chapa */}
          {(chapa.length > 0 || titular) && (
            <div className="mt-6 border-t border-dashed border-grid pt-4">
              <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
                {titular ? "Chapa" : f.cargo === "senador" ? "Suplentes" : "Vice na chapa"}
              </p>
              <ul className="mt-3 flex flex-wrap gap-3">
                {titular && <MembroChapa m={{ ...titular, papel: "titular" }} rotulo={cargoRotulo(titular.cargo)} />}
                {chapa.map((m) => <MembroChapa key={m.papel} m={m} rotulo={PAPEL_ROTULO[m.papel]} />)}
              </ul>
            </div>
          )}

          {redes.length > 0 && <Redes redes={redes} fonte={fontes.redes} />}
        </div>
      </div>
    </Secao>
  )
}

function MembroChapa({ m, rotulo }) {
  const conteudo = (
    <>
      <FotoCandidato src={m.foto_url} nome={m.nome_urna} className="h-12 w-9 shrink-0 rounded-[2px] border border-grid" iniciaisClassName="text-[12px]" />
      <span className="min-w-0">
        <span className="block font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">{rotulo}</span>
        <span className="block truncate text-[14px] font-semibold text-foreground group-hover:text-accent-strong">{m.nome_urna}</span>
        {m.partido && <span className="block font-mono text-[10.5px] text-muted-foreground">{m.partido}</span>}
      </span>
    </>
  )
  return (
    <li className="min-w-0 max-w-full">
      {m.slug ? (
        <Link to={`/candidato/${m.slug}`} className="group flex min-h-11 items-center gap-2.5 rounded-[var(--radius)] border border-grid bg-surface py-1.5 pl-1.5 pr-3 hover:border-accent">{conteudo}</Link>
      ) : (
        <div className="flex items-center gap-2.5 rounded-[var(--radius)] border border-grid bg-surface py-1.5 pl-1.5 pr-3">{conteudo}</div>
      )}
    </li>
  )
}

function Redes({ redes, fonte }) {
  const [todas, setTodas] = useState(false)
  // uma por plataforma primeiro; o resto fica atrás de "ver todas"
  const vistas = new Set()
  const principais = []
  const resto = []
  for (const r of redes) {
    if (vistas.has(r.plataforma) && r.plataforma !== "site") resto.push(r)
    else if (r.plataforma === "site" && principais.filter((p) => p.plataforma === "site").length >= 1) resto.push(r)
    else {
      vistas.add(r.plataforma)
      principais.push(r)
    }
  }
  const mostrar = todas ? [...principais, ...resto] : principais.slice(0, 8)
  const escondidas = principais.length + resto.length - mostrar.length
  return (
    <div className="mt-5">
      <p className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
        Redes e sites declarados <Fonte fonte={fonte} mostrarData={false} />
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {mostrar.map((r) => (
          <li key={r.url}>
            <a href={r.url} target="_blank" rel="noopener noreferrer nofollow" title={r.url} className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius)] border border-grid-strong bg-surface px-2.5 font-mono text-[11px] uppercase tracking-[0.04em] text-foreground hover:border-accent hover:text-accent-strong">
              <Globe aria-hidden="true" className="size-3.5 text-muted-foreground" />
              {REDE_ROTULO[r.plataforma] ?? r.plataforma}
              <span className="sr-only"> (abre em nova aba)</span>
            </a>
          </li>
        ))}
        {escondidas > 0 && (
          <li>
            <button type="button" onClick={() => setTodas(true)} className="inline-flex min-h-9 items-center px-2 font-mono text-[11px] uppercase tracking-[0.04em] text-accent-strong underline underline-offset-2">
              + {escondidas} {escondidas === 1 ? "link" : "links"}
            </button>
          </li>
        )}
      </ul>
    </div>
  )
}

function Resumo({ dados, abas, irAba }) {
  const { ficha: f, fontes } = dados
  const casa = { camara: "Câmara", senado: "Senado", alba: "ALBA" }[f.cota_casas?.split(",")[0]]
  const cards = [
    {
      icone: Landmark,
      rotulo: "Patrimônio 2026",
      valor: f.declarou_sem_bens_2026 ? "R$ 0" : fmtBRLCompacto(f.patrimonio_2026),
      sub: f.declarou_sem_bens_2026
        ? "declarou não ter bens"
        : !vazio(f.variacao_patrimonio_pct)
          ? `${fmtPct(f.variacao_patrimonio_pct, { sinal: true })} desde ${f.patrimonio_ano_anterior}`
          : f.patrimonio_2026 != null ? "declarado ao TSE" : "sem declaração",
      fonte: fontes.patrimonio,
      aba: "patrimonio",
    },
    {
      icone: Wallet,
      rotulo: "Arrecadado 2026",
      valor: fmtBRLCompacto(f.arrecadado_2026),
      sub: f.arrecadado_2026 != null ? `${plural(f.n_doadores_2026 ?? 0, "doador", "doadores")} · parcial` : f.cargo === "suplente" ? "campanha é a do titular" : "sem prestação",
      fonte: fontes.arrecadacao,
      aba: "campanha",
    },
    {
      icone: HandCoins,
      rotulo: "Emendas empenhadas",
      valor: fmtBRLCompacto(f.emendas_empenhado),
      sub: f.emendas_ano_min ? `${f.emendas_ano_min}–${f.emendas_ano_max} · ${fmtInt(f.n_emendas)} emendas` : "sem emendas atribuídas",
      fonte: f.emendas_empenhado != null ? fontes.emendas : null,
      aba: "emendas",
    },
    {
      icone: Receipt,
      rotulo: casa === "ALBA" ? "Verba indenizatória" : "Cota parlamentar",
      // mesmo total da Visão geral e da aba (todos os anos publicados), com o período explícito
      valor: fmtBRLCompacto(f.cota_total),
      sub: casa ? `${casa} · ${f.cota_ano_min === f.cota_ano_max ? f.cota_ano_min : `${f.cota_ano_min}–${f.cota_ano_max}`}` : "sem mandato com cota",
      fonte: fontes.cota,
      aba: "cota",
    },
    {
      icone: TriangleAlert,
      rotulo: "Sanções",
      valor: fmtInt(f.n_sancoes ?? 0),
      sub: f.n_sancoes ? "registros no CEIS/CNEP" : "nenhuma no CEIS/CNEP",
      aba: "atencao",
    },
  ]
  return (
    <Secao aria-label="Resumo em números">
      <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c, i) => (
          <div
            key={c.rotulo}
            className={juntar(
              "flex min-w-0 flex-col gap-1.5 border-grid px-4 py-5 sm:px-5",
              "border-b lg:border-b-0",
              i % 2 === 1 && "border-l sm:border-l-0",
              "sm:[&:not(:nth-child(3n+1))]:border-l lg:[&:not(:first-child)]:border-l",
              i === 4 && "col-span-2 sm:col-span-1",
            )}
          >
            <dt className="order-2 flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
              <c.icone aria-hidden="true" className="size-3.5 shrink-0" /> {c.rotulo}
            </dt>
            <dd className="numero order-1 whitespace-nowrap text-[22px] font-medium leading-none text-foreground sm:text-[26px] xl:text-[30px]">{c.valor}</dd>
            <dd className="order-3 text-[12px] text-muted-foreground">{c.sub}</dd>
            {c.fonte && <dd className="order-4"><Fonte fonte={c.fonte} /></dd>}
            {c.aba && abas.some((a) => a.id === c.aba) && (
              <dd className="order-5">
                <button type="button" onClick={() => irAba(c.aba)} className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-accent-strong hover:underline">
                  Ver detalhes →
                </button>
              </dd>
            )}
          </div>
        ))}
      </dl>
    </Secao>
  )
}

function AbaCarregando() {
  return (
    <div aria-busy="true" className="space-y-4">
      <span className="sr-only" role="status">Carregando seção…</span>
      <Esqueleto className="h-8 w-64" />
      <Esqueleto className="h-40 w-full" />
    </div>
  )
}

function FichaCarregando() {
  return (
    <Moldura className={`${PAD} py-10`} aria-busy="true">
      <span className="sr-only" role="status">Carregando ficha…</span>
      <Esqueleto className="h-5 w-40" />
      <div className="mt-6 grid gap-8 sm:grid-cols-[200px_1fr] lg:grid-cols-[260px_1fr]">
        <Esqueleto className="aspect-[3/4] w-full max-w-[220px] sm:max-w-none" />
        <div className="space-y-4">
          <Esqueleto className="h-4 w-48" />
          <Esqueleto className="h-16 w-3/4" />
          <Esqueleto className="h-4 w-1/2" />
          <Esqueleto className="h-24 w-full" />
        </div>
      </div>
    </Moldura>
  )
}

