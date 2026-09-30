// Portal da Transparência (CGU) — arquivos de download, sem chave de API.
//   node coleta/baixar/portal.mjs [--forcar]
// 1. Emendas parlamentares (arquivo UNICO: emendas, por favorecido, convênios) -> <cache>/portal/emendas/
// 2. Cadastros de sanções CEIS e CNEP (o Portal só publica o arquivo do dia)  -> <cache>/portal/sancoes/
import fs from "node:fs";
import path from "node:path";
import { baixarArquivo, extrairZip, caminho, existe, lerJson, principal, log, FORCAR } from "./lib.mjs";

const DL = "https://portaldatransparencia.gov.br/download-de-dados";

async function arquivoDoDia(tipo, chave) {
  // o Portal publica um arquivo por dia (AAAAMMDD) e só mantém o mais recente
  const dir = path.join("portal", "sancoes");
  const zip = path.join(dir, `${tipo}.zip`);
  if (!FORCAR && existe(caminho(zip)) && existe(caminho(zip) + ".meta.json"))
    return baixarArquivo(lerJson(caminho(zip) + ".meta.json").url, zip, { chave }); // cache
  for (let d = 0; d < 10; d++) {
    const dt = new Date(Date.now() - d * 864e5).toISOString().slice(0, 10).replaceAll("-", "");
    try {
      return await baixarArquivo(`${DL}/${tipo}/${dt}`, zip, { chave });
    } catch (e) {
      if (!/HTTP 40[34]/.test(e.message)) throw e;
    }
  }
  throw new Error(`nenhum arquivo ${tipo} nos últimos 10 dias`);
}

principal(async () => {
  log("== emendas parlamentares (UNICO)");
  const { arquivo } = await baixarArquivo(`${DL}/emendas-parlamentares/UNICO`, path.join("portal", "EmendasParlamentares.zip"), { chave: "portal_emendas" });
  const csvs = extrairZip(arquivo, path.join(path.dirname(arquivo), "emendas"), (n) => /^EmendasParlamentares.*\.csv$/i.test(n));
  log(`  ${csvs.map((c) => path.basename(c)).join(", ")}`);

  log("== CEIS / CNEP");
  for (const tipo of ["ceis", "cnep"]) {
    const { arquivo: z } = await arquivoDoDia(tipo, "portal_sancoes");
    const dest = path.join(path.dirname(z), tipo);
    if (FORCAR) fs.rmSync(dest, { recursive: true, force: true });
    const [csv] = extrairZip(z, dest, (n) => /\.csv$/i.test(n));
    log(`  ${tipo}: ${path.basename(csv)}`);
  }
});
