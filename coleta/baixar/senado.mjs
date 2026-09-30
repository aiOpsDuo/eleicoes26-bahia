// Senado Federal — CEAPS (arquivos anuais) e Dados Abertos (API).
//   node coleta/baixar/senado.mjs [--forcar]
// 1. CEAPS despesa_ceaps_{ano}.csv, 2019–2026 -> <cache>/senado/ceaps/
// 2. API (para os senadores com id_senado no base/candidatos_ids.json) -> <cache>/senado/api/
//    senadores em exercício da BA, mandatos, filiações, votações nominais (por semestre) e matérias de autoria.
import path from "node:path";
import { baixarArquivo, getApi, configurarApi, candidatosIds, principal, log } from "./lib.mjs";

const ANOS = (process.env.SENADO_ANOS || "2019,2020,2021,2022,2023,2024,2025,2026").split(",").map(Number);
const API = "https://legis.senado.leg.br/dadosabertos";
configurarApi("senado", { gapMs: 300 });

principal(async () => {
  log("== CEAPS");
  for (const ano of ANOS)
    await baixarArquivo(`https://www.senado.leg.br/transparencia/LAI/verba/despesa_ceaps_${ano}.csv`, path.join("senado", "ceaps", `despesa_ceaps_${ano}.csv`), { chave: "senado_ceaps" });

  log("== API");
  await getApi("senado", `${API}/senador/lista/atual.json?uf=BA`, { chave: "senado_senadores" });
  const sens = Object.values(candidatosIds()).filter((c) => c.id_senado);
  for (const s of sens) {
    const cod = s.id_senado;
    await getApi("senado", `${API}/senador/${cod}/mandatos.json`, { chave: "senado_senadores" });
    await getApi("senado", `${API}/senador/${cod}/filiacoes.json`, { chave: "senado_senadores" });
    for (let a = 2019; a <= Math.max(...ANOS); a++)
      for (const [i, f] of [["01-01", "06-30"], ["07-01", "12-31"]])
        await getApi("senado", `${API}/votacao?codigoParlamentar=${cod}&dataInicio=${a}-${i}&dataFim=${a}-${f}`, { chave: "senado_votacoes" });
    await getApi("senado", `${API}/processo?codigoParlamentarAutor=${cod}`, { chave: "senado_processos" });
    log(`  ${s.nome_urna} (${cod}) ok`);
  }
});
