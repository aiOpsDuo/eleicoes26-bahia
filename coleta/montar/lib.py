"""Utilitários da montagem do banco ba2026.

A montagem lê só o cache da coleta (<COLETA_CACHE>, padrão .cache) e os JSONs-base
(coleta/base/), monta todas as tabelas finais num DuckDB de trabalho
(<cache>/trabalho.duckdb, schema `saida`) e depois o carregar/90_carregar_pg.py copia para o Postgres.
CPF só existe dentro do DuckDB de trabalho (para casar registros); nunca é copiado para o Postgres.
"""
import os, re, json, hashlib, unicodedata
import duckdb

AQUI = os.path.dirname(os.path.abspath(__file__))
APP = os.path.abspath(os.path.join(AQUI, "..", ".."))
BASE = os.path.join(APP, "coleta", "base")
CACHE = os.path.abspath(os.environ.get("COLETA_CACHE", os.path.join(APP, ".cache")))
WORK_DUCKDB = os.path.join(CACHE, "trabalho.duckdb")
PG_DSN = os.environ.get("BA2026_DSN", "host=/tmp port=5432 dbname=ba2026 user=pedrostriquer")
DATA_REFERENCIA = os.environ.get("DATA_REFERENCIA", "2026-09-30")  # idade calculada nesta data
CARGOS = {"5": "senador", "9": "suplente", "10": "suplente", "6": "deputado_federal", "7": "deputado_estadual"}


def cache(*partes):
    return os.path.join(CACHE, *partes)


def exige(p):
    if not os.path.exists(p):
        raise SystemExit(f"falta {p} — rode antes os scripts de coleta/baixar (ver coleta/COLETA.md)")
    return p


def work(read_only=False):
    os.makedirs(CACHE, exist_ok=True)
    c = duckdb.connect(WORK_DUCKDB, read_only=read_only)
    if not read_only:
        c.execute("create schema if not exists saida")
        c.execute("create schema if not exists tmp")
    return c


def csv_sql(caminho, encoding="latin-1", delim=";", **extra):
    """Expressão DuckDB que lê um CSV como texto (padrão: arquivos do TSE, latin-1 e ';')."""
    opts = [f"delim='{delim}'", "header=true", "all_varchar=true", "quote='\"'"]
    if encoding:
        opts.append(f"encoding='{encoding}'")
    opts += [f"{k}={v}" for k, v in extra.items()]
    arq = caminho if isinstance(caminho, str) else "[" + ",".join(f"'{p}'" for p in caminho) + "]"
    if isinstance(caminho, str):
        arq = f"'{caminho}'"
    return f"read_csv({arq}, {', '.join(opts)})"


def tse_csv(nome, **extra):
    return csv_sql(exige(cache("tse", "csv", nome)), **extra)


def api(grupo, url):
    """Resposta de API guardada pela coleta (<cache>/<grupo>/api/<sha1(url)[:16]>.json) ou None."""
    p = cache(grupo, "api", hashlib.sha1(url.encode()).hexdigest()[:16] + ".json")
    if not os.path.exists(p):
        return None
    with open(p) as f:
        return json.load(f)["dados"]


def ler_json(p):
    with open(p) as f:
        return json.load(f)


def candidatos_ids():
    return ler_json(os.path.join(BASE, "candidatos_ids.json"))["candidatos"]


def norm(s):
    """nome normalizado: sem acento, minúsculo, só letras/dígitos e espaço simples."""
    if s is None:
        return None
    s = unicodedata.normalize("NFD", str(s)).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return re.sub(r"\s+", " ", s)


def slugify(s):
    return (norm(s) or "").replace(" ", "-")


MINUSC = {"de", "da", "do", "das", "dos", "e", "di", "du", "del"}


def titulo(s):
    """Caixa de título pt-BR para nomes do TSE (em caixa alta)."""
    if s is None:
        return None
    if s != s.upper():
        return s  # já vem com caixa mista
    out = []
    for i, w in enumerate(s.split()):
        lw = w.lower()
        base = re.sub(r"[^a-zà-ú]", "", lw)
        if i > 0 and lw in MINUSC:
            out.append(lw)
        elif base in ("dr", "dra", "sr", "sra", "pr", "jr", "prof", "profa", "sgt", "cel", "cap", "ten", "ver", "pe"):
            out.append(w[:1].upper() + lw[1:])
        elif lw in ("ii", "iii", "iv"):
            out.append(w.upper())
        elif base and not re.search(r"[aeiouáéíóúâêôãõà]", base) and len(base) <= 4:
            out.append(w.upper())  # siglas: ACM, PM, PT
        else:
            out.append("-".join(p[:1].upper() + p[1:] for p in lw.split("-")))
    return " ".join(out)


def so_cnpj(doc):
    d = re.sub(r"\D", "", doc or "")
    return d if len(d) == 14 else None


def eh_pf(doc):
    return len(re.sub(r"\D", "", doc or "")) == 11


def registra_funcoes(c):
    """Expõe funções Python no DuckDB."""
    try:
        from duckdb.sqltypes import VARCHAR, BOOLEAN
    except ImportError:
        from duckdb.typing import VARCHAR, BOOLEAN
    for nome, f, ret in [("py_norm", norm, VARCHAR), ("py_titulo", titulo, VARCHAR), ("py_slug", slugify, VARCHAR),
                         ("py_cnpj", so_cnpj, VARCHAR), ("py_pf", eh_pf, BOOLEAN)]:
        try:
            c.create_function(nome, f, [VARCHAR], ret, null_handling="special")
        except Exception:
            pass


def fontes_ids(c):
    return dict(c.execute("select chave, id from saida.fonte").fetchall())


# valores monetários: TSE usa vírgula decimal (às vezes com ponto de milhar)
V = lambda col: f"try_cast(replace(replace({col}, '.', ''), ',', '.') as decimal(18,2))"
V_VIRG = lambda col: f"try_cast(replace({col}, ',', '.') as decimal(18,2))"  # sem ponto de milhar
D = lambda col: f"try_strptime({col}, '%d/%m/%Y')::date"
NULO = lambda col: f"nullif(nullif(nullif(nullif({col}, '#NULO'), '#NULO#'), '#NE'), '')"
