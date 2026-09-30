// Patrimônio: evolução das declarações ao TSE (2006 a 2026), alerta de variação forte,
// bens por ano com filtros (ano, tipo, busca) na URL.
import { useMemo } from "react"
import { Fonte } from "../../components/Fonte.jsx"
import { Segmentos } from "../../components/ui/controles.jsx"
import { DadoIndisponivel } from "../../components/ui/estados.jsx"
import { Aviso, Bloco, CampoBusca, EstadoSecao, Seletor, Tabela, TituloAba, useParamsUrl, useSecao } from "../../components/ficha/pecas.jsx"
import { BarrasH, Colunas } from "../../components/ficha/graficos.jsx"
import { capitalizar, fmtBRL, fmtBRLCompacto, fmtData, fmtInt, fmtPct, vazio } from "../../lib/format.js"

const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

/** Alerta: salto atípico (≥ 20×) ou aumento ≥ R$ 1 mi / ≥ 100% (com ≥ R$ 300 mil). */
function alertaPatrimonio(evolucao) {
  const atual = evolucao.find((e) => e.ano === 2026)
  if (!atual) return null
  const ant = [...evolucao].filter((e) => e.ano < 2026 && e.valor_total != null).pop()
  if (!ant) return null
  const aumento = atual.valor_total - ant.valor_total
  if (ant.valor_total > 0 && atual.valor_total / ant.valor_total >= 20 && aumento >= 300_000) return { tipo: "atipico", atual, ant, aumento, fator: atual.valor_total / ant.valor_total }
  const pct = ant.valor_total > 0 ? (aumento / ant.valor_total) * 100 : null
  if (aumento >= 1_000_000 || (pct != null && pct >= 100 && aumento >= 300_000)) return { tipo: "aumento", atual, ant, aumento, pct }
  return null
}

