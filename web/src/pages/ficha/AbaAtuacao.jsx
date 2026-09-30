// Atuação legislativa: votações-chave em cartões, alinhamento com o governo por ano, tabela de votos filtrável
// (ano, tema, voto, só chave, alinhamento, busca) e proposições de autoria (tipo, ano, tema, só projetos).
import { Fonte } from "../../components/Fonte.jsx"
import { Selo } from "../../components/ui/base.jsx"
import { DadoIndisponivel } from "../../components/ui/estados.jsx"
import { Aviso, Bloco, EstadoSecao, GradeNumeros, LinkDoc, Numero, Tabela, TabelaServidor, TextoExpansivel, TituloAba, useParamsUrl, useSecao, rolarPara } from "../../components/ficha/pecas.jsx"
import { BarrasH, Colunas } from "../../components/ficha/graficos.jsx"
import { fmtData, fmtInt, fmtPct } from "../../lib/format.js"
import { CorVoto, rotuloVoto } from "./AbaAtuacaoPecas.jsx"

const CASA = { camara: "Câmara dos Deputados", senado: "Senado Federal" }
const fonteVotos = (casa) => (casa === "senado" ? "senado_votacoes" : "camara_votacoes")

export function AbaAtuacao({ dados }) {
  const f = dados.ficha
  const { dados: d, erro, recarregar } = useSecao(f.slug, "atuacao")
  const [, definirVotos] = useParamsUrl("v_")
  const [pp, definirProp] = useParamsUrl("p_")
  if (!d) return <EstadoSecao erro={erro} recarregar={recarregar} />

  const v = d.votos
  const pr = d.proposicoes
  const semVotos = !v.por_ano.length
  const semProp = !pr.tipos.length
  if (semVotos && semProp) {
    return (
      <div>
        <TituloAba eyebrow="Atuação legislativa" titulo="Votações e proposições" />
        <DadoIndisponivel>
          {f.mandato_atual === "deputado_estadual" || f.cargo === "deputado_estadual" ? (
            <>A Assembleia Legislativa da Bahia (ALBA) não publica votações nominais nem proposições em dados abertos estruturados, por isso esta ficha
              não tem a atuação legislativa estadual. O que existe da ALBA é a verba indenizatória (aba Cota parlamentar).</>
          ) : (
            <>Não há votações nominais nem proposições registradas nas bases consultadas (Câmara 2019–2026 e Senado). Mandatos anteriores a 2019 não estão cobertos.</>
          )}
        </DadoIndisponivel>
      </div>
    )
  }
  const casaPrincipal = v.casas[0]?.casa ?? "camara"
  const totalVotos = v.por_ano.reduce((a, x) => a + x.n, 0)
  const comOri = v.por_ano.reduce((a, x) => a + x.com_orientacao, 0)
  const alin = v.por_ano.reduce((a, x) => a + x.alinhados, 0)
  const pct = comOri ? (alin / comOri) * 100 : null
  const chaveComVoto = v.chave.filter((k) => k.voto).length

  return (
    <div className="flex flex-col gap-12">
      <TituloAba eyebrow="Atuação legislativa" titulo="Votações e proposições">
        {semVotos
          ? "Não há votos nominais deste candidato nas bases consultadas (Câmara e Senado, 2019–2026). Abaixo, as proposições de autoria."
          : <>Votos nominais em plenário ({v.casas.map((c) => `${CASA[c.casa] ?? c.casa}, ${fmtData(c.de)} a ${fmtData(c.ate)}`).join("; ")}) e proposições de autoria. A casa publica só os votos registrados: ausência não aparece como voto.</>}
      </TituloAba>

      {!semVotos && (
        <>
          <GradeNumeros colunas="grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4">
            <Numero rotulo="Votos registrados" valor={fmtInt(totalVotos)} sub={v.por_voto.slice(0, 3).map((x) => `${rotuloVoto(x.valor)} ${fmtInt(x.n)}`).join(" · ")} fonte={<Fonte chave={fonteVotos(casaPrincipal)} />} />
            <Numero rotulo="Alinhamento com o governo" valor={pct != null ? fmtPct(pct) : "—"} sub={comOri ? `em ${fmtInt(comOri)} votos com orientação Sim/Não do governo` : "a casa não publica orientação do governo"} fonte={comOri ? <Fonte chave="camara_votacoes" /> : null} />
            <Numero rotulo="Votações-chave" valor={v.chave.length ? `${fmtInt(chaveComVoto)} / ${fmtInt(v.chave.length)}` : "—"} sub={v.chave.length ? "com voto registrado, no período em que votou" : "a seleção de votações-chave cobre a Câmara"} />
            <Numero rotulo="Proposições de autoria" valor={fmtInt(pr.tipos.reduce((a, t) => a + t.n, 0))} sub={`${fmtInt(pr.tipos.filter((t) => t.principal).reduce((a, t) => a + t.n, 0))} projetos (PL, PEC, PLP…)`} fonte={<Fonte chave={casaPrincipal === "senado" ? "senado_processos" : "camara_proposicoes"} />} />
          </GradeNumeros>

          {v.chave.length > 0 && (
            <Bloco eyebrow="Votações-chave" titulo="Como votou nos temas decisivos" descricao="Votações de maior impacto no período em que há votos deste parlamentar. “Sem voto” = ausência, licença ou fora do exercício naquele dia.">
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {v.chave.map((k) => (
                  <li key={k.id} className="flex min-w-0 flex-col gap-2 rounded-[var(--radius)] border border-grid bg-surface p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[14.5px] font-semibold leading-snug text-foreground">{k.rotulo_chave}</p>
                        <p className="mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.05em] text-muted-foreground">{fmtData(k.data)} · {k.proposicao}</p>
                      </div>
                      <span className="shrink-0"><CorVoto voto={k.voto} /></span>
                    </div>
                    {k.proposicao_ementa && <p className="line-clamp-3 text-[12.5px] leading-relaxed text-muted-foreground" title={k.proposicao_ementa}>{k.proposicao_ementa}</p>}
                    <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-dashed border-grid pt-2 text-[11.5px] text-muted-foreground">
                      {k.orientacao_governo && <span>Governo orientou <strong className="text-foreground">{k.orientacao_governo}</strong></span>}
                      {k.alinhado_governo === true && <Selo tom="accent">alinhado</Selo>}
                      {k.alinhado_governo === false && <Selo tom="neutral">contra o governo</Selo>}
                      {k.votos_sim != null && <span className="numero">placar {k.votos_sim}×{k.votos_nao}</span>}
                      {k.aprovada != null && <span>{k.aprovada ? "aprovada" : "rejeitada"}</span>}
                      <span className="ml-auto"><Fonte id={k.fonte_id} href={k.url} rotulo="Votação oficial" mostrarData={false} /></span>
                    </div>
                  </li>
                ))}
              </ul>
            </Bloco>
          )}

          {comOri > 0 && (
            <Bloco eyebrow="Alinhamento" titulo="Votou com o governo? (por ano)" descricao="Percentual de votos Sim/Não iguais à orientação da liderança do Governo na Câmara, entre as votações em que o governo orientou Sim ou Não.">
              <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <div className="rounded-[var(--radius)] border border-grid bg-surface p-4 pt-6">
                  <Colunas
                    dados={v.por_ano.filter((a) => a.com_orientacao > 0).map((a) => ({ rotulo: a.ano, valores: { p: a.pct_alinhamento } }))}
                    series={[{ id: "p", rotulo: "% alinhado ao governo" }]}
                    formatar={(x) => fmtPct(x)}
                    rotuloAcessivel="Alinhamento com o governo por ano"
                    onSelecionar={(a) => { definirVotos({ ano: a }); rolarPara("tabela-votos") }}
                  />
                </div>
                <Tabela
                  legenda="Votos por ano"
                  linhas={v.por_ano}
                  chave={(l) => l.ano}
                  colunas={[
                    { id: "ano", rotulo: "Ano", principal: true, valor: (l) => <button type="button" onClick={() => { definirVotos({ ano: l.ano }); rolarPara("tabela-votos") }} className="numero font-medium hover:text-accent-strong hover:underline">{l.ano}</button> },
                    { id: "n", rotulo: "Votos", alinhar: "direita", valor: (l) => fmtInt(l.n) },
                    { id: "sim", rotulo: "Sim", alinhar: "direita", valor: (l) => fmtInt(l.sim) },
                    { id: "nao", rotulo: "Não", alinhar: "direita", valor: (l) => fmtInt(l.nao) },
                    { id: "out", rotulo: "Outros", alinhar: "direita", valor: (l) => fmtInt(l.outros) },
                    { id: "pct", rotulo: "Alinhado", alinhar: "direita", valor: (l) => (l.com_orientacao ? fmtPct(l.pct_alinhamento) : "—") },
                  ]}
                  minLargura={480}
                />
              </div>
            </Bloco>
          )}

          <Bloco id="tabela-votos" eyebrow="Voto a voto" titulo="Todas as votações" descricao="Filtre por ano, tema da proposição, voto e alinhamento. O link abre a proposição/matéria na página oficial da casa.">
            <TabelaServidor
              api={`candidatos/${f.slug}/atuacao/votos`}
              prefixo="v_"
              busca={{ placeholder: "Buscar proposição ou descrição (ex.: PEC 45, anistia)" }}
              filtros={[
                { id: "chave", rotulo: "Recorte", opcoes: [{ value: "1", label: "Só votações-chave", n: v.chave.filter((k) => k.voto).length }], rotuloOpcao: () => "Só votações-chave", todos: "Todas" },
                { id: "ano", rotulo: "Ano", opcoes: [...v.por_ano].reverse().map((a) => ({ value: a.ano, label: String(a.ano), n: a.n })) },
                { id: "voto", rotulo: "Voto", opcoes: v.por_voto.map((x) => ({ value: x.valor, label: rotuloVoto(x.valor), n: x.n })), rotuloOpcao: rotuloVoto },
                { id: "tema", rotulo: "Tema", opcoes: v.temas.map((t) => ({ value: t.valor, label: t.valor, n: t.n })) },
                ...(comOri ? [{ id: "alinhamento", rotulo: "Governo", opcoes: [{ value: "sim", label: "Votou com o governo" }, { value: "nao", label: "Votou contra o governo" }], rotuloOpcao: (x) => (x === "sim" ? "com o governo" : "contra o governo") }] : []),
              ]}
              ordens={[{ value: "data", label: "Mais recentes" }, { value: "data_asc", label: "Mais antigas" }]}
              ordemPadrao="data"
              legenda="Votos nominais"
              documento={(l) => l.url}
              rotuloDocumento="Oficial"
              colunas={[
                { id: "desc", rotulo: "Votação", principal: true, classe: "max-w-[440px]", valor: (l) => (
                  <span className="block">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {l.proposicao && <span className="font-mono text-[11.5px] font-medium text-foreground">{l.proposicao}</span>}
                      {l.eh_chave && <Selo tom="accent">{l.rotulo_chave ?? "chave"}</Selo>}
                    </span>
                    <TextoExpansivel texto={l.proposicao_ementa || l.descricao} limite={160} className="mt-0.5 text-[12.5px] text-muted-foreground" />
                  </span>
                ) },
                { id: "data", rotulo: "Data", valor: (l) => <span className="numero whitespace-nowrap">{fmtData(l.data)}</span> },
                { id: "voto", rotulo: "Voto", valor: (l) => <CorVoto voto={l.voto} /> },
                { id: "gov", rotulo: "Governo", valor: (l) => (l.orientacao_governo ? <span className="text-[12px]">{l.orientacao_governo}{l.alinhado_governo === true ? " ✓" : l.alinhado_governo === false ? " ✗" : ""}</span> : <span className="text-subtle-foreground">—</span>) },
                { id: "tema", rotulo: "Tema", esconderCelular: true, valor: (l) => <span className="text-[12px] text-muted-foreground">{l.tema || "—"}</span> },
                { id: "res", rotulo: "Resultado", valor: (l) => <span className="text-[12px] text-muted-foreground">{l.aprovada == null ? "—" : l.aprovada ? "Aprovada" : "Rejeitada"}</span> },
              ]}
              minLargura={960}
            />
          </Bloco>
        </>
      )}

      {!semProp ? (
        <Bloco id="tabela-proposicoes" eyebrow="Proposições" titulo="Projetos e requerimentos de autoria" descricao={casaPrincipal === "senado" ? "Matérias do parlamentar no Senado." : "Câmara: só proposições em que é o primeiro signatário (autor principal), 2019–2026."}>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)]">
            <div className="min-w-0">
              <p className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">Por tipo (clique para filtrar)</p>
              <BarrasH itens={pr.tipos.slice(0, 12).map((t) => ({ id: t.valor, rotulo: t.valor, valor: t.n }))} formatar={fmtInt} onClick={(t) => definirProp({ tipo: pp.tipo === t.id ? null : t.id })} ativo={pp.tipo} />
            </div>
            <div className="min-w-0">
              <TabelaServidor
                api={`candidatos/${f.slug}/atuacao/proposicoes`}
                prefixo="p_"
                busca={{ placeholder: "Buscar na ementa ou número (ex.: PL 3470)" }}
                filtros={[
                  { id: "principais", rotulo: "Recorte", opcoes: [{ value: "1", label: "Só projetos (PL, PEC, PLP, PDL…)" }], rotuloOpcao: () => "só projetos", todos: "Todas" },
                  { id: "tipo", rotulo: "Tipo", opcoes: pr.tipos.map((t) => ({ value: t.valor, label: t.valor, n: t.n })) },
                  { id: "ano", rotulo: "Ano", opcoes: pr.anos.map((a) => ({ value: a.valor, label: String(a.valor), n: a.n })) },
                  { id: "tema", rotulo: "Tema", opcoes: pr.temas.map((t) => ({ value: t.valor, label: t.valor, n: t.n })) },
                ]}
                legenda="Proposições de autoria"
                documento={(l) => l.url}
                rotuloDocumento="Tramitação"
                colunas={[
                  { id: "id", rotulo: "Proposição", principal: true, valor: (l) => <span className="whitespace-nowrap font-mono text-[12px] font-medium">{l.sigla_tipo} {l.numero}/{l.ano}</span> },
                  { id: "ementa", rotulo: "Ementa", classe: "max-w-[420px]", valor: (l) => <TextoExpansivel texto={l.ementa} limite={180} className="text-[12.5px]" /> },
                  { id: "data", rotulo: "Apresentação", valor: (l) => <span className="numero whitespace-nowrap">{fmtData(l.data_apresentacao)}</span> },
                  { id: "sit", rotulo: "Situação", valor: (l) => <span className="text-[12px] text-muted-foreground">{l.situacao || "—"}</span> },
                  { id: "tema", rotulo: "Tema", esconderCelular: true, valor: (l) => <span className="text-[12px] text-muted-foreground">{l.tema || "—"}</span> },
                  { id: "teor", rotulo: "Texto", valor: (l) => <LinkDoc href={l.url_inteiro_teor} rotulo="Inteiro teor" descricao="texto da proposição" semLink="Sem inteiro teor publicado" /> },
                ]}
                minLargura={880}
              />
            </div>
          </div>
        </Bloco>
      ) : (
        !semVotos && <Aviso titulo="Sem proposições de autoria principal">Nenhuma proposição em que este parlamentar seja o primeiro signatário foi encontrada nas bases consultadas.</Aviso>
      )}
    </div>
  )
}
