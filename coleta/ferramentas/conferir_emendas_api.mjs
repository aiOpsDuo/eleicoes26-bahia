// Confere os totais de emendas do arquivo UNICO (o que está no banco) contra a API do Portal da Transparência.
//   PORTAL_API_KEY=... node coleta/ferramentas/conferir_emendas_api.mjs ["NOME DO AUTOR" ANO ...]
// A chave é pessoal e gratuita (https://portaldatransparencia.gov.br/api-de-dados/cadastrar-email); é lida só da
// variável de ambiente PORTAL_API_KEY e nunca é gravada (as respostas ficam em <cache>/portal/api/ sem cabeçalhos).
// A coleta em si NÃO usa a API (só arquivos de download); este script é uma conferência opcional.
import { spawnSync } from "node:child_process";
import { getApi, configurarApi, principal, log } from "../baixar/lib.mjs";

const KEY = process.env.PORTAL_API_KEY;
if (!KEY) { console.error("defina PORTAL_API_KEY no ambiente (não grave a chave em arquivo versionado)"); process.exit(1); }
configurarApi("portal", { gapMs: 700, headers: { "chave-api-dados": KEY } });
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const AMOSTRA = args.length >= 2 ? Array.from({ length: args.length / 2 }, (_, i) => [args[2 * i], +args[2 * i + 1]])
  : [["FELIX MENDONCA JUNIOR", 2024], ["JAQUES WAGNER", 2025], ["ALICE PORTUGAL", 2023]];
const brl = (s) => (typeof s === "number" ? s : +String(s).replace(/\./g, "").replace(",", "."));
const fmt = (v) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

principal(async () => {
  for (const [nome, ano] of AMOSTRA) {
    const linhas = [];
    for (let pg = 1; ; pg++) {
      const j = await getApi("portal", `https://api.portaldatransparencia.gov.br/api-de-dados/emendas?nomeAutor=${encodeURIComponent(nome)}&ano=${ano}&pagina=${pg}`);
      linhas.push(...j);
      if (j.length < 15) break;
    }
    const emp = linhas.reduce((s, e) => s + brl(e.valorEmpenhado), 0);
    const pago = linhas.reduce((s, e) => s + brl(e.valorPago), 0);
    // mesmo recorte no banco (autor pelo nome do Portal)
    const sql = `select coalesce(sum(empenhado),0), coalesce(sum(pago),0) from emenda where ano = ${ano} and autor_nome = '${nome.replace(/'/g, "''")}'`;
    const r = spawnSync("psql", ["-At", "-F", "|", "-d", process.env.BA2026_DB || "ba2026", "-c", sql], { encoding: "utf8" });
    const [bEmp, bPago] = (r.stdout || "0|0").trim().split("|").map(Number);
    log(`${nome} ${ano}: API ${linhas.length} emendas, empenhado R$ ${fmt(emp)}, pago R$ ${fmt(pago)} | banco: empenhado R$ ${fmt(bEmp)}, pago R$ ${fmt(bPago)}`
      + (Math.abs(emp - bEmp) < 0.01 ? "  OK" : "  DIFERENTE (o arquivo UNICO e a API podem ter datas de atualização diferentes)"));
  }
});