export function AbaPatrimonio({ dados }) {
  const f = dados.ficha
  const { dados: d, erro, recarregar } = useSecao(f.slug, "patrimonio")
  const [p, definir] = useParamsUrl("b_")
  const anosBens = useMemo(() => [...new Set((d?.bens ?? []).map((b) => b.ano))].sort((a, b) => b - a), [d])
  const ano = anosBens.includes(Number(p.ano)) ? Number(p.ano) : anosBens[0]
  const doAno = useMemo(() => (d?.bens ?? []).filter((b) => b.ano === ano), [d, ano])
  const tipos = useMemo(() => {
    const m = new Map()
    for (const b of doAno) {
      const t = b.tipo || "Não informado"
      const e = m.get(t) ?? { id: t, rotulo: capitalizar(t.toLowerCase()), valor: 0, n: 0 }
      e.valor += b.valor ?? 0
      e.n++
      m.set(t, e)
    }
    return [...m.values()].sort((a, b) => b.valor - a.valor)
  }, [doAno])
  const filtrados = useMemo(() => {
    const q = semAcento(p.q)
    return doAno.filter((b) => (!p.tipo || (b.tipo || "Não informado") === p.tipo) && (!q || semAcento(`${b.tipo} ${b.descricao}`).includes(q)))
  }, [doAno, p.tipo, p.q])

  if (!d) return <EstadoSecao erro={erro} recarregar={recarregar} />
  const ev = d.evolucao
  const alerta = alertaPatrimonio(ev)
  const atual = ev.find((e) => e.ano === 2026)
  const somaFiltro = filtrados.reduce((a, b) => a + (b.valor ?? 0), 0)

  return (
    <div className="flex flex-col gap-12">
      <TituloAba eyebrow="Patrimônio declarado ao TSE" titulo="Bens e evolução">
        Valores como declarados pelo candidato à Justiça Eleitoral (valor de declaração, não de mercado). Todos os anos vêm dos arquivos de bens
        de candidatos do TSE (2006 a 2026).
      </TituloAba>

      {alerta?.tipo === "atipico" && (
        <Aviso tom="warn" eyebrow="Valor atípico" titulo={`O total de 2026 é ${fmtInt(Math.floor(alerta.fator))} vezes o de ${alerta.ant.ano}`}>
          {fmtBRL(alerta.atual.valor_total)} em 2026 contra {fmtBRL(alerta.ant.valor_total)} em {alerta.ant.ano}. O valor oficial segue exibido como
          publicado; o aviso não indica erro nem causa. <Fonte id={alerta.ant.fonte_id} ano={alerta.ant.ano} /> <Fonte id={alerta.atual.fonte_id} />
        </Aviso>
      )}
      {alerta?.tipo === "aumento" && (
        <Aviso tom="warn" eyebrow="Sinal de alerta" titulo="Aumento patrimonial expressivo">
          O patrimônio declarado aumentou <strong className="text-foreground">{fmtBRL(alerta.aumento)}</strong>
          {alerta.pct != null && ` (${fmtPct(alerta.pct, { sinal: true })})`} entre {alerta.ant.ano} e 2026. O sinal mostra apenas a variação dos valores
          declarados ao TSE e não determina sua causa. <Fonte id={alerta.ant.fonte_id} /> <Fonte id={alerta.atual.fonte_id} />
        </Aviso>
      )}

      {ev.length > 0 ? (
        <Bloco eyebrow="Evolução" titulo="Total declarado por eleição">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="rounded-[var(--radius)] border border-grid bg-surface p-4 pt-6">
              <Colunas
                dados={ev.map((e) => ({ rotulo: e.ano, valores: { v: e.valor_total } }))}
                series={[{ id: "v", rotulo: "Patrimônio declarado" }]}
                formatar={fmtBRLCompacto}
                rotuloAcessivel="Patrimônio declarado por eleição"
                onSelecionar={(a) => anosBens.includes(Number(a)) && definir({ ano: a, tipo: null })}
                selecionado={ano}
              />
              <p className="mt-2 text-[11.5px] text-muted-foreground">Clique num ano com bens detalhados para ver a lista abaixo.</p>
            </div>
            <Tabela
              legenda="Patrimônio por eleição"
              linhas={[...ev].reverse()}
              chave={(l) => l.ano}
              colunas={[
                { id: "ano", rotulo: "Eleição", principal: true, valor: (l) => <span className="numero font-medium">{l.ano}{l.cargo_na_eleicao ? <span className="block font-sans text-[11px] font-normal text-muted-foreground">{capitalizar(l.cargo_na_eleicao.toLowerCase())}</span> : null}</span> },
                { id: "valor", rotulo: "Total", alinhar: "direita", valor: (l) => (l.declarou_bens === false && l.valor_total === 0 ? "Sem bens" : fmtBRL(l.valor_total)) },
                { id: "bens", rotulo: "Bens", alinhar: "direita", valor: (l) => fmtInt(l.qtd_bens) },
                { id: "var", rotulo: "Variação", alinhar: "direita", valor: (l) => (vazio(l.variacao_pct) ? (vazio(l.variacao_abs) ? "—" : fmtBRLCompacto(l.variacao_abs)) : <span className={l.variacao_pct > 0 ? "text-foreground" : "text-muted-foreground"}>{fmtPct(l.variacao_pct, { sinal: true })}</span>) },
                { id: "fonte", rotulo: "Fonte", valor: (l) => <Fonte id={l.fonte_id} ano={l.ano} /> },
              ]}
              minLargura={520}
            />
          </div>
          {d.snapshot && atual && d.snapshot.bens_total != null && Math.abs((d.snapshot.bens_total ?? 0) - (atual.valor_total ?? 0)) >= 1 && (
            <Aviso className="mt-4" tom="accent" titulo="A declaração mudou durante a campanha">
              Em {fmtData(d.snapshot.dt_snapshot)} o total declarado ao TSE era {fmtBRL(d.snapshot.bens_total)}; no arquivo de 29/09/2026 é {fmtBRL(atual.valor_total)}.{" "}
              <Fonte id={d.snapshot.fonte_id} />
            </Aviso>
          )}
        </Bloco>
      ) : (
        <DadoIndisponivel>Sem declaração de patrimônio nas bases consultadas.</DadoIndisponivel>
      )}

      {anosBens.length > 0 ? (
        <Bloco eyebrow="Bem a bem" titulo={`Bens declarados em ${ano}`} descricao="Tipo e descrição como informados ao TSE. Clique num tipo para filtrar a lista.">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            {anosBens.length > 1 && <Segmentos rotulo="Ano da declaração" opcoes={anosBens.map((a) => ({ value: a, label: String(a), n: d.bens.filter((b) => b.ano === a).length }))} valor={ano} onChange={(a) => definir({ ano: a === anosBens[0] ? null : a, tipo: null })} />}
            <CampoBusca valor={p.q} onChange={(v) => definir({ q: v })} placeholder="Buscar na descrição (ex.: apartamento, fazenda, ações)" rotulo="Buscar bens" className="sm:min-w-[280px] sm:flex-1" />
            <Seletor rotulo="Tipo" valor={p.tipo} opcoes={tipos.map((t) => ({ value: t.id, label: t.rotulo, n: t.n }))} onChange={(v) => definir({ tipo: v })} />
          </div>
          <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div className="min-w-0">
              <p className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">Por tipo de bem</p>
              <BarrasH itens={tipos.slice(0, 12)} formatar={fmtBRLCompacto} onClick={(t) => definir({ tipo: p.tipo === t.id ? null : t.id })} ativo={p.tipo} />
            </div>
            <div className="min-w-0">
              <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
                <span className="numero text-foreground">{fmtInt(filtrados.length)}</span> {filtrados.length === 1 ? "bem" : "bens"} · soma{" "}
                <span className="numero text-foreground">{fmtBRL(somaFiltro)}</span> <Fonte id={doAno[0]?.fonte_id} ano={ano} />
              </p>
              <Tabela
                legenda={`Bens declarados em ${ano}`}
                linhas={filtrados}
                colunas={[
                  { id: "desc", rotulo: "Descrição", principal: true, valor: (l) => <span className="text-foreground">{l.descricao || "—"}</span> },
                  { id: "tipo", rotulo: "Tipo", valor: (l) => <span className="text-muted-foreground">{capitalizar((l.tipo ?? "").toLowerCase()) || "—"}</span> },
                  { id: "valor", rotulo: "Valor", alinhar: "direita", valor: (l) => fmtBRL(l.valor) },
                ]}
                vazio="Nenhum bem com esses filtros."
                minLargura={520}
              />
            </div>
          </div>
        </Bloco>
      ) : (
        f.declarou_sem_bens_2026 && <Aviso titulo="Declarou não ter bens em 2026">O candidato informou ao TSE que não possui bens a declarar. <Fonte chave="tse_bens_2026" /></Aviso>
      )}
    </div>
  )
}
