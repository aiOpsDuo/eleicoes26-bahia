// Aba Fontes: todas as fontes usadas nesta ficha (tabela por tabela do banco), com data de coleta, licença,
// onde cada uma aparece e quantos registros vêm dela.
import { Link } from "../../lib/nav.jsx"
import { Eyebrow, TituloSecao } from "../../components/ui/base.jsx"
import { EstadoSecao, Tabela, useSecao } from "../../components/ficha/pecas.jsx"
import { fmtData, fmtInt } from "../../lib/format.js"

export function AbaFontes({ dados }) {
  const { ficha } = dados
  const { dados: d, erro, recarregar } = useSecao(ficha.slug, "fontes")
  const linhas = [...(d?.fontes ?? [])]
  // foto que não é do TSE: crédito/URL da própria imagem
  if (ficha.foto_url && !ficha.foto_url.startsWith("/fotos/tse/") && ficha.foto_fonte_url) {
    linhas.push({ id: "foto", nome: ficha.foto_credito || "Crédito da foto", url: ficha.foto_fonte_url, coletado_em: null, licenca: null, usos: [{ uso: "Foto", n: 1 }] })
  } else if (ficha.foto_url?.startsWith("/fotos/tse/") && dados.fontes.foto) {
    linhas.push({ ...dados.fontes.foto, usos: [{ uso: "Foto", n: 1 }] })
  }
  return (
    <div>
      <Eyebrow>Fontes desta ficha</Eyebrow>
      <TituloSecao className="mt-3">De onde vêm os dados</TituloSecao>
      <p className="mt-3 max-w-2xl text-[14px] text-muted-foreground">
        Todas as bases oficiais usadas nas seções desta ficha, com a data em que foram coletadas. Nas seções, cada linha
        tem o link do documento específico (nota fiscal, emenda, votação, proposição, ato) quando a fonte publica. Lista completa em{" "}
        <Link to="/fontes" className="text-accent-strong underline underline-offset-2">Fontes</Link>.
      </p>
      <div className="mt-6">
        {!d ? (
          <EstadoSecao erro={erro} recarregar={recarregar} />
        ) : (
          <Tabela
            legenda="Fontes usadas nesta ficha"
            linhas={linhas}
            chave={(l) => l.id}
            colunas={[
              { id: "nome", rotulo: "Fonte", principal: true, classe: "max-w-[320px]", valor: (l) => <span className="font-medium">{l.nome}{l.descricao && <span className="mt-0.5 block text-[11.5px] font-normal text-muted-foreground">{l.descricao.length > 160 ? `${l.descricao.slice(0, 160)}…` : l.descricao}</span>}</span> },
              { id: "uso", rotulo: "Usada em", classe: "max-w-[260px]", valor: (l) => <span className="text-[12.5px]">{l.usos.map((u) => `${u.uso}${u.n > 1 ? ` (${fmtInt(u.n)})` : ""}`).join(" · ")}</span> },
              { id: "data", rotulo: "Coleta", valor: (l) => <span className="numero whitespace-nowrap">{fmtData(l.coletado_em)}</span> },
              { id: "lic", rotulo: "Licença", valor: (l) => <span className="text-[12px] text-muted-foreground">{l.licenca ?? "—"}</span> },
            ]}
            documento={(l) => l.url?.replace("{ano}", "2026")}
            rotuloDocumento="Link"
            minLargura={820}
          />
        )}
      </div>
    </div>
  )
}
