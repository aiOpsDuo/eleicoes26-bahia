// Trajetória: linha do tempo (candidaturas anteriores no TSE, mandatos no Senado, trocas de partido,
// candidatura atual) e votos de 2022 por município (maiores municípios).
import { Fonte } from "../../components/Fonte.jsx"
import { Selo } from "../../components/ui/base.jsx"
import { DadoIndisponivel } from "../../components/ui/estados.jsx"
import { Bloco, EstadoSecao, GradeNumeros, Numero, Tabela, TituloAba, useSecao } from "../../components/ficha/pecas.jsx"
import { BarrasH } from "../../components/ficha/graficos.jsx"
import { capitalizar, caixaTitulo, fmtData, fmtInt, fmtPct, rotuloSnake } from "../../lib/format.js"
import { cargoRotulo } from "../../lib/rotulos.js"

const TIPO = { candidatura: "Candidatura", mandato: "Mandato", cargo_executivo: "Cargo executivo", partido: "Troca de partido", atual: "Candidatura 2026" }

export function AbaTrajetoria({ dados }) {
  const f = dados.ficha
  const { dados: d, erro, recarregar } = useSecao(f.slug, "trajetoria")
  if (!d) return <EstadoSecao erro={erro} recarregar={recarregar} />

  const itens = [
    ...d.eventos.map((e) => ({ ...e, chave: `e${e.id}`, ano: e.ano_inicio, tipo: e.tipo_evento })),
    ...d.mudancas.map((m) => ({ chave: `m${m.id}`, ano: m.ano ?? (m.data_mudanca ? Number(m.data_mudanca.slice(0, 4)) : null), tipo: "partido", cargo: `${m.partido_anterior ?? "?"} → ${m.partido_novo ?? "?"}`, observacoes: m.contexto, data: m.data_mudanca, fonte_url: m.fonte_url, fonte_id: m.fonte_id })),
    { chave: "atual", ano: 2026, tipo: "atual", cargo: cargoRotulo(f.cargo, f.genero), partido: f.partido, numero: f.numero, resultado: f.situacao ? `registro ${f.situacao}` : null, fonte_id: null, atual: true },
  ].sort((a, b) => (a.ano ?? 9999) - (b.ano ?? 9999) || (a.atual ? 1 : 0) - (b.atual ? 1 : 0))
  const v = d.votos_2022
  const totalVotos = v?.votos

  return (
    <div className="flex flex-col gap-12">
      <TituloAba eyebrow="Trajetória" titulo="Candidaturas e mandatos">
        Candidaturas anteriores na Bahia (TSE), mandatos no Senado e trocas de partido (filiações do Senado e histórico do deputado na
        Câmara). Mudança de sigla por fusão ou renomeação do partido não conta como troca.
      </TituloAba>

      {itens.length > 1 ? (
        <Bloco eyebrow="Linha do tempo" titulo="Do mais antigo ao atual">
          <ol className="relative ml-2 border-l border-grid-strong pl-6">
            {itens.map((e) => (
              <li key={e.chave} className="relative pb-6 last:pb-0">
                <span aria-hidden="true" className={`absolute -left-[31px] top-1 size-2.5 rounded-[2px] ring-4 ring-background ${e.atual ? "bg-accent" : e.tipo === "partido" ? "bg-warn" : e.eleito ? "bg-accent-strong" : "bg-grid-strong"}`} />
                <p className="numero text-[12px] font-medium text-muted-foreground">
                  {e.ano ?? "s/d"}{e.ano_fim && e.ano_fim !== e.ano ? `–${e.ano_fim}` : e.tipo === "mandato" && !e.ano_fim ? "–atual" : ""}
                  {e.data ? ` · ${fmtData(e.data)}` : ""}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[14.5px] font-semibold text-foreground">{e.cargo ? capitalizar(e.cargo) : TIPO[e.tipo] ?? rotuloSnake(e.tipo)}</span>
                  {e.partido && <span className="font-mono text-[11px] text-accent-strong">{e.partido}</span>}
                  {e.numero && <span className="font-mono text-[11px] text-muted-foreground">nº {e.numero}</span>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Selo tom={e.atual ? "accent" : e.tipo === "partido" ? "warn" : "neutral"}>{TIPO[e.tipo] ?? rotuloSnake(e.tipo) ?? "Evento"}</Selo>
                  {e.resultado && <Selo tom={e.eleito ? "ok" : "neutral"}>{capitalizar(String(e.resultado).toLowerCase())}</Selo>}
                  {e.votos != null && <span className="numero text-[12px] text-foreground">{fmtInt(e.votos)} votos</span>}
                  {e.uf && e.tipo !== "partido" && <span className="font-mono text-[10.5px] text-muted-foreground">{e.uf}</span>}
                </div>
                {e.observacoes && <p className="mt-1 text-[12.5px] text-muted-foreground">{e.observacoes}</p>}
                {(e.fonte_id || e.fonte_url) && <p className="mt-1"><Fonte id={e.fonte_id} href={e.fonte_url} /></p>}
              </li>
            ))}
          </ol>
        </Bloco>
      ) : (
        <DadoIndisponivel>Sem candidaturas anteriores na Bahia nem mandatos registrados nas bases consultadas.</DadoIndisponivel>
      )}

      {v?.municipios?.length > 0 && (
        <Bloco eyebrow="Eleição de 2022" titulo="Onde teve mais votos" descricao={`Votos nominais no 1º turno de 2022${v.cargo ? ` (${capitalizar(v.cargo.toLowerCase())})` : ""}, por município.`}>
          <GradeNumeros colunas="grid-cols-1 min-[420px]:grid-cols-3" className="mb-6">
            <Numero rotulo="Votos no 1º turno" valor={fmtInt(totalVotos)} fonte={<Fonte id={v.fonte_id} />} />
            <Numero rotulo="Municípios com voto" valor={fmtInt(v.n_municipios)} sub="de 417 na Bahia" />
            <Numero rotulo="Maior votação" valor={caixaTitulo(v.municipios[0].municipio)} sub={`${fmtInt(v.municipios[0].votos)} votos · ${fmtPct((v.municipios[0].votos / totalVotos) * 100)} do total`} />
          </GradeNumeros>
          <div className="grid gap-8 lg:grid-cols-2">
            <BarrasH itens={v.municipios.slice(0, 12).map((m) => ({ id: m.cd_municipio, rotulo: caixaTitulo(m.municipio), valor: m.votos, sub: `${fmtPct((m.votos / totalVotos) * 100)} do total` }))} formatar={fmtInt} />
            <Tabela
              legenda="Votos por município em 2022"
              linhas={v.municipios}
              chave={(l) => l.cd_municipio}
              colunas={[
                { id: "mun", rotulo: "Município", principal: true, valor: (l) => <span className="font-medium">{caixaTitulo(l.municipio)}</span> },
                { id: "v", rotulo: "Votos", alinhar: "direita", valor: (l) => fmtInt(l.votos) },
                { id: "pct", rotulo: "% do total", alinhar: "direita", valor: (l) => fmtPct((l.votos / totalVotos) * 100) },
                { id: "el", rotulo: "Eleitores 2026", alinhar: "direita", valor: (l) => fmtInt(l.eleitores_2026) },
              ]}
              minLargura={440}
            />
          </div>
          {v.votos_2t != null && <p className="mt-3 text-[12.5px] text-muted-foreground">2º turno: {fmtInt(v.votos_2t)} votos.</p>}
          <p className="mt-2"><Fonte id={v.fonte_id} /></p>
        </Bloco>
      )}
    </div>
  )
}
