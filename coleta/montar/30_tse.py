"""Dados eleitorais e de identidade pública:
- TSE: trajetória (candidaturas na BA em 2006–2022), votos de 2022 por município (e município-base),
  patrimônio e bens (2026 + anos anteriores), prestação de contas 2022/2026, município (eleitorado),
  vagas, coligações, registro de pesquisas e calendário.
- Senado/Câmara (APIs oficiais): mandatos de senador (trajetória) e trocas de partido (filiações do Senado,
  histórico de deputado da Câmara).
- CEIS/CNEP (Portal da Transparência): sanções a pessoas físicas candidatas, pelo CPF.

Candidaturas de anos diferentes são ligadas pelo CPF — só dentro do DuckDB de trabalho.
"""
import os, glob, json
from lib import (work, tse_csv, csv_sql, cache, exige, api, ler_json, registra_funcoes, fontes_ids, norm, NULO, V, D)

ANOS = [int(a) for a in os.environ.get("TSE_ANOS_ANTERIORES", "2006,2010,2014,2018,2022").split(",")]
c = work()
registra_funcoes(c)
fid = dict(fontes_ids(c))
fonte_cand = lambda a: fid.get(f"tse_cand_{a}")
fonte_bens = lambda a: fid.get(f"tse_bens_{a}")

c.execute("create or replace table tmp.k as select id cid, sq_candidato_2026 sq, cpf_interno cpf, cargo, st_declarar_bens, id_camara, id_senado from saida.candidato")

# ------------------------------------------------------------------ candidaturas anteriores (BA)
# Uma linha por SQ (a do maior turno); depois uma por (ano, CPF): a que tem resultado; empate -> SQ mais novo
# (ex.: 2022, candidaturas do PROS refeitas com outro SQ).
arqs = [exige(cache("tse", "csv", f"consulta_cand_{a}_BA.csv")) for a in ANOS]
c.execute(f"""create or replace table tmp.cand_ant_todas as
select ANO_ELEICAO::int ano, SQ_CANDIDATO sq, NR_CPF_CANDIDATO cpf, DS_CARGO, SG_PARTIDO, SG_UF, NR_CANDIDATO, {NULO('DS_SIT_TOT_TURNO')} DS_SIT_TOT_TURNO,
  row_number() over (partition by ANO_ELEICAO, NR_CPF_CANDIDATO
                     order by ({NULO('DS_SIT_TOT_TURNO')} is null), SQ_CANDIDATO desc) pref
from (select * from {csv_sql(arqs, union_by_name='true')}
      qualify row_number() over (partition by ANO_ELEICAO, SQ_CANDIDATO order by try_cast(NR_TURNO as int) desc) = 1)
where length(NR_CPF_CANDIDATO) = 11""")
c.execute("create or replace table tmp.cand_ant as select * from tmp.cand_ant_todas where pref = 1")

# votos nominais de 2022 (zonas somadas) por SQ, turno e município
c.execute(f"""create or replace table tmp.vot22 as
select SQ_CANDIDATO sq, CD_MUNICIPIO::int cd_municipio, any_value(NM_MUNICIPIO) nm_municipio, NR_TURNO::int turno, any_value(DS_CARGO) ds_cargo,
  sum(QT_VOTOS_NOMINAIS::bigint) votos
from {tse_csv('votacao_candidato_munzona_2022_BA.csv')} group by all""")

# ------------------------------------------------------------------ trajetória
c.execute(f"""create or replace table tmp.traj_tse as
select k.cid, 'candidatura' tipo_evento, a.ano ano_inicio, a.ano ano_fim, py_titulo(a.DS_CARGO) cargo, a.SG_PARTIDO partido,
  a.SG_UF uf, a.NR_CANDIDATO numero, a.DS_SIT_TOT_TURNO resultado, a.DS_SIT_TOT_TURNO like 'ELEITO%' eleito,
  (select sum(v.votos) from tmp.vot22 v where v.sq = a.sq and v.turno = 1 and a.ano = 2022) votos,
  null::varchar observacoes, case a.ano {' '.join(f'when {x} then {fonte_cand(x)}' for x in ANOS)} end fonte_id, null::varchar fonte_url
from tmp.cand_ant a join tmp.k k on k.cpf = a.cpf""")

