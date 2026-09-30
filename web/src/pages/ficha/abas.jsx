// Registro das abas da ficha. Cada aba recebe { dados, irAba } — dados = GET /api/candidatos/:slug
// ({ ficha, chapa, titular, redes, fontes }) — e busca a própria seção em /api/candidatos/:slug/<secao>.
// Abas sem dado ficam ocultas; quando a ausência informa algo (mandato sem cota, suplente sem prestação própria,
// deputado estadual sem votações abertas da ALBA), a aba aparece com um estado vazio explicativo.
import { lazy } from "react"
import { AbaVisaoGeral } from "./AbaVisaoGeral.jsx"
import { AbaFontes } from "./AbaFontes.jsx"

const AbaPatrimonio = lazy(() => import("./AbaPatrimonio.jsx").then((m) => ({ default: m.AbaPatrimonio })))
const AbaCampanha = lazy(() => import("./AbaCampanha.jsx").then((m) => ({ default: m.AbaCampanha })))
const AbaAtuacao = lazy(() => import("./AbaAtuacao.jsx").then((m) => ({ default: m.AbaAtuacao })))
const AbaEmendas = lazy(() => import("./AbaEmendas.jsx").then((m) => ({ default: m.AbaEmendas })))
const AbaCota = lazy(() => import("./AbaCota.jsx").then((m) => ({ default: m.AbaCota })))
const AbaAtencao = lazy(() => import("./AbaAtencao.jsx").then((m) => ({ default: m.AbaAtencao })))
const AbaTrajetoria = lazy(() => import("./AbaTrajetoria.jsx").then((m) => ({ default: m.AbaTrajetoria })))

const PARLAMENTAR = ["senador", "deputado_federal", "deputado_estadual"]
const MANDATO_PARLAMENTAR = ["senador", "deputado_federal", "deputado_estadual"]
const temMandatoParlamentar = (f) => MANDATO_PARLAMENTAR.includes(f.mandato_atual)

export const ABAS = [
  { id: "geral", rotulo: "Visão geral", componente: AbaVisaoGeral },
  {
    id: "patrimonio",
    rotulo: "Patrimônio",
    n: (f) => f.n_bens_2026,
    visivel: (f) => f.n_declaracoes_patrimonio > 0 || f.n_bens_2026 > 0,
    componente: AbaPatrimonio,
  },
  {
    id: "campanha",
    rotulo: "Campanha",
    n: (f) => f.n_prestacoes,
    visivel: (f) => f.n_prestacoes > 0 || f.cargo === "suplente",
    componente: AbaCampanha,
  },
  {
    id: "atuacao",
    rotulo: "Atuação",
    n: (f) => (f.n_votos ?? 0) + (f.n_proposicoes ?? 0),
    visivel: (f) => f.tem_votos || f.tem_proposicoes || temMandatoParlamentar(f),
    componente: AbaAtuacao,
  },
  {
    id: "emendas",
    rotulo: "Emendas",
    n: (f) => f.n_emendas,
    visivel: (f) => f.tem_emendas || temMandatoParlamentar(f),
    componente: AbaEmendas,
  },
  {
    id: "cota",
    rotulo: "Cota parlamentar",
    n: (f) => f.n_notas_cota,
    visivel: (f) => f.tem_cota || temMandatoParlamentar(f),
    componente: AbaCota,
  },
  {
    id: "atencao",
    rotulo: "Sanções",
    n: (f) => f.n_sancoes ?? 0,
    componente: AbaAtencao,
  },
  {
    id: "trajetoria",
    rotulo: "Trajetória",
    n: (f) => f.n_trajetoria,
    visivel: (f) => f.n_trajetoria > 0 || f.n_mudancas_partido > 0 || f.n_votos_municipio > 0,
    componente: AbaTrajetoria,
  },
  { id: "fontes", rotulo: "Fontes", componente: AbaFontes },
]

export function abasDaFicha(ficha) {
  return ABAS.filter((a) => !a.visivel || a.visivel(ficha)).map((a) => ({ ...a, n: a.n ? a.n(ficha) : undefined }))
}

export { PARLAMENTAR }
