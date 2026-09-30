// Cota parlamentar (Câmara CEAP, Senado CEAPS) e verba indenizatória (ALBA): total por ano e categoria,
// maiores fornecedores, destaques "o que comeu, onde dormiu" e a tabela de notas com LINK DA NOTA FISCAL.
import { Fonte } from "../../components/Fonte.jsx"
import { DadoIndisponivel } from "../../components/ui/estados.jsx"
import { Aviso, Bloco, Cnpj, EstadoSecao, GradeNumeros, LinkDoc, Numero, Recolhivel, Tabela, TabelaServidor, TituloAba, useParamsUrl, useSecao, rolarPara } from "../../components/ficha/pecas.jsx"
import { BarrasH, Colunas } from "../../components/ficha/graficos.jsx"
import { caixaTitulo, capitalizar, fmtBRL, fmtBRLCompacto, fmtData, fmtInt, nomeMes } from "../../lib/format.js"

export const GRUPO_ROTULO = {
  alimentacao: "Alimentação",
  hospedagem: "Hospedagem",
  combustivel: "Combustível",
  locomocao_hospedagem_alimentacao_combustivel: "Locomoção, hospedagem, alimentação e combustível",
  passagem: "Passagens aéreas",
  locacao_veiculo: "Locação de veículos e aeronaves",
  divulgacao: "Divulgação da atividade",
  consultoria: "Consultorias e assessorias",
  telefonia_postal: "Telefonia e correios",
  seguranca: "Segurança",
  taxi_pedagio_estacionamento: "Táxi, pedágio e estacionamento",
  escritorio: "Escritório de apoio",
  eventos_cursos: "Eventos e cursos",
  outros: "Outros",
  aeronave: "Fretamento de aeronaves",
}
const rotuloGrupo = (g) => GRUPO_ROTULO[g] ?? capitalizar(String(g ?? "sem categoria").replace(/_/g, " "))
const CASA = { camara: { nome: "Câmara (CEAP)", chave: "camara_ceap" }, senado: { nome: "Senado (CEAPS)", chave: "senado_ceaps" }, alba: { nome: "ALBA (verba indenizatória)", chave: "alba_verba" } }
const DESTAQUE = {
  alimentacao: { titulo: "O que comeu", sub: "maiores notas de alimentação" },
  hospedagem: { titulo: "Onde dormiu", sub: "maiores notas de hospedagem" },
  combustivel: { titulo: "Combustível", sub: "maiores abastecimentos" },
  aeronave: { titulo: "Fretamento de aeronaves", sub: "maiores notas de aeronave" },
  locomocao: { titulo: "Locomoção, hospedagem e alimentação", sub: "o Senado agrupa essas despesas numa só categoria" },
}

function detalheNota(l) {
  return [l.especificacao, l.trecho && `trecho ${l.trecho}`, l.passageiro && `passageiro ${l.passageiro}`, l.detalhamento, l.processo && `processo ${l.processo}`]
    .filter(Boolean)
    .join(" · ")
}