# mandatos de senador (API do Senado)
sen = []
for cid, cod in c.execute("select cid, id_senado from tmp.k where id_senado is not null").fetchall():
    j = api("senado", f"https://legis.senado.leg.br/dadosabertos/senador/{cod}/mandatos.json") or {}
    ms = (((j.get("MandatoParlamentar") or {}).get("Parlamentar") or {}).get("Mandatos") or {}).get("Mandato") or []
    for m in ms if isinstance(ms, list) else [ms]:
        l1, l2 = m.get("PrimeiraLegislaturaDoMandato") or {}, m.get("SegundaLegislaturaDoMandato") or {}
        ini, fim = (l1.get("DataInicio") or "")[:4], (l2.get("DataFim") or l1.get("DataFim") or "")[:4]
        ps = (m.get("Partidos") or {}).get("Partido")
        partido = (ps[-1] if isinstance(ps, list) else ps or {}).get("Sigla")
        sen.append((cid, "mandato", int(ini) if ini else None, int(fim) if fim else None, "Senador", partido, m.get("UfParlamentar"),
                    m.get("DescricaoParticipacao"), f"https://www25.senado.leg.br/web/senadores/senador/-/perfil/{cod}"))
c.execute("create or replace table tmp.traj_sen (cid int, tipo_evento varchar, ano_inicio int, ano_fim int, cargo varchar, partido varchar, uf varchar, obs varchar, url varchar)")
if sen:
    c.executemany("insert into tmp.traj_sen values (?,?,?,?,?,?,?,?,?)", sen)
c.execute(f"""create or replace table saida.trajetoria as
select row_number() over (order by candidato_id, ano_inicio nulls last) id, * from (
  select cid candidato_id, 'tse' origem, tipo_evento, ano_inicio, ano_fim, cargo, partido, uf, numero, resultado, eleito, votos,
    observacoes, fonte_id, fonte_url from tmp.traj_tse
  union all
  select cid, 'senado', tipo_evento, ano_inicio, ano_fim, cargo, partido, uf, null, null, null, null,
    case when obs is not null then 'Participação: ' || obs end, {fid['senado_senadores']}, url from tmp.traj_sen)""")

# ------------------------------------------------------------------ trocas de partido (Senado: filiações; Câmara: histórico)
# Mudança de sigla por fusão/renomeação do partido não é troca do parlamentar: fica de fora.
RENOMEACAO = {("PMDB", "MDB"), ("PR", "PL"), ("PRB", "REPUBLICANOS"), ("PPS", "CIDADANIA"), ("PTN", "PODE"), ("PHS", "PODE"),
              ("PSC", "PODE"), ("SD", "SOLIDARIEDADE"), ("PROS", "SOLIDARIEDADE"), ("PEN", "PATRIOTA"), ("PRP", "PATRIOTA"),
              ("DEM", "UNIÃO"), ("PSL", "UNIÃO"), ("PTdoB", "AVANTE"), ("PT do B", "AVANTE"), ("PSDC", "DC"), ("PFL", "DEM"), ("SDD", "SD"), ("SD", "SOLIDARIEDADE"), ("PPL", "PCdoB"),
              ("PTB", "PRD"), ("PATRIOTA", "PRD"), ("PP", "PROGRESSISTAS"), ("PROGRESSISTAS", "PP")}
