"""Reaproveita arquivos oficiais já baixados em outras pastas para montar o cache da coleta
(<COLETA_CACHE>, padrão .cache) sem baixar tudo de novo.

    python coleta/ferramentas/semear_cache.py --de /pasta/com/downloads [--de outra] [--copiar] [--simular]

Procura, recursivamente, arquivos com os MESMOS nomes publicados pelas fontes oficiais (zips do TSE,
CSVs da Câmara, CEAP, CEAPS, arquivo UNICO de emendas, CEIS/CNEP, respostas de API guardadas como
{url, consultado_em, dados}) e cria links simbólicos (ou cópias, com --copiar) no lugar que os scripts
de download esperam, cada um com o .meta.json (url oficial + data de coleta = data do arquivo).
Quando o mesmo nome aparece em mais de um lugar, fica o arquivo mais recente.
CSVs que já foram convertidos para UTF-8 são ignorados (os scripts esperam o arquivo como publicado).
Nada aqui é obrigatório: sem semear, `run_all.sh` baixa tudo das fontes.
"""
import os, re, sys, json, shutil, hashlib, datetime

AQUI = os.path.dirname(os.path.abspath(__file__))
APP = os.path.abspath(os.path.join(AQUI, "..", ".."))
CACHE = os.path.abspath(os.environ.get("COLETA_CACHE", os.path.join(APP, ".cache")))
ODS = "https://cdn.tse.jus.br/estatistica/sead/odsele"
TSE_ZIP = {
    r"consulta_cand_(\d{4})\.zip": ODS + "/consulta_cand/{0}",
    r"bem_candidato_(\d{4})\.zip": ODS + "/bem_candidato/{0}",
    r"consulta_cand_complementar_2026\.zip": ODS + "/consulta_cand_complementar/{0}",
    r"rede_social_candidato_2026\.zip": ODS + "/consulta_cand/{0}",
    r"consulta_coligacao_2026\.zip": ODS + "/consulta_coligacao/{0}",
    r"consulta_vagas_2026\.zip": ODS + "/consulta_vagas/{0}",
    r"pesquisa_eleitoral_2026\.zip": ODS + "/pesquisa_eleitoral/{0}",
    r"votacao_candidato_munzona_2022\.zip": ODS + "/votacao_candidato_munzona/{0}",
    r"perfil_eleitorado_2026\.zip": ODS + "/perfil_eleitorado/{0}",
    r"prestacao_de_contas_eleitorais_candidatos_(\d{4})\.zip": ODS + "/prestacao_contas/{0}",
    r"foto_cand2026_BA_div\.zip": "https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2026/fotos/{0}",
}
TSE_CSV = [  # (regex do membro, zip de origem)
    (r"consulta_cand_(\d{4})_BA\.csv", "consulta_cand/consulta_cand_{1}.zip"),
    (r"bem_candidato_(\d{4})_BA\.csv", "bem_candidato/bem_candidato_{1}.zip"),
    (r"consulta_cand_complementar_2026_BA\.csv", "consulta_cand_complementar/consulta_cand_complementar_2026.zip"),
    (r"rede_social_candidato_2026_BA\.csv", "consulta_cand/rede_social_candidato_2026.zip"),
    (r"consulta_coligacao_2026_BA\.csv", "consulta_coligacao/consulta_coligacao_2026.zip"),
    (r"consulta_vagas_2026_BA\.csv", "consulta_vagas/consulta_vagas_2026.zip"),
    (r"pesquisa_eleitoral_2026_BA\.csv", "pesquisa_eleitoral/pesquisa_eleitoral_2026.zip"),
    (r"votacao_candidato_munzona_2022_BA\.csv", "votacao_candidato_munzona/votacao_candidato_munzona_2022.zip"),
    (r"perfil_eleitorado_2026_BA\.csv", "perfil_eleitorado/perfil_eleitorado_2026.zip"),
    (r"(?:receitas|despesas_contratadas|despesas_pagas)_candidatos_(\d{4})_BA\.csv", "prestacao_contas/prestacao_de_contas_eleitorais_candidatos_{1}.zip"),
]
CAMARA_ARQ = r"(votacoes|votacoesVotos|votacoesOrientacoes|votacoesProposicoes|proposicoes|proposicoesAutores|proposicoesTemas)-(\d{4})\.csv"
API_GRUPOS = {"camara", "senado", "transferegov", "ibge"}


