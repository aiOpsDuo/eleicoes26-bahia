// Campanha: prestação de contas por eleição (2026 parcial e anteriores), receitas por origem, doadores (PF só nome),
// despesas por categoria, principais fornecedores e a tabela de despesas pesquisável/paginada no servidor.
import { Link } from "../../lib/nav.jsx"
import { Fonte } from "../../components/Fonte.jsx"
import { Segmentos } from "../../components/ui/controles.jsx"
import { DadoIndisponivel } from "../../components/ui/estados.jsx"
import { Aviso, Bloco, Cnpj, EstadoSecao, GradeNumeros, LinkExterno, Numero, Tabela, TabelaServidor, TituloAba, useParamsUrl, useSecao, rolarPara } from "../../components/ficha/pecas.jsx"
import { BarrasH, Composicao } from "../../components/ficha/graficos.jsx"
import { capitalizar, caixaTitulo, fmtBRL, fmtBRLCompacto, fmtData, fmtInt, rotuloSnake, urlDivulgaCand } from "../../lib/format.js"

const TIPO_DOADOR = {
  fundo_eleitoral: "Fundo eleitoral (FEFC)",
  fundo_partidario: "Fundo partidário",
  pessoa_fisica: "Pessoa física",
  recursos_proprios: "Recursos próprios",
  partido_candidato: "Partido / outro candidato",
  outros: "Outros",
}

