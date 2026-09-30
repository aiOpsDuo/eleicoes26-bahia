// Sanções: registros do candidato nos cadastros CEIS e CNEP do Portal da Transparência (CGU),
// casados pelo registro da candidatura no TSE. Nenhuma outra fonte (processos, imprensa) entra nesta edição.
import { Fonte } from "../../components/Fonte.jsx"
import { Selo } from "../../components/ui/base.jsx"
import { Bloco, EstadoSecao, LinkDoc, TituloAba, useSecao } from "../../components/ficha/pecas.jsx"
import { fmtData, fmtInt } from "../../lib/format.js"

export function AbaAtencao({ dados }) {
  const f = dados.ficha
  const { dados: d, erro, recarregar } = useSecao(f.slug, "atencao")
  if (!d) return <EstadoSecao erro={erro} recarregar={recarregar} />

  return (
    <div className="flex flex-col gap-12">
      <TituloAba eyebrow="Sanções" titulo="Cadastros de sanções">
        Registros nos cadastros de empresas e pessoas sancionadas mantidos pela Controladoria-Geral da União (CEIS e CNEP).
        Um registro é um <strong className="text-foreground">fato administrativo publicado</strong>, não uma conclusão sobre o candidato.
      </TituloAba>

      <Bloco eyebrow="CEIS e CNEP" titulo={d.sancoes.length ? `Sanções registradas (${fmtInt(d.sancoes.length)})` : "Nenhuma sanção registrada"}>
        {d.sancoes.length ? (
          <ul className="flex flex-col gap-2">
            {d.sancoes.map((x) => (
              <li key={x.id} className="rounded-[var(--radius)] border border-grid bg-surface p-4 text-[13px]">
                <Selo tom="danger">{x.cadastro}</Selo> <span className="font-medium">{x.descricao}</span> · {x.orgao} · {fmtData(x.data_inicio)}–{fmtData(x.data_fim)} <LinkDoc href={x.fonte_url} rotulo="Registro" /> <Fonte id={x.fonte_id} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            Nenhuma sanção individual encontrada nos cadastros CEIS e CNEP do Portal da Transparência (cruzamento pelo registro
            da candidatura no TSE). <Fonte chave="portal_sancoes" />
          </p>
        )}
      </Bloco>
    </div>
  )
}
