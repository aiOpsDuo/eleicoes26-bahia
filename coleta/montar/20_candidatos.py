"""`candidato`, `chapa_membro`, `candidato_rede_social` e `etl_casamento`.

Base: TSE 2026 (consulta_cand_2026_BA.csv) — senador, suplentes, deputado federal e deputado estadual da BA
(todas as candidaturas, inclusive renúncias/indeferidas). Situação do registro: arquivo complementar.
Identidade (slug, ids da Câmara/Senado/ALBA, códigos de autor de emenda): base/candidatos_ids.json.
Candidatura que não está no JSON recebe slug calculado e nenhum id (aparece em etl_casamento como sem_match).
"""
import json
from lib import (work, tse_csv, cache, api, ler_json, candidatos_ids, norm, slugify, titulo, registra_funcoes,
                 fontes_ids, CARGOS, DATA_REFERENCIA, NULO, D)

c = work()
registra_funcoes(c)
fid = fontes_ids(c)

# ------------------------------------------------------------------ TSE 2026 (uma linha por SQ: a do maior turno)
c.execute(f"""create or replace table tmp.tse26 as select * from {tse_csv('consulta_cand_2026_BA.csv')}
qualify row_number() over (partition by SQ_CANDIDATO order by try_cast(NR_TURNO as int) desc) = 1""")
c.execute(f"""create or replace table tmp.compl26 as select * from {tse_csv('consulta_cand_complementar_2026_BA.csv')}
qualify row_number() over (partition by SQ_CANDIDATO order by DT_GERACAO desc) = 1""")
cargo_case = "case CD_CARGO " + " ".join(f"when '{k}' then '{v}'" for k, v in CARGOS.items()) + " end"
c.execute(f"""create or replace table tmp.base as
select t.SQ_CANDIDATO sq, {cargo_case} cargo, t.DS_CARGO cargo_tse,
  case t.CD_CARGO when '9' then 1 when '10' then 2 end ordem_suplencia, t.SG_UF uf,
  t.NM_URNA_CANDIDATO nome_urna_tse, t.NM_CANDIDATO nome_completo_tse, {NULO('t.NM_SOCIAL_CANDIDATO')} nome_social,
  t.SG_PARTIDO partido, t.NM_PARTIDO partido_nome, t.NR_CANDIDATO numero,
  {NULO('t.NM_FEDERACAO')} federacao, {NULO('t.NM_COLIGACAO')} coligacao, {NULO('t.DS_COMPOSICAO_COLIGACAO')} composicao_coligacao,
  t.DS_GENERO genero, t.DS_COR_RACA cor_raca, {D('t.DT_NASCIMENTO')} data_nascimento, {NULO('t.SG_UF_NASCIMENTO')} uf_nascimento,
  t.DS_OCUPACAO ocupacao, t.DS_GRAU_INSTRUCAO grau_instrucao, t.DS_ESTADO_CIVIL estado_civil,
  t.NR_CPF_CANDIDATO cpf,  -- só no DuckDB de trabalho
  lower(coalesce({NULO('k.DS_SITUACAO_JULGAMENTO')}, {NULO('t.DS_SITUACAO_CANDIDATURA')})) situacao,
  case when coalesce({NULO('k.DS_SITUACAO_JULGAMENTO')}, {NULO('t.DS_SITUACAO_CANDIDATURA')}) is not null
       then coalesce({D('k.DT_GERACAO')}, {D('t.DT_GERACAO')}) end situacao_data,
  {NULO('k.NM_MUNICIPIO_NASCIMENTO')} municipio_nascimento, k.ST_DECLARAR_BENS st_declarar_bens
from tmp.tse26 t left join tmp.compl26 k on k.SQ_CANDIDATO = t.SQ_CANDIDATO
where t.CD_CARGO in ({','.join(f"'{k}'" for k in CARGOS)})""")

# ------------------------------------------------------------------ identidades (base/candidatos_ids.json)
ids = candidatos_ids()
c.execute("""create or replace table tmp.ids (sq varchar, slug varchar, nome_urna varchar, id_camara integer, id_senado integer,
  id_alba integer, cods varchar[], nome_ceaps varchar, casamento varchar)""")
c.executemany("insert into tmp.ids values (?,?,?,?,?,?,?,?,?)", [
    (sq, d.get("slug"), d.get("nome_urna"), d.get("id_camara"), d.get("id_senado"), d.get("id_alba"), d.get("cods_autor_emenda"),
     d.get("nome_ceaps"), json.dumps(d.get("casamento") or {}, ensure_ascii=False)) for sq, d in ids.items()])