mud = []
for cid, cod in c.execute("select cid, id_senado from tmp.k where id_senado is not null").fetchall():
    j = api("senado", f"https://legis.senado.leg.br/dadosabertos/senador/{cod}/filiacoes.json") or {}
    fs = (((j.get("FiliacaoParlamentar") or {}).get("Parlamentar") or {}).get("Filiacoes") or {}).get("Filiacao") or []
    fs = sorted(fs if isinstance(fs, list) else [fs], key=lambda f: f.get("DataFiliacao") or "")
    for a, b in zip(fs, fs[1:]):
        pa, pb = a["Partido"]["SiglaPartido"], b["Partido"]["SiglaPartido"]
        if pa != pb and (pa, pb) not in RENOMEACAO:
            mud.append((cid, pa, pb, b.get("DataFiliacao"), "Filiação registrada no Senado Federal", fid["senado_senadores"],
                        f"https://www25.senado.leg.br/web/senadores/senador/-/perfil/{cod}"))
for cid, idc in c.execute("select cid, id_camara from tmp.k where id_camara is not null").fetchall():
    j = api("camara", f"https://dadosabertos.camara.leg.br/api/v2/deputados/{idc}/historico") or {}
    # as linhas "Nome no início da legislatura" têm data sintética (a da legislatura atual) em todas as legislaturas: fora
    hs = sorted([h for h in j.get("dados") or [] if h.get("siglaPartido") and not (h.get("descricaoStatus") or "").startswith("Nome no início")],
                key=lambda h: h.get("dataHora") or "")
    for a, b in zip(hs, hs[1:]):
        pa, pb = a["siglaPartido"], b["siglaPartido"]
        if pa != pb and (pa, pb) not in RENOMEACAO:
            mud.append((cid, pa, pb, (b.get("dataHora") or "")[:10] or None, b.get("descricaoStatus"), fid["camara_deputados"],
                        f"https://www.camara.leg.br/deputados/{idc}"))
c.execute("create or replace table saida.mudanca_partido (candidato_id int, partido_anterior varchar, partido_novo varchar, data_mudanca varchar, contexto varchar, fonte_id int, fonte_url varchar)")
if mud:
    c.executemany("insert into saida.mudanca_partido values (?,?,?,?,?,?,?)", mud)
c.execute("""create or replace table saida.mudanca_partido as
select row_number() over (order by candidato_id, data_mudanca) id, candidato_id, partido_anterior, partido_novo, try_cast(data_mudanca as date) data_mudanca,
  year(try_cast(data_mudanca as date)) ano, contexto, fonte_id, fonte_url
from saida.mudanca_partido qualify row_number() over (partition by candidato_id, partido_anterior, partido_novo, data_mudanca) = 1""")

# ------------------------------------------------------------------ votos 2022 por município + município-base
c.execute(f"""create or replace table saida.votos_municipio_2022 as
select k.cid candidato_id, v.cd_municipio, py_titulo(any_value(v.nm_municipio)) municipio, v.turno, py_titulo(any_value(v.ds_cargo)) cargo,
  sum(v.votos) votos, {fid['tse_votacao_2022']} fonte_id
from tmp.vot22 v join tmp.cand_ant_todas a on a.ano = 2022 and a.sq = v.sq join tmp.k k on k.cpf = a.cpf
group by k.cid, v.cd_municipio, v.turno""")
c.execute("""update saida.candidato k set municipio_base = b.municipio, cd_municipio_base = b.cd_municipio
from (select candidato_id, municipio, cd_municipio from saida.votos_municipio_2022 where turno = 1
      qualify row_number() over (partition by candidato_id order by votos desc) = 1) b
where b.candidato_id = k.id and k.cargo in ('deputado_federal', 'deputado_estadual')""")

