// Exporta o banco ba2026 para JSON estático (versão sem servidor do site, ver estatico/README.md).
// Reaproveita os próprios handlers da API (api/rotas/*.js): cada arquivo tem exatamente o formato da resposta da
// rota correspondente. As listas grandes (despesas, votos, proposições, emendas, notas) saem com TODAS as linhas,
// em formato colunar, e o front (web/src/lib/estatico.js) filtra, ordena e pagina no navegador.
//
//   node estatico/exportar.mjs [--saida estatico/saida/dados] [--so slug1,slug2]
//
// Conexão: a mesma da API (BA2026_DSN ou PGHOST/PGPORT/PGDATABASE/PGUSER; padrão socket /tmp, banco ba2026).
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { pool, q } from "../api/db.js"
import { GRUPOS, CARGOS, SITUACOES, SITUACAO_ROTULOS, FAIXAS, ORDENS, fontes } from "../api/dominio.js"
import { listar, ROTULO_FAIXA, COLS_BUSCA } from "../api/rotas/candidatos.js"
import { ficha } from "../api/rotas/ficha.js"
import { inicio } from "../api/rotas/inicio.js"
import * as sec from "../api/rotas/secoes.js"

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const arg = (nome) => {
  const i = process.argv.indexOf(nome)
  return i > 0 ? process.argv[i + 1] : null
}
const SAIDA = path.resolve(arg("--saida") ?? path.join(AQUI, "saida", "dados"))
const SO = arg("--so")?.split(",").filter(Boolean) ?? null
const LIMITE_ARQUIVO = 20 * 1024 * 1024 // hospedagens estáticas costumam limitar a 25 MiB por arquivo; margem
const CONCORRENCIA = 4

// seções pequenas: vão inteiras no arquivo do candidato
const SECOES = ["visao", "patrimonio", "atuacao", "emendas", "cota", "atencao", "trajetoria", "fontes"]
const HANDLER_SECAO = { visao: sec.visao, patrimonio: sec.patrimonio, atuacao: sec.atuacao, emendas: sec.emendas, cota: sec.cota, atencao: sec.atencao, trajetoria: sec.trajetoria, fontes: sec.fontesUsadas }
// listas grandes: um arquivo por candidato (só quando há linhas)
const LISTAS = {
  "campanha/despesas": { arquivo: "campanha-despesas", handler: sec.campanhaDespesas },
  "atuacao/votos": { arquivo: "atuacao-votos", handler: sec.atuacaoVotos },
  "atuacao/proposicoes": { arquivo: "atuacao-proposicoes", handler: sec.atuacaoProposicoes },
  "emendas/lista": { arquivo: "emendas-lista", handler: sec.emendasLista },
  "cota/notas": { arquivo: "cota-notas", handler: sec.cotaNotas },
}
// colunas do voto (o resto da linha é da votação e vai para o dicionário compartilhado votacoes.json)
const COLS_VOTO = ["voto", "partido_na_epoca", "alinhado_governo", "contradicao"]

/** Chama um handler Express da API e devolve { status, corpo }. */
async function chamar(handler, { params = {}, query = {} } = {}) {
  let status = 200
  let corpo
  const res = {
    status(s) { status = s; return this },
    set() { return this },
    json(d) { corpo = d; return this },
  }
  await handler({ params, query }, res)
  if (status !== 200) throw new Error(`handler devolveu ${status}: ${JSON.stringify(corpo)}`)
  return corpo
}

let nArquivos = 0
let nBytes = 0
const maiores = []
function gravar(rel, dados) {
  const destino = path.join(SAIDA, rel)
  const texto = JSON.stringify(dados)
  const bytes = Buffer.byteLength(texto)
  if (bytes > LIMITE_ARQUIVO) throw new Error(`${rel} tem ${(bytes / 1048576).toFixed(1)} MB (limite ${LIMITE_ARQUIVO / 1048576} MB)`)
  fs.mkdirSync(path.dirname(destino), { recursive: true })
  fs.writeFileSync(destino, texto)
  nArquivos++
  nBytes += bytes
  maiores.push([bytes, rel])
}

function colunar(linhas) {
  const colunas = linhas.length ? Object.keys(linhas[0]) : []
  return { colunas, linhas: linhas.map((l) => colunas.map((c) => l[c])) }
}

async function comLimite(itens, n, fn) {
  let i = 0
  const trabalhadores = Array.from({ length: n }, async () => {
    while (i < itens.length) {
      const item = itens[i++]
      await fn(item)
    }
  })
  await Promise.all(trabalhadores)
}

const votacoes = new Map() // id -> valores da votação (colunas em COLS_VOTACAO)
let COLS_VOTACAO = null
let COLS_LINHA_VOTO = null

