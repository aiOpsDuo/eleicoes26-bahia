"""Copia as tabelas `saida.*` do DuckDB de trabalho (<cache>/trabalho.duckdb) para o Postgres `ba2026`.

- As colunas vêm do Postgres (db/schema.sql é a fonte da verdade); coluna ausente no DuckDB entra
  como NULL; coluna extra no DuckDB (ex.: cpf_interno) é ignorada. Tabela do esquema que a montagem não
  produz fica vazia (ex.: processo, ponto_atencao — ver db/DADOS.md).
- Máscara de CPF: qualquer sequência com formato de CPF (11 dígitos isolados, com ou sem pontuação) em
  colunas de texto livre vira ***CPF*** (ex.: razão social de MEI que embute o CPF do dono). Colunas de
  identificador são poupadas. Depois roda 91_pos_carga.sql.
"""
import os, re, sys, tempfile
import psycopg

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "montar"))
from lib import work, PG_DSN  # noqa: E402

ORDEM = ["fonte", "candidato", "chapa_membro", "candidato_rede_social", "candidato_referencia", "candidatura_snapshot",
         "trajetoria", "mudanca_partido", "votos_municipio_2022", "patrimonio", "bem", "campanha_resumo", "campanha_receita",
         "campanha_doador", "campanha_despesa", "campanha_fornecedor", "campanha_despesa_categoria", "processo", "sancao",
         "ponto_atencao", "votacao", "voto", "proposicao", "emenda", "emenda_favorecido", "emenda_convenio", "emenda_pix",
         "emenda_pix_show", "cota_despesa", "gestao_gasto", "ato_executivo", "gasto_cartao_executivo", "cota_resumo_referencia",
         "relatorio_pesquisa", "municipio", "vaga", "coligacao", "pesquisa_eleitoral", "calendario_eleitoral", "etl_casamento"]
POUPA = re.compile(r"^(id|slug.*|sq_.*|codigo.*|cod_.*|cd_.*|numero.*|id_.*|url.*|.*_url|protocolo|documento|processo|votacao_id|chave|.*_cnpj|nome_origem|chave_origem)$")
SEM_MASCARA = {"fonte", "etl_casamento"}
CPF_RE = r"(^|[^0-9])([0-9]{3}\.?[0-9]{3}\.?[0-9]{3}-?[0-9]{2})([^0-9]|$)"

c = work(read_only=True)
tem = {r[0] for r in c.execute("select table_name from information_schema.tables where table_schema = 'saida'").fetchall()}
tmpdir = tempfile.mkdtemp(prefix="ba2026_")
with psycopg.connect(PG_DSN, autocommit=False) as pg:
    cur = pg.cursor()
    for t in ORDEM:
        cols = cur.execute("""select column_name, data_type from information_schema.columns
                              where table_schema = 'public' and table_name = %s order by ordinal_position""", [t]).fetchall()
        if not cols:
            raise SystemExit(f"tabela {t} não existe no Postgres (rode db/schema.sql)")
        cur.execute(f"truncate {t} cascade")
        if t not in tem:
            print(f"{t:32s} {'(vazia)':>9}")
            continue
        dcols = {r[0] for r in c.execute(f"describe saida.{t}").fetchall()}
        sel = []
        for nome, tipo in cols:
            q = f'"{nome}"'
            if nome not in dcols:
                sel.append(f"null as {nome}")
            elif tipo == "ARRAY":
                sel.append(f"case when {q} is null then null else '{{' || array_to_string(list_transform({q}, x -> '\"' || replace(x, '\"', '') || '\"'), ',') || '}}' end as {nome}")
            elif tipo in ("text", "character varying", "jsonb") and t not in SEM_MASCARA and not POUPA.match(nome):
                sel.append(f"regexp_replace(replace({q}::varchar, chr(0), ''), '{CPF_RE}', '\\1***CPF***\\3', 'g') as {nome}")
            elif tipo in ("text", "character varying", "jsonb"):
                sel.append(f"replace({q}::varchar, chr(0), '') as {nome}")
            else:
                sel.append(f"{q} as {nome}")
        arq = os.path.join(tmpdir, t + ".csv")
        c.execute(f"copy (select {', '.join(sel)} from saida.{t}) to '{arq}' (header false, delimiter ',', quote '\"', escape '\"', nullstr '')")
        with open(arq, "rb") as f, cur.copy(f"copy {t} ({', '.join(n for n, _ in cols)}) from stdin with (format csv, null '')") as cp:
            while chunk := f.read(1 << 20):
                cp.write(chunk)
        n = cur.execute(f"select count(*) from {t}").fetchone()[0]
        print(f"{t:32s} {n:>9}")
        os.remove(arq)
    cur.execute(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "91_pos_carga.sql")).read())
    for (t,) in cur.execute("""select table_name from information_schema.columns
                               where table_schema = 'public' and column_default like 'nextval%' and column_name = 'id'""").fetchall():
        cur.execute(f"select setval(pg_get_serial_sequence('{t}', 'id'), coalesce((select max(id) from {t}), 0) + 1, false)")
    pg.commit()