# ------------------------------------------------------------------ patrimônio
bens_ant = [exige(cache("tse", "csv", f"bem_candidato_{a}_BA.csv")) for a in ANOS]
c.execute(f"""create or replace table tmp.bens_tse as
select k.cid, 2026 ano, try_cast(b.NR_ORDEM_BEM_CANDIDATO as int) ordem, b.DS_TIPO_BEM_CANDIDATO tipo, b.DS_BEM_CANDIDATO descricao,
  {V('b.VR_BEM_CANDIDATO')} valor, {fonte_bens(2026)} fonte_id
from {tse_csv('bem_candidato_2026_BA.csv')} b join tmp.k k on k.sq = b.SQ_CANDIDATO
union all
select cid, ano, ordem, tipo, descricao, valor, fonte_id from (
  select k.cid, a.ano, try_cast(coalesce(b.NR_ORDEM_BEM_CANDIDATO, b.NR_ORDEM_CANDIDATO) as int) ordem, b.DS_TIPO_BEM_CANDIDATO tipo,
    b.DS_BEM_CANDIDATO descricao, {V('b.VR_BEM_CANDIDATO')} valor,
    case a.ano {' '.join(f'when {x} then {fonte_bens(x)}' for x in ANOS)} end fonte_id, a.pref
  from {csv_sql(bens_ant, union_by_name='true')} b
  join tmp.cand_ant_todas a on a.ano = b.ANO_ELEICAO::int and a.sq = b.SQ_CANDIDATO
  join tmp.k k on k.cpf = a.cpf
) x qualify pref = min(pref) over (partition by cid, ano)""")
c.execute(f"""create or replace table saida.patrimonio as
select t.cid candidato_id, t.ano ano_eleicao, t.valor_total, t.qtd qtd_bens, t.declarou declarou_bens, 'tse' origem,
  coalesce((select x.cargo from tmp.traj_tse x where x.cid = t.cid and x.ano_inicio = t.ano limit 1),
           case when t.ano = 2026 then (select k.cargo from tmp.k k where k.cid = t.cid) end) cargo_na_eleicao, t.fonte_id
from (select cid, ano, sum(valor) valor_total, count(*) qtd, true declarou, any_value(fonte_id) fonte_id from tmp.bens_tse group by 1, 2
      union all  -- declarou NÃO ter bens em 2026 (complementar) e não há linha de bem
      select cid, 2026, 0, 0, false, {fid['tse_cand_compl_2026']} from tmp.k
      where st_declarar_bens = 'N' and cid not in (select cid from tmp.bens_tse where ano = 2026)) t""")
c.execute("""create or replace table saida.bem as
select row_number() over (order by cid, ano, ordem) id, cid candidato_id, ano ano_eleicao, ordem, tipo, descricao, valor, fonte_id from tmp.bens_tse""")

# ------------------------------------------------------------------ campanha (prestação de contas)
# receitas e despesas: 2026 pelo SQ; 2022 pelo CPF do candidato (recorte BA)
def pc(nome, ano):
    return tse_csv(f"{nome}_candidatos_{ano}_BA.csv")
c.execute(f"""create or replace table tmp.rec as
select k.cid, 2026 ano, r.*, {fid['tse_prestacao_2026']} fonte_id from {pc('receitas', 2026)} r join tmp.k k on k.sq = r.SQ_CANDIDATO
union all by name
select k.cid, 2022 ano, r.*, {fid['tse_prestacao_2022']} fonte_id from {pc('receitas', 2022)} r join tmp.k k on k.cpf = r.NR_CPF_CANDIDATO""")
tipo = """case when r.DS_FONTE_RECEITA = 'FUNDO ESPECIAL' then 'fundo_eleitoral' when r.DS_FONTE_RECEITA = 'FUNDO PARTIDARIO' then 'fundo_partidario'
  when r.DS_ORIGEM_RECEITA in ('Recursos de pessoas físicas', 'Recursos de Financiamento Coletivo', 'Doações pela Internet') then 'pessoa_fisica'
  when r.DS_ORIGEM_RECEITA = 'Recursos próprios' then 'recursos_proprios'
  when r.DS_ORIGEM_RECEITA in ('Recursos de partido político', 'Recursos de outros candidatos') then 'partido_candidato'
  else 'outros' end"""
