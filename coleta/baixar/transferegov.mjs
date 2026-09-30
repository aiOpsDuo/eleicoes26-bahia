// Transferegov — Transferências Especiais ("emendas Pix"), API pública (sem chave).
//   node coleta/baixar/transferegov.mjs [--forcar]
// Docs: https://api-publica.transferegov.gestao.gov.br/especiais/docs  (máx. 200 itens por página)
// As tabelas nacionais são paginadas inteiras (respostas cruas em <cache>/transferegov/api/) e o recorte
// da BA (beneficiário com UF = BA) é gravado em <cache>/transferegov/<tabela>_ba.json.
// ~2.600 páginas na primeira vez (~15 min); depois tudo vem do cache.
import fs from "node:fs";
import { getApi, configurarApi, caminho, principal, log } from "./lib.mjs";

const API = "https://api-publica.transferegov.gestao.gov.br/especiais";
const CH = "transferegov_pix";
configurarApi("transferegov", { gapMs: 150 });

async function todos(p, nome) {
  const out = [];
  for (let pg = 1; ; pg++) {
    const j = await getApi("transferegov", `${API}${p}${p.includes("?") ? "&" : "?"}pagina=${pg}&tamanho_da_pagina=200`, { chave: CH });
    out.push(...j.data);
    if (nome && (pg % 100 === 0 || pg === j.total_pages)) log(`  ${nome} ${pg}/${j.total_pages}`);
    if (pg >= j.total_pages || !j.data.length) break;
  }
  return out;
}

principal(async () => {
  const atual = await getApi("transferegov", `${API}/data-atualizacao`, { chave: CH });
  const benef = await todos("/beneficiarios-especiais?uf_beneficiario=BA", "beneficiários BA");
  const idsBenef = new Set(benef.map((b) => b.id_beneficiario));
  const pa = (await todos("/planos-acao-especiais", "planos de ação")).filter((r) => idsBenef.has(r.id_beneficiario));
  const idsPA = new Set(pa.map((r) => r.id_plano_acao));
  const ex = (await todos("/executores-especiais", "executores")).filter((r) => idsPA.has(r.id_plano_acao));
  const idsEx = new Set(ex.map((r) => r.id_executor));
  const tabelas = {
    beneficiarios: benef, planos_acao: pa, executores: ex,
    finalidades: (await todos("/finalidade-especiais", "finalidades")).filter((r) => idsEx.has(r.id_executor)),
    metas: (await todos("/meta-especiais", "metas")).filter((r) => idsEx.has(r.id_executor)),
    relatorios_gestao: (await todos("/relatorios-gestao-especiais", "relatórios de gestão")).filter((r) => idsPA.has(r.id_plano_acao)),
    relatorios_gestao_novos: (await todos("/relatorios-gestao-novos-especiais", "relatórios de gestão (novos)")).filter((r) => idsPA.has(r.id_plano_acao)),
    empenhos: (await todos("/empenhos-especiais", "empenhos")).filter((r) => idsPA.has(r.id_plano_acao)),
  };
  for (const [n, dados] of Object.entries(tabelas)) {
    fs.writeFileSync(caminho("transferegov", `${n}_ba.json`), JSON.stringify({ fonte: API, data_atualizacao_api: atual, n: dados.length, dados }));
    log(`  ${n}: ${dados.length} (BA)`);
  }
});
