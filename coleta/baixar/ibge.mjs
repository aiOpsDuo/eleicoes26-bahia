// IBGE — estimativa de população 2024 dos municípios da BA (API de agregados / SIDRA, tabela 6579, variável 9324).
//   node coleta/baixar/ibge.mjs [--forcar]
import fs from "node:fs";
import { getApi, configurarApi, caminho, principal, log } from "./lib.mjs";

const URL = "https://servicodados.ibge.gov.br/api/v3/agregados/6579/periodos/2024/variaveis/9324?localidades=N6[N3[29]]";
configurarApi("ibge", { gapMs: 300 });

principal(async () => {
  const j = await getApi("ibge", URL, { chave: "ibge_pop" });
  const dados = j[0].resultados[0].series.map((s) => ({ ibge: s.localidade.id, municipio: s.localidade.nome.replace(/ - BA$/, ""), pop2024: +Object.values(s.serie)[0] || null }));
  fs.writeFileSync(caminho("ibge", "populacao_ba.json"), JSON.stringify({ fonte: URL, dados }));
  log(`  ${dados.length} municípios`);
});
