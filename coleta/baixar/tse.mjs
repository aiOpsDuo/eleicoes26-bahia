// TSE — Portal de Dados Abertos (cdn.tse.jus.br). Baixa os zips e extrai só o recorte BA.
//   node coleta/baixar/tse.mjs [--forcar]
// Zips em <cache>/tse/zip/, CSVs extraídos (latin-1, ';', como publicados) em <cache>/tse/csv/.
// Se todos os CSVs de um zip já estão extraídos, o zip não é baixado de novo.
// COLETA_APAGAR_ZIPS=1 apaga os zips grandes depois de extrair (votação 2022, eleitorado, prestação de contas).
import fs from "node:fs";
import path from "node:path";
import { baixarArquivo, extrairZip, caminho, existe, lerJson, registrarFonte, principal, log, FORCAR } from "./lib.mjs";

const ODS = "https://cdn.tse.jus.br/estatistica/sead/odsele";
export const ANOS_ANTERIORES = (process.env.TSE_ANOS_ANTERIORES || "2006,2010,2014,2018,2022").split(",").map(Number);

// [url, chave da fonte, membros a extrair]
export function arquivosTse() {
  const L = [];
  for (const ano of [...ANOS_ANTERIORES, 2026]) {
    L.push([`${ODS}/consulta_cand/consulta_cand_${ano}.zip`, `tse_cand_${ano}`, [`consulta_cand_${ano}_BA.csv`]]);
    L.push([`${ODS}/bem_candidato/bem_candidato_${ano}.zip`, `tse_bens_${ano}`, [`bem_candidato_${ano}_BA.csv`]]);
  }
  L.push(
    [`${ODS}/consulta_cand_complementar/consulta_cand_complementar_2026.zip`, "tse_cand_compl_2026", ["consulta_cand_complementar_2026_BA.csv"]],
    [`${ODS}/consulta_cand/rede_social_candidato_2026.zip`, "tse_rede_social_2026", ["rede_social_candidato_2026_BA.csv"]],
    [`${ODS}/consulta_coligacao/consulta_coligacao_2026.zip`, "tse_coligacao_2026", ["consulta_coligacao_2026_BA.csv"]],
    [`${ODS}/consulta_vagas/consulta_vagas_2026.zip`, "tse_vagas_2026", ["consulta_vagas_2026_BA.csv"]],
    [`${ODS}/pesquisa_eleitoral/pesquisa_eleitoral_2026.zip`, "tse_pesquisa_2026", ["pesquisa_eleitoral_2026_BA.csv"]],
    [`${ODS}/votacao_candidato_munzona/votacao_candidato_munzona_2022.zip`, "tse_votacao_2022", ["votacao_candidato_munzona_2022_BA.csv"]],
    [`${ODS}/perfil_eleitorado/perfil_eleitorado_2026.zip`, "tse_eleitorado_2026", ["perfil_eleitorado_2026_BA.csv"]],
  );
  for (const ano of [2022, 2026]) {
    L.push([`${ODS}/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_${ano}.zip`, `tse_prestacao_${ano}`,
      [`receitas_candidatos_${ano}_BA.csv`, `despesas_contratadas_candidatos_${ano}_BA.csv`, `despesas_pagas_candidatos_${ano}_BA.csv`]]);
  }
  return L;
}
const GRANDES = /votacao_candidato_munzona|perfil_eleitorado|prestacao_de_contas/;
export const FOTOS = "https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2026/fotos/foto_cand2026_BA_div.zip";

principal(async () => {
  const dirCsv = caminho("tse", "csv", "x").replace(/x$/, "");
  for (const [url, chave, membros] of arquivosTse()) {
    const zipNome = path.basename(url);
    const prontos = membros.map((m) => path.join(dirCsv, m));
    if (!FORCAR && prontos.every((p) => existe(p) && existe(p + ".meta.json"))) {
      for (const p of prontos) registrarFonte(chave, lerJson(p + ".meta.json").consultado_em, url);
      log(`  cache: ${zipNome} (${membros.length} CSV)`);
      continue;
    }
    const { arquivo } = await baixarArquivo(url, path.join("tse", "zip", zipNome), { chave });
    const feitos = extrairZip(arquivo, dirCsv, (n) => membros.includes(n));
    const faltam = membros.filter((m) => !feitos.some((f) => path.basename(f) === m));
    if (faltam.length) log(`  AVISO: ${zipNome} não tem ${faltam.join(", ")}`);
    if (process.env.COLETA_APAGAR_ZIPS === "1" && GRANDES.test(zipNome)) fs.rmSync(arquivo);
  }
  await baixarArquivo(FOTOS, path.join("tse", "zip", path.basename(FOTOS)), { chave: "tse_fotos_2026" });
});
