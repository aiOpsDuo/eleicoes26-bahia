// Emendas parlamentares: empenhado/pago por ano e por área, municípios de destino REAL (sem BB/Caixa) com per capita,
// favorecidos (prefeitura/fundo/entidade privada), convênios com objeto, emendas Pix com plano de ação e relatório,
// shows, e a lista de emendas com link para a página de cada uma no Portal da Transparência.
import { useMemo, useState } from "react"
import { Fonte } from "../../components/Fonte.jsx"
import { Selo } from "../../components/ui/base.jsx"
import { Segmentos } from "../../components/ui/controles.jsx"
import { DadoIndisponivel } from "../../components/ui/estados.jsx"
import { Aviso, Bloco, Cnpj, EstadoSecao, GradeNumeros, Numero, Recolhivel, Tabela, TabelaServidor, TextoExpansivel, TituloAba, useParamsUrl, useSecao, rolarPara } from "../../components/ficha/pecas.jsx"
import { BarrasH, Colunas } from "../../components/ficha/graficos.jsx"
import { caixaTitulo, capitalizar, fmtBRL, fmtBRLCompacto, fmtCompetencia, fmtData, fmtInt } from "../../lib/format.js"

const PORTAL = "https://portaldatransparencia.gov.br/emendas/detalhe?codigoEmenda="

function tipoFavorecido(l) {
  const nj = (l.natureza_juridica ?? "").toLowerCase()
  const nome = (l.nome ?? "").toLowerCase()
  if (l.pf) return { rotulo: "Pessoa física", tom: "neutral" }
  if (l.privado) return { rotulo: nj ? capitalizar(nj) : "Entidade privada", tom: "warn" }
  if (/fundo/.test(nome) || /fundo/.test(nj)) return { rotulo: "Fundo público", tom: "accent" }
  if (/munic/.test(nj) || /^munic|prefeitura/.test(nome)) return { rotulo: "Prefeitura", tom: "accent" }
  if (/estad|uf/.test(nj) || /^estado d/.test(nome)) return { rotulo: "Governo estadual", tom: "accent" }
  return { rotulo: nj ? capitalizar(nj) : l.tipo ?? "Pessoa jurídica", tom: "neutral" }
}

const ORD_MUN = {
  valor: { rotulo: "Maior valor", f: (a, b) => (b.valor_recebido ?? 0) - (a.valor_recebido ?? 0) },
  per_capita: { rotulo: "Maior per capita", f: (a, b) => (b.per_capita ?? -1) - (a.per_capita ?? -1) },
  emendas: { rotulo: "Mais emendas", f: (a, b) => b.n_emendas - a.n_emendas },
  nome: { rotulo: "Município A–Z", f: (a, b) => a.municipio.localeCompare(b.municipio, "pt-BR") },
}

