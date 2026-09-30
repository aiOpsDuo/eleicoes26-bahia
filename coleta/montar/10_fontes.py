"""Tabela `fonte`: catálogo de base/fontes.json (id = posição na lista) + data de coleta tirada do
cache da coleta (<cache>/_fontes/<chave>.json, gravado pelos scripts de coleta/baixar)."""
import os, datetime
from lib import work, BASE, cache, ler_json

cat = ler_json(os.path.join(BASE, "fontes.json"))["fontes"]
rows, sem = [], []
for i, f in enumerate(cat, start=1):
    p = cache("_fontes", f"{f['chave']}.json")
    dt = ler_json(p)["consultado_em"][:10] if os.path.exists(p) else f.get("coletado_em")
    if not dt:
        sem.append(f["chave"])
        dt = datetime.date.today().isoformat()
    rows.append((i, f["chave"], f["nome"], f["url"], dt, f["descricao"], f["licenca"]))
c = work()
c.execute("create or replace table saida.fonte (id integer, chave varchar, nome varchar, url varchar, coletado_em date, descricao varchar, licenca varchar)")
c.executemany("insert into saida.fonte values (?,?,?,?,?,?,?)", rows)
print("fontes:", len(rows), "| sem registro de coleta no cache (data de hoje):", sem or "nenhuma")
