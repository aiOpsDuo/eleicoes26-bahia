// Assembleia Legislativa da Bahia (ALBA) — verba indenizatória, portal de transparência.
//   node coleta/baixar/alba.mjs [--forcar]
//
// Não há API nem arquivo: o portal devolve HTML (20 linhas por página; o parâmetro `size` é ignorado).
// A coleta tem dois passos:
//   1. lista por deputado x ano (processo, nº da nota, competência, categoria, valor LÍQUIDO);
//   2. página de detalhe de cada lançamento — a única fonte de fornecedor, CNPJ/CPF, glosa e do PDF da nota.
// A coluna VALOR da lista é o líquido; a do detalhe é o bruto (com a glosa ao lado). O script confere
// `lista == detalhe - glosa` e avisa se deixar de bater. A fonte não publica data do documento, só a competência.
//
// Saída em <cache>/alba/:
//   deputados.csv   id_alba;nome  (o próprio seletor do portal é o roster)
//   verba.csv       um lançamento por linha (colunas abaixo), com url_documento = PDF da nota no portal
//   partes/<id>_<ano>.json  cache por deputado x ano (permite retomar)
// Por padrão coleta só os deputados com id_alba em base/candidatos_ids.json (ALBA_TODOS=1: todos do seletor).
// ALBA_ANOS=2023,2024,2025,2026 (padrão); ALBA_REFAZER_ANOS=2026 recoleta só esses anos; ALBA_CONC=6 requisições simultâneas.
// Teste rápido: ALBA_DEPS=910635 node coleta/baixar/alba.mjs
// Primeira coleta completa: ~16 mil páginas de detalhe, ~12 min.
import fs from "node:fs";
import path from "node:path";
import { caminho, existe, lerJson, registrarFonte, candidatosIds, emParalelo, principal, log, FORCAR } from "./lib.mjs";

const BASE = "https://www.al.ba.gov.br/transparencia/verbas-idenizatorias";
const ANOS = (process.env.ALBA_ANOS ?? "2023,2024,2025,2026").split(",").map(Number);
const REFAZER = new Set((process.env.ALBA_REFAZER_ANOS ?? "").split(",").filter(Boolean).map(Number));
const CONC = Number(process.env.ALBA_CONC ?? 6);
const SO_DEPS = (process.env.ALBA_DEPS ?? "").split(",").filter(Boolean);
const CHAVE = "alba_verba";
const alertas = [];
const alerta = (m) => { alertas.push(m); log("ALERTA  " + m); };