# ------------------------------------------------------------------ nome de exibição e slug
# nome de urna: a grafia do JSON (nome parlamentar oficial, com acentos/caixa) quando é o mesmo nome do TSE
c.execute("""create or replace table tmp.nomes as
select b.sq, case when i.nome_urna is not null and py_norm(i.nome_urna) = py_norm(b.nome_urna_tse) then i.nome_urna
                  else py_titulo(b.nome_urna_tse) end nome_urna, py_titulo(b.nome_completo_tse) nome_completo, i.slug slug_json
from tmp.base b left join tmp.ids i using (sq)""")
ordem = {"senador": 0, "suplente": 1, "deputado_federal": 2, "deputado_estadual": 3}
curto = {"senador": "senador", "suplente": "suplente", "deputado_federal": "dep-federal", "deputado_estadual": "dep-estadual"}
rows = c.execute("select b.sq, b.cargo, n.slug_json, n.nome_urna, b.numero, b.situacao from tmp.base b join tmp.nomes n using (sq)").fetchall()
rows.sort(key=lambda r: (ordem[r[1]], 1 if (r[5] or "").startswith(("ren", "indef")) else 0, norm(r[3]), r[4] or "", r[0]))
usados = {r[2] for r in rows if r[2]}  # slugs do JSON são reservados (URLs estáveis)
slug = {}
for sq, cargo, sj, nome, numero, _ in rows:
    if sj:
        slug[sq] = sj
        continue
    b = slugify(nome)
    s = next(x for x in [b, f"{b}-{curto[cargo]}", f"{b}-{curto[cargo]}-{numero}", f"{b}-{sq}"] if x not in usados)
    usados.add(s)
    slug[sq] = s
c.execute("create or replace table tmp.slug (id int, sq varchar, slug varchar)")
c.executemany("insert into tmp.slug values (?,?,?)", [(i, r[0], slug[r[0]]) for i, r in enumerate(rows, start=1)])

# ------------------------------------------------------------------ mandato atual (listas oficiais)
dep57 = {d["id"] for d in ler_json(cache("camara", "deputados_ba.json"))["dados"] if d["idLegislatura"] == 57}
sen = api("senado", "https://legis.senado.leg.br/dadosabertos/senador/lista/atual.json?uf=BA") or {}
p = ((sen.get("ListaParlamentarEmExercicio") or {}).get("Parlamentares") or {}).get("Parlamentar") or []
sen_atual = {int(x["IdentificacaoParlamentar"]["CodigoParlamentar"]) for x in (p if isinstance(p, list) else [p])
             if x["IdentificacaoParlamentar"].get("UfParlamentar") == "BA"}
c.execute("create or replace table tmp.dep57 (id integer)")
c.executemany("insert into tmp.dep57 values (?)", [(x,) for x in dep57])
c.execute("create or replace table tmp.sen_atual (id integer)")
c.executemany("insert into tmp.sen_atual values (?)", [(x,) for x in sen_atual])

# ------------------------------------------------------------------ candidato
c.execute(f"""
create or replace table saida.candidato as
select s.id, s.slug, n.nome_urna, n.nome_completo, b.nome_social, b.cargo, b.cargo_tse, b.ordem_suplencia,
  null::integer titular_id, b.uf, b.partido, b.partido_nome, b.numero, b.federacao, b.coligacao, b.composicao_coligacao,
  b.situacao, b.situacao_data, lower(b.genero) genero, lower(b.cor_raca) cor_raca, b.data_nascimento,
  date_diff('year', b.data_nascimento, date '{DATA_REFERENCIA}')
    - case when strftime(b.data_nascimento, '%m%d') > '{DATA_REFERENCIA[5:7]}{DATA_REFERENCIA[8:10]}' then 1 else 0 end idade,
  b.uf_nascimento, py_titulo(b.municipio_nascimento) municipio_nascimento,
  case when b.municipio_nascimento is not null then py_titulo(b.municipio_nascimento) || '/' || b.uf_nascimento end naturalidade,
  lower(b.ocupacao) ocupacao, lower(b.grau_instrucao) grau_instrucao, lower(b.estado_civil) estado_civil,
  case when i.id_camara is not null then 'https://www.camara.leg.br/internet/deputado/bandep/' || i.id_camara || '.jpg'
       when i.id_senado is not null then 'https://www.senado.leg.br/senadores/img/fotos-oficiais/senador' || i.id_senado || '.jpg' end foto_url,
  case when i.id_camara is not null then 'Foto oficial: Câmara dos Deputados'
       when i.id_senado is not null then 'Foto oficial: Senado Federal' end foto_credito,
  case when i.id_camara is not null then 'https://www.camara.leg.br/deputados/' || i.id_camara
       when i.id_senado is not null then 'https://www25.senado.leg.br/web/senadores/senador/-/perfil/' || i.id_senado end foto_fonte_url,
  null::varchar bio, null::integer bio_fonte_id, null::varchar site_campanha,
  b.sq sq_candidato_2026, i.id_camara, i.id_senado, i.id_alba,
  case when len(i.cods) > 0 then i.cods end cods_autor_emenda,
  case when i.id_camara in (select id from tmp.dep57) then 'deputado_federal'
       when i.id_senado in (select id from tmp.sen_atual) then 'senador'
       when i.id_alba is not null then 'deputado_estadual' end mandato_atual,
  case when i.id_camara in (select id from tmp.dep57) then 'Deputado(a) federal pela BA (legislatura 2023–2027)'
       when i.id_senado in (select id from tmp.sen_atual) then 'Senador(a) pela BA'
       when i.id_alba is not null then 'Deputado(a) estadual na ALBA (2023–2027)' end mandato_atual_descricao,
  null::varchar municipio_base, null::integer cd_municipio_base, null::varchar slug_referencia,
  list_filter(['tse_2026', case when i.slug is not null then 'candidatos_ids' end], x -> x is not null) origem_dados,
  {fid['tse_cand_2026']} fonte_id, now() atualizado_em,
  b.cpf cpf_interno, b.st_declarar_bens, i.nome_ceaps
from tmp.base b join tmp.slug s using (sq) join tmp.nomes n using (sq) left join tmp.ids i using (sq)""")