c.execute(f"""create or replace table saida.campanha_receita as
select row_number() over (order by r.cid, r.ano, r.DT_RECEITA) id, r.cid candidato_id, r.ano ano_eleicao, {D('r.DT_RECEITA')} dt_receita,
  coalesce({NULO('r.NM_DOADOR_RFB')}, r.NM_DOADOR) doador_nome, py_cnpj(r.NR_CPF_CNPJ_DOADOR) doador_cnpj, py_pf(r.NR_CPF_CNPJ_DOADOR) doador_pf,
  {tipo} doador_tipo, {NULO('r.DS_FONTE_RECEITA')} fonte_recurso, {NULO('r.DS_ORIGEM_RECEITA')} origem_receita,
  {NULO('r.DS_ESPECIE_RECEITA')} especie, {NULO('r.DS_NATUREZA_RECEITA')} natureza, {NULO('r.DS_RECEITA')} descricao,
  {V('r.VR_RECEITA')} valor, r.fonte_id
from tmp.rec r""")
c.execute(f"""create or replace table tmp.desp as
select k.cid, 2026 ano, d.*, {fid['tse_prestacao_2026']} fonte_id from {pc('despesas_contratadas', 2026)} d join tmp.k k on k.sq = d.SQ_CANDIDATO
union all by name
select k.cid, 2022 ano, d.*, {fid['tse_prestacao_2022']} fonte_id from {pc('despesas_contratadas', 2022)} d join tmp.k k on k.cpf = d.NR_CPF_CANDIDATO""")
c.execute(f"""create or replace table saida.campanha_despesa as
select row_number() over (order by d.cid, d.ano) id, d.cid candidato_id, d.ano ano_eleicao, {D('d.DT_DESPESA')} dt_despesa,
  coalesce({NULO('d.NM_FORNECEDOR_RFB')}, d.NM_FORNECEDOR) fornecedor_nome, py_cnpj(d.NR_CPF_CNPJ_FORNECEDOR) fornecedor_cnpj,
  py_pf(d.NR_CPF_CNPJ_FORNECEDOR) fornecedor_pf, {NULO('d.DS_TIPO_FORNECEDOR')} fornecedor_tipo, {NULO('d.DS_CNAE_FORNECEDOR')} fornecedor_cnae,
  py_titulo({NULO('d.NM_MUNICIPIO_FORNECEDOR')}) fornecedor_municipio, {NULO('d.SG_UF_FORNECEDOR')} fornecedor_uf,
  d.DS_ORIGEM_DESPESA categoria, {NULO('d.DS_DESPESA')} descricao, {NULO('d.DS_TIPO_DOCUMENTO')} tipo_documento,
  {NULO('d.NR_DOCUMENTO')} numero_documento, {V('d.VR_DESPESA_CONTRATADA')} valor, d.fonte_id
from tmp.desp d  -- exclui a linha-sentinela de "declarou zero"
where not (coalesce(d.NR_CPF_CNPJ_FORNECEDOR, '-1') in ('-1', '#NULO') and {V('d.VR_DESPESA_CONTRATADA')} = 0)""")
# despesas pagas: o arquivo não tem SQ do candidato — resolve pelo prestador de contas
c.execute("""create or replace table tmp.prest as
select distinct SQ_PRESTADOR_CONTAS p, cid, ano from (select SQ_PRESTADOR_CONTAS, cid, ano from tmp.rec union all select SQ_PRESTADOR_CONTAS, cid, ano from tmp.desp)""")
c.execute(f"""create or replace table tmp.pagas as
select p.cid, p.ano, sum({V('x.VR_PAGTO_DESPESA')}) pagas from (
  select SQ_PRESTADOR_CONTAS, VR_PAGTO_DESPESA, 2026 ano from {pc('despesas_pagas', 2026)}
  union all select SQ_PRESTADOR_CONTAS, VR_PAGTO_DESPESA, 2022 from {pc('despesas_pagas', 2022)}) x
join tmp.prest p on p.p = x.SQ_PRESTADOR_CONTAS and p.ano = x.ano group by 1, 2""")
c.execute("""create or replace table tmp.prest_info as
select cid, ano, arg_max(TP_PRESTACAO_CONTAS, try_strptime(DT_PRESTACAO_CONTAS, '%d/%m/%Y')) tipo,
  max(try_strptime(DT_PRESTACAO_CONTAS, '%d/%m/%Y'))::date dt, arg_max(DS_CARGO, 1) cargo
from (select cid, ano, TP_PRESTACAO_CONTAS, DT_PRESTACAO_CONTAS, DS_CARGO from tmp.rec
      union all select cid, ano, TP_PRESTACAO_CONTAS, DT_PRESTACAO_CONTAS, DS_CARGO from tmp.desp) group by 1, 2""")
