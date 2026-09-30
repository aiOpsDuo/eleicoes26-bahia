// Gráficos simples da ficha (HTML/CSS, sem biblioteca): colunas por ano (1 ou 2 séries) e barras horizontais.
// Regras (skill dataviz): marcas finas com ponta arredondada de 4px, eixo/grade recessivos, legenda para ≥ 2 séries,
// texto sempre em tokens de texto (nunca na cor da série), dica ao passar o mouse/focar e tabela equivalente abaixo.
// Paleta de 2 séries validada (azul claro #7aa0f0 / azul escuro #2448a8): contraste < 3:1 do claro é compensado
// pelos valores escritos e pela tabela.
import { useState } from "react"
import { juntar } from "../ui/base.jsx"

export const CORES_SERIES = ["#7aa0f0", "#2448a8"]
export const COR_UNICA = "var(--accent)"

function Legenda({ series }) {
  if (series.length < 2) return null
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Legenda">
      {series.map((s, i) => (
        <li key={s.id} className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
          <span aria-hidden="true" className="inline-block size-2.5 rounded-[2px]" style={{ background: s.cor ?? CORES_SERIES[i] }} />
          {s.rotulo}
        </li>
      ))}
    </ul>
  )
}

/**
 * Colunas por categoria (ano). dados: [{ rotulo, valores: { [serieId]: number } }]
 * series: [{ id, rotulo, cor? }]; formatar: (v) => string; destacar: rótulo com contorno (ano selecionado)
 */
