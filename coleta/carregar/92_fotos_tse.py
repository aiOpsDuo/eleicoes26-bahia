"""Fotos oficiais do TSE para quem não tem foto da Câmara/Senado (roda no Postgres, depois do 90 e antes do views.sql).

1. Lê o pacote de fotos da BA do cache da coleta (<cache>/tse/zip/foto_cand2026_BA_div.zip, baixado por baixar/tse.mjs).
2. Extrai para web/public/fotos/tse/{SQ_CANDIDATO}.jpg (servidas pelo front em /fotos/tse/...; ~10 MB, 161x225).
3. candidato.foto_url = '/fotos/tse/{sq}.jpg' para quem está sem foto.
Se rodar isolado, depois: REFRESH MATERIALIZED VIEW candidato_resumo;
"""
import os, sys, re, zipfile
import psycopg

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "montar"))
from lib import cache, APP, PG_DSN  # noqa: E402

URL = "https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2026/fotos/foto_cand2026_BA_div.zip"
ZIP = cache("tse", "zip", "foto_cand2026_BA_div.zip")
DEST = os.path.join(APP, "web", "public", "fotos", "tse")
CREDITO = "Foto: TSE — divulgação de candidaturas 2026"

sqs = set()
if os.path.exists(ZIP):
    os.makedirs(DEST, exist_ok=True)
    with zipfile.ZipFile(ZIP) as z:
        for info in z.infolist():
            m = re.match(r"^F[A-Z]{2}(\d+)_div\.(jpe?g)$", os.path.basename(info.filename), re.I)
            if not m:
                continue
            alvo = os.path.join(DEST, f"{m.group(1)}.jpg")
            if not os.path.exists(alvo) or os.path.getsize(alvo) != info.file_size:
                with z.open(info) as src, open(alvo, "wb") as out:
                    out.write(src.read())
            sqs.add(m.group(1))
else:
    print("AVISO: pacote de fotos do TSE não está no cache (rode baixar/tse.mjs); o site mostra as iniciais")
print("fotos TSE disponíveis:", len(sqs))

with psycopg.connect(PG_DSN) as pg:
    n = 0
    for cid, sq in pg.execute("select id, sq_candidato_2026 from candidato where foto_url is null").fetchall():
        if sq in sqs:
            pg.execute("update candidato set foto_url = %s, foto_credito = %s, foto_fonte_url = %s where id = %s",
                       [f"/fotos/tse/{sq}.jpg", CREDITO, URL, cid])
            n += 1
    sem = pg.execute("select count(*) from candidato where foto_url is null").fetchone()[0]
    print(f"foto_url do TSE: {n} | ainda sem foto: {sem}")
