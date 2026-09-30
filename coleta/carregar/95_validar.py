"""Validações pós-carga do banco ba2026 (sai com código 1 se alguma falhar)."""
import os, sys, json
import psycopg

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "montar"))
from lib import PG_DSN, BASE, work  # noqa: E402

pg = psycopg.connect(PG_DSN)
q = lambda s, p=None: pg.execute(s, p).fetchall()
ok = True


def check(nome, cond, info=""):
    global ok
    print(("OK   " if cond else "FALHA"), nome, info)
    ok &= bool(cond)


print("\n# Candidatos por cargo")
for r in q("select cargo, count(*), count(*) filter (where mandato_atual is not null) from candidato group by 1 order by 1"):
    print(f"  {r[0]:20s} {r[1]:>5}  (com mandato atual: {r[2]})")

print("\n# Cobertura por cargo (nº de candidatos com a seção)")
cols = ["tem_patrimonio", "tem_campanha_2026", "tem_emendas", "tem_cota", "tem_votos", "tem_proposicoes", "tem_mandato_atual",
        "(n_sancoes>0)", "(foto_url is not null)", "(municipio_base is not null)"]
print("  cargo | total | " + " | ".join(c.replace("tem_", "").strip("()") for c in cols))
for r in q(f"select cargo, count(*), {', '.join(f'count(*) filter (where {x})' for x in cols)} from candidato_resumo group by 1 order by 1"):
    print("  " + " | ".join(str(x) for x in r))

print("\n# Checagens")
check("Só senador, suplente, deputado federal e deputado estadual",
      {r[0] for r in q("select distinct cargo from candidato")} <= {"senador", "suplente", "deputado_federal", "deputado_estadual"})
r = q("""select sum(e.empenhado), sum(e.pago) from emenda e join candidato k on k.id = e.candidato_id
         where k.nome_completo ilike 'felix de almeida mendon%' and e.ano = 2024""")[0]
check("Félix Mendonça Júnior: emendas 2024 = R$ 37.872.992,39 empenhado", r[0] is not None and abs(float(r[0]) - 37872992.39) < 0.005,
      f"empenhado={r[0]} pago={r[1]}")
r = q("""select k.nome_urna, count(*), sum(c.valor_liquido) from cota_despesa c join candidato k on k.id = c.candidato_id
         where c.casa = 'senado' group by 1 order by 1""")
check("Senador com cota (CEAPS)", len(r) >= 1, r)
r = q("""select count(distinct c.candidato_id), sum(c.valor_liquido), count(*) filter (where c.url_documento like 'https://www.al.ba.gov.br/%')
         from cota_despesa c where c.casa = 'alba'""")[0]
check("Deputados estaduais com verba ALBA (e PDF da nota)", r[0] >= 40 and r[2] > 0, r)
ex = q("""select k.nome_urna, count(*), sum(c.valor_liquido) from cota_despesa c join candidato k on k.id = c.candidato_id
          where c.casa = 'alba' and k.cargo = 'deputado_estadual' group by 1 order by 3 desc limit 1""")
print("       exemplo ALBA:", ex)
chaves = {f["chave"] for f in json.load(open(os.path.join(BASE, "fontes.json")))["fontes"]}
f_banco = {r[0] for r in q("select chave from fonte")}
check("Tabela fonte = catálogo oficial de base/fontes.json", f_banco == chaves, f_banco ^ chaves)
OFICIAIS = ("tse.jus.br", "camara.leg.br", "senado.leg.br", "senado.gov.br", "portaldatransparencia.gov.br", "transferegov.gestao.gov.br",
            "al.ba.gov.br", "ibge.gov.br")
hosts = set()
for t, col in q("""select table_name, column_name from information_schema.columns c join information_schema.tables t using (table_schema, table_name)
                   where table_schema = 'public' and t.table_type = 'BASE TABLE' and table_name <> 'candidato_rede_social'  -- redes declaradas ao TSE
                     and (column_name in ('url', 'fonte_url', 'url_documento', 'foto_fonte_url', 'url_api', 'url_inteiro_teor')
                         or (table_name = 'candidato' and column_name = 'foto_url'))"""):
    hosts |= {h for (h,) in q(f"select distinct substring({col} from '^https?://([^/]+)') from {t} where {col} ~ '^https?://'")}
fora = sorted(h for h in hosts if not any(h == d or h.endswith("." + d) for d in OFICIAIS))
check("Todos os links (fonte e documentos) são de domínios oficiais", not fora, fora)
origens = q("""select 'trajetoria', origem from trajetoria union select 'patrimonio', origem from patrimonio union select 'campanha_resumo', origem from campanha_resumo
               union select 'campanha_doador', origem from campanha_doador union select 'ponto_atencao', origem from ponto_atencao""")
check("Nenhuma linha com origem referência/pesquisa", not [o for o in origens if o[1] in ("referencia", "pesquisa")], origens)
vazias = [t for t in ("candidato_referencia", "gestao_gasto", "relatorio_pesquisa", "ato_executivo", "gasto_cartao_executivo",
                      "cota_resumo_referencia", "ponto_atencao", "processo", "candidatura_snapshot") if q(f"select count(*) from {t}")[0][0]]
check("Tabelas de conteúdo removido estão vazias", not vazias, vazias)
check("Nenhum id de votação/proposição da referência", not q("select 1 from votacao where id like 'ref:%' union all select 1 from proposicao where id like 'ref:%'"))
check("Nenhuma coluna chamada *cpf*", not q("select table_name, column_name from information_schema.columns where table_schema = 'public' and column_name ilike '%cpf%'"))

cpfs = {r[0] for r in work(read_only=True).execute("select cpf_interno from saida.candidato where cpf_interno is not null").fetchall()}
achou = []
for t, col in q("""select table_name, column_name from information_schema.columns c join information_schema.tables t using (table_schema, table_name)
                   where table_schema = 'public' and t.table_type = 'BASE TABLE' and data_type in ('text', 'jsonb', 'character varying')"""):
    for (m,) in q(f"""select distinct regexp_replace(m[1], '\\D', '', 'g') from {t}, regexp_matches({col}::text, '(\\d{{3}}\\.?\\d{{3}}\\.?\\d{{3}}-?\\d{{2}})', 'g') m"""):
        if m in cpfs:
            achou.append((t, col))
check("Nenhum CPF de candidato aparece em texto", not achou, achou[:5])
doc_pf = q("""select 'campanha', count(*) from campanha_despesa where fornecedor_pf and regexp_replace(coalesce(numero_documento, ''), '\\D', '', 'g') ~ '^\\d{11}$'
              union all select 'cota', count(*) from cota_despesa where fornecedor_pf and regexp_replace(coalesce(numero_documento, ''), '\\D', '', 'g') ~ '^\\d{11}$'""")
check("Nenhum nº de documento de fornecedor PF com 11 dígitos (CPF)", all(n == 0 for _, n in doc_pf), doc_pf)
sem_fonte = []
for (t,) in q("select table_name from information_schema.columns where table_schema = 'public' and column_name = 'fonte_id'"):
    n = q(f"select count(*) from {t} where fonte_id is null")[0][0]
    if n:
        sem_fonte.append((t, n))
check("Toda linha de fato tem fonte_id", not sem_fonte, sem_fonte)
sem = q("select count(*) from etl_casamento where metodo = 'sem_match'")[0][0]
print(f"\ncandidaturas fora de base/candidatos_ids.json (slug calculado, sem ids): {sem}")
print("\nRESULTADO:", "tudo OK" if ok else "HÁ FALHAS")
sys.exit(0 if ok else 1)