c.execute(f"""create or replace table saida.campanha_resumo as
select i.cid candidato_id, i.ano ano_eleicao, py_titulo(i.cargo) cargo_na_eleicao, i.tipo tipo_prestacao, i.dt dt_prestacao,
  r.total total_receitas, r.fefc fundo_eleitoral, r.fp fundo_partidario, r.pf pessoas_fisicas, r.prop recursos_proprios,
  r.pc outros_candidatos_partidos, r.outros outras_receitas, d.total despesas_contratadas, pg.pagas despesas_pagas,
  r.n n_receitas, r.nd n_doadores, d.n n_despesas, d.nf n_fornecedores, 'tse' origem,
  case i.ano when 2026 then {fid['tse_prestacao_2026']} else {fid['tse_prestacao_2022']} end fonte_id
from tmp.prest_info i
left join (select candidato_id, ano_eleicao, sum(valor) total, sum(valor) filter (where doador_tipo = 'fundo_eleitoral') fefc,
             sum(valor) filter (where doador_tipo = 'fundo_partidario') fp, sum(valor) filter (where doador_tipo = 'pessoa_fisica') pf,
             sum(valor) filter (where doador_tipo = 'recursos_proprios') prop, sum(valor) filter (where doador_tipo = 'partido_candidato') pc,
             sum(valor) filter (where doador_tipo = 'outros') outros, count(*) n, count(distinct doador_nome) nd
           from saida.campanha_receita group by 1, 2) r on r.candidato_id = i.cid and r.ano_eleicao = i.ano
left join (select candidato_id, ano_eleicao, sum(valor) total, count(*) n, count(distinct coalesce(fornecedor_cnpj, fornecedor_nome)) nf
           from saida.campanha_despesa group by 1, 2) d on d.candidato_id = i.cid and d.ano_eleicao = i.ano
left join tmp.pagas pg on pg.cid = i.cid and pg.ano = i.ano""")
c.execute("""create or replace table saida.campanha_doador as
select row_number() over (order by candidato_id, ano_eleicao, valor desc) id, * from (
  select candidato_id, ano_eleicao, doador_nome, doador_cnpj, bool_or(doador_pf) doador_pf, mode(doador_tipo) doador_tipo,
    count(*) n_doacoes, sum(valor) valor, 'tse' origem, any_value(fonte_id) fonte_id
  from saida.campanha_receita where doador_nome is not null group by candidato_id, ano_eleicao, doador_nome, doador_cnpj)""")
c.execute("""create or replace table saida.campanha_fornecedor as
select row_number() over (order by candidato_id, ano_eleicao, valor desc) id, candidato_id, ano_eleicao, fornecedor_nome, fornecedor_cnpj, fornecedor_pf,
  categoria_principal, n_despesas, valor, fonte_id from (
  select candidato_id, ano_eleicao, any_value(fornecedor_nome) fornecedor_nome, fornecedor_cnpj, bool_or(fornecedor_pf) fornecedor_pf,
    mode(categoria) categoria_principal, count(*) n_despesas, sum(valor) valor, any_value(fonte_id) fonte_id
  from saida.campanha_despesa group by candidato_id, ano_eleicao, fornecedor_cnpj, case when fornecedor_cnpj is null then fornecedor_nome end)
where fornecedor_nome is not null""")
c.execute("""create or replace table saida.campanha_despesa_categoria as
select candidato_id, ano_eleicao, categoria, count(*) n_despesas, sum(valor) valor, 'tse' origem, any_value(fonte_id) fonte_id
from saida.campanha_despesa where categoria is not null group by 1, 2, 3""")