export function AbaCampanha({ dados }) {
  const f = dados.ficha
  const [p, definir] = useParamsUrl("c_")
  const { dados: d, erro, recarregar, carregando } = useSecao(f.slug, "campanha", { ano: p.ano })
  const [pd, definirDesp] = useParamsUrl("d_")

  if (f.cargo === "suplente" && d && !d.resumos.length) {
    return (
      <div>
        <TituloAba eyebrow="Prestação de contas" titulo="Dinheiro da campanha" />
        <DadoIndisponivel>
          Suplentes não prestam contas separadas: a campanha é a do titular da chapa.
          {dados.titular && <> Veja a ficha de <Link to={`/candidato/${dados.titular.slug}?aba=campanha`} className="font-medium text-accent-strong underline underline-offset-2">{dados.titular.nome_urna}</Link>.</>}
        </DadoIndisponivel>
      </div>
    )
  }
  if (!d) return <EstadoSecao erro={erro} recarregar={recarregar} />
  if (!d.resumos.length) return <DadoIndisponivel>Sem prestação de contas nas bases consultadas.</DadoIndisponivel>

  const r = d.resumos.find((x) => x.ano === d.ano) ?? d.resumos[0]
  const parcial = r.ano === 2026
  const receitas = [
    { id: "fefc", rotulo: "Fundo eleitoral (FEFC)", valor: r.fundo_eleitoral },
    { id: "fp", rotulo: "Fundo partidário", valor: r.fundo_partidario },
    { id: "pf", rotulo: "Pessoas físicas", valor: r.pessoas_fisicas },
    { id: "rp", rotulo: "Recursos próprios", valor: r.recursos_proprios },
    { id: "ocp", rotulo: "Outros candidatos e partidos", valor: r.outros_candidatos_partidos },
    { id: "out", rotulo: "Outras receitas", valor: r.outras_receitas },
  ]
  const temLinhas = d.n_despesas_linhas > 0
  // 2026: página do candidato no DivulgaCandContas (TSE), com receitas, despesas e extratos atualizados
  const urlTse = r.ano === 2026 ? urlDivulgaCand(f) : null
  const urlTseDespesas = r.ano === 2026 ? urlDivulgaCand(f, "despesas") : null

  return (
    <div className="flex flex-col gap-12">
      <TituloAba eyebrow="Prestação de contas eleitoral" titulo="Dinheiro da campanha">
        Receitas e despesas declaradas à Justiça Eleitoral. Despesa <em>contratada</em> não é despesa <em>paga</em>: os dois números não se somam.
        Doador pessoa física aparece só pelo nome (o site não publica CPF).
      </TituloAba>

      <div className="flex flex-wrap items-center gap-3">
        {d.anos.length > 1 && <Segmentos rotulo="Eleição" opcoes={d.anos.map((a) => ({ value: a, label: String(a) }))} valor={d.ano} onChange={(a) => { definir({ ano: a === d.anos[0] ? null : a }); definirDesp({ categoria: null, q: null }) }} />}
        {carregando && <span className="font-mono text-[11px] uppercase text-muted-foreground">carregando…</span>}
      </div>

      {parcial && (
        <Aviso tom="warn" eyebrow="Dado parcial" titulo="2026: prestação de contas ainda em andamento">
          Números do arquivo do TSE de 29/09/2026 ({r.tipo_prestacao ? capitalizar(r.tipo_prestacao.toLowerCase()) : "parcial"}
          {r.dt_prestacao ? `, entregue em ${fmtData(r.dt_prestacao)}` : ""}). Valores vão mudar até a prestação final, depois da eleição.
        </Aviso>
      )}

      <Bloco eyebrow={`Eleição ${r.ano}${r.cargo_na_eleicao ? ` · ${r.cargo_na_eleicao}` : ""}`} titulo="Totais" acao={urlTse && <LinkExterno href={urlTse}>Prestação no DivulgaCandContas (TSE)</LinkExterno>}>
        <GradeNumeros colunas="grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4">
          <Numero rotulo="Arrecadado" valor={fmtBRLCompacto(r.total_receitas)} sub={r.n_doadores != null ? `${fmtInt(r.n_doadores)} doadores · ${fmtInt(r.n_receitas)} receitas` : null} fonte={<Fonte id={r.fonte_id} />} />
          <Numero rotulo="Despesas contratadas" valor={fmtBRLCompacto(r.despesas_contratadas)} sub={r.n_despesas != null ? `${fmtInt(r.n_despesas)} despesas · ${fmtInt(r.n_fornecedores)} fornecedores` : null} fonte={<Fonte id={r.fonte_id} />} />
          <Numero rotulo="Despesas pagas" valor={fmtBRLCompacto(r.despesas_pagas)} sub="só agregado (o TSE não detalha pagamentos)" fonte={<Fonte id={r.fonte_id} />} />
          <Numero rotulo="Fundos públicos" valor={fmtBRLCompacto((r.fundo_eleitoral ?? 0) + (r.fundo_partidario ?? 0))} sub={r.total_receitas ? `${Math.round((((r.fundo_eleitoral ?? 0) + (r.fundo_partidario ?? 0)) / r.total_receitas) * 100)}% do arrecadado` : null} fonte={<Fonte id={r.fonte_id} />} />
        </GradeNumeros>
      </Bloco>

      <div className="grid gap-12 lg:grid-cols-2">
        <Bloco eyebrow="Receitas" titulo="De onde veio o dinheiro">
          {r.total_receitas ? <Composicao itens={receitas} formatar={fmtBRLCompacto} total={receitas.reduce((a, i) => a + (i.valor ?? 0), 0)} /> : <DadoIndisponivel>Sem receitas declaradas.</DadoIndisponivel>}
          <p className="mt-3"><Fonte id={r.fonte_id} /></p>
        </Bloco>
        <Bloco eyebrow="Despesas" titulo="Em que gastou" descricao={temLinhas ? "Categorias oficiais do TSE. Clique para filtrar a tabela de despesas." : undefined}>
          {d.categorias.length ? (
            <BarrasH
              itens={d.categorias.slice(0, 12).map((c) => ({ id: c.categoria, rotulo: capitalizar(c.categoria.toLowerCase()), valor: c.valor, sub: c.n_despesas ? `${fmtInt(c.n_despesas)} despesas` : null }))}
              formatar={fmtBRLCompacto}
              onClick={temLinhas ? (c) => { definirDesp({ categoria: pd.categoria === c.id ? null : c.id }); rolarPara("tabela-despesas") } : undefined}
              ativo={pd.categoria}
            />
          ) : (
            <DadoIndisponivel>Sem despesas por categoria.</DadoIndisponivel>
          )}
          {d.categorias.length > 12 && <p className="mt-2 text-[11.5px] text-muted-foreground">+ {d.categorias.length - 12} categorias menores (todas no filtro da tabela).</p>}
          {d.categorias[0] && <p className="mt-3"><Fonte id={d.categorias[0].fonte_id} /></p>}
        </Bloco>
      </div>

      <div className="grid gap-12">
        <Bloco eyebrow="Doadores" titulo="Maiores doadores" descricao="Pessoa física: só o nome. Partidos e empresas: CNPJ com link para o cadastro na Receita.">
          <Tabela
            legenda="Maiores doadores"
            linhas={d.doadores}
            chave={(l, i) => `${l.nome}-${i}`}
            colunas={[
              { id: "nome", rotulo: "Doador", principal: true, valor: (l) => <span className="font-medium">{caixaTitulo(l.nome)}</span> },
              { id: "tipo", rotulo: "Tipo", valor: (l) => <span className="text-muted-foreground">{TIPO_DOADOR[l.tipo] ?? rotuloSnake(l.tipo) ?? "—"}</span> },
              { id: "doc", rotulo: "CNPJ", valor: (l) => <Cnpj cnpj={l.cnpj} pf={l.pf} /> },
              { id: "n", rotulo: "Doações", alinhar: "direita", valor: (l) => fmtInt(l.n_doacoes) },
              { id: "valor", rotulo: "Valor", alinhar: "direita", valor: (l) => fmtBRL(l.valor) },
            ]}
            vazio="Sem doadores declarados."
            minLargura={600}
          />
          {d.doadores[0] && <p className="mt-2"><Fonte id={d.doadores[0].fonte_id} /></p>}
        </Bloco>
        <Bloco eyebrow="Fornecedores" titulo="Principais fornecedores">
          <Tabela
            legenda="Principais fornecedores"
            linhas={d.fornecedores}
            chave={(l, i) => `${l.nome}-${i}`}
            colunas={[
              { id: "nome", rotulo: "Fornecedor", principal: true, valor: (l) => <button type="button" className="text-left font-medium hover:text-accent-strong hover:underline" title="Ver as despesas deste fornecedor" onClick={() => { definirDesp({ q: l.cnpj ?? l.nome }); rolarPara("tabela-despesas") }}>{caixaTitulo(l.nome)}</button> },
              { id: "doc", rotulo: "CNPJ", valor: (l) => <Cnpj cnpj={l.cnpj} pf={l.pf} /> },
              { id: "cat", rotulo: "Categoria principal", valor: (l) => <span className="text-muted-foreground">{l.categoria_principal ? capitalizar(l.categoria_principal.toLowerCase()) : "—"}</span> },
              { id: "valor", rotulo: "Valor", alinhar: "direita", valor: (l) => fmtBRL(l.valor) },
            ]}
            vazio="Sem fornecedores declarados."
            minLargura={600}
          />
        </Bloco>
      </div>

      {temLinhas ? (
        <Bloco id="tabela-despesas" eyebrow="Despesa a despesa" titulo={`Despesas contratadas em ${r.ano}`} descricao={urlTseDespesas
            ? <>Busque por fornecedor, CNPJ, descrição ou nº do documento. O TSE não publica a nota de cada despesa em dados abertos; a fonte de cada linha é o arquivo oficial da prestação, e as despesas também podem ser conferidas na <LinkExterno href={urlTseDespesas}>página de despesas do candidato no DivulgaCandContas</LinkExterno>.</>
            : "Busque por fornecedor, CNPJ, descrição ou nº do documento. O TSE não publica a nota de cada despesa em dados abertos: o link é o arquivo oficial da prestação."}>
          <TabelaServidor
            api={`candidatos/${f.slug}/campanha/despesas`}
            prefixo="d_"
            fixos={{ ano: r.ano }}
            busca={{ placeholder: "Buscar fornecedor, CNPJ, descrição…" }}
            filtros={[{ id: "categoria", rotulo: "Categoria", rotuloOpcao: (v) => capitalizar(String(v).toLowerCase()), todos: "Todas" }]}
            ordens={[
              { value: "valor", label: "Maior valor" },
              { value: "valor_asc", label: "Menor valor" },
              { value: "data", label: "Mais recentes" },
              { value: "data_asc", label: "Mais antigas" },
              { value: "fornecedor", label: "Fornecedor A–Z" },
            ]}
            ordemPadrao="valor"
            legenda="Despesas de campanha"
            colunas={[
              { id: "forn", rotulo: "Fornecedor", principal: true, valor: (l) => <span className="font-medium">{caixaTitulo(l.fornecedor)}{l.fornecedor_municipio ? <span className="block text-[11px] font-normal text-muted-foreground">{caixaTitulo(l.fornecedor_municipio)}/{l.fornecedor_uf}</span> : null}</span> },
              { id: "data", rotulo: "Data", valor: (l) => <span className="numero whitespace-nowrap">{fmtData(l.data)}</span> },
              { id: "doc", rotulo: "CNPJ", valor: (l) => <Cnpj cnpj={l.cnpj} pf={l.pf} /> },
              { id: "cat", rotulo: "Categoria", valor: (l) => <span className="text-muted-foreground">{capitalizar((l.categoria ?? "").toLowerCase()) || "—"}</span> },
              { id: "desc", rotulo: "Descrição", classe: "max-w-[320px]", valor: (l) => <span className="text-[12.5px]">{l.descricao || "—"}{l.numero_documento ? <span className="block font-mono text-[10.5px] text-muted-foreground">{l.tipo_documento ?? "doc."} {l.numero_documento}</span> : null}</span> },
              { id: "valor", rotulo: "Valor", alinhar: "direita", valor: (l) => fmtBRL(l.valor) },
              { id: "fonte", rotulo: "Fonte", valor: (l) => <Fonte id={l.fonte_id} mostrarData={false} /> },
            ]}
            minLargura={900}
          />
        </Bloco>
      ) : null}
    </div>
  )
}
