// Peças de candidato: foto (ou iniciais), card da grade, linha da lista densa, chapa, selo de situação.
import { memo, useState } from "react"
import { Link } from "../lib/nav.jsx"
import { ArrowRight, Landmark, Wallet } from "lucide-react"
import { fmtBRLCompacto, iniciais, capitalizar, vazio } from "../lib/format.js"
import { cargoRotulo, PAPEL_ROTULO, SITUACAO_TOM } from "../lib/rotulos.js"
import { Selo, juntar } from "./ui/base.jsx"

/** Foto do candidato; sem foto (ou erro de carga) => iniciais sobre fundo azul-claro. */
export function FotoCandidato({ src, nome, className, iniciaisClassName = "text-lg", eager = false }) {
  const [falhou, setFalhou] = useState(false)
  if (!src || falhou) {
    return (
      <div aria-hidden="true" className={juntar("pontilhado flex items-center justify-center bg-accent-soft font-heading uppercase text-accent", className)}>
        <span className={iniciaisClassName}>{iniciais(nome)}</span>
      </div>
    )
  }
  return (
    <img
      src={src}
      alt=""
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFalhou(true)}
      className={juntar("bg-surface-2 object-cover object-top", className)}
    />
  )
}

const SITUACAO_CURTA = {
  deferida: "Deferida",
  em_julgamento: "Em julgamento",
  indeferida: "Indeferida",
  renuncia: "Renúncia",
}
/** Selo da situação do registro (mostra o texto oficial no title). */
export function SeloSituacao({ situacao, grupo, completo = false, className }) {
  if (!situacao) return null
  const tom = SITUACAO_TOM[grupo] ?? "neutral"
  return (
    <Selo tom={tom} title={`Situação do registro no TSE: ${situacao}`} className={className}>
      {completo ? capitalizar(situacao) : SITUACAO_CURTA[grupo] ?? capitalizar(situacao)}
    </Selo>
  )
}

/** Linha de chapa: "Vice: Zé Cocá (PP)" com link para a ficha do membro. */
export function Chapa({ membros, className, compacta = false }) {
  if (!membros?.length) return null
  return (
    <ul className={juntar("flex flex-col gap-1 text-[12px] text-muted-foreground", className)}>
      {membros.map((m) => (
        <li key={m.papel} className="flex min-w-0 items-baseline gap-1.5">
          <span className="shrink-0 font-mono text-[10.5px] uppercase tracking-[0.06em]">{PAPEL_ROTULO[m.papel] ?? m.papel}</span>
          {m.slug && !compacta ? (
            <Link to={`/candidato/${m.slug}`} title={m.nome_urna} className="relative z-10 truncate font-medium text-foreground underline decoration-grid-strong underline-offset-2 hover:text-accent-strong hover:decoration-accent">
              {m.nome_urna}
            </Link>
          ) : (
            <span title={m.nome_urna} className="truncate font-medium text-foreground">{m.nome_urna}</span>
          )}
          {m.partido && <span className="shrink-0 font-mono text-[10.5px]">{m.partido}</span>}
        </li>
      ))}
    </ul>
  )
}

function Metrica({ icone: Icone, rotulo, valor }) {
  return (
    <div className="min-w-0">
      <p className="numero truncate text-[14px] font-medium leading-none text-foreground sm:text-[13px] xl:text-[15px]">{valor}</p>
      <p className="mt-1 flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
        <Icone aria-hidden="true" className="size-3 shrink-0" />
        {rotulo}
      </p>
    </div>
  )
}

