// Visão geral: cartões-resumo clicáveis de cada seção, votações-chave recentes, dados do registro e situação.
import { Landmark, Wallet, HandCoins, Receipt, Vote, FileText, TriangleAlert, History } from "lucide-react"
import { Eyebrow, TituloSecao } from "../../components/ui/base.jsx"
import { CampoComFonte, Fonte } from "../../components/Fonte.jsx"
import { Aviso, Bloco, GradeNumeros, Numero, useSecao } from "../../components/ficha/pecas.jsx"
import { capitalizar, fmtBRLCompacto, fmtData, fmtInt, fmtPct, plural, vazio, TRACO, urlDivulgaCand } from "../../lib/format.js"
import { CorVoto } from "./AbaAtuacaoPecas.jsx"

const CASA = { camara: "Câmara", senado: "Senado", alba: "ALBA" }

export function AbaVisaoGeral({ dados, irAba, abas: listaAbas = [] }) {
  const { ficha: f, fontes } = dados
  const { dados: v } = useSecao(f.slug, "visao")
  const abas = new Set(listaAbas.map((a) => a.id))
  const idf = fontes.identificacao
  const casa = CASA[f.cota_casas?.split(",")[0]]
  const camp = v?.ultima_campanha
  const casaVotos = v?.casas_votos?.includes("senado") ? "senado" : "camara"

  const cartoes = [
    abas.has("patrimonio") && {
      aba: "patrimonio", icone: Landmark, rotulo: "Patrimônio 2026",
      valor: f.declarou_sem_bens_2026 ? "R$ 0" : fmtBRLCompacto(f.patrimonio_2026),
      sub: f.declarou_sem_bens_2026 ? "declarou não ter bens" : !vazio(f.variacao_patrimonio_pct) ? `${fmtPct(f.variacao_patrimonio_pct, { sinal: true })} desde ${f.patrimonio_ano_anterior}` : "sem declaração anterior comparável",
      fonte: <Fonte fonte={fontes.patrimonio} />,
    },
    abas.has("campanha") && {
      aba: "campanha", icone: Wallet, rotulo: camp ? `Arrecadado ${camp.ano_eleicao}` : "Campanha",
      valor: camp ? fmtBRLCompacto(camp.total_receitas) : TRACO,
      sub: camp ? `gasto contratado ${fmtBRLCompacto(camp.despesas_contratadas)}${camp.ano_eleicao === 2026 ? " · 2026 parcial" : ""}` : "campanha é a do titular da chapa",
      fonte: camp && <Fonte id={camp.fonte_id} />,
    },
    abas.has("emendas") && {
      aba: "emendas", icone: HandCoins, rotulo: "Emendas empenhadas",
      valor: fmtBRLCompacto(f.emendas_empenhado),
      sub: f.emendas_ano_min ? `pago ${fmtBRLCompacto(f.emendas_pago_total)} · ${f.emendas_ano_min}–${f.emendas_ano_max}` : "sem emendas atribuídas",
      fonte: f.emendas_empenhado != null && <Fonte chave="portal_emendas" />,
    },
    abas.has("cota") && {
      aba: "cota", icone: Receipt, rotulo: casa === "ALBA" ? "Verba indenizatória" : "Cota parlamentar",
      valor: fmtBRLCompacto(f.cota_total),
      sub: casa ? `${casa} · ${f.cota_ano_min}–${f.cota_ano_max} · ${fmtInt(f.n_notas_cota)} notas` : "sem despesas publicadas",
      fonte: fontes.cota && <Fonte fonte={fontes.cota} />,
    },
    abas.has("atuacao") && {
      aba: "atuacao", icone: Vote, rotulo: "Votações nominais",
      valor: fmtInt(f.n_votos),
      sub: f.n_votos ? (f.pct_alinhamento_governo != null ? `${fmtPct(f.pct_alinhamento_governo)} alinhado ao governo · ${fmtInt(f.n_votacoes_chave)} votações-chave` : `${fmtInt(f.n_votacoes_chave)} votações-chave`) : "sem votações abertas",
      fonte: f.n_votos > 0 && <Fonte chave={casaVotos === "senado" ? "senado_votacoes" : "camara_votacoes"} />,
    },
    abas.has("atuacao") && f.n_proposicoes > 0 && {
      aba: "atuacao", icone: FileText, rotulo: "Proposições",
      valor: fmtInt(f.n_proposicoes),
      sub: `${fmtInt(f.n_proposicoes_principais)} projetos (PL, PEC, PLP…)`,
      fonte: <Fonte chave={casaVotos === "senado" ? "senado_processos" : "camara_proposicoes"} />,
    },
    {
      aba: "atencao", icone: TriangleAlert, rotulo: "Sanções",
      valor: fmtInt(f.n_sancoes ?? 0),
      sub: f.n_sancoes ? "registros no CEIS/CNEP" : "nenhuma no CEIS/CNEP",
      fonte: <Fonte chave="portal_sancoes" />,
      tom: f.n_sancoes > 0 ? "danger" : undefined,
    },
    abas.has("trajetoria") && {
      aba: "trajetoria", icone: History, rotulo: "Trajetória",
      valor: fmtInt(f.n_trajetoria),
      sub: f.n_mudancas_partido ? `${plural(f.n_mudancas_partido, "troca", "trocas")} de partido` : "candidaturas e mandatos",
    },
  ].filter(Boolean)

  const semMandatoParlamentar = !abas.has("atuacao") && !abas.has("emendas") && !abas.has("cota") && ["deputado_federal", "deputado_estadual", "senador", "suplente"].includes(f.cargo)

  return (
    <div className="flex flex-col gap-12">
      <Bloco eyebrow="Resumo por seção" titulo="O que há nesta ficha" descricao="Cada número leva à seção com o detalhamento linha a linha e o link de cada documento.">
        <GradeNumeros colunas="grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4">
          {cartoes.map((c) => (
            <Numero key={c.rotulo} icone={c.icone} rotulo={c.rotulo} valor={c.valor} sub={c.sub} fonte={c.fonte} tom={c.tom} onClick={() => irAba(c.aba)} />
          ))}
        </GradeNumeros>
        {semMandatoParlamentar && (
          <Aviso className="mt-4" titulo="Sem mandato parlamentar nas bases consultadas">
            Não há votações, emendas nem cota parlamentar para este candidato: esses dados só existem para quem exerce ou exerceu mandato
            na Câmara (2019–2026), no Senado ou na ALBA (verba 2023–2026).
          </Aviso>
        )}
      </Bloco>

      {v?.votos_chave?.length > 0 && (
        <Bloco eyebrow="Votações-chave" titulo="Como votou nos temas decisivos" acao={<button type="button" onClick={() => irAba("atuacao")} className="font-mono text-[11px] uppercase tracking-[0.06em] text-accent-strong hover:underline">Todas as votações →</button>}>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {v.votos_chave.map((k) => (
              <li key={k.rotulo_chave + k.data} className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-grid bg-surface px-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-foreground" title={k.rotulo_chave}>{k.rotulo_chave}</span>
                  <span className="font-mono text-[10.5px] text-muted-foreground">{fmtData(k.data)}{k.orientacao_governo ? ` · governo: ${k.orientacao_governo}` : ""}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <CorVoto voto={k.voto} />
                  <Fonte id={k.fonte_id} href={k.url} rotulo="Votação" mostrarData={false} />
                </span>
              </li>
            ))}
          </ul>
        </Bloco>
      )}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <DadosRegistro f={f} idf={idf} />
        <aside className="flex flex-col gap-8">
          {f.bio && (
            <section aria-labelledby="bio">
              <Eyebrow id="bio" as="h3">Biografia</Eyebrow>
              <p className="mt-3 text-[14px] leading-relaxed text-foreground">{f.bio}</p>
              <p className="mt-2"><Fonte fonte={fontes.bio} /></p>
            </section>
          )}
          <section aria-labelledby="situacao-reg">
            <Eyebrow id="situacao-reg" as="h3">Situação do registro</Eyebrow>
            <dl className="mt-3 grid gap-4">
              <CampoComFonte rotulo="Situação" valor={capitalizar(f.situacao)} detalhe={f.situacao_data ? `Dado de ${fmtData(f.situacao_data)}` : null} fonte={fontes.situacao} />
              {f.mandato_atual_descricao && <CampoComFonte rotulo="Mandato atual" valor={f.mandato_atual_descricao} fonte={idf} />}
              {f.municipio_base && <CampoComFonte rotulo="Município-base" valor={f.municipio_base} detalhe="Onde teve mais votos em 2022" fonte={fontes.municipio_base} />}
              {f.site_campanha && <CampoComFonte rotulo="Site de campanha" valor={<a href={f.site_campanha} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-accent-strong underline underline-offset-2">{f.site_campanha.replace(/^https?:\/\/(www\.)?/, "")}</a>} chave="tse_rede_social_2026" />}
            </dl>
          </section>
        </aside>
      </div>
    </div>
  )
}

function DadosRegistro({ f, idf }) {
  const campos = [
    ["Nome completo", f.nome_completo],
    f.nome_social && ["Nome social", f.nome_social],
    ["Nascimento", f.data_nascimento ? `${fmtData(f.data_nascimento)} (${f.idade} anos)` : f.idade ? `${f.idade} anos` : null],
    ["Naturalidade", f.naturalidade ?? (f.municipio_nascimento ? `${f.municipio_nascimento}/${f.uf_nascimento}` : null)],
    ["Gênero", capitalizar(f.genero)],
    ["Cor/raça", capitalizar(f.cor_raca)],
    ["Estado civil", capitalizar(f.estado_civil)],
    ["Grau de instrução", capitalizar(f.grau_instrucao)],
    ["Ocupação declarada", capitalizar(f.ocupacao)],
    ["Partido", f.partido_nome ? `${f.partido} — ${capitalizar(f.partido_nome.toLowerCase())}` : f.partido],
    f.numero && ["Número na urna", f.numero],
    f.federacao && ["Federação", f.federacao],
    f.coligacao && ["Coligação", f.coligacao === "PARTIDO ISOLADO" ? "Sem coligação (partido isolado)" : f.coligacao],
    f.composicao_coligacao && ["Composição da coligação", f.composicao_coligacao],
  ].filter(Boolean)
  return (
    <section aria-labelledby="dados-registro">
      <Eyebrow>Registro de candidatura</Eyebrow>
      <TituloSecao id="dados-registro" className="mt-3">Dados do registro</TituloSecao>
      <dl className="mt-6 grid gap-px overflow-hidden rounded-[var(--radius)] border border-grid bg-grid sm:grid-cols-2">
        {campos.map(([rotulo, valor]) => (
          <div key={rotulo} className="bg-surface px-4 py-3">
            <dt className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">{rotulo}</dt>
            <dd className="mt-1 text-[14px] text-foreground">{valor || TRACO}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        <Fonte fonte={idf} />
        {f.sq_candidato_2026 && <span className="font-mono text-[10.5px] text-muted-foreground">nº de registro no TSE (SQ): {f.sq_candidato_2026}</span>}
        {urlDivulgaCand(f) && <Fonte href={urlDivulgaCand(f)} rotulo="Ficha no DivulgaCandContas (TSE)" mostrarData={false} />}
      </p>
    </section>
  )
}