async function getHtml(url, tentativa = 1) {
  try {
    const r = await fetch(url, { headers: { accept: "text/html", "User-Agent": "Mozilla/5.0 (coleta ba2026)" } });
    if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
    if (!r.ok) return { erro: `HTTP ${r.status}`, html: "" };
    return { html: await r.text() };
  } catch (e) {
    if (tentativa >= 5) return { erro: e.message, html: "" };
    await new Promise((s) => setTimeout(s, 600 * 2 ** (tentativa - 1)));
    return getHtml(url, tentativa + 1);
  }
}

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ensp: " " };
const texto = (s) => s.replace(/<[^>]*>/g, " ").replace(/&(amp|lt|gt|quot|apos|nbsp|ensp);/g, (_, e) => ENT[e])
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/\s+/g, " ").trim();
const celulas = (tr) => [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => texto(m[1]));
const linhasTabela = (html) => [...html.matchAll(/<tr class="table-itens[^"]*">([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
/** "R$ 1.234,56" -> "1234.56" (vírgula decimal, ponto de milhar). */
function valor(s) {
  const t = (s || "").replace(/[^\d,.-]/g, "");
  if (!t) return null;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n.toFixed(2) : null;
}
const soDigitos = (s) => ((s || "").match(/\d/g) || []).join("") || null;

async function lerRoster() {
  const { html, erro } = await getHtml(`${BASE}?ano=${ANOS.at(-1)}`);
  if (erro) throw new Error(`não consegui abrir o portal da ALBA: ${erro}`);
  const sel = html.match(/<select[^>]*name="deputado"[^>]*>([\s\S]*?)<\/select>/);
  if (!sel) throw new Error("o seletor de deputado sumiu da página — o HTML mudou");
  return [...sel[1].matchAll(/<option value="(\d+)"[^>]*>([\s\S]*?)<\/option>/g)].map((m) => ({ id_alba: m[1], nome: texto(m[2]).replace(/^Dep\.\s*/i, "") }));
}

async function listar(id, ano) {
  const url = (p) => `${BASE}?deputado=${id}&ano=${ano}${p ? `&page=${p}&size=20` : ""}`;
  const primeira = await getHtml(url(0));
  if (primeira.erro) { alerta(`lista ${id}/${ano}: ${primeira.erro}`); return null; }
  const paginas = [...primeira.html.matchAll(/page=(\d+)&amp;size=20/g)].map((m) => +m[1]);
  const ultima = paginas.length ? Math.max(...paginas) : 0;
  const html = [primeira.html];
  if (ultima > 0) {
    const resto = await emParalelo(Array.from({ length: ultima }, (_, k) => k + 1), 3, async (p) => {
      const r = await getHtml(url(p));
      if (r.erro) alerta(`lista ${id}/${ano} página ${p}: ${r.erro}`);
      return r.html;
    });
    html.push(...resto);
  }
  const itens = [];
  for (const h of html) for (const tr of linhasTabela(h)) {
    const c = celulas(tr);
    if (c.length < 6) continue; // o portal emite um <tr> vazio antes da 1ª linha
    const det = tr.match(/verbas-idenizatorias\/(\d+)\//);
    const [mes, anoComp] = (c[2] || "").split("/");
    itens.push({
      id_detalhe: det ? det[1] : null, num_processo: c[0] || null, num_documento: c[1] || null,
      mes: /^\d{1,2}$/.test(mes) ? String(+mes) : null, ano: /^\d{4}$/.test(anoComp) ? anoComp : String(ano),
      categoria_lista: c[4] || null, vlr_lista: valor(c[5]),
    });
  }
  return itens;
}

async function detalhar(item) {
  if (!item.id_detalhe) return null;
  const { html, erro } = await getHtml(`${BASE}/${item.id_detalhe}/`);
  if (erro) { alerta(`detalhe ${item.id_detalhe}: ${erro}`); return null; }
  const corpo = html.slice(html.indexOf("DESPESAS REFER"));
  const linhas = linhasTabela(corpo).map((tr) => {
    const c = celulas(tr);
    const anexo = tr.match(/href="([^"]*fserver[^"]*)"/);
    return {
      categoria: c[0] || null, num_documento: c[1] || null, cnpj_cpf_fornecedor: soDigitos(c[2]), nome_fornecedor: c[3] || null,
      vlr_documento: valor(c[4]), vlr_glosa: valor(c[5]), url_documento: anexo ? new URL(anexo[1], "https://www.al.ba.gov.br").href : null,
    };
  });
  if (!linhas.length) return null;
  if (linhas.length > 1) {
    const casada = linhas.find((l) => l.num_documento === item.num_documento);
    if (casada) return casada;
    alerta(`detalhe ${item.id_detalhe}: ${linhas.length} linhas e nenhuma casa com a nota ${item.num_documento}`);
  }
  return linhas[0];
}

async function coletarParte(id, ano) {
  const arq = caminho("alba", "partes", `${id}_${ano}.json`);
  if (!FORCAR && !REFAZER.has(ano) && existe(arq)) return lerJson(arq);
  const consultado_em = new Date().toISOString();
  const lista = await listar(id, ano);
  if (lista === null) return null; // erro: não grava parte (tenta de novo na próxima execução)
  const linhas = await emParalelo(lista, CONC, async (item) => {
    const det = await detalhar(item);
    const bruto = det?.vlr_documento ?? item.vlr_lista;
    const glosa = det?.vlr_glosa ?? null;
    const liquido = bruto == null ? null : (Number(bruto) - Number(glosa ?? 0)).toFixed(2);
    if (item.vlr_lista != null && liquido != null && Math.abs(Number(item.vlr_lista) - Number(liquido)) > 0.005)
      alerta(`${id}/${ano} detalhe ${item.id_detalhe}: valor da lista (${item.vlr_lista}) não é o líquido do detalhe (${liquido})`);
    return {
      id_alba: id, id_detalhe: item.id_detalhe, ano: item.ano, mes: item.mes,
      tipo_despesa: det?.categoria ?? item.categoria_lista, num_processo: item.num_processo,
      num_documento: det?.num_documento ?? item.num_documento, vlr_documento: bruto, vlr_glosa: glosa, vlr_liquido: liquido,
      nome_fornecedor: det?.nome_fornecedor ?? null, cnpj_cpf_fornecedor: det?.cnpj_cpf_fornecedor ?? null,
      url_documento: det?.url_documento ?? null, dt_coleta: consultado_em,
    };
  });
  const parte = { url: `${BASE}?deputado=${id}&ano=${ano}`, consultado_em, linhas };
  fs.writeFileSync(arq, JSON.stringify(parte));
  return parte;
}

const campo = (x) => (x === null || x === undefined ? "" : /[;"\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : String(x));
const COLS = ["id_alba", "id_detalhe", "ano", "mes", "tipo_despesa", "num_processo", "num_documento", "vlr_documento", "vlr_glosa",
  "vlr_liquido", "nome_fornecedor", "cnpj_cpf_fornecedor", "url_documento", "dt_coleta"];

principal(async () => {
  const saida = caminho("alba", "verba.csv");
  const parcial = SO_DEPS.length > 0;
  if (!FORCAR && !REFAZER.size && !parcial && existe(saida) && existe(saida + ".meta.json")) {
    const m = lerJson(saida + ".meta.json");
    registrarFonte(CHAVE, m.consultado_em, BASE);
    registrarFonte("alba_deputados", m.consultado_em, BASE);
    log(`  cache: alba/verba.csv (${m.linhas} lançamentos, coletado em ${m.consultado_em.slice(0, 10)})`);
    return;
  }
  const roster = await lerRoster();
  fs.writeFileSync(caminho("alba", "deputados.csv"), "id_alba;nome\n" + roster.map((d) => `${d.id_alba};${campo(d.nome)}`).join("\n") + "\n");
  registrarFonte("alba_deputados", new Date().toISOString(), BASE);
  const doJson = new Set(Object.values(candidatosIds()).map((c) => c.id_alba).filter(Boolean).map(String));
  const alvo = SO_DEPS.length ? roster.filter((d) => SO_DEPS.includes(d.id_alba))
    : process.env.ALBA_TODOS === "1" ? roster : roster.filter((d) => doJson.has(d.id_alba));
  for (const id of doJson) if (!roster.some((d) => d.id_alba === id)) alerta(`id_alba ${id} do candidatos_ids.json não está no seletor do portal`);
  log(`  ${roster.length} deputados no seletor; coletando ${alvo.length} x ${ANOS.length} anos`);

  const todas = [];
  let maisRecente = "";
  for (const [k, d] of alvo.entries()) {
    for (const ano of ANOS) {
      const p = await coletarParte(d.id_alba, ano);
      if (!p) continue;
      todas.push(...p.linhas);
      if (p.consultado_em > maisRecente) maisRecente = p.consultado_em;
    }
    log(`  ${k + 1}/${alvo.length} ${d.nome}: ${todas.length} lançamentos acumulados`);
  }
  const semDetalhe = todas.filter((d) => !d.nome_fornecedor).length;
  if (semDetalhe) alerta(`${semDetalhe} lançamentos sem fornecedor (detalhe não abriu)`);
  if (parcial) { log(`teste parcial: ${todas.length} lançamentos (verba.csv não foi reescrito)`); return; }
  fs.writeFileSync(saida, [COLS.join(";"), ...todas.map((l) => COLS.map((c) => campo(l[c])).join(";"))].join("\n") + "\n");
  fs.writeFileSync(saida + ".meta.json", JSON.stringify({ url: BASE, consultado_em: maisRecente, linhas: todas.length, deputados: alvo.length, anos: ANOS, alertas }, null, 1) + "\n");
  registrarFonte(CHAVE, maisRecente, BASE);
  log(`  ${todas.length} lançamentos, ${alertas.length} alertas -> alba/verba.csv`);
});