def eh_utf8_convertido(p):
    """True se o CSV decodifica como UTF-8 e tem acentos (i.e., foi convertido; o original é latin-1)."""
    with open(p, "rb") as f:
        b = f.read(4 << 20)
    try:
        s = b.decode("utf-8")
    except UnicodeDecodeError:
        return False
    return any(ord(ch) > 127 for ch in s)


def mtime_iso(p):
    return datetime.datetime.fromtimestamp(os.path.getmtime(p), datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def destinos(p):
    """(destino relativo ao cache, url oficial, meta extra) para um arquivo, ou None."""
    n = os.path.basename(p)
    for rx, url in TSE_ZIP.items():
        if re.fullmatch(rx, n):
            return os.path.join("tse", "zip", n), url.format(n), {}
    for rx, z in TSE_CSV:
        m = re.fullmatch(rx, n)
        if m:
            if eh_utf8_convertido(p):
                return None
            url = ODS + "/" + z.replace("{1}", m.group(1) if m.groups() else "")
            return os.path.join("tse", "csv", n), url, {"membro": n}
    m = re.fullmatch(CAMARA_ARQ, n)
    if m:
        return os.path.join("camara", "arquivos", n), f"https://dadosabertos.camara.leg.br/arquivos/{m.group(1)}/csv/{n}", {}
    m = re.fullmatch(r"(?:Ano-(\d{4})\.csv\.zip|ceap_(\d{4})\.zip)", n)
    if m:
        a = m.group(1) or m.group(2)
        return os.path.join("camara", "ceap", f"Ano-{a}.csv.zip"), f"https://www.camara.leg.br/cotas/Ano-{a}.csv.zip", {}
    m = re.fullmatch(r"Ano-(\d{4})\.csv", n)
    if m:
        return os.path.join("camara", "ceap", n), f"https://www.camara.leg.br/cotas/Ano-{m.group(1)}.csv.zip", {"membro": n}
    m = re.fullmatch(r"(?:despesa_ceaps|ceaps)_(\d{4})\.csv", n)
    if m:
        if eh_utf8_convertido(p):
            return None
        return (os.path.join("senado", "ceaps", f"despesa_ceaps_{m.group(1)}.csv"),
                f"https://www.senado.leg.br/transparencia/LAI/verba/despesa_ceaps_{m.group(1)}.csv", {})
    if n in ("emendas.zip", "EmendasParlamentares.zip"):
        return os.path.join("portal", "EmendasParlamentares.zip"), "https://portaldatransparencia.gov.br/download-de-dados/emendas-parlamentares/UNICO", {}
    if re.fullmatch(r"EmendasParlamentares(_PorFavorecido|_Convenios)?\.csv", n):
        return os.path.join("portal", "emendas", n), "https://portaldatransparencia.gov.br/download-de-dados/emendas-parlamentares/UNICO", {"membro": n}
    m = re.fullmatch(r"(ceis|cnep)\.zip", n, re.I)
    if m:
        t = m.group(1).lower()
        irmao = [x for x in os.listdir(os.path.dirname(p)) if re.fullmatch(rf"\d{{8}}_{t.upper()}\.csv", x)]
        data = irmao[0][:8] if irmao else mtime_iso(p)[:10].replace("-", "")
        return os.path.join("portal", "sancoes", f"{t}.zip"), f"https://portaldatransparencia.gov.br/download-de-dados/{t}/{data}", {}
    m = re.fullmatch(r"(\d{8})_(CEIS|CNEP)\.csv", n)
    if m:
        t = m.group(2).lower()
        return os.path.join("portal", "sancoes", t, n), f"https://portaldatransparencia.gov.br/download-de-dados/{t}/{m.group(1)}", {"membro": n}
    grupo = os.path.basename(os.path.dirname(p))
    if grupo in API_GRUPOS and re.fullmatch(r"[0-9a-f]{16}\.json", n):
        return os.path.join(grupo, "api", n), None, {"api": True}
    if n == "despesa-verba-alba.csv":
        return os.path.join("alba", "verba.csv"), "https://www.al.ba.gov.br/transparencia/verbas-idenizatorias", {"alba": True}
    if n == "deputado-alba.csv":
        return os.path.join("alba", "deputados.csv"), "https://www.al.ba.gov.br/transparencia/verbas-idenizatorias", {"alba_roster": True}
    return None


def main():
    dirs = [os.path.abspath(sys.argv[i + 1]) for i, a in enumerate(sys.argv) if a == "--de"]
    copiar, simular = "--copiar" in sys.argv, "--simular" in sys.argv
    if not dirs:
        print(__doc__); sys.exit(1)
    achados = {}
    for d in dirs:
        for raiz, subdirs, arqs in os.walk(d):
            subdirs[:] = [s for s in subdirs if s not in ("node_modules", ".git", ".venv", ".cache")]
            for a in arqs:
                p = os.path.join(raiz, a)
                if p.startswith(CACHE):
                    continue
                r = destinos(p)
                if not r:
                    continue
                dest = r[0]
                if dest not in achados or os.path.getmtime(p) > os.path.getmtime(achados[dest][0]):
                    achados[dest] = (p, r[1], r[2])
    n = {}
    for dest, (orig, url, extra) in sorted(achados.items()):
        alvo = os.path.join(CACHE, dest)
        grupo = dest.split(os.sep)[0]
        n[grupo] = n.get(grupo, 0) + 1
        if simular:
            continue
        os.makedirs(os.path.dirname(alvo), exist_ok=True)
        if os.path.lexists(alvo):
            os.remove(alvo)
        if extra.get("alba_roster"):  # id_alba;nome;... -> id_alba;nome
            with open(orig, encoding="utf-8") as f, open(alvo, "w", encoding="utf-8") as g:
                for i, linha in enumerate(f):
                    g.write(";".join(linha.rstrip("\n").split(";")[:2]) + "\n")
        elif copiar:
            shutil.copy2(orig, alvo)
        else:
            os.symlink(orig, alvo)
        if extra.get("api"):
            j = json.load(open(orig))
            h = hashlib.sha1(j["url"].encode()).hexdigest()[:16]
            if h + ".json" != os.path.basename(orig):  # nome não bate com o hash da URL: renomeia
                os.remove(alvo)
                alvo = os.path.join(os.path.dirname(alvo), h + ".json")
                (shutil.copy2 if copiar else os.symlink)(orig, alvo)
            continue
        meta = {"url": url, "consultado_em": mtime_iso(orig), "bytes": os.path.getsize(orig), "reaproveitado_de": orig}
        if extra.get("alba"):
            import csv
            with open(orig, encoding="utf-8", newline="") as f:
                linhas = list(csv.DictReader(f, delimiter=";"))
            ult = max((l.get("dt_coleta") or "" for l in linhas), default="")
            meta.update(consultado_em=ult or meta["consultado_em"], linhas=len(linhas))
        meta.update({k: v for k, v in extra.items() if k == "membro"})
        with open(alvo + ".meta.json", "w") as f:
            json.dump(meta, f, indent=1)
    print(("(simulação) " if simular else "") + f"cache: {CACHE}")
    for g, k in sorted(n.items()):
        print(f"  {g:14s} {k:>6} arquivos")


if __name__ == "__main__":
    main()
