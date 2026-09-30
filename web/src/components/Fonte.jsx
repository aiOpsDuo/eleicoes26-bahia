// Padrão "todo dado tem fonte". Reutilizável pela ficha (fase 3):
//
//   <Fonte chave="tse_bens_2026" />                 -> link mono pequeno "↗ TSE · 30/09/2026" para a fonte oficial
//   <Fonte id={linha.fonte_id} href={linha.fonte_url} />  -> usa a fonte da tabela, mas aponta para o documento específico
//   <Fonte fonte={objetoFonte} />                   -> objeto {nome, url, coletado_em} já vindo da API
//   <CampoComFonte rotulo="Patrimônio 2026" valor="R$ 1,2 mi" chave="tse_bens_2026" />
//   <TabelaDocumentos colunas={[...]} linhas={[...]} documento={(l) => l.url_documento} />
//
// A tabela `fonte` (≈44 linhas) é carregada uma vez por <FontesProvider> (GET /api/fontes).
import { createContext, useContext, useMemo } from "react"
import { ArrowUpRight, FileText } from "lucide-react"
import { useApi } from "../lib/api.js"
import { fmtData, dominio } from "../lib/format.js"
import { juntar } from "./ui/base.jsx"

const FontesCtx = createContext({ porChave: {}, porId: {}, lista: [] })

export function FontesProvider({ children }) {
  const { dados } = useApi("/api/fontes")
  const valor = useMemo(() => {
    const lista = dados?.itens ?? []
    return {
      lista,
      porChave: Object.fromEntries(lista.map((f) => [f.chave, f])),
      porId: Object.fromEntries(lista.map((f) => [f.id, f])),
    }
  }, [dados])
  return <FontesCtx.Provider value={valor}>{children}</FontesCtx.Provider>
}

export function useFontes() {
  return useContext(FontesCtx)
}

/** Resolve uma fonte por objeto, chave ou id. */
export function useFonte({ fonte, chave, id }) {
  const { porChave, porId } = useFontes()
  return fonte ?? (chave ? porChave[chave] : null) ?? (id != null ? porId[id] : null) ?? null
}

/** Nome curto para o link: "TSE — Bens declarados 2026" => "TSE". */
const ABREVIA = {
  "Assembleia Legislativa da Bahia": "ALBA",
  "Câmara dos Deputados": "Câmara",
  "Senado Federal": "Senado",
}
export function nomeCurto(nome) {
  if (!nome) return "Fonte"
  const base = nome.split(/\s[—–-]\s/)[0].replace(/\s*\(.*\)$/, "").trim()
  return ABREVIA[base] ?? base
}

/**
 * Link de fonte pequeno (mono). `href` sobrescreve a URL (documento específico: nota, emenda, ato).
 * `rotulo` sobrescreve o texto. Sem fonte e sem href => não renderiza nada.
 */
export function Fonte({ fonte: f0, chave, id, href, rotulo, data, className, mostrarData = true, ano }) {
  const f = useFonte({ fonte: f0, chave, id })
  // algumas fontes publicam um arquivo por ano (URL com {ano}): usa o ano do dado ou o corrente
  const url = (href || f?.url)?.replace("{ano}", ano ?? "2026")
  if (!url) return null
  const coletado = data ?? f?.coletado_em
  const texto = rotulo ?? (f ? nomeCurto(f.nome) : dominio(url))
  const titulo = [
    f ? `Fonte: ${f.nome}` : `Fonte: ${dominio(url)}`,
    coletado ? `coletado em ${fmtData(coletado)}` : null,
    href && f ? "(link para o documento específico)" : null,
  ].filter(Boolean).join(", ")
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={titulo}
      aria-label={titulo}
      className={juntar(
        "inline align-baseline font-mono text-[10.5px] uppercase leading-4 tracking-[0.05em] text-muted-foreground underline decoration-grid-strong underline-offset-2 transition-colors [overflow-wrap:normal] hover:text-accent-strong hover:decoration-accent",
        className,
      )}
    >
      <ArrowUpRight aria-hidden="true" className="mr-0.5 inline size-3 -translate-y-px" />
      {texto}
      {mostrarData && coletado && <span className="whitespace-nowrap text-subtle-foreground"> · {fmtData(coletado)}</span>}
    </a>
  )
}

/** Rótulo + valor + fonte (bloco de dado da ficha). */
export function CampoComFonte({ rotulo, valor, detalhe, fonte, chave, id, href, ano, className, grande = false }) {
  return (
    <div className={juntar("flex min-w-0 flex-col gap-1", className)}>
      <dt className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">{rotulo}</dt>
      <dd className={juntar("min-w-0 text-foreground", grande ? "numero text-[22px] leading-none sm:text-[26px]" : "text-[length:var(--text-body)] font-medium")}>
        {valor ?? "—"}
      </dd>
      {detalhe && <dd className="text-[12px] text-muted-foreground">{detalhe}</dd>}
      <dd><Fonte fonte={fonte} chave={chave} id={id} href={href} ano={ano} /></dd>
    </div>
  )
}

/**
 * Tabela com link de documento por linha.
 * colunas: [{ id, rotulo, valor: (linha) => ReactNode, alinhar?: "direita", classe? }]
 * documento: (linha) => url | null  (vira a última coluna "Documento ↗")
 * fonte: (linha) => { id?, chave?, href? } opcional — link de fonte por linha em vez de documento
 */
export function TabelaDocumentos({ colunas, linhas, documento, rotuloDocumento = "Documento", legenda, vazio = "Sem registros.", chaveLinha = (_l, i) => i }) {
  if (!linhas?.length) return <p className="py-6 text-center text-[13px] text-muted-foreground">{vazio}</p>
  return (
    <div className="w-full overflow-x-auto rounded-[var(--radius)] border border-grid bg-surface">
      <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
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
          {linhas.map((l, i) => {
            const doc = documento?.(l)
            return (
              <tr key={chaveLinha(l, i)} className="border-b border-grid last:border-0 hover:bg-surface-2">
                {colunas.map((c) => (
                  <td key={c.id} className={juntar("px-3 py-2 align-top", c.alinhar === "direita" && "numero text-right", c.classe)}>{c.valor(l)}</td>
                ))}
                {documento && (
                  <td className="px-3 py-2 text-right align-top">
                    {doc ? (
                      <a href={doc} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.04em] text-accent-strong hover:underline">
                        <FileText aria-hidden="true" className="size-3.5" /> Abrir <span className="sr-only">documento (abre em nova aba)</span>
                      </a>
                    ) : (
                      <span className="text-subtle-foreground" title="A fonte não publica link do documento">—</span>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
