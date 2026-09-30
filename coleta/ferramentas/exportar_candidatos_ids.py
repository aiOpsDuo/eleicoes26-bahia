"""Exporta o casamento de identidades de um banco ba2026 já carregado para
coleta/base/candidatos_ids.json (o ponto de partida versionado da coleta).

Uso (depois de revisar/corrigir ids direto no banco ou no JSON):
    python coleta/ferramentas/exportar_candidatos_ids.py [--dsn "host=/tmp dbname=ba2026"]

O JSON guarda, por candidatura de 2026 (chave = SQ_CANDIDATO do TSE):
  slug (estável, usado nas URLs), nome_urna/cargo (só para leitura humana),
  id_camara, id_senado, id_alba, cods_autor_emenda (Portal da Transparência e
  Transferegov), nome_ceaps (grafia do senador no arquivo CEAPS) e `casamento`
  (como cada id foi obtido). Nunca guarda CPF.
"""
import os, sys, json, datetime
import psycopg

AQUI = os.path.dirname(os.path.abspath(__file__))
SAIDA = os.path.join(AQUI, "..", "base", "candidatos_ids.json")
DSN = os.environ.get("BA2026_DSN", "host=/tmp port=5432 dbname=ba2026 user=pedrostriquer")
if "--dsn" in sys.argv:
    DSN = sys.argv[sys.argv.index("--dsn") + 1]
CARGOS = ("senador", "suplente", "deputado_federal", "deputado_estadual")

def limpa(c):
    return {k: v for k, v in c.items() if v is not None}


with psycopg.connect(DSN) as pg:
    rows = pg.execute("""select id, sq_candidato_2026, slug, nome_urna, cargo, id_camara, id_senado, id_alba, cods_autor_emenda
                         from candidato where cargo = any(%s) and sq_candidato_2026 is not null order by cargo, slug""", [list(CARGOS)]).fetchall()
    cas = {}
    for cid, origem, metodo, conf, obs in pg.execute(
            "select candidato_id, origem, metodo, confianca, observacao from etl_casamento where candidato_id is not null").fetchall():
        if origem in ("camara", "senado", "alba"):
            cas.setdefault(cid, {})[origem] = limpa({"metodo": metodo, "confianca": conf, "obs": obs})

anterior = {}
if os.path.exists(SAIDA):
    anterior = json.load(open(SAIDA)).get("candidatos", {})

out = {}
for cid, sq, slug, nome, cargo, idc, ids, ida, cods in rows:
    d = {"slug": slug, "nome_urna": nome, "cargo": cargo}
    if idc: d["id_camara"] = idc
    if ids: d["id_senado"] = ids
    if ida: d["id_alba"] = ida
    if cods: d["cods_autor_emenda"] = sorted(set(cods), key=lambda x: (len(x), x))
    if ids:
        d["nome_ceaps"] = (anterior.get(sq, {}).get("nome_ceaps")
                           or __import__("unicodedata").normalize("NFD", nome).encode("ascii", "ignore").decode().upper())
    if cid in cas:
        d["casamento"] = cas[cid]
    elif anterior.get(sq, {}).get("casamento"):
        d["casamento"] = anterior[sq]["casamento"]
    out[sq] = d

doc = {
    "descricao": ("Casamento de identidades por candidatura de 2026 (BA): SQ_CANDIDATO do TSE -> slug do site e ids oficiais "
                  "(Câmara dos Deputados, Senado Federal, portal da ALBA, códigos de autor de emenda do Portal da Transparência "
                  "/ Transferegov). Ponto de partida da coleta: coleta/montar/20_candidatos.py lê este arquivo. "
                  "Candidaturas novas (fora do arquivo) recebem slug calculado e nenhum id até alguém revisar. Sem CPF."),
    "gerado_em": datetime.date.today().isoformat(),
    "cargos": list(CARGOS),
    "candidatos": out,
}
# uma candidatura por linha: arquivo pequeno e diff legível
with open(SAIDA, "w") as f:
    cab = {k: v for k, v in doc.items() if k != "candidatos"}
    f.write(json.dumps(cab, ensure_ascii=False, indent=1)[:-2] + ',\n "candidatos": {\n')
    itens = list(out.items())
    for i, (sq, d) in enumerate(itens):
        f.write(f'  {json.dumps(sq)}: {json.dumps(d, ensure_ascii=False)}' + (",\n" if i < len(itens) - 1 else "\n"))
    f.write(" }\n}\n")
print(f"{len(out)} candidaturas -> {os.path.relpath(SAIDA)} ({os.path.getsize(SAIDA)/1024:.0f} KB)")