export function Colunas({ dados, series, formatar, altura = 180, onSelecionar, selecionado, rotuloAcessivel }) {
  const [foco, setFoco] = useState(null)
  const max = Math.max(1, ...dados.flatMap((d) => series.map((s) => d.valores[s.id] ?? 0)))
  const cores = series.map((s, i) => s.cor ?? (series.length === 1 ? COR_UNICA : CORES_SERIES[i]))
  const ultimo = dados.length - 1
  return (
    <figure className="min-w-0" aria-label={rotuloAcessivel}>
      <Legenda series={series.map((s, i) => ({ ...s, cor: cores[i] }))} />
      <div className="relative mt-3 overflow-x-auto pb-1">
        <div className="relative flex min-w-full items-end gap-1 border-b border-grid-strong sm:gap-2" style={{ height: altura, minWidth: dados.length * (series.length > 1 ? 34 : 26) }}>
          {/* grade recessiva: 50% e 100% */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 border-t border-grid" />
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-grid" />
          <span aria-hidden="true" className="numero pointer-events-none absolute right-0 top-0 -translate-y-full bg-surface/0 text-[10px] text-subtle-foreground">{formatar(max)}</span>
          {dados.map((d, i) => {
            const ativo = foco === i
            const sel = selecionado != null && String(selecionado) === String(d.rotulo)
            const texto = `${d.rotulo}: ${series.map((s) => `${s.rotulo} ${formatar(d.valores[s.id])}`).join(" · ")}`
            const Tag = onSelecionar ? "button" : "div"
            return (
              <Tag
                key={d.rotulo}
                type={onSelecionar ? "button" : undefined}
                tabIndex={onSelecionar ? undefined : 0}
                aria-label={texto}
                aria-pressed={onSelecionar ? sel : undefined}
                onClick={onSelecionar ? () => onSelecionar(d.rotulo) : undefined}
                onMouseEnter={() => setFoco(i)}
                onMouseLeave={() => setFoco(null)}
                onFocus={() => setFoco(i)}
                onBlur={() => setFoco(null)}
                className={juntar("relative flex h-full min-w-0 flex-1 items-end justify-center gap-[2px] rounded-t-[2px] outline-none focus-visible:bg-accent-soft focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent", (ativo || sel) && "bg-surface-2", onSelecionar && "cursor-pointer")}
              >
                {series.map((s, j) => {
                  const v = d.valores[s.id] ?? 0
                  return (
                    <span
                      key={s.id}
                      aria-hidden="true"
                      className="block w-full max-w-[22px] rounded-t-[4px] transition-[height] duration-300"
                      style={{ height: `${Math.max(v > 0 ? 1.5 : 0, (v / max) * 100)}%`, background: cores[j] }}
                    />
                  )
                })}
                {ativo && (
                  <span role="tooltip" className={juntar("pointer-events-none absolute bottom-full z-10 mb-2 w-max max-w-[220px] rounded-[var(--radius)] border border-grid bg-surface px-2.5 py-1.5 text-left shadow-md", i > ultimo / 2 ? "right-0" : "left-0")}>
                    <span className="block font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">{d.rotulo}</span>
                    {series.map((s, j) => (
                      <span key={s.id} className="flex items-center gap-1.5 whitespace-nowrap text-[12px] text-foreground">
                        {series.length > 1 && <span aria-hidden="true" className="inline-block size-2 rounded-[2px]" style={{ background: cores[j] }} />}
                        {series.length > 1 && <span className="text-muted-foreground">{s.rotulo}</span>}
                        <span className="numero font-medium">{formatar(d.valores[s.id])}</span>
                      </span>
                    ))}
                  </span>
                )}
              </Tag>
            )
          })}
        </div>
        <div className="flex min-w-full gap-1 sm:gap-2" style={{ minWidth: dados.length * (series.length > 1 ? 34 : 26) }}>
          {dados.map((d) => (
            <span key={d.rotulo} className={juntar("numero flex-1 pt-1 text-center text-[10.5px]", selecionado != null && String(selecionado) === String(d.rotulo) ? "font-semibold text-accent-strong" : "text-muted-foreground")}>
              {String(d.rotulo).length === 4 && dados.length > 9 ? `’${String(d.rotulo).slice(2)}` : d.rotulo}
            </span>
          ))}
        </div>
      </div>
    </figure>
  )
}

/**
 * Barras horizontais (ranking/categorias), uma série. itens: [{ id, rotulo, valor, sub?, extra? }]
 * onClick(item) torna a linha um botão (filtra a tabela); ativo: id destacado.
 */
export function BarrasH({ itens, formatar, onClick, ativo, max: maxFixo, className }) {
  const max = maxFixo ?? Math.max(1, ...itens.map((i) => i.valor ?? 0))
  return (
    <ul className={juntar("flex flex-col", className)}>
      {itens.map((it) => {
        const pct = Math.max(it.valor > 0 ? 0.8 : 0, ((it.valor ?? 0) / max) * 100)
        const sel = ativo != null && ativo === it.id
        const conteudo = (
          <>
            <span className="flex min-w-0 items-baseline justify-between gap-3">
              <span className={juntar("min-w-0 truncate text-[13px]", sel ? "font-semibold text-accent-strong" : "text-foreground")} title={it.rotulo}>{it.rotulo}</span>
              <span className="numero shrink-0 text-[12.5px] font-medium text-foreground">{formatar(it.valor)}</span>
            </span>
            <span aria-hidden="true" className="mt-1 block h-2 w-full rounded-[2px] bg-surface-2">
              <span className="block h-full rounded-r-[4px] transition-[width] duration-300" style={{ width: `${pct}%`, background: sel ? "var(--accent-strong)" : "var(--accent)" }} />
            </span>
            {it.sub && <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground" title={typeof it.sub === "string" ? it.sub : undefined}>{it.sub}</span>}
          </>
        )
        return (
          <li key={it.id ?? it.rotulo} className="min-w-0">
            {onClick ? (
              <button type="button" onClick={() => onClick(it)} aria-pressed={sel} className={juntar("block w-full rounded-[2px] px-2 py-1.5 text-left outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent", sel && "bg-accent-soft")}>
                {conteudo}
              </button>
            ) : (
              <div className="px-2 py-1.5">{conteudo}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** Barra empilhada de composição (ex.: receitas por origem), com legenda e valores. itens: [{ id, rotulo, valor }] */
export function Composicao({ itens, formatar, total }) {
  const soma = total ?? itens.reduce((a, i) => a + (i.valor ?? 0), 0)
  const cores = ["#2448a8", "#3b6fe0", "#7aa0f0", "#b9cdf6", "#8a93a3", "#cdd3dc"]
  // a cor segue a categoria (posição fixa na lista recebida), não o ranking
  const vis = itens.map((i, k) => ({ ...i, cor: cores[k % cores.length] })).filter((i) => (i.valor ?? 0) > 0)
  if (!soma || !vis.length) return null
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label={vis.map((i) => `${i.rotulo}: ${formatar(i.valor)}`).join("; ")}>
        {vis.map((i) => (
          <span key={i.id} title={`${i.rotulo}: ${formatar(i.valor)}`} className="block h-full" style={{ width: `${(i.valor / soma) * 100}%`, background: i.cor }} />
        ))}
      </div>
      <ul className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {vis.map((i) => (
          <li key={i.id} className="flex min-w-0 items-center justify-between gap-3 text-[12.5px]">
            <span className="flex min-w-0 items-center gap-2 text-foreground">
              <span aria-hidden="true" className="inline-block size-2.5 shrink-0 rounded-[2px]" style={{ background: i.cor }} />
              <span className="min-w-0 leading-snug">{i.rotulo}</span>
            </span>
            <span className="numero shrink-0 text-muted-foreground">
              {formatar(i.valor)} <span className="text-subtle-foreground">· {Math.round((i.valor / soma) * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