async function exportarCandidato(slug) {
  const base = await chamar(ficha, { params: { slug } })
  const secoes = {}
  for (const s of SECOES) secoes[s] = await chamar(HANDLER_SECAO[s], { params: { slug } })
  // campanha depende de ?ano=: resposta padrão (ano mais recente) + uma por ano anterior
  const padrao = await chamar(sec.campanha, { params: { slug } })
  const porAno = {}
  for (const ano of padrao.anos ?? []) if (ano !== padrao.ano) porAno[ano] = await chamar(sec.campanha, { params: { slug }, query: { ano: String(ano) } })
  secoes.campanha = { padrao, por_ano: porAno }

  const listas = {}
  for (const [rota, { arquivo, handler }] of Object.entries(LISTAS)) {
    const r = await chamar(handler, { params: { slug }, query: { [sec.TODAS]: true } })
    if (!r.total) continue
    listas[rota] = r.total
    if (rota === "atuacao/votos") {
      COLS_LINHA_VOTO ??= Object.keys(r.linhas[0])
      COLS_VOTACAO ??= COLS_LINHA_VOTO.filter((c) => c !== "id" && !COLS_VOTO.includes(c))
      const linhas = r.linhas.map((l) => {
        const v = COLS_VOTACAO.map((c) => l[c])
        const antes = votacoes.get(l.id)
        if (antes && JSON.stringify(antes) !== JSON.stringify(v)) throw new Error(`votação ${l.id} com dados diferentes entre candidatos`)
        votacoes.set(l.id, v)
        return [l.id, ...COLS_VOTO.map((c) => l[c])]
      })
      gravar(`candidatos/${slug}/${arquivo}.json`, { colunas: COLS_LINHA_VOTO, colunas_voto: ["id", ...COLS_VOTO], linhas })
    } else {
      gravar(`candidatos/${slug}/${arquivo}.json`, colunar(r.linhas))
    }
  }
  gravar(`candidatos/${slug}.json`, { ...base, secoes, listas })
}

async function main() {
  const t0 = Date.now()
  if (!SO) fs.rmSync(SAIDA, { recursive: true, force: true })
  fs.mkdirSync(SAIDA, { recursive: true })

  // início e fontes (mesmas respostas de /api/inicio e /api/fontes)
  gravar("inicio.json", await chamar(inicio))
  const { lista } = await fontes()
  gravar("fontes.json", { itens: lista })

  // extras usados só no cliente: texto de busca normalizado pelo próprio banco (f_normaliza) e faixa de patrimônio
  const extras = Object.fromEntries(
    (await q(`SELECT slug, busca, f_normaliza(nome_urna) AS nn, faixa_patrimonio FROM candidato_resumo WHERE cargo = ANY($1)`, [CARGOS])).map((r) => [r.slug, r]),
  )

  // listas por grupo: todas as situações, em ordem de nome (a ordem alfabética do banco vira o índice _i)
  for (const grupo of Object.keys(GRUPOS)) {
    const itens = []
    let meta = null
    for (let pagina = 1; ; pagina++) {
      const r = await chamar(listar, { query: { grupo, situacao: "todas", ordem: "nome", por_pagina: "100", pagina: String(pagina) } })
      meta ??= r
      itens.push(...r.itens)
      if (pagina >= r.paginas) break
    }
    gravar(`listas/${grupo}.json`, {
      grupo,
      cargos: meta.cargos,
      fontes: meta.fontes,
      situacoes: SITUACOES,
      situacao_rotulos: SITUACAO_ROTULOS,
      faixas: FAIXAS,
      faixa_rotulos: ROTULO_FAIXA,
      ordens: Object.keys(ORDENS),
      itens: itens.map((it, i) => ({ ...it, _i: i, _b: extras[it.slug].busca, _f: extras[it.slug].faixa_patrimonio })),
    })
  }

  // índice leve para a busca global
  const busca = await q(`SELECT ${COLS_BUSCA}, busca, f_normaliza(nome_urna) AS nn FROM candidato_resumo WHERE cargo = ANY($1) ORDER BY nome_urna`, [CARGOS])
  gravar("busca.json", { situacoes: SITUACOES, itens: busca.map(({ busca: b, nn, ...r }, i) => ({ ...r, _i: i, _b: b, _n: nn })) })

  // fichas
  const slugs = SO ?? (await q(`SELECT slug FROM candidato WHERE cargo = ANY($1) ORDER BY slug`, [CARGOS])).map((r) => r.slug)
  let feitos = 0
  await comLimite(slugs, CONCORRENCIA, async (slug) => {
    await exportarCandidato(slug)
    if (++feitos % 100 === 0) console.log(`  ${feitos}/${slugs.length} fichas`)
  })

  // dicionário compartilhado de votações (só as que aparecem em algum voto)
  if (!SO) gravar("votacoes.json", { colunas: COLS_VOTACAO ?? [], linhas: Object.fromEntries(votacoes) })

  maiores.sort((a, b) => b[0] - a[0])
  console.log(`exportado: ${nArquivos} arquivos, ${(nBytes / 1048576).toFixed(1)} MB em ${path.relative(process.cwd(), SAIDA) || SAIDA} (${((Date.now() - t0) / 1000).toFixed(0)} s)`)
  console.log("maiores:", maiores.slice(0, 5).map(([b, r]) => `${r} ${(b / 1048576).toFixed(1)} MB`).join(" · "))
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => pool.end())
