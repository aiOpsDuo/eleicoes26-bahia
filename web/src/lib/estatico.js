// Modo estático (VITE_MODO=estatico): responde às mesmas URLs /api/... que a API, mas a partir dos JSON
// gerados por estatico/exportar.mjs e servidos em /dados. Filtros, busca, ordenação e paginação são feitos aqui,
// reproduzindo as regras de api/rotas/*.js (mesmos parâmetros, mesmos limites, mesmo formato de resposta).
// As telas não sabem em que modo estão: tudo passa por buscarJSON() em lib/api.js.
import { ErroApi } from "./erro.js"

const BASE = "/dados"

// ---------------------------------------------------------------- carga dos arquivos (com cache)

const arquivos = new Map() // caminho -> Promise<json>

function carregar(caminho) {
  if (!arquivos.has(caminho)) {
    const p = fetch(`${BASE}/${caminho}`, { headers: { Accept: "application/json" } }).then(async (r) => {
      // o fallback do SPA devolve index.html (200) para arquivo inexistente: só aceita JSON
      const tipo = r.headers.get("content-type") ?? ""
      if (r.status === 404 || (r.ok && !tipo.includes("json"))) throw new ErroApi(404, "não encontrado")
      if (!r.ok) throw new ErroApi(r.status, `Erro ${r.status}`)
      return r.json()
    })
    p.catch(() => arquivos.delete(caminho)) // erro de rede: permite tentar de novo
    arquivos.set(caminho, p)
  }
  return arquivos.get(caminho)
}

/** Arquivo colunar { colunas, linhas: [[...]] } -> array de objetos (convertido uma vez só). */
const objetos = new WeakMap()
function paraObjetos(dados) {
  if (!objetos.has(dados)) {
    const { colunas, linhas } = dados
    objetos.set(dados, linhas.map((l) => Object.fromEntries(colunas.map((c, i) => [c, l[i]]))))
  }
  return objetos.get(dados)
}

/** Tira os campos auxiliares (_i, _b, _f, _n) antes de devolver à tela. */
function publico(item) {
  const out = {}
  for (const k in item) if (k[0] !== "_") out[k] = item[k]
  return out
}

// ---------------------------------------------------------------- utilitários (mesmas regras da API)

/** f_normaliza do banco: sem acento e em minúsculas. */
export function normalizar(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}
function str(v, max = 120) {
  if (v == null) return null
  const s = String(v).trim()
  return s ? s.slice(0, max) : null
}
function int(v, { min = -Infinity, max = Infinity } = {}) {
  const s = str(v, 12)
  if (!s || !/^-?\d+$/.test(s)) return null
  const n = Number(s)
  return n < min || n > max ? null : n
}
function paginacao(p, padrao = 25) {
  const por = int(p.por_pagina, { min: 1, max: 100 }) ?? padrao
  const pagina = int(p.pagina, { min: 1, max: 100000 }) ?? 1
  return { por, pagina, offset: (pagina - 1) * por }
}
/** parseInt da lista de candidatos (listar/busca usam parseInt, não int()). */
function parse(v) {
  const n = parseInt(v, 10)
  return Number.isNaN(n) ? 0 : n
}
const colacao = new Intl.Collator("en-US") // o banco usa a colação ICU en-US
const contem = (valor, termoNorm) => normalizar(valor).includes(termoNorm)
const soma = (linhas, campo) => {
  let s = null
  for (const l of linhas) if (l[campo] != null) s = (s ?? 0) + Number(l[campo])
  return s == null ? null : Math.round(s * 100) / 100
}
/** ORDER BY: lista de critérios [(a, b) => número]. */
const ordenar = (linhas, criterios) => [...linhas].sort((a, b) => {
  for (const c of criterios) {
    const r = c(a, b)
    if (r) return r
  }
  return 0
})
const desc = (campo) => (a, b) => nulosNoFim(a[campo], b[campo], (x, y) => (y > x ? 1 : y < x ? -1 : 0))
const asc = (campo) => (a, b) => nulosNoFim(a[campo], b[campo], (x, y) => (x > y ? 1 : x < y ? -1 : 0))
const ascTexto = (campo) => (a, b) => nulosNoFim(a[campo], b[campo], (x, y) => colacao.compare(x, y))
const idAsc = (a, b) => (a.id > b.id ? 1 : a.id < b.id ? -1 : 0)
function nulosNoFim(x, y, cmp) {
  if (x == null && y == null) return 0
  if (x == null) return 1
  if (y == null) return -1
  return cmp(x, y)
}
/** facetas: GROUP BY campo, com n e soma, ordenadas por soma DESC NULLS LAST. */
function facetas(linhas, campo, campoSoma) {
  const m = new Map()
  for (const l of linhas) {
    const k = l[campo] ?? null
    const e = m.get(k) ?? { valor: k, n: 0, linhas: [] }
    e.n++
    e.linhas.push(l)
    m.set(k, e)
  }
  return ordenar([...m.values()].map((e) => ({ valor: e.valor, n: e.n, soma: soma(e.linhas, campoSoma) })), [desc("soma")])
}