export function AbaCota({ dados }) {
  const f = dados.ficha
  const { dados: d, erro, recarregar } = useSecao(f.slug, "cota")
  const [p, definir] = useParamsUrl("n_")
  if (!d) return <EstadoSecao erro={erro} recarregar={recarregar} />

  const casas = [...new Set(d.por_ano.map((x) => x.casa))]
  const alba = casas.length === 1 && casas[0] === "alba"
  const titulo = alba ? "Verba indenizatória" : "Cota parlamentar"
  if (!d.totais?.n) {
    return (
      <div>
        <TituloAba eyebrow="Gastos do mandato" titulo={titulo} />
        <DadoIndisponivel>
          {f.mandato_atual
            ? "Não há despesas de cota/verba publicadas para este mandato nas bases consultadas (Câmara e Senado 2019–2026; ALBA 2023–2026)."
            : "Sem mandato parlamentar: não há cota nem verba indenizatória."}
        </DadoIndisponivel>
      </div>
    )
  }

  // por ano (soma das casas)
  const anos = [...new Set(d.por_ano.map((x) => x.ano))].sort()
  const porAno = anos.map((a) => ({ rotulo: a, valores: { t: d.por_ano.filter((x) => x.ano === a).reduce((s, x) => s + (x.total ?? 0), 0) } }))
  // por grupo
  const grupos = new Map()
  for (const c of d.por_categoria) {
    const e = grupos.get(c.grupo) ?? { id: c.grupo, rotulo: rotuloGrupo(c.grupo), valor: 0, n: 0, cats: [] }
    e.valor += c.total ?? 0
    e.n += c.n
    e.cats.push(c.categoria)
    grupos.set(c.grupo, e)
  }
  const listaGrupos = [...grupos.values()].sort((a, b) => b.valor - a.valor)
  const destaques = Object.keys(DESTAQUE).map((k) => ({ k, notas: d.destaques.filter((n) => n.destaque === k) })).filter((x) => x.notas.length)
  const semLink = d.totais.n - d.totais.n_com_link
  const irNotas = (mud) => { definir(mud); rolarPara("tabela-notas") }

  return (
    <div className="flex flex-col gap-12">
      <TituloAba eyebrow={`Gastos do mandato · ${casas.map((c) => CASA[c]?.nome ?? c).join(" + ")}`} titulo={titulo}>
        {alba
          ? "Verba indenizatória da Assembleia Legislativa da Bahia, nota a nota, com o PDF do documento publicado no portal da ALBA."
          : "Cota para o Exercício da Atividade Parlamentar: reembolso de despesas do gabinete, nota a nota. A Câmara publica o link de cada nota fiscal; o Senado publica o detalhamento em texto, sem o documento."}
      </TituloAba>

      {d.totais?.n > 0 && (
        <GradeNumeros colunas="grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4">
          <Numero rotulo={`Total ${d.totais.ano_min}–${d.totais.ano_max}`} valor={fmtBRLCompacto(d.totais.total)} sub={`${fmtInt(d.totais.n)} notas/reembolsos`} fonte={<Fonte chave={CASA[casas[0]]?.chave} ano={d.totais.ano_max} />} />
          <Numero rotulo="Maior categoria" valor={fmtBRLCompacto(listaGrupos[0]?.valor)} sub={listaGrupos[0]?.rotulo} onClick={() => irNotas({ grupo: listaGrupos[0]?.id })} />
          <Numero rotulo="Notas com documento" valor={fmtInt(d.totais.n_com_link)} sub={semLink > 0 ? `${fmtInt(semLink)} sem link publicado pela casa` : "todas com link"} />
          <Numero rotulo="Fretamento de aeronaves" valor={d.totais.aeronave ? fmtBRLCompacto(d.totais.aeronave) : "R$ 0"} sub={d.totais.aeronave ? "locação ou fretamento" : "nenhuma nota de aeronave"} onClick={d.totais.aeronave ? () => irNotas({ grupo: "aeronave" }) : undefined} />
        </GradeNumeros>
      )}

      {porAno.length > 0 && (
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <Bloco eyebrow="Por ano" titulo="Quanto gastou" descricao="Clique num ano para ver as notas dele.">
            <div className="rounded-[var(--radius)] border border-grid bg-surface p-4 pt-6">
              <Colunas dados={porAno} series={[{ id: "t", rotulo: "Total" }]} formatar={fmtBRLCompacto} rotuloAcessivel="Cota por ano" onSelecionar={(a) => irNotas({ ano: a })} selecionado={p.ano} />
            </div>
            <Recolhivel className="mt-3" titulo="Tabela por ano">
              <Tabela legenda="Cota por ano" linhas={d.por_ano} chave={(l) => `${l.casa}-${l.ano}`} colunas={[
                { id: "ano", rotulo: "Ano", principal: true, valor: (l) => <span className="numero font-medium">{l.ano}</span> },
                { id: "casa", rotulo: "Casa", valor: (l) => CASA[l.casa]?.nome ?? l.casa },
                { id: "n", rotulo: "Notas", alinhar: "direita", valor: (l) => fmtInt(l.n) },
                { id: "t", rotulo: "Total", alinhar: "direita", valor: (l) => fmtBRL(l.total) },
                { id: "f", rotulo: "Fonte", valor: (l) => <Fonte chave={CASA[l.casa]?.chave} ano={l.ano} mostrarData={false} /> },
              ]} minLargura={480} />
            </Recolhivel>
          </Bloco>
          <Bloco eyebrow="Por categoria" titulo="Em quê" descricao="Categorias agrupadas; clique para filtrar as notas.">
            <BarrasH
              itens={listaGrupos.map((g) => ({ ...g, sub: `${fmtInt(g.n)} notas${g.cats.length > 1 ? ` · ${g.cats.length} categorias oficiais` : g.cats[0] && g.cats[0].toLowerCase() !== g.rotulo.toLowerCase() ? ` · ${capitalizar(g.cats[0].toLowerCase())}` : ""}` }))}
              formatar={fmtBRLCompacto}
              onClick={(g) => irNotas({ grupo: p.grupo === g.id ? null : g.id })}
              ativo={p.grupo}
            />
          </Bloco>
        </div>
      )}

      {destaques.length > 0 && (
        <Bloco eyebrow="Destaques" titulo="O que comeu, onde dormiu, como viajou" descricao="As maiores notas de cada tipo, com o documento. Valores líquidos (depois de glosas).">
          <div className="grid gap-4 md:grid-cols-2">
            {destaques.map(({ k, notas }) => (
              <section key={k} aria-label={DESTAQUE[k].titulo} className="min-w-0 rounded-[var(--radius)] border border-grid bg-surface">
                <header className="flex items-baseline justify-between gap-3 border-b border-grid px-4 py-3">
                  <div>
                    <p className="text-[15px] font-semibold text-foreground">{DESTAQUE[k].titulo}</p>
                    <p className="text-[11.5px] text-muted-foreground">{DESTAQUE[k].sub}</p>
                  </div>
                  <button type="button" onClick={() => irNotas({ grupo: k === "locomocao" ? "locomocao_hospedagem_alimentacao_combustivel" : k, ordem: null })} className="shrink-0 font-mono text-[10.5px] uppercase tracking-[0.05em] text-accent-strong hover:underline">Ver todas →</button>
                </header>
                <ul>
                  {notas.map((n) => (
                    <li key={n.id} className="flex items-start justify-between gap-3 border-b border-grid px-4 py-2.5 last:border-0">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-foreground" title={n.fornecedor}>{caixaTitulo(n.fornecedor)}</p>
                        <p className="truncate text-[11.5px] text-muted-foreground" title={detalheNota(n)}>
                          {n.data_documento ? fmtData(n.data_documento) : `${nomeMes(n.mes)}/${n.ano}`}
                          {n.cnpj ? ` · ${n.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")}` : ""}
                          {detalheNota(n) ? ` · ${detalheNota(n)}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-0.5">
                        <span className="numero text-[13px] font-medium text-foreground">{fmtBRL(n.valor_liquido)}</span>
                        <LinkDoc href={n.url_documento} rotulo="Nota" descricao="nota fiscal" />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </Bloco>
      )}

      {d.fornecedores.length > 0 && (
        <Bloco eyebrow="Fornecedores" titulo="Para quem foi o dinheiro" descricao="Clique no nome para ver as notas do fornecedor.">
          <Tabela
            legenda="Maiores fornecedores da cota"
            linhas={d.fornecedores}
            chave={(l, i) => `${l.cnpj ?? l.nome}-${i}`}
            colunas={[
              { id: "nome", rotulo: "Fornecedor", principal: true, valor: (l) => <button type="button" onClick={() => irNotas({ q: l.cnpj ?? l.nome, grupo: null })} className="text-left font-medium hover:text-accent-strong hover:underline">{caixaTitulo(l.nome)}</button> },
              { id: "cnpj", rotulo: "CNPJ", valor: (l) => <Cnpj cnpj={l.cnpj} pf={l.pf} /> },
              { id: "g", rotulo: "Categorias", valor: (l) => <span className="text-[12px] text-muted-foreground">{(l.grupos ?? "").split(",").map(rotuloGrupo).join(", ")}</span> },
              { id: "n", rotulo: "Notas", alinhar: "direita", valor: (l) => fmtInt(l.n) },
              { id: "t", rotulo: "Total", alinhar: "direita", valor: (l) => fmtBRL(l.total) },
            ]}
            minLargura={720}
          />
        </Bloco>
      )}

      {d.totais?.n > 0 && (
        <Bloco id="tabela-notas" eyebrow="Nota a nota" titulo="Todas as notas" descricao={`Busque por fornecedor, CNPJ, descrição, trecho ou nº do documento. “Nota” abre o documento fiscal publicado pela casa.${casas.includes("camara") ? " Valores negativos são como a Câmara publica: compensação de bilhete aéreo não usado e desconto de complementação do auxílio-moradia; entram na soma." : ""}`}>
          <TabelaServidor
            api={`candidatos/${f.slug}/cota/notas`}
            prefixo="n_"
            busca={{ placeholder: "Buscar fornecedor, CNPJ, restaurante, hotel, trecho…" }}
            filtros={[
              ...(casas.length > 1 ? [{ id: "casa", rotulo: "Casa", opcoes: casas.map((c) => ({ value: c, label: CASA[c]?.nome ?? c })), rotuloOpcao: (c) => CASA[c]?.nome ?? c, todos: "Todas" }] : []),
              { id: "grupo", rotulo: "Categoria", rotuloOpcao: rotuloGrupo, todos: "Todas", opcoes: [...listaGrupos.map((g) => ({ value: g.id, label: g.rotulo, n: g.n })), ...(d.totais.aeronave ? [{ value: "aeronave", label: "Fretamento de aeronaves" }] : [])] },
              { id: "ano", rotulo: "Ano", opcoes: [...anos].reverse().map((a) => ({ value: a, label: String(a) })) },
              { id: "mes", rotulo: "Mês", opcoes: d.meses.map((m) => ({ value: m, label: nomeMes(m) })), rotuloOpcao: nomeMes },
            ]}
            ordens={[
              { value: "valor", label: "Maior valor" },
              { value: "valor_asc", label: "Menor valor" },
              { value: "data", label: "Mais recentes" },
              { value: "data_asc", label: "Mais antigas" },
              { value: "fornecedor", label: "Fornecedor A–Z" },
            ]}
            ordemPadrao="valor"
            legenda="Notas da cota parlamentar"
            documento={(l) => l.url_documento}
            rotuloDocumento="Nota"
            colunas={[
              { id: "forn", rotulo: "Fornecedor", principal: true, classe: "max-w-[260px]", valor: (l) => <span className="font-medium">{caixaTitulo(l.fornecedor)}</span> },
              { id: "data", rotulo: "Data", valor: (l) => <span className="numero whitespace-nowrap">{l.data_documento ? fmtData(l.data_documento) : `${nomeMes(l.mes)}/${l.ano}`}</span> },
              { id: "cnpj", rotulo: "CNPJ", valor: (l) => <Cnpj cnpj={l.cnpj} pf={l.pf} /> },
              { id: "cat", rotulo: "Categoria", valor: (l) => <span className="text-[12px] text-muted-foreground" title={l.categoria}>{rotuloGrupo(l.categoria_grupo)}</span> },
              { id: "det", rotulo: "Detalhe", classe: "max-w-[280px]", valor: (l) => <span className="text-[12px] text-muted-foreground">{detalheNota(l) || (l.numero_documento ? `doc. ${l.numero_documento}` : "—")}</span> },
              { id: "v", rotulo: "Valor", alinhar: "direita", valor: (l) => <span>{fmtBRL(l.valor_liquido)}{l.valor_glosa > 0 && <span className="block text-[10.5px] text-muted-foreground">glosa {fmtBRL(l.valor_glosa)}</span>}</span> },
            ]}
            minLargura={980}
          />
        </Bloco>
      )}

      {casas.includes("senado") && <Aviso>O Senado não publica o documento fiscal de cada reembolso em dados abertos; a tabela traz o detalhamento informado pelo gabinete.</Aviso>}
    </div>
  )
}
