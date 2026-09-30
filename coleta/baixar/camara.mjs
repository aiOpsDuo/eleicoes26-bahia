// Câmara dos Deputados — Dados Abertos.
//   node coleta/baixar/camara.mjs [--forcar]
// 1. Arquivos anuais (CSV) de votações e proposições, 2019–2026 -> <cache>/camara/arquivos/
// 2. Cota parlamentar (CEAP) Ano-{ano}.csv.zip, 2019–2026         -> <cache>/camara/ceap/
// 3. API: deputados da BA (legislaturas 55–57), detalhe e histórico dos deputados com id no
//    base/candidatos_ids.json                                        -> <cache>/camara/api/
import fs from "node:fs";
import path from "node:path";
import { baixarArquivo, extrairZip, caminho, getApi, configurarApi, candidatosIds, principal, log } from "./lib.mjs";

const ANOS = (process.env.CAMARA_ANOS || "2019,2020,2021,2022,2023,2024,2025,2026").split(",").map(Number);
const ARQ = "https://dadosabertos.camara.leg.br/arquivos";
const API = "https://dadosabertos.camara.leg.br/api/v2";
const TIPOS = {
  votacoes: "camara_votacoes", votacoesVotos: "camara_votacoes", votacoesOrientacoes: "camara_votacoes", votacoesProposicoes: "camara_votacoes",
  proposicoes: "camara_proposicoes", proposicoesAutores: "camara_proposicoes", proposicoesTemas: "camara_proposicoes",
};
configurarApi("camara", { gapMs: 150 });

async function camaraTodos(p) {
  const out = [];
  const q = p + (p.includes("?") ? "&" : "?") + "itens=100";
  for (let pg = 1; ; pg++) {
    const j = await getApi("camara", `${API}${q}&pagina=${pg}`, { chave: "camara_deputados" });
    out.push(...j.dados);
    if (!j.links?.some((l) => l.rel === "next")) break;
  }
  return out;
}

principal(async () => {
  log("== arquivos de votações e proposições");
  for (const ano of ANOS)
    for (const [t, chave] of Object.entries(TIPOS))
      await baixarArquivo(`${ARQ}/${t}/csv/${t}-${ano}.csv`, path.join("camara", "arquivos", `${t}-${ano}.csv`), { chave });

  log("== cota parlamentar (CEAP)");
  for (const ano of ANOS) {
    const { arquivo } = await baixarArquivo(`https://www.camara.leg.br/cotas/Ano-${ano}.csv.zip`, path.join("camara", "ceap", `Ano-${ano}.csv.zip`), { chave: "camara_ceap" });
    extrairZip(arquivo, path.dirname(arquivo), (n) => n === `Ano-${ano}.csv`);
  }

  log("== API: deputados da BA");
  const lista = [];
  for (const leg of [55, 56, 57]) for (const d of await camaraTodos(`/deputados?siglaUf=BA&idLegislatura=${leg}`)) lista.push({ ...d, idLegislatura: leg });
  fs.writeFileSync(caminho("camara", "deputados_ba.json"), JSON.stringify({ fonte: `${API}/deputados?siglaUf=BA&idLegislatura={55,56,57}`, dados: lista }));
  const doJson = [...new Set(Object.values(candidatosIds()).map((c) => c.id_camara).filter(Boolean))];
  // detalhe de todos os deputados BA (55–57; o CPF serve só para conferir o casamento: ferramentas/conferir_ids.py)
  for (const id of new Set([...lista.map((d) => d.id), ...doJson])) await getApi("camara", `${API}/deputados/${id}`, { chave: "camara_deputados" });
  for (const id of doJson) await getApi("camara", `${API}/deputados/${id}/historico`, { chave: "camara_deputados" });
  log(`  ${new Set(lista.map((d) => d.id)).size} deputados BA nas legislaturas 55–57; ${doJson.length} com id no candidatos_ids.json`);
});