# ------------------------------------------------------------------ sanções (CEIS/CNEP) de pessoas físicas candidatas, pelo CPF
sanc = []
for tipo in ("ceis", "cnep"):
    arq = sorted(glob.glob(cache("portal", "sancoes", tipo, "*.csv")))
    if arq:
        sanc.append(f"""select * from {csv_sql(arq[-1])} where "TIPO DE PESSOA" = 'F'""")
if sanc:
    c.execute(f"""create or replace table saida.sancao as
select row_number() over () id, k.cid candidato_id, s."CADASTRO" cadastro, s."CATEGORIA DA SANÇÃO" descricao, s."ÓRGÃO SANCIONADOR" orgao,
  {D('s."DATA INÍCIO SANÇÃO"')} data_inicio, {D('s."DATA FINAL SANÇÃO"')} data_fim,
  to_json({{'processo': s."NÚMERO DO PROCESSO", 'fundamentacao': s."FUNDAMENTAÇÃO LEGAL", 'abrangencia': s."ABRAGÊNCIA DA SANÇÃO",
           'publicacao': s."PUBLICAÇÃO", 'data_publicacao': s."DATA PUBLICAÇÃO", 'esfera': s."ESFERA ÓRGÃO SANCIONADOR",
           'uf_orgao': s."UF ÓRGÃO SANCIONADOR"}})::varchar dados,
  'https://portaldatransparencia.gov.br/sancoes/' || lower(s."CADASTRO") || '/' || s."CÓDIGO DA SANÇÃO" fonte_url, {fid['portal_sancoes']} fonte_id
from ({' union all by name '.join(sanc)}) s join tmp.k k on k.cpf = regexp_replace(s."CPF OU CNPJ DO SANCIONADO", '\\D', '', 'g')""")
else:
    print("AVISO: CEIS/CNEP não encontrados no cache; tabela sancao vazia")

