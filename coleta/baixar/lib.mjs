// Utilitários da coleta: cache em disco com metadado de fonte, downloads de arquivo
// e GET de API com retry. Tudo que é baixado fica em $COLETA_CACHE (padrão .cache).
//
//   arquivo baixado  -> <cache>/<grupo>/.../<nome>            + <nome>.meta.json {url, consultado_em, bytes, sha256, last_modified}
//   resposta de API  -> <cache>/<grupo>/api/<sha1(url)[:16]>.json  {fonte, url, consultado_em, dados}
//   fontes usadas    -> <cache>/_fontes/<chave>.json          {chave, consultado_em, itens, exemplo_url}
//
// Por que Node e não curl/python: o CDN do TSE (cdn.tse.jus.br) recusa curl/wget/urllib
// (fingerprint TLS); o fetch do Node passa. Para uniformizar, toda a coleta usa fetch.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CACHE = path.resolve(process.env.COLETA_CACHE || path.join(APP, ".cache"));
export const FORCAR = process.argv.includes("--forcar");
export const BASE = path.join(APP, "coleta", "base");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const log = (...a) => console.log(...a);
export const lerJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
export const existe = (p) => fs.existsSync(p);
export function caminho(...partes) {
  const p = path.join(CACHE, ...partes);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  return p;
}
export const candidatosIds = () => lerJson(path.join(BASE, "candidatos_ids.json")).candidatos;

// ------------------------------------------------------------------ registro de fontes (coletado_em)
const fontes = {};
export function registrarFonte(chave, consultadoEm, url) {
  if (!chave || !consultadoEm) return;
  const f = (fontes[chave] ||= { chave, consultado_em: consultadoEm, itens: 0, exemplo_url: url });
  f.itens++;
  if (consultadoEm > f.consultado_em) f.consultado_em = consultadoEm;
}
export function gravarFontes() {
  for (const f of Object.values(fontes)) {
    const p = caminho("_fontes", `${f.chave}.json`);
    // várias execuções parciais: fica a coleta mais recente
    if (existe(p)) {
      const ant = lerJson(p);
      if (ant.consultado_em > f.consultado_em) f.consultado_em = ant.consultado_em;
    }
    fs.writeFileSync(p, JSON.stringify(f, null, 1) + "\n");
  }
}
process.on("exit", gravarFontes);

// ------------------------------------------------------------------ HTTP
async function tentar(url, opts = {}, { tentativas = 5, esperaBase = 1500 } = {}) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { redirect: "follow", ...opts });
      if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
      return r;
    } catch (e) {
      if (i >= tentativas) throw new Error(`${e.message} em ${url}`);
      await sleep(esperaBase * i);
    }
  }
}

/**
 * Baixa `url` para <cache>/<destino> (streaming, com .meta.json). Pula se já existe (salvo --forcar).
 * Devolve { arquivo, meta }.
 */
export async function baixarArquivo(url, destino, { chave, headers = {} } = {}) {
  const arq = caminho(destino);
  const metaP = arq + ".meta.json";
  if (!FORCAR && existe(arq) && existe(metaP)) {
    const meta = lerJson(metaP);
    registrarFonte(chave, meta.consultado_em, url);
    return { arquivo: arq, meta, cache: true };
  }
  const t0 = Date.now();
  log(`  baixando ${url}`);
  const r = await tentar(url, { headers: { "User-Agent": "Mozilla/5.0 (coleta ba2026)", ...headers } });
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
  const tmp = arq + ".parcial";
  const hash = crypto.createHash("sha256");
  const out = fs.createWriteStream(tmp);
  let bytes = 0;
  for await (const chunk of r.body) {
    hash.update(chunk);
    bytes += chunk.length;
    if (!out.write(chunk)) await new Promise((ok) => out.once("drain", ok));
  }
  await new Promise((ok, erro) => out.end((e) => (e ? erro(e) : ok())));
  fs.renameSync(tmp, arq);
  const meta = {
    url, url_final: r.url !== url ? r.url : undefined, consultado_em: new Date().toISOString(), bytes,
    sha256: hash.digest("hex"), last_modified: r.headers.get("last-modified") || undefined,
    segundos: Math.round((Date.now() - t0) / 100) / 10,
  };
  fs.writeFileSync(metaP, JSON.stringify(meta, null, 1) + "\n");
  log(`  ok ${(bytes / 1e6).toFixed(1)} MB em ${meta.segundos}s -> ${path.relative(CACHE, arq)}`);
  registrarFonte(chave, meta.consultado_em, url);
  return { arquivo: arq, meta, cache: false };
}