// ---------------------------------------------------------------- pg_trgm (busca aproximada)

function trigramas(s) {
  const out = []
  for (const palavra of normalizar(s).split(/[^\p{L}\p{N}]+/u)) {
    if (!palavra) continue
    const t = `  ${palavra} `
    for (let i = 0; i < t.length - 2; i++) out.push(t.slice(i, i + 3))
  }
  return out
}
/** word_similarity(a, b) do pg_trgm: maior semelhança entre os trigramas de `a` e um trecho contínuo de `b`. */
export function semelhancaPalavra(a, b) {
  const ta = new Set(trigramas(a))
  if (!ta.size) return 0
  const tb = trigramas(b)
  let melhor = 0
  for (let i = 0; i < tb.length; i++) {
    if (!ta.has(tb[i])) continue
    const vistos = new Set()
    let comuns = 0
    for (let j = i; j < tb.length; j++) {
      if (!vistos.has(tb[j])) {
        vistos.add(tb[j])
        if (ta.has(tb[j])) comuns++
      }
      const s = comuns / (ta.size + vistos.size - comuns)
      if (s > melhor) melhor = s
    }
  }
  return melhor
}
const LIMIAR_PALAVRA = 0.6 // pg_trgm.word_similarity_threshold (padrão)

// ---------------------------------------------------------------- candidatos: lista, filtros, busca

const ORDENS_LISTA = {
  nome: [],
  patrimonio: [desc("patrimonio_2026")],
  emendas: [desc("emendas_empenhado")],
  cota: [desc("cota_total_2023_2026")],
  arrecadacao: [desc("arrecadado_2026")],
  idade: [desc("idade")],
  numero: [asc("numero")],
}

async function lista(grupo) {
  if (!grupo) return null
  try {
    return await carregar(`listas/${encodeURIComponent(grupo)}.json`)
  } catch (e) {
    if (e.status === 404) return null
    throw e
  }
}

/** montarFiltro() de api/rotas/candidatos.js; `ignorar` = filtro deixado de fora (facetas). */
function filtroLista(L, p, ignorar = null) {
  const conds = []
  const qtxt = str(p.q, 80)
  if (qtxt && ignorar !== "q") {
    const t = normalizar(qtxt)
    if (/^\d{2,6}$/.test(qtxt)) conds.push((c) => c.numero === qtxt || c._b.includes(t))
    else conds.push((c) => c._b.includes(t) || semelhancaPalavra(t, c._b) >= LIMIAR_PALAVRA)
  }
  const partido = str(p.partido, 20)
  if (partido && ignorar !== "partido") conds.push((c) => c.partido === partido)
  const situacao = str(p.situacao, 60) || "na_disputa"
  if (situacao !== "todas" && ignorar !== "situacao") {
    const vals = L.situacoes[situacao] ?? [situacao]
    conds.push((c) => vals.includes(c.situacao))
  }
  const mandato = str(p.mandato, 5)
  if ((mandato === "sim" || mandato === "nao") && ignorar !== "mandato") conds.push((c) => c.tem_mandato_atual === (mandato === "sim"))
  const genero = str(p.genero, 20)
  if (genero && ignorar !== "genero") conds.push((c) => c.genero === genero)
  const cor = str(p.cor_raca, 20)
  if (cor && ignorar !== "cor_raca") conds.push((c) => c.cor_raca === cor)
  const faixa = str(p.faixa_patrimonio, 20)
  if (faixa && L.faixas.includes(faixa) && ignorar !== "faixa_patrimonio") conds.push((c) => c._f === faixa)
  const mun = str(p.municipio, 10)
  if (mun && /^\d+$/.test(mun) && ignorar !== "municipio") conds.push((c) => c.cd_municipio_base === Number(mun))
  return L.itens.filter((c) => conds.every((f) => f(c)))
}