# suplente -> titular: mesmo número, cargo senador; com dois titulares de mesmo número, o não renunciante
c.execute("""
update saida.candidato v set titular_id = (
  select t.id from saida.candidato t where t.numero = v.numero and t.cargo = 'senador' and t.uf = v.uf
  order by case when coalesce(t.situacao, '') like 'ren%' or coalesce(t.situacao, '') like 'indef%' then 1 else 0 end, t.id limit 1)
where v.cargo = 'suplente'""")

# ------------------------------------------------------------------ redes sociais (TSE)
c.execute(f"""create or replace table saida.candidato_rede_social as
select row_number() over () id, k.id candidato_id,
  case when url ilike '%instagram%' then 'instagram' when url ilike '%facebook%' or url ilike '%fb.com%' then 'facebook'
       when url ilike '%x.com%' or url ilike '%twitter%' then 'x' when url ilike '%youtube%' or url ilike '%youtu.be%' then 'youtube'
       when url ilike '%tiktok%' then 'tiktok' when url ilike '%kwai%' then 'kwai' when url ilike '%threads%' then 'threads'
       when url ilike '%linkedin%' then 'linkedin' when url ilike '%t.me%' or url ilike '%telegram%' then 'telegram'
       when url ilike '%whatsapp%' or url ilike '%wa.me%' then 'whatsapp' when url ilike '%flickr%' then 'flickr' else 'site' end plataforma,
  url, {fid['tse_rede_social_2026']} fonte_id
from (select SQ_CANDIDATO sq, trim(DS_URL) url from {tse_csv('rede_social_candidato_2026_BA.csv')} where {NULO('DS_URL')} is not null) r
join saida.candidato k on k.sq_candidato_2026 = r.sq
qualify row_number() over (partition by k.id, rtrim(regexp_replace(lower(url), '^https?://(www\\.)?', ''), '/')) = 1""")

# ------------------------------------------------------------------ chapa (suplentes do senador)
c.execute(f"""create or replace table saida.chapa_membro as
select row_number() over () id, v.titular_id candidato_id, case when v.ordem_suplencia = 1 then 'suplente_1' else 'suplente_2' end papel,
  v.id membro_id, v.nome_urna, v.nome_completo, v.partido, v.sq_candidato_2026 sq_candidato, {fid['tse_cand_2026']} fonte_id
from saida.candidato v where v.titular_id is not null
qualify row_number() over (partition by v.titular_id, papel order by case when coalesce(v.situacao, '') like 'ren%'
  or coalesce(v.situacao, '') like 'indef%' then 1 else 0 end, v.id) = 1""")

# ------------------------------------------------------------------ casamento (auditoria)
cas = []
for cid, sq, nome, casamento, idc, ids_, ida in c.execute(
        "select k.id, k.sq_candidato_2026, k.nome_urna, i.casamento, i.id_camara, i.id_senado, i.id_alba from saida.candidato k left join tmp.ids i on i.sq = k.sq_candidato_2026").fetchall():
    if casamento is None:
        cas.append(("candidatos_ids", sq, nome, cid, "sem_match", None, "candidatura fora de base/candidatos_ids.json: slug calculado, sem ids"))
        continue
    info = json.loads(casamento)
    for origem, chave in (("camara", idc), ("senado", ids_), ("alba", ida)):
        if chave:
            m = info.get(origem, {})
            cas.append((origem, str(chave), nome, cid, m.get("metodo", "candidatos_ids"), m.get("confianca"), m.get("obs")))
c.execute("create or replace table saida.etl_casamento (id int, origem varchar, chave_origem varchar, nome_origem varchar, candidato_id int, metodo varchar, confianca varchar, observacao varchar)")
c.executemany("insert into saida.etl_casamento values (?,?,?,?,?,?,?,?)", [(i, *r) for i, r in enumerate(cas, start=1)])
fora = [sq for sq in ids if sq not in slug]
if fora:
    print(f"AVISO: {len(fora)} candidaturas do candidatos_ids.json não estão no TSE 2026 atual (ex.: {fora[:3]})")

print(c.sql("""select cargo, count(*) n, count(id_camara) camara, count(id_senado) senado, count(id_alba) alba,
  count(cods_autor_emenda) cods, count(mandato_atual) mandato from saida.candidato group by 1 order by 1"""))