/** Card da grade (senado; prévias da home). */
export const CandidatoCard = memo(function CandidatoCard({ c, indice = 0, mostrarChapa = true, eager = false }) {
  const patrimonio = c.declarou_sem_bens_2026 ? "Sem bens" : fmtBRLCompacto(c.patrimonio_2026)
  return (
    <article
      className="entrada group relative flex h-full flex-col overflow-hidden rounded-[var(--radius)] border border-grid bg-surface transition-[border-color,box-shadow,translate] duration-200 hover:-translate-y-0.5 hover:border-accent hover:shadow-md focus-within:border-accent motion-reduce:hover:translate-y-0"
      style={{ animationDelay: `${Math.min(indice, 12) * 40}ms` }}
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden border-b border-grid bg-surface-2">
        <FotoCandidato
          src={c.foto_url}
          nome={c.nome_urna}
          eager={eager}
          className="absolute inset-0 size-full transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none"
          iniciaisClassName="text-[56px] sm:text-[72px]"
        />
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {c.numero && <span className="numero rounded-[2px] bg-surface/95 px-1.5 py-0.5 text-[11px] font-semibold text-foreground shadow-sm">{c.numero}</span>}
        </div>
        {c.situacao_grupo && c.situacao_grupo !== "deferida" && (
          <div className="absolute right-2 top-2"><SeloSituacao situacao={c.situacao} grupo={c.situacao_grupo} /></div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-3 sm:p-4">
        <div className="min-w-0">
          <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-accent-strong">{c.partido}</p>
          <h3 className="mt-1 font-heading text-[19px] uppercase leading-[1.02] text-foreground sm:text-[23px]">
            <Link to={`/candidato/${c.slug}`} className="outline-none after:absolute after:inset-0 after:rounded-[var(--radius)] after:content-[''] focus-visible:underline focus-visible:after:ring-2 focus-visible:after:ring-accent">
              {c.nome_urna}
            </Link>
          </h3>
          {c.tem_mandato_atual && (
            <p className="mt-1 text-[12px] leading-snug text-muted-foreground">Mandato atual: {cargoRotulo(c.mandato_atual)}</p>
          )}
        </div>
        {mostrarChapa && <Chapa membros={c.chapa} />}
        <div className="mt-auto grid grid-cols-1 gap-2 border-t border-dashed border-grid pt-2.5 sm:grid-cols-2 sm:gap-3">
          <Metrica icone={Landmark} rotulo="Patrimônio" valor={patrimonio} />
          <Metrica icone={Wallet} rotulo="Arrecadado" valor={fmtBRLCompacto(c.arrecadado_2026)} />
        </div>
        <span className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.06em] text-accent-strong">
          Ver ficha <ArrowRight aria-hidden="true" className="size-3 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </article>
  )
})

/** Colunas numéricas da lista densa, conforme a ordenação ativa. */
function valorColuna(c, col) {
  switch (col) {
    case "patrimonio": return c.declarou_sem_bens_2026 ? "Sem bens" : fmtBRLCompacto(c.patrimonio_2026)
    case "arrecadacao": return fmtBRLCompacto(c.arrecadado_2026)
    case "emendas": return fmtBRLCompacto(c.emendas_empenhado)
    case "cota": return fmtBRLCompacto(c.cota_total_2023_2026)
    default: return "—"
  }
}
export const COLUNAS_LISTA = [
  { id: "patrimonio", rotulo: "Patrimônio", dica: "Bens declarados ao TSE em 2026" },
  { id: "arrecadacao", rotulo: "Arrecadado", dica: "Receitas de campanha 2026 (parcial)" },
  { id: "emendas", rotulo: "Emendas", dica: "Emendas empenhadas 2015–2026" },
  { id: "cota", rotulo: "Cota 2023–26", dica: "Cota/verba parlamentar 2023–2026 (a ficha mostra todos os anos)" },
]

/** Linha da lista densa (deputados). */
export const CandidatoLinha = memo(function CandidatoLinha({ c }) {
  return (
    <li className="linha-hover relative grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-3 sm:px-4 @4xl:grid-cols-[48px_minmax(0,1.6fr)_104px_repeat(4,minmax(0,0.8fr))] @4xl:gap-x-4">
      <FotoCandidato src={c.foto_url} nome={c.nome_urna} className="h-16 w-12 rounded-[2px] border border-grid" iniciaisClassName="text-[15px]" />
      <div className="min-w-0">
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Link to={`/candidato/${c.slug}`} title={c.nome_urna} className="truncate text-[15px] font-semibold text-foreground outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-accent hover:text-accent-strong focus-visible:underline">
            {c.nome_urna}
          </Link>
          {c.tem_mandato_atual && <Selo tom="accent" title={c.mandato_atual ? `Mandato atual: ${cargoRotulo(c.mandato_atual)}` : undefined}>Mandato</Selo>}
          {c.situacao_grupo && c.situacao_grupo !== "deferida" && <SeloSituacao situacao={c.situacao} grupo={c.situacao_grupo} />}
        </p>
        <p className="mt-0.5 truncate text-[12px] text-muted-foreground" title={[c.nome_completo, c.municipio_base && `base: ${c.municipio_base}`].filter(Boolean).join(" · ")}>
          {c.nome_completo}
          {c.municipio_base && <span className="hidden sm:inline"> · base: {c.municipio_base}</span>}
        </p>
        {/* métricas no celular/tablet */}
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] text-muted-foreground @4xl:hidden">
          <span><Landmark aria-hidden="true" className="mr-0.5 inline size-3" />{valorColuna(c, "patrimonio")}</span>
          {!vazio(c.arrecadado_2026) && <span><Wallet aria-hidden="true" className="mr-0.5 inline size-3" />{valorColuna(c, "arrecadacao")}</span>}
          {!vazio(c.emendas_empenhado) && <span>Emendas {valorColuna(c, "emendas")}</span>}
          {!vazio(c.cota_total_2023_2026) && <span>Cota 23–26 {valorColuna(c, "cota")}</span>}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1 text-right @4xl:items-start @4xl:text-left">
        <span className="numero text-[15px] font-semibold text-foreground">{c.numero}</span>
        <span className="max-w-[104px] truncate font-mono text-[10.5px] uppercase tracking-[0.06em] text-accent-strong" title={c.partido}>{c.partido}</span>
      </div>
      {COLUNAS_LISTA.map((col) => (
        <span key={col.id} className="numero hidden whitespace-nowrap text-right text-[13px] text-foreground @4xl:block">
          {valorColuna(c, col.id)}
        </span>
      ))}
    </li>
  )
})

/** Mini-item de ranking/busca: foto pequena + nome + cargo. */
export function CandidatoMini({ c, direita, className, onClick }) {
  return (
    <Link to={`/candidato/${c.slug}`} onClick={onClick} title={`${c.nome_urna} · ${c.partido} · ${cargoRotulo(c.cargo)}${c.numero ? ` · ${c.numero}` : ""}`} className={juntar("group flex min-w-0 items-center gap-3", className)}>
      <FotoCandidato src={c.foto_url} nome={c.nome_urna} className="h-12 w-9 shrink-0 rounded-[2px] border border-grid" iniciaisClassName="text-[12px]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold text-foreground group-hover:text-accent-strong">{c.nome_urna}</span>
        <span className="block truncate font-mono text-[10.5px] uppercase tracking-[0.05em] text-muted-foreground">
          {c.partido} · {cargoRotulo(c.cargo)}{c.numero ? ` · ${c.numero}` : ""}
        </span>
      </span>
      {direita}
    </Link>
  )
}