async function rotaCandidatos(p) {
  const L = await lista(p.grupo)
  if (!L) throw new ErroApi(400, "informe ?grupo= (senado, deputado-federal, deputado-estadual, parlamentar) ou ?cargo=")
  const porPagina = Math.min(100, Math.max(1, parse(p.por_pagina) || 24))
  const pagina = Math.max(1, parse(p.pagina) || 1)
  const ordem = L.ordens.includes(p.ordem) ? p.ordem : "nome"
  const filtrados = ordenar(filtroLista(L, p), [...ORDENS_LISTA[ordem], asc("_i")])
  const pag = filtrados.slice((pagina - 1) * porPagina, pagina * porPagina)
  const total = pag.length ? filtrados.length : 0 // como a API (count(*) OVER () numa página vazia dá 0)
  return {
    cargos: L.cargos,
    total,
    pagina,
    por_pagina: porPagina,
    paginas: Math.max(1, Math.ceil(total / porPagina)),
    ordem,
    itens: pag.map(publico),
    fontes: L.fontes,
  }
}

function contar(itens, chave) {
  const m = new Map()
  for (const c of itens) {
    const k = chave(c)
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m].map(([valor, n]) => ({ valor, n }))
}
const porNDesc = (a, b) => b.n - a.n || nulosNoFim(a.valor, b.valor, (x, y) => colacao.compare(String(x), String(y)))

async function rotaFiltros(p) {
  const L = await lista(p.grupo)
  if (!L) throw new ErroApi(400, "informe ?grupo= ou ?cargo=")
  const faceta = (campo, ignorar) => contar(filtroLista(L, p, ignorar), (c) => c[campo] ?? null).sort(porNDesc)
  const situacoesBrutas = faceta("situacao", "situacao")
  const porSituacao = Object.fromEntries(situacoesBrutas.map((r) => [r.valor, r.n]))
  const somaSit = (vals) => vals.reduce((s, v) => s + (porSituacao[v] ?? 0), 0)
  const situacoes = ["na_disputa", "deferida", "em_julgamento", "indeferida", "renuncia"].map((valor) => ({
    valor, rotulo: L.situacao_rotulos[valor], n: somaSit(L.situacoes[valor]),
  }))
  situacoes.push({ valor: "todas", rotulo: "Todas", n: situacoesBrutas.reduce((s, r) => s + r.n, 0) })
  const mandato = contar(filtroLista(L, p, "mandato"), (c) => c.tem_mandato_atual)
  const municipios = new Map()
  for (const c of filtroLista(L, p, "municipio")) {
    if (c.cd_municipio_base == null) continue
    const k = `${c.cd_municipio_base}|${c.municipio_base}`
    const e = municipios.get(k) ?? { valor: String(c.cd_municipio_base), rotulo: c.municipio_base, n: 0 }
    e.n++
    municipios.set(k, e)
  }
  return {
    cargos: L.cargos,
    partidos: faceta("partido", "partido").filter((x) => x.valor),
    situacoes,
    generos: faceta("genero", "genero").filter((x) => x.valor),
    cores_raca: faceta("cor_raca", "cor_raca").filter((x) => x.valor),
    faixas_patrimonio: contar(filtroLista(L, p, "faixa_patrimonio"), (c) => c._f)
      .sort((a, b) => L.faixas.indexOf(a.valor) - L.faixas.indexOf(b.valor))
      .map((f) => ({ ...f, rotulo: L.faixa_rotulos[f.valor] })),
    mandato: { sim: mandato.find((m) => m.valor === true)?.n ?? 0, nao: mandato.find((m) => m.valor === false)?.n ?? 0 },
    municipios: [...municipios.values()].sort((a, b) => colacao.compare(a.rotulo ?? "", b.rotulo ?? "")),
  }
}