# ------------------------------------------------------------------ contexto
pop = ler_json(exige(cache("ibge", "populacao_ba.json")))["dados"]
ALIAS = {"santa teresinha": "2928505", "muquem de sao francisco": "2922250", "lagedo do tabocal": "2919058"}  # grafias do TSE
c.execute("create or replace table tmp.pop (ibge varchar, municipio varchar, n varchar, pop2024 bigint)")
c.executemany("insert into tmp.pop values (?,?,?,?)", [(p["ibge"], p["municipio"], norm(p["municipio"]), p["pop2024"]) for p in pop])
c.execute("create or replace table tmp.alias (n varchar, ibge varchar)")
c.executemany("insert into tmp.alias values (?,?)", list(ALIAS.items()))
c.execute(f"""create or replace table saida.municipio as
select e.cd_municipio cd_municipio_tse, p.ibge cod_ibge, coalesce(p.municipio, py_titulo(e.nm)) nome, e.eleitores eleitores_2026,
  p.pop2024 populacao_2024, {fid['tse_eleitorado_2026']} fonte_id
from (select CD_MUNICIPIO::int cd_municipio, any_value(NM_MUNICIPIO) nm, sum(QT_ELEITORES::bigint) eleitores
      from {tse_csv('perfil_eleitorado_2026_BA.csv')} group by 1) e
left join tmp.alias a on a.n = py_norm(e.nm)
left join tmp.pop p on p.n = py_norm(e.nm) or p.ibge = a.ibge
qualify row_number() over (partition by e.cd_municipio order by (p.n = py_norm(e.nm)) desc nulls last) = 1""")
c.execute(f"""create or replace table saida.vaga as
select case CD_CARGO when '5' then 'senador' when '6' then 'deputado_federal' when '7' then 'deputado_estadual'
  when '9' then 'suplente_1' when '10' then 'suplente_2' end cargo, QT_VAGA::int qt_vagas, {D('DT_POSSE')} dt_posse, {fid['tse_vagas_2026']} fonte_id
from {tse_csv('consulta_vagas_2026_BA.csv')} where CD_CARGO in ('5','6','7','9','10')""")
c.execute(f"""create or replace table saida.coligacao as
select row_number() over () id, lower(DS_CARGO) cargo, TP_AGREMIACAO tipo, SG_PARTIDO partido, {NULO('NM_FEDERACAO')} federacao,
  {NULO('NM_COLIGACAO')} nome_coligacao, {NULO('DS_COMPOSICAO_COLIGACAO')} composicao, {NULO('DS_SITUACAO')} situacao, {fid['tse_coligacao_2026']} fonte_id
from {tse_csv('consulta_coligacao_2026_BA.csv')} where CD_CARGO in ('5','6','7')""")
c.execute(f"""create or replace table saida.pesquisa_eleitoral as
select NR_PROTOCOLO_REGISTRO protocolo, {D('DT_REGISTRO')} dt_registro, NM_EMPRESA empresa, py_cnpj(NR_CNPJ_EMPRESA) empresa_cnpj,
  ST_PESQUISA_PROPRIA = 'S' contratante_propria, DS_CARGO cargos, {D('DT_INICIO_PESQUISA')} dt_inicio, {D('DT_FIM_PESQUISA')} dt_fim,
  {D('DT_DIVULGACAO')} dt_divulgacao, try_cast(QT_ENTREVISTADO as int) entrevistados, {V('VR_PESQUISA')} valor,
  {NULO('DS_METODOLOGIA_PESQUISA')} metodologia, {NULO('DS_DADO_MUNICIPIO')} abrangencia, {fid['tse_pesquisa_2026']} fonte_id
from {tse_csv('pesquisa_eleitoral_2026_BA.csv')} qualify row_number() over (partition by NR_PROTOCOLO_REGISTRO order by DT_GERACAO desc) = 1""")
# Calendário: marcos digitados da Resolução do TSE (não há arquivo de dados abertos para isso)
CAL = [("2026-05-06", None, "Encerramento do cadastro eleitoral", False), ("2026-07-20", "2026-08-05", "Convenções partidárias", False),
       ("2026-08-15", None, "Prazo final de registro de candidaturas", False), ("2026-08-16", None, "Início da propaganda eleitoral", False),
       ("2026-08-28", "2026-10-01", "Propaganda em rádio e TV — 1º turno", False), ("2026-09-09", "2026-09-13", "Prestação de contas parcial", False),
       ("2026-09-14", None, "Cerimônia de lacração dos sistemas", False), ("2026-10-04", None, "1º TURNO", True),
       ("2026-10-25", None, "2º turno (se houver)", True), ("2026-12-18", None, "Diplomação dos eleitos", False)]
c.execute("create or replace table saida.calendario_eleitoral (id int, dt_inicio date, dt_fim date, marco varchar, destaque boolean, fonte_id int)")
c.executemany("insert into saida.calendario_eleitoral values (?,?,?,?,?,?)",
              [(i, a, b, m, d, fid["tse_calendario_2026"]) for i, (a, b, m, d) in enumerate(CAL, start=1)])

print(c.sql("select origem, ano_eleicao, count(*) from saida.patrimonio group by all order by 2 desc"))
print(c.sql("select ano_eleicao, count(*), sum(total_receitas)::bigint from saida.campanha_resumo group by all order by 1 desc"))
for t in ["trajetoria", "mudanca_partido", "votos_municipio_2022", "bem", "campanha_receita", "campanha_despesa", "sancao", "municipio", "pesquisa_eleitoral"]:
    print(f"  {t:22s}", c.execute(f"select count(*), count(distinct {'candidato_id' if t not in ('municipio','pesquisa_eleitoral') else 1}) from saida.{t}").fetchone())