/**
 * Extrai membros de um zip com o `unzip` do sistema (macOS/Linux). `filtro(nome)` escolhe os membros.
 * Cada membro extraído ganha .meta.json herdando url/consultado_em do zip.
 */
export function extrairZip(zip, dirDestino, filtro) {
  const lista = spawnSync("unzip", ["-Z1", zip], { encoding: "utf8", maxBuffer: 1 << 26 });
  if (lista.status !== 0) throw new Error(`unzip falhou em ${zip}: ${lista.stderr}`);
  const membros = lista.stdout.split("\n").filter((m) => m && !m.endsWith("/") && filtro(path.basename(m)));
  const metaZip = existe(zip + ".meta.json") ? lerJson(zip + ".meta.json") : {};
  fs.mkdirSync(dirDestino, { recursive: true });
  const saida = [];
  for (const m of membros) {
    const alvo = path.join(dirDestino, path.basename(m));
    if (!FORCAR && existe(alvo) && existe(alvo + ".meta.json")) { saida.push(alvo); continue; }
    const r = spawnSync("unzip", ["-o", "-j", "-q", zip, m, "-d", dirDestino]);
    if (r.status !== 0) throw new Error(`unzip ${m}: ${r.stderr}`);
    fs.writeFileSync(alvo + ".meta.json", JSON.stringify({ url: metaZip.url, consultado_em: metaZip.consultado_em, zip: path.basename(zip), membro: m }, null, 1) + "\n");
    saida.push(alvo);
  }
  return saida;
}

// ------------------------------------------------------------------ APIs JSON com cache por URL
const intervalo = {};
const ultimo = {};
export function configurarApi(grupo, { gapMs = 300, headers = {} } = {}) {
  intervalo[grupo] = { gapMs, headers };
}

/** GET com cache em <cache>/<grupo>/api/<hash>.json. `texto: true` guarda a resposta crua. */
export async function getApi(grupo, url, { chave, texto = false, aceitar404 = false } = {}) {
  const h = crypto.createHash("sha1").update(url).digest("hex").slice(0, 16);
  const arq = caminho(grupo, "api", h + ".json");
  if (!FORCAR && existe(arq)) {
    const j = lerJson(arq);
    registrarFonte(chave, j.consultado_em, url);
    return j.dados;
  }
  const cfg = intervalo[grupo] || { gapMs: 300, headers: {} };
  const espera = (ultimo[grupo] || 0) + cfg.gapMs - Date.now();
  if (espera > 0) await sleep(espera);
  ultimo[grupo] = Date.now();
  const r = await tentar(url, { headers: { Accept: "application/json", ...cfg.headers } });
  if (r.status === 404 && aceitar404) return null;
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
  const corpo = await r.text();
  const dados = texto ? corpo : JSON.parse(corpo);
  const consultado_em = new Date().toISOString();
  fs.writeFileSync(arq, JSON.stringify({ fonte: grupo, url, consultado_em, dados }));
  registrarFonte(chave, consultado_em, url);
  return dados;
}

/** Roda `tarefa` sobre `itens` com no máximo `n` simultâneas, preservando a ordem. */
export async function emParalelo(itens, n, tarefa) {
  const saida = new Array(itens.length);
  let i = 0;
  const trabalhador = async () => { while (i < itens.length) { const k = i++; saida[k] = await tarefa(itens[k], k); } };
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, trabalhador));
  return saida;
}

export function principal(fn) {
  const t0 = Date.now();
  fn().then(() => log(`fim (${((Date.now() - t0) / 1000).toFixed(0)}s)`)).catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
}