const ORDEM_CARGO_BUSCA = ["senador", "deputado_federal", "deputado_estadual", "suplente"]

async function rotaBusca(p) {
  const texto = str(p.q, 80)
  if (!texto || texto.length < 2) return { q: texto ?? "", itens: [] }
  const limite = Math.min(20, Math.max(1, parse(p.limite) || 8))
  const { itens, situacoes } = await carregar("busca.json")
  const t = normalizar(texto)
  const achados = []
  for (const c of itens) {
    const sub = c._b.includes(t)
    const sem = semelhancaPalavra(t, c._b)
    if (sub || sem >= LIMIAR_PALAVRA || c.numero === texto) {
      achados.push({ c, sub, sem, exato: c._n === t, prefixo: c._n.startsWith(t), palavra: ` ${c._n}`.includes(` ${t}`) })
    }
  }
  const bool = (k) => (a, b) => Number(b[k]) - Number(a[k])
  const ordenados = ordenar(achados, [
    bool("exato"), bool("prefixo"), bool("palavra"), bool("sub"),
    (a, b) => ORDEM_CARGO_BUSCA.indexOf(a.c.cargo) - ORDEM_CARGO_BUSCA.indexOf(b.c.cargo),
    (a, b) => Number(b.c.tem_mandato_atual) - Number(a.c.tem_mandato_atual),
    (a, b) => b.sem - a.sem,
    (a, b) => a.c._i - b.c._i,
  ])
  // grupoSituacao() de api/dominio.js
  const grupo = (s) => ["deferida", "em_julgamento", "indeferida", "renuncia"].find((g) => situacoes[g].includes(s)) ?? null
  return { q: texto, itens: ordenados.slice(0, limite).map(({ c }) => ({ ...publico(c), situacao_grupo: grupo(c.situacao) })) }
}

// ---------------------------------------------------------------- ficha e seções

async function candidato(slug) {
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) throw new ErroApi(404, "candidato não encontrado")
  try {
    return await carregar(`candidatos/${slug}.json`)
  } catch (e) {
    if (e.status === 404) throw new ErroApi(404, "candidato não encontrado")
    throw e
  }
}

const ARQUIVO_LISTA = {
  "campanha/despesas": "campanha-despesas",
  "atuacao/votos": "atuacao-votos",
  "atuacao/proposicoes": "atuacao-proposicoes",
  "emendas/lista": "emendas-lista",
  "cota/notas": "cota-notas",
}

async function linhasDaLista(slug, C, rota) {
  if (!C.listas?.[rota]) return []
  const dados = await carregar(`candidatos/${slug}/${ARQUIVO_LISTA[rota]}.json`)
  if (rota !== "atuacao/votos") return paraObjetos(dados)
  // votos: linha do voto + dicionário compartilhado de votações
  if (!objetos.has(dados)) {
    const dic = await carregar("votacoes.json")
    const idx = Object.fromEntries(dic.colunas.map((c, i) => [c, i]))
    const idxVoto = Object.fromEntries(dados.colunas_voto.map((c, i) => [c, i]))
    objetos.set(dados, dados.linhas.map((l) => {
      const v = dic.linhas[l[0]]
      return Object.fromEntries(dados.colunas.map((c) => [c, c in idxVoto ? l[idxVoto[c]] : v[idx[c]]]))
    }))
  }
  return objetos.get(dados)
}

function paginar(linhas, pg) {
  return { linhas: linhas.slice(pg.offset, pg.offset + pg.por), total: linhas.length, pagina: pg.pagina, por_pagina: pg.por }
}
/** Texto de busca das tabelas: termo() + LIKE sem acento. */
function termoBusca(v) {
  const s = str(v, 80)
  if (!s) return null
  return { norm: normalizar(s), cru: s, escapado: s.replace(/[\\%_]/g, (m) => `\\${m}`), digitos: s.replace(/\D/g, "") || "#" }
}

