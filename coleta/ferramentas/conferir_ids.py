"""Confere base/candidatos_ids.json contra o que a coleta baixou (não altera o JSON: só aponta o que revisar).

    python coleta/ferramentas/conferir_ids.py      (depois de coleta/run_all.sh, ou pelo menos do download + 20_candidatos)

1. id_camara: o CPF do deputado na API da Câmara é o mesmo do registro da candidatura no TSE?
2. Deputados federais da BA (legislaturas 55–57) cujo CPF bate com uma candidatura de 2026 sem id_camara no JSON.
3. id_senado está na lista de senadores da BA? cods_autor_emenda aparecem no arquivo de emendas?
4. id_alba está no seletor do portal da ALBA? Nomes do portal que batem (normalizados) com uma candidatura sem id_alba.
5. Candidaturas do TSE que não estão no JSON (ganharam slug calculado).
O CPF só é lido em memória; nada é gravado.
"""
import os, sys, csv, glob, json

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "montar"))
from lib import work, cache, api, ler_json, candidatos_ids, norm  # noqa: E402

ids = candidatos_ids()
c = work(read_only=True)
cands = {sq: (cid, nome, cargo, cpf) for cid, sq, nome, cargo, cpf in
         c.execute("select id, sq_candidato_2026, nome_urna, cargo, cpf_interno from saida.candidato").fetchall()}
por_cpf = {v[3]: sq for sq, v in cands.items() if v[3]}
avisos = 0


def aviso(msg):
    global avisos
    avisos += 1
    print("  REVISAR:", msg)


print("# 1-2. Câmara")
deps = {d["id"]: d for d in ler_json(cache("camara", "deputados_ba.json"))["dados"]}
for id_camara in sorted(deps):
    det = (api("camara", f"https://dadosabertos.camara.leg.br/api/v2/deputados/{id_camara}") or {}).get("dados") or {}
    sq = por_cpf.get(det.get("cpf"))
    no_json = [s for s, d in ids.items() if d.get("id_camara") == id_camara]
    if no_json and sq and no_json[0] != sq:
        aviso(f"id_camara {id_camara} ({deps[id_camara]['nome']}) está no JSON em {no_json[0]}, mas o CPF aponta para {sq}")
    elif no_json and not sq:
        aviso(f"id_camara {id_camara} ({deps[id_camara]['nome']}) no JSON ({no_json[0]}), mas o CPF da Câmara não bate com nenhuma candidatura")
    elif sq and not no_json:
        aviso(f"deputado {deps[id_camara]['nome']} (id_camara {id_camara}) é a candidatura {sq} ({cands[sq][1]}, {cands[sq][2]}) — falta no JSON")

print("# 3. Senado e códigos de autor")
sen = api("senado", "https://legis.senado.leg.br/dadosabertos/senador/lista/atual.json?uf=BA") or {}
p = ((sen.get("ListaParlamentarEmExercicio") or {}).get("Parlamentares") or {}).get("Parlamentar") or []
sen_ba = {int(x["IdentificacaoParlamentar"]["CodigoParlamentar"]): x["IdentificacaoParlamentar"]["NomeParlamentar"] for x in (p if isinstance(p, list) else [p])}
for sq, d in ids.items():
    if d.get("id_senado") and d["id_senado"] not in sen_ba:
        print(f"  info: id_senado {d['id_senado']} ({d['nome_urna']}) não está em exercício pela BA hoje")
for cod, nome in sen_ba.items():
    if not any(d.get("id_senado") == cod for d in ids.values()):
        alvo = [sq for sq, v in cands.items() if norm(v[1]) == norm(nome)]
        if alvo:
            aviso(f"senador {nome} ({cod}) parece ser a candidatura {alvo[0]} — falta id_senado no JSON")
emendas = cache("portal", "emendas", "EmendasParlamentares.csv")
if os.path.exists(emendas):
    autores = {}
    with open(emendas, encoding="latin-1", newline="") as f:
        for r in csv.DictReader(f, delimiter=";"):
            autores[r["Código do Autor da Emenda"]] = r["Nome do Autor da Emenda"]
    tg = {str(p["codigo_parlamentar_emenda_plano_acao"]) for p in ler_json(cache("transferegov", "planos_acao_ba.json"))["dados"]}
    for sq, d in ids.items():
        for cod in d.get("cods_autor_emenda", []):
            if cod not in autores and cod not in tg:
                aviso(f"código de autor {cod} ({d['nome_urna']}) não aparece nas emendas nem no Transferegov")
    for cod, nome in autores.items():
        alvo = [sq for sq, v in cands.items() if norm(v[1]) == norm(nome) and not ids.get(sq, {}).get("cods_autor_emenda")]
        if alvo and cands[alvo[0]][2] in ("senador", "deputado_federal"):
            aviso(f"autor de emenda '{nome}' ({cod}) tem o mesmo nome da candidatura {alvo[0]} ({cands[alvo[0]][2]}) sem código — conferir")

print("# 4. ALBA")
p = cache("alba", "deputados.csv")
if os.path.exists(p):
    with open(p, encoding="utf-8", newline="") as f:
        roster = {int(r["id_alba"]): r["nome"] for r in csv.DictReader(f, delimiter=";")}
    for sq, d in ids.items():
        if d.get("id_alba") and d["id_alba"] not in roster:
            aviso(f"id_alba {d['id_alba']} ({d['nome_urna']}) não está no seletor do portal da ALBA")
    usados = {d.get("id_alba") for d in ids.values()}
    for ida, nome in roster.items():
        if ida in usados:
            continue
        alvo = [sq for sq, v in cands.items() if norm(v[1]) == norm(nome)]
        if len(alvo) == 1:
            aviso(f"deputado(a) estadual {nome} (id_alba {ida}) tem o mesmo nome da candidatura {alvo[0]} ({cands[alvo[0]][2]}) — conferir")

print("# 5. Candidaturas fora do JSON")
for sq, v in cands.items():
    if sq not in ids:
        aviso(f"{sq} {v[1]} ({v[2]}) não está no candidatos_ids.json")
print(f"\n{avisos} itens para revisar" if avisos else "\nnada a revisar")