export function AbaEmendas({ dados }) {
  const f = dados.ficha
  const { dados: d, erro, recarregar } = useSecao(f.slug, "emendas")
  const [pm, definirMun] = useParamsUrl("m_")
  const [pe, definirEm] = useParamsUrl("e_")
  const [pf, definirFav] = useParamsUrl("f_")
  const [todosMun, setTodosMun] = useState(false)
  const municipios = useMemo(() => [...(d?.municipios ?? [])].sort((ORD_MUN[pm.ordem] ?? ORD_MUN.valor).f), [d, pm.ordem])
  const favorecidos = useMemo(() => (d?.favorecidos ?? []).filter((l) => !pf.tipo || (pf.tipo === "privado" ? l.privado : !l.privado)), [d, pf.tipo])

  if (!d) return <EstadoSecao erro={erro} recarregar={recarregar} />
  if (!d.por_ano.length) {
    return (
      <div>
        <TituloAba eyebrow="Emendas parlamentares" titulo="Para onde foi o dinheiro" />
        <DadoIndisponivel>
          Sem emendas atribuídas a este candidato. Emendas individuais só existem para quem teve mandato federal (código de autor no Portal da Transparência);
          {f.mandato_atual === "deputado_estadual" ? " emendas ao orçamento estadual da Bahia não são publicadas em dados abertos por autor." : " emendas de bancada e de comissão não são atribuídas a um parlamentar."}
        </DadoIndisponivel>
      </div>
    )
  }
  const tot = d.por_ano.reduce((a, x) => ({ emp: a.emp + (x.empenhado ?? 0), pago: a.pago + (x.pago ?? 0), pt: a.pt + (x.pago_total ?? 0), n: a.n + x.n_emendas }), { emp: 0, pago: 0, pt: 0, n: 0 })
  const pixTotal = d.pix.reduce((a, x) => a + (x.valor_plano ?? 0), 0)
  const semRelatorio = d.pix.filter((x) => !x.tem_relatorio_gestao).length
  const intermediado = d.intermediarios.reduce((a, x) => a + (x.valor ?? 0), 0)
  const munVis = todosMun ? municipios : municipios.slice(0, 20)

  return (
    <div className="flex flex-col gap-12">
      <TituloAba eyebrow="Emendas parlamentares · Portal da Transparência" titulo="Para onde foi o dinheiro">
        Emendas individuais ao Orçamento da União ({d.por_ano[0].ano}–{d.por_ano.at(-1).ano}). <em>Empenhado</em> é o valor reservado; <em>pago</em> inclui
        restos a pagar pagos em anos seguintes. Cada emenda tem link para a página oficial no Portal.
      </TituloAba>

      <GradeNumeros colunas="grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4">
        <Numero rotulo="Empenhado" valor={fmtBRLCompacto(tot.emp)} sub={`${fmtInt(f.n_emendas)} emendas`} fonte={<Fonte chave="portal_emendas" />} />
        <Numero rotulo="Pago (com restos a pagar)" valor={fmtBRLCompacto(tot.pt)} sub={tot.emp ? `${Math.round((tot.pt / tot.emp) * 100)}% do empenhado · no exercício ${fmtBRLCompacto(tot.pago)}` : null} fonte={<Fonte chave="portal_emendas" />} />
        <Numero rotulo="Municípios de destino" valor={fmtInt(d.municipios.length)} sub="destino real (sem Banco do Brasil/Caixa)" fonte={<Fonte chave="portal_emendas" />} />
        <Numero rotulo="Emendas Pix (planos)" valor={fmtBRLCompacto(pixTotal)} sub={d.pix.length ? `${fmtInt(d.pix.length)} planos · ${fmtInt(semRelatorio)} sem relatório de gestão` : "sem transferências especiais"} fonte={d.pix.length ? <Fonte chave="transferegov_pix" /> : null} />
      </GradeNumeros>

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Bloco eyebrow="Por ano" titulo="Empenhado e pago" descricao="Clique num ano para ver as emendas dele na lista abaixo.">
          <div className="rounded-[var(--radius)] border border-grid bg-surface p-4 pt-6">
            <Colunas
              dados={d.por_ano.map((a) => ({ rotulo: a.ano, valores: { e: a.empenhado, p: a.pago_total } }))}
              series={[{ id: "e", rotulo: "Empenhado" }, { id: "p", rotulo: "Pago (com restos)" }]}
              formatar={fmtBRLCompacto}
              rotuloAcessivel="Emendas empenhadas e pagas por ano"
              onSelecionar={(a) => { definirEm({ ano: a }); rolarPara("lista-emendas") }}
              selecionado={pe.ano}
            />
          </div>
          <Recolhivel className="mt-3" titulo="Tabela por ano">
            <Tabela
              legenda="Emendas por ano"
              linhas={[...d.por_ano].reverse()}
              chave={(l) => l.ano}
              colunas={[
                { id: "ano", rotulo: "Ano", principal: true, valor: (l) => <span className="numero font-medium">{l.ano}</span> },
                { id: "n", rotulo: "Emendas", alinhar: "direita", valor: (l) => fmtInt(l.n_emendas) },
                { id: "e", rotulo: "Empenhado", alinhar: "direita", valor: (l) => fmtBRL(l.empenhado) },
                { id: "p", rotulo: "Pago no ano", alinhar: "direita", valor: (l) => fmtBRL(l.pago) },
                { id: "r", rotulo: "Restos pagos", alinhar: "direita", valor: (l) => fmtBRL(l.restos_pagar_pagos) },
                { id: "t", rotulo: "Pago total", alinhar: "direita", valor: (l) => fmtBRL(l.pago_total) },
              ]}
              minLargura={640}
            />
          </Recolhivel>
        </Bloco>
        <Bloco eyebrow="Por área" titulo="Em que áreas" descricao="Função orçamentária. Clique para filtrar a lista.">
          <BarrasH
            itens={d.por_area.map((a) => ({ id: a.area, rotulo: a.area, valor: a.empenhado, sub: `pago ${fmtBRLCompacto(a.pago_total)} · ${fmtInt(a.n_emendas)} emendas` }))}
            formatar={fmtBRLCompacto}
            onClick={(a) => { definirEm({ area: pe.area === a.id ? null : a.id }); rolarPara("lista-emendas") }}
            ativo={pe.area}
          />
          <p className="mt-3"><Fonte chave="portal_emendas" /></p>
        </Bloco>
      </div>

      <Bloco eyebrow="Destino real" titulo="Municípios que receberam" descricao="Pelo arquivo de favorecidos do Portal. Exclui o que passa pela conta do Banco do Brasil (emendas Pix, ver abaixo) e pela Caixa (contratos de repasse, ver convênios), que são intermediários. Per capita: população IBGE 2024 (municípios da Bahia).">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Segmentos rotulo="Ordenar municípios" opcoes={Object.entries(ORD_MUN).map(([k, o]) => ({ value: k, label: o.rotulo }))} valor={pm.ordem ?? "valor"} onChange={(v) => definirMun({ ordem: v === "valor" ? null : v })} />
        </div>
        <Tabela
          legenda="Municípios de destino das emendas"
          linhas={munVis}
          chave={(l) => `${l.municipio}-${l.uf}`}
          colunas={[
            { id: "mun", rotulo: "Município", principal: true, valor: (l) => <span className="font-medium">{caixaTitulo(l.municipio)}<span className="ml-1 font-mono text-[10.5px] text-muted-foreground">{l.uf}</span></span> },
            { id: "v", rotulo: "Recebido", alinhar: "direita", valor: (l) => fmtBRL(l.valor_recebido) },
            { id: "pop", rotulo: "População", alinhar: "direita", valor: (l) => fmtInt(l.populacao) },
            { id: "pc", rotulo: "Por habitante", alinhar: "direita", valor: (l) => (l.per_capita != null ? fmtBRL(l.per_capita) : "—") },
            { id: "n", rotulo: "Emendas", alinhar: "direita", valor: (l) => fmtInt(l.n_emendas) },
            { id: "fav", rotulo: "Favorecidos", alinhar: "direita", valor: (l) => fmtInt(l.n_favorecidos) },
            { id: "per", rotulo: "Período", valor: (l) => <span className="numero whitespace-nowrap text-[12px] text-muted-foreground">{fmtCompetencia(l.primeiro_mes)}–{fmtCompetencia(l.ultimo_mes)}</span> },
          ]}
          minLargura={760}
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          {municipios.length > 20 && (
            <button type="button" onClick={() => setTodosMun((t) => !t)} className="min-h-10 font-mono text-[11px] uppercase tracking-[0.05em] text-accent-strong hover:underline">
              {todosMun ? "Mostrar só os 20 primeiros" : `Mostrar todos os ${fmtInt(municipios.length)} municípios`}
            </button>
          )}
          <span className="flex flex-wrap gap-3"><Fonte chave="portal_emendas" /><Fonte chave="ibge_pop" /></span>
        </div>
        {intermediado > 0 && (
          <Aviso className="mt-4" titulo={`${fmtBRL(intermediado)} passaram por intermediários`}>
            {d.intermediarios.map((i) => `${caixaTitulo(i.nome)} (${fmtBRLCompacto(i.valor)}, ${fmtInt(i.n_emendas)} emendas)`).join("; ")}. Esses bancos só
            repassam o dinheiro; o destino real está nas emendas Pix e nos convênios abaixo.
          </Aviso>
        )}
      </Bloco>

      <Bloco eyebrow="Favorecidos" titulo="Quem recebeu" descricao="Prefeituras, fundos, governo estadual e entidades privadas (ONGs, associações, empresas) que receberam pagamentos das emendas. O link abre a maior emenda paga ao favorecido.">
        <div className="mb-3">
          <Segmentos rotulo="Tipo de favorecido" opcoes={[{ value: "", label: "Todos", n: d.favorecidos.length }, { value: "publico", label: "Poder público", n: d.favorecidos.filter((x) => !x.privado).length }, { value: "privado", label: "Entidades privadas", n: d.favorecidos.filter((x) => x.privado).length }]} valor={pf.tipo ?? ""} onChange={(v) => definirFav({ tipo: v })} />
        </div>
        <Tabela
          legenda="Favorecidos das emendas"
          linhas={favorecidos}
          chave={(l, i) => `${l.nome}-${l.cnpj}-${i}`}
          documento={(l) => (l.codigo_emenda_maior ? PORTAL + l.codigo_emenda_maior : null)}
          rotuloDocumento="Emenda"
          colunas={[
            { id: "nome", rotulo: "Favorecido", principal: true, classe: "max-w-[320px]", valor: (l) => <span className="font-medium">{caixaTitulo(l.nome)}</span> },
            { id: "tipo", rotulo: "Tipo", valor: (l) => { const t = tipoFavorecido(l); return <Selo tom={t.tom}>{t.rotulo}</Selo> } },
            { id: "cnpj", rotulo: "CNPJ", valor: (l) => <Cnpj cnpj={l.cnpj} pf={l.pf} /> },
            { id: "mun", rotulo: "Município", valor: (l) => <span className="text-[12px] text-muted-foreground">{caixaTitulo(l.municipio) ?? "—"}{l.uf ? `/${l.uf}` : ""}</span> },
            { id: "n", rotulo: "Emendas", alinhar: "direita", valor: (l) => fmtInt(l.n_emendas) },
            { id: "v", rotulo: "Recebido", alinhar: "direita", valor: (l) => fmtBRL(l.valor) },
          ]}
          minLargura={860}
        />
        <p className="mt-2 text-[11.5px] text-muted-foreground">Mostrando os {fmtInt(d.favorecidos.length)} maiores favorecidos. <Fonte chave="portal_emendas" /></p>
      </Bloco>

      {d.convenios.length > 0 && (
        <Bloco eyebrow="Convênios e contratos de repasse" titulo="O que foi contratado" descricao="Objeto de cada convênio financiado pelas emendas (inclui os contratos de repasse pagos via Caixa).">
          <Tabela
            legenda="Convênios das emendas"
            linhas={d.convenios}
            documento={(l) => l.url}
            rotuloDocumento="Emenda"
            colunas={[
              { id: "obj", rotulo: "Objeto", principal: true, classe: "max-w-[420px]", valor: (l) => <TextoExpansivel texto={l.objeto} limite={170} className="text-[12.5px] text-foreground" /> },
              { id: "conv", rotulo: "Convenente", valor: (l) => <span className="text-[12.5px]">{caixaTitulo(l.convenente)}<span className="block font-mono text-[10.5px] text-muted-foreground">nº {l.numero_convenio}</span></span> },
              { id: "loc", rotulo: "Local", valor: (l) => <span className="text-[12px] text-muted-foreground">{l.localidade}</span> },
              { id: "data", rotulo: "Publicação", valor: (l) => <span className="numero whitespace-nowrap">{fmtData(l.data_publicacao)}</span> },
              { id: "v", rotulo: "Valor", alinhar: "direita", valor: (l) => fmtBRL(l.valor) },
            ]}
            minLargura={900}
          />
        </Bloco>
      )}

      {d.pix.length > 0 && (
        <Bloco eyebrow="Emendas Pix · transferências especiais" titulo="Planos de ação" descricao="Dinheiro que vai direto para a conta do município, que depois informa no Transferegov o que fez com ele (plano de ação) e presta contas no relatório de gestão.">
          {semRelatorio > 0 && (
            <Aviso tom="warn" className="mb-3" titulo={`${fmtInt(semRelatorio)} de ${fmtInt(d.pix.length)} planos sem relatório de gestão publicado`}>
              O relatório de gestão é a prestação de contas do município sobre o uso do dinheiro. Ausência de relatório não é, por si, irregularidade.
            </Aviso>
          )}
          <Tabela
            legenda="Planos de ação das emendas Pix"
            linhas={d.pix}
            documento={(l) => l.url}
            rotuloDocumento="Emenda"
            colunas={[
              { id: "ben", rotulo: "Beneficiário", principal: true, valor: (l) => <span className="font-medium">{caixaTitulo(l.beneficiario)}<span className="block font-mono text-[10.5px] font-normal text-muted-foreground">{l.ano} · plano {l.codigo_plano_acao}</span></span> },
              { id: "obj", rotulo: "Objeto / metas", classe: "max-w-[400px]", valor: (l) => <TextoExpansivel texto={[l.objeto, l.metas].filter(Boolean).join(" — ") || l.finalidades || l.areas} limite={150} className="text-[12.5px]" /> },
              { id: "rel", rotulo: "Relatório", valor: (l) => (
                <span className="flex flex-col items-start gap-1">
                  {l.tem_relatorio_gestao ? <Selo tom="ok">{l.situacao_relatorio_gestao?.split(":")[0] || "Publicado"}</Selo> : <Selo tom="warn">Sem relatório</Selo>}
                  {l.tem_show_evento && <Selo tom="warn">Show/evento</Selo>}
                </span>
              ) },
              { id: "cnpj", rotulo: "CNPJ", esconderCelular: true, valor: (l) => <Cnpj cnpj={l.cnpj} /> },
              { id: "v", rotulo: "Valor do plano", alinhar: "direita", valor: (l) => fmtBRL(l.valor_plano) },
            ]}
            minLargura={900}
          />
          <p className="mt-2"><Fonte chave="transferegov_pix" /></p>
        </Bloco>
      )}

      {d.shows.length > 0 && (
        <Bloco eyebrow="Shows e festas" titulo="Metas que financiam eventos" descricao="Metas de planos Pix cuja descrição cita show, festa ou evento.">
          <Tabela
            legenda="Metas de shows e eventos"
            linhas={d.shows}
            colunas={[
              { id: "desc", rotulo: "Descrição da meta", principal: true, classe: "max-w-[480px]", valor: (l) => <TextoExpansivel texto={l.descricao} limite={200} className="text-[12.5px]" /> },
              { id: "mun", rotulo: "Município", valor: (l) => caixaTitulo(l.municipio) },
              { id: "ano", rotulo: "Ano", valor: (l) => <span className="numero">{l.ano}</span> },
              { id: "v", rotulo: "Valor", alinhar: "direita", valor: (l) => fmtBRL(l.valor) },
            ]}
            minLargura={680}
          />
          <p className="mt-2"><Fonte chave="transferegov_pix" /></p>
        </Bloco>
      )}

      <Bloco id="lista-emendas" eyebrow="Emenda a emenda" titulo="Todas as emendas" descricao="Uma linha por emenda e localidade/ação. O link abre a página da emenda no Portal da Transparência (execução, favorecidos, documentos).">
        <TabelaServidor
          api={`candidatos/${f.slug}/emendas/lista`}
          prefixo="e_"
          busca={{ placeholder: "Buscar localidade, ação, programa ou código" }}
          filtros={[
            { id: "ano", rotulo: "Ano", opcoes: [...d.por_ano].reverse().map((a) => ({ value: a.ano, label: String(a.ano), n: a.n_emendas })) },
            { id: "area", rotulo: "Área", opcoes: d.por_area.map((a) => ({ value: a.area, label: a.area, n: a.n_emendas })), todos: "Todas" },
          ]}
          ordens={[
            { value: "ano", label: "Mais recentes" },
            { value: "ano_asc", label: "Mais antigas" },
            { value: "empenhado", label: "Maior empenhado" },
            { value: "pago", label: "Maior pago" },
          ]}
          ordemPadrao="ano"
          resumo={(r) => r.soma?.empenhado != null && <span>empenhado <span className="numero text-foreground">{fmtBRL(r.soma.empenhado)}</span> · pago <span className="numero text-foreground">{fmtBRL(r.soma.pago_total)}</span></span>}
          legenda="Emendas parlamentares"
          documento={(l) => l.url}
          rotuloDocumento="Portal"
          colunas={[
            { id: "loc", rotulo: "Localidade / ação", principal: true, classe: "max-w-[380px]", valor: (l) => <span><span className="font-medium">{caixaTitulo(l.localidade)}</span><span className="block text-[12px] text-muted-foreground">{capitalizar((l.acao ?? "").toLowerCase())}</span></span> },
            { id: "cod", rotulo: "Emenda", valor: (l) => <span className="font-mono text-[11.5px]">{l.codigo_emenda}<span className="block text-[10.5px] text-muted-foreground">{l.ano} · {l.tipo_emenda?.replace("Emenda Individual - ", "")}</span></span> },
            { id: "area", rotulo: "Área", valor: (l) => <span className="text-[12px] text-muted-foreground">{l.funcao}</span> },
            { id: "e", rotulo: "Empenhado", alinhar: "direita", valor: (l) => fmtBRL(l.empenhado) },
            { id: "p", rotulo: "Pago total", alinhar: "direita", valor: (l) => fmtBRL(l.pago_total) },
          ]}
          minLargura={900}
        />
      </Bloco>
    </div>
  )
}