const AERONAVE = (c) => /aeronave/i.test(c ?? "") || (/fretamento/i.test(c ?? "") && /a.reo/i.test(c ?? ""))
const dataNota = (l) => l.data_documento ?? `${l.ano}-${String(l.mes ?? 1).padStart(2, "0")}-01`

const LISTAS = {
  "campanha/despesas"(linhas, p) {
    const ano = int(p.ano, { min: 1990, max: 2100 })
    const cat = str(p.categoria)
    const t = termoBusca(p.q)
    let base = linhas
    if (ano) base = base.filter((l) => l.ano === ano)
    if (t) base = base.filter((l) => contem(l.fornecedor, t.norm) || contem(l.descricao, t.norm) || (l.cnpj ?? "").includes(t.digitos) || contem(l.numero_documento, t.norm))
    const filtradas = cat ? base.filter((l) => l.categoria === cat) : base
    const ORDEM = {
      valor: [desc("valor"), idAsc], valor_asc: [asc("valor"), idAsc], data: [desc("data"), idAsc], data_asc: [asc("data"), idAsc],
      fornecedor: [ascTexto("fornecedor"), idAsc],
    }
    const pg = paginacao(p)
    const r = paginar(ordenar(filtradas, ORDEM[str(p.ordem)] ?? ORDEM.valor), pg)
    return { ...r, soma: soma(filtradas, "valor"), facetas: { categoria: facetas(base, "categoria", "valor") } }
  },
  "atuacao/votos"(linhas, p) {
    let f = linhas
    const ano = int(p.ano, { min: 1990, max: 2100 })
    if (ano) f = f.filter((l) => l.ano === ano)
    const tema = str(p.tema)
    if (tema) f = f.filter((l) => l.tema === tema)
    const voto = str(p.voto, 30)
    if (voto) f = f.filter((l) => l.voto === voto)
    if (str(p.chave) === "1") f = f.filter((l) => l.eh_chave)
    const al = str(p.alinhamento, 10)
    if (al === "sim") f = f.filter((l) => l.alinhado_governo === true)
    if (al === "nao") f = f.filter((l) => l.alinhado_governo === false)
    const t = termoBusca(p.q)
    if (t) f = f.filter((l) => contem(l.descricao, t.norm) || contem(l.proposicao, t.norm) || contem(l.proposicao_ementa, t.norm) || contem(l.rotulo_chave, t.norm))
    // o arquivo já vem em "data DESC, votacao_id"; a ordem estável preserva o desempate por id
    const ordenadas = str(p.ordem) === "data_asc" ? ordenar(f, [asc("data")]) : f
    return paginar(ordenadas, paginacao(p))
  },
  "atuacao/proposicoes"(linhas, p) {
    let f = linhas
    const tipo = str(p.tipo, 20)
    if (tipo) f = f.filter((l) => l.sigla_tipo === tipo)
    const ano = int(p.ano, { min: 1900, max: 2100 })
    if (ano) f = f.filter((l) => l.ano === ano)
    const tema = str(p.tema)
    if (tema) f = f.filter((l) => l.tema === tema)
    if (str(p.principais) === "1") f = f.filter((l) => l.tipo_principal)
    const t = termoBusca(p.q)
    if (t) {
      f = f.filter((l) => contem(l.ementa, t.norm)
        || (l.sigla_tipo != null && l.numero != null && l.ano != null && contem(`${l.sigla_tipo} ${l.numero}/${l.ano}`, t.norm)))
    }
    return paginar(f, paginacao(p)) // arquivo já em "data_apresentacao DESC NULLS LAST, id"
  },
  "emendas/lista"(linhas, p) {
    let f = linhas
    const ano = int(p.ano, { min: 1990, max: 2100 })
    if (ano) f = f.filter((l) => l.ano === ano)
    const area = str(p.area)
    if (area) f = f.filter((l) => l.funcao === area)
    const t = termoBusca(p.q)
    if (t) f = f.filter((l) => contem(l.localidade, t.norm) || contem(l.acao, t.norm) || contem(l.programa, t.norm) || (l.codigo_emenda ?? "").includes(t.cru))
    const ORDEM = {
      empenhado: [desc("empenhado"), idAsc], pago: [desc("pago_total"), idAsc],
      ano: [(a, b) => b.ano - a.ano, desc("empenhado"), idAsc], ano_asc: [(a, b) => a.ano - b.ano, desc("empenhado"), idAsc],
    }
    const r = paginar(ordenar(f, ORDEM[str(p.ordem)] ?? ORDEM.ano), paginacao(p))
    return { ...r, soma: { empenhado: soma(f, "empenhado"), pago_total: soma(f, "pago_total") } }
  },
  "cota/notas"(linhas, p) {
    let base = linhas
    const casa = str(p.casa, 10)
    if (["camara", "senado", "alba"].includes(casa)) base = base.filter((l) => l.casa === casa)
    const ano = int(p.ano, { min: 1990, max: 2100 })
    if (ano) base = base.filter((l) => l.ano === ano)
    const mes = int(p.mes, { min: 1, max: 12 })
    if (mes) base = base.filter((l) => l.mes === mes)
    const t = termoBusca(p.q)
    if (t) {
      base = base.filter((l) => contem(l.fornecedor, t.norm) || contem(l.categoria, t.norm) || contem(l.especificacao, t.norm)
        || contem(l.detalhamento, t.norm) || contem(l.trecho, t.norm) || contem(l.passageiro, t.norm)
        || (l.cnpj ?? "").includes(t.digitos) || l.numero_documento === t.escapado)
    }
    const grupo = str(p.grupo, 60)
    const f = grupo === "aeronave" ? base.filter((l) => AERONAVE(l.categoria)) : grupo ? base.filter((l) => l.categoria_grupo === grupo) : base
    const porData = (sinal) => (a, b) => sinal * (dataNota(a) > dataNota(b) ? 1 : dataNota(a) < dataNota(b) ? -1 : 0)
    const ORDEM = {
      valor: [desc("valor_liquido"), idAsc], valor_asc: [asc("valor_liquido"), idAsc],
      data: [porData(-1), (a, b) => -idAsc(a, b)], data_asc: [porData(1), idAsc],
      fornecedor: [ascTexto("fornecedor"), idAsc],
    }
    const r = paginar(ordenar(f, ORDEM[str(p.ordem)] ?? ORDEM.valor), paginacao(p))
    return { ...r, soma: soma(f, "valor_liquido"), facetas: { grupo: facetas(base, "categoria_grupo", "valor_liquido") } }
  },
}

