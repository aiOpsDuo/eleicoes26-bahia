// Rótulos exibíveis e configuração das telas por grupo.

export const CARGO_ROTULO = {
  senador: "Senador",
  suplente: "Suplente de senador",
  deputado_federal: "Deputado federal",
  deputado_estadual: "Deputado estadual",
}

// flexão por gênero quando o banco informa (genero = 'feminino')
const FEMININO = {
  senador: "Senadora",
  suplente: "Suplente de senadora",
  deputado_federal: "Deputada federal",
  deputado_estadual: "Deputada estadual",
}
export function cargoRotulo(cargo, genero) {
  if (genero === "feminino" && FEMININO[cargo]) return FEMININO[cargo]
  return CARGO_ROTULO[cargo] ?? cargo
}

export const MANDATO_ROTULO = {
  senador: "Senador",
  deputado_federal: "Deputado federal",
  deputado_estadual: "Deputado estadual",
}

export const PAPEL_ROTULO = { suplente_1: "1º suplente", suplente_2: "2º suplente" }

/** Telas de lista. `layout`: grade de cards (poucos) ou lista densa paginada (centenas). */
export const GRUPOS = [
  { slug: "senado", rotulo: "Senado", plural: "Senado", titulo: "Senado", cargo: "senador", layout: "grade", eyebrow: "Candidatos ao Senado pela Bahia", ambito: "Bahia", parlamentar: true },
  { slug: "deputado-federal", rotulo: "Deputado federal", curto: "Dep. federal", plural: "Câmara dos Deputados", titulo: "Deputado federal", cargo: "deputado_federal", layout: "lista", eyebrow: "Candidatos a deputado federal pela Bahia", ambito: "Bahia", parlamentar: true },
  { slug: "deputado-estadual", rotulo: "Deputado estadual", curto: "Dep. estadual", plural: "Assembleia Legislativa", titulo: "Deputado estadual", cargo: "deputado_estadual", layout: "lista", eyebrow: "Candidatos a deputado estadual na Bahia", ambito: "Bahia", parlamentar: true },
]
export const GRUPO_POR_SLUG = Object.fromEntries(GRUPOS.map((g) => [g.slug, g]))
export const GRUPO_POR_CARGO = {
  ...Object.fromEntries(GRUPOS.map((g) => [g.cargo, g])),
  suplente: GRUPOS[0],
}

export const SITUACAO_TOM = {
  deferida: "ok",
  em_julgamento: "warn",
  indeferida: "danger",
  renuncia: "neutral",
}

export const ORDENS = [
  { valor: "nome", rotulo: "Nome: A a Z", curto: "Nome A–Z", descricao: "Ordem alfabética. A posição não representa avaliação dos candidatos." },
  { valor: "patrimonio", rotulo: "Patrimônio: maior para menor", curto: "Patrimônio ↓", descricao: "Patrimônio declarado ao TSE em 2026, do maior para o menor. Sem declaração fica no fim." },
  { valor: "arrecadacao", rotulo: "Arrecadação 2026: maior para menor", curto: "Arrecadação ↓", descricao: "Receitas de campanha declaradas até 29/09/2026 (prestação parcial)." },
  { valor: "emendas", rotulo: "Emendas: maior para menor", curto: "Emendas ↓", descricao: "Emendas individuais empenhadas no Orçamento federal (2015–2026). Só quem foi parlamentar tem valor." },
  { valor: "cota", rotulo: "Cota parlamentar: maior para menor", curto: "Cota ↓", descricao: "Cota/verba parlamentar 2023–2026 (Câmara, Senado ou ALBA). Só quem tem mandato tem valor." },
  { valor: "numero", rotulo: "Número na urna", curto: "Número", descricao: "Número de urna, em ordem crescente." },
]

export const GENERO_ROTULO = { feminino: "Mulheres", masculino: "Homens" }
export const COR_ROTULO = { branca: "Branca", preta: "Preta", parda: "Parda", amarela: "Amarela", "indígena": "Indígena" }

export const REDE_ROTULO = {
  instagram: "Instagram", facebook: "Facebook", x: "X", youtube: "YouTube", tiktok: "TikTok", kwai: "Kwai",
  threads: "Threads", linkedin: "LinkedIn", telegram: "Telegram", whatsapp: "WhatsApp", flickr: "Flickr",
  wikipedia: "Wikipédia", site: "Site",
}