async function rotaFicha(slug, resto, p) {
  const C = await candidato(slug)
  if (!resto.length) {
    const { secoes: _s, listas: _l, ...base } = C
    return base
  }
  const rota = resto.join("/")
  if (LISTAS[rota]) return LISTAS[rota](await linhasDaLista(slug, C, rota), p)
  if (rota === "campanha") {
    const { padrao, por_ano: porAno } = C.secoes.campanha
    const ano = int(p.ano)
    return (ano != null && porAno[ano]) || padrao
  }
  if (resto.length === 1 && C.secoes[rota]) return C.secoes[rota]
  throw new ErroApi(404, "rota não encontrada")
}

// ---------------------------------------------------------------- roteador

/** Resolve uma URL /api/... a partir dos arquivos estáticos. */
export async function resolverEstatico(url) {
  const u = new URL(url, "http://local")
  const p = {}
  for (const [k, v] of u.searchParams) if (!(k in p)) p[k] = v // parâmetro repetido: vale o primeiro, como na API
  const partes = u.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean).map(decodeURIComponent)
  const [r0, r1, ...resto] = partes
  if (r0 === "inicio" && !r1) return carregar("inicio.json")
  if (r0 === "fontes" && !r1) return carregar("fontes.json")
  if (r0 === "busca" && !r1) return rotaBusca(p)
  if (r0 === "filtros" && !r1) return rotaFiltros(p)
  if (r0 === "candidatos" && !r1) return rotaCandidatos(p)
  if (r0 === "candidatos" && r1) return rotaFicha(r1, resto, p)
  throw new ErroApi(404, "rota não encontrada")
}
