"""Atuação parlamentar a partir das fontes oficiais:
- emendas (Portal da Transparência, arquivo UNICO) + favorecidos + convênios, pelos códigos de autor do candidatos_ids.json;
- emendas Pix (Transferegov) + metas que financiam shows/festas (regra de palavras-chave abaixo);
- cota parlamentar: Câmara (CEAP), Senado (CEAPS) e verba indenizatória da ALBA;
- votações e votos: Câmara (arquivos anuais 2019–2026, orientação do governo, votações-chave de base/votacoes_chave.json)
  e Senado (API, por senador);
- proposições de autoria: Câmara (1º signatário) e Senado (API)."""
import os, glob, json
from lib import work, csv_sql, cache, exige, api, ler_json, BASE, registra_funcoes, fontes_ids, V

c = work()
registra_funcoes(c)
fid = fontes_ids(c)
URL_EMENDA = "'https://portaldatransparencia.gov.br/emendas/detalhe?codigoEmenda=' || "

c.execute("create or replace table tmp.cods as select id cid, unnest(cods_autor_emenda) cod from saida.candidato where cods_autor_emenda is not null")
c.execute("create or replace table tmp.cam as select id cid, id_camara::varchar idc from saida.candidato where id_camara is not null")
c.execute("create or replace table tmp.sen as select id cid, id_senado ids, nome_ceaps from saida.candidato where id_senado is not null")

# ------------------------------------------------------------------ emendas (Portal da Transparência)
E = lambda n: csv_sql(exige(cache("portal", "emendas", n)))
c.execute(f"""create or replace table tmp.em as select * from {E('EmendasParlamentares.csv')} where "Código do Autor da Emenda" in (select cod from tmp.cods)""")
c.execute(f"""create or replace table saida.emenda as
select row_number() over (order by k.cid, e."Ano da Emenda", e."Código da Emenda") id, k.cid candidato_id, e."Código da Emenda" codigo_emenda,
  e."Ano da Emenda"::int ano, e."Tipo de Emenda" tipo_emenda, e."Número da emenda" numero_emenda, e."Código do Autor da Emenda" autor_codigo,
  e."Nome do Autor da Emenda" autor_nome, e."Localidade de aplicação do recurso" localidade, nullif(e."Município", '') municipio,
  nullif(e."UF", '') uf, nullif(e."Código Município IBGE", '') cod_ibge, e."Nome Função" funcao, e."Nome Subfunção" subfuncao,
  e."Nome Programa" programa, e."Nome Ação" acao, {V('e."Valor Empenhado"')} empenhado, {V('e."Valor Liquidado"')} liquidado,
  {V('e."Valor Pago"')} pago, {V('e."Valor Restos A Pagar Pagos"')} restos_pagar_pagos,
  coalesce({V('e."Valor Pago"')}, 0) + coalesce({V('e."Valor Restos A Pagar Pagos"')}, 0) pago_total,
  {URL_EMENDA}e."Código da Emenda" fonte_url, {fid['portal_emendas']} fonte_id
from tmp.em e join tmp.cods k on k.cod = e."Código do Autor da Emenda" """)
c.execute(f"""create or replace table saida.emenda_favorecido as
select row_number() over (order by candidato_id, valor desc) id, * from (
select k.cid candidato_id, f."Código da Emenda" codigo_emenda, min(left(f."Ano/Mês", 4))::int ano, f."Favorecido" favorecido,
  py_cnpj(f."Código do Favorecido") favorecido_cnpj, f."Tipo Favorecido" ilike 'Pessoa F%' favorecido_pf, f."Tipo Favorecido" tipo_favorecido,
  f."Natureza Jurídica" natureza_juridica, f."Município Favorecido" municipio, f."UF Favorecido" uf,
  f."Código do Favorecido" in ('00000000000191', '00360305000104', 'RB0000104') intermediario,  -- Banco do Brasil (Pix) / Caixa (repasse)
  not (f."Tipo Favorecido" ilike '%administra%' or f."Natureza Jurídica" ilike '%munic%' or f."Natureza Jurídica" ilike '%estad%'
       or f."Natureza Jurídica" ilike '%federal%' or f."Natureza Jurídica" ilike '%fundo p%' or f."Tipo Favorecido" = 'Unidade Gestora') privado,
  sum({V('f."Valor Recebido"')}) valor, min(f."Ano/Mês") primeiro_mes, max(f."Ano/Mês") ultimo_mes,
  {URL_EMENDA}f."Código da Emenda" fonte_url, {fid['portal_emendas']} fonte_id
from {E('EmendasParlamentares_PorFavorecido.csv')} f join tmp.cods k on k.cod = f."Código do Autor da Emenda"
group by k.cid, f."Código da Emenda", f."Favorecido", f."Código do Favorecido", f."Tipo Favorecido", f."Natureza Jurídica",
  f."Município Favorecido", f."UF Favorecido")""")
c.execute(f"""create or replace table saida.emenda_convenio as
select row_number() over (order by candidato_id, valor desc) id, * from (
select distinct e.candidato_id, cv."Código da Emenda" codigo_emenda, cv."Número Convênio" numero_convenio, cv."Convenente" convenente,
  cv."Objeto Convênio" objeto,
  coalesce(try_strptime(left(cv."Data Publicação Convênio", 10), '%d/%m/%Y'), try_strptime(left(cv."Data Publicação Convênio", 10), '%Y-%m-%d'))::date data_publicacao,
  cv."Localidade do gasto" localidade, cv."Nome Função" funcao, {V('cv."Valor Convênio"')} valor,
  {URL_EMENDA}cv."Código da Emenda" fonte_url, {fid['portal_emendas']} fonte_id
from {E('EmendasParlamentares_Convenios.csv')} cv join (select distinct candidato_id, codigo_emenda from saida.emenda) e on e.codigo_emenda = cv."Código da Emenda")""")

# ------------------------------------------------------------------ emendas Pix (Transferegov, beneficiários da BA)
def tg(nome):
    p = exige(cache("transferegov", f"{nome}_ba.json"))
    nd = cache("transferegov", f".{nome}.ndjson")
    with open(nd, "w") as f:
        for r in ler_json(p)["dados"]:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    c.execute(f"create or replace table tmp.tg_{nome} as select * from read_json_auto('{nd}', format='newline_delimited', sample_size=-1)")
    os.remove(nd)
for n in ["beneficiarios", "planos_acao", "executores", "finalidades", "metas", "relatorios_gestao", "relatorios_gestao_novos", "empenhos"]:
    tg(n)
pop = ler_json(exige(cache("ibge", "populacao_ba.json")))["dados"]
c.execute("create or replace table tmp.pop (ibge varchar, municipio varchar, n varchar)")
c.executemany("insert into tmp.pop values (?,?,?)", [(p["ibge"], p["municipio"], p["municipio"]) for p in pop])
c.execute("update tmp.pop set n = py_norm(municipio)")
# Metas que financiam shows/festas: palavras-chave na descrição/nome da meta (classificação automática, sem juízo de valor)
SHOW = r"\bSHOWS?\b|ARTISTIC|\bBANDAS?\b|FESTEJ|\bFESTAS?\b|FESTIVA|SAO JOAO|SAO PEDRO|CARNAVAL|MICARETA|ATRACO"
c.execute(f"""create or replace table tmp.tg_meta_show as
select e.id_plano_acao, m.nome_meta, m.desc_meta, coalesce(m.vl_custeio_emenda_especial_meta, 0) + coalesce(m.vl_investimento_emenda_especial_meta, 0) v
from tmp.tg_metas m join tmp.tg_executores e using (id_executor)
where regexp_matches(upper(strip_accents(coalesce(m.desc_meta, '') || ' ' || coalesce(m.nome_meta, ''))), '{SHOW}')""")
c.execute("""create or replace table tmp.tg_pa as
with ex as (select id_plano_acao, string_agg(distinct nome_executor, ' | ') executores from tmp.tg_executores group by 1),
     me as (select e.id_plano_acao, string_agg(m.desc_meta, ' | ' order by m.id_executor, m.sequencial_meta) metas
            from tmp.tg_metas m join tmp.tg_executores e using (id_executor) group by 1),
     fi as (select e.id_plano_acao, string_agg(distinct f.area_politica_publica_tipo_pt || ' / ' || f.area_politica_publica_pt, ' | ') finalidades
            from tmp.tg_finalidades f join tmp.tg_executores e using (id_executor) group by 1),
     rg as (select id_plano_acao, string_agg(distinct descritivo_relatorio_gestao, ' | ') descritivo_rg,
              string_agg(distinct situacao_relatorio_gestao, ',') sit_rg from tmp.tg_relatorios_gestao group by 1),
     rgn as (select id_plano_acao, string_agg(distinct tipo_relatorio_gestao_novo || ':' || situacao_relatorio_gestao_novo, ',') sit_rg_novo
             from tmp.tg_relatorios_gestao_novos group by 1),
     em as (select id_plano_acao, sum(valor_empenho) filter (where descricao_tipo_documento_empenho ilike '%original%'
              or descricao_tipo_documento_empenho ilike '%refor%') empenhado from tmp.tg_empenhos group by 1)
select pa.id_plano_acao, pa.codigo_plano_acao, pa.ano_plano_acao ano, pa.situacao_plano_acao situacao,
  (pa.situacao_plano_acao = 'CIENTE') valido,  -- IMPEDIDO costuma ser reemitido como novo plano: não somar
  pa.codigo_parlamentar_emenda_plano_acao::varchar cod_parlamentar, pa.numero_emenda_parlamentar_plano_acao::varchar cod_emenda,
  b.nome_beneficiario beneficiario, b.cnpj_beneficiario, p.ibge, p.municipio,
  coalesce(pa.valor_custeio_plano_acao, 0) + coalesce(pa.valor_investimento_plano_acao, 0) valor_plano,
  pa.valor_custeio_plano_acao custeio, pa.valor_investimento_plano_acao investimento,
  pa.codigo_descricao_areas_politicas_publicas_plano_acao areas, pa.nome_objeto, pa.detalhamento_objeto,
  ex.executores, fi.finalidades, me.metas, em.empenhado, rg.sit_rg, rg.descritivo_rg, rgn.sit_rg_novo
from tmp.tg_planos_acao pa join tmp.tg_beneficiarios b using (id_beneficiario)
left join tmp.pop p on p.n = py_norm(regexp_replace(b.nome_beneficiario, '^MUNICIPIO DE ', ''))
  or (p.ibge = '2928505' and py_norm(b.nome_beneficiario) like '%santa teresinha%')
  or (p.ibge = '2922250' and py_norm(b.nome_beneficiario) like '%muquem de sao francisco%')
  or (p.ibge = '2919058' and py_norm(b.nome_beneficiario) like '%lagedo do tabocal%')
left join ex using (id_plano_acao) left join me using (id_plano_acao) left join fi using (id_plano_acao)
left join rg using (id_plano_acao) left join rgn using (id_plano_acao) left join em using (id_plano_acao)
qualify row_number() over (partition by pa.id_plano_acao order by p.ibge) = 1""")
c.execute(f"""create or replace table saida.emenda_pix as
select row_number() over (order by k.cid, p.ano, p.valor_plano desc) id, k.cid candidato_id, p.id_plano_acao, p.codigo_plano_acao,
  p.cod_emenda codigo_emenda, p.ano::int ano, p.situacao, p.valido, p.beneficiario, py_cnpj(p.cnpj_beneficiario) beneficiario_cnpj,
  nullif(p.municipio, '') municipio, p.ibge cod_ibge, p.valor_plano, p.custeio, p.investimento, p.areas, p.nome_objeto objeto,
  p.detalhamento_objeto detalhamento, p.executores, p.finalidades, p.metas, p.empenhado,
  coalesce(p.sit_rg_novo, p.sit_rg) situacao_relatorio_gestao, not (p.sit_rg is null and p.sit_rg_novo is null and p.descritivo_rg is null) tem_relatorio_gestao,
  p.id_plano_acao in (select id_plano_acao from tmp.tg_meta_show) tem_show_evento,
  null::varchar fonte_url, {fid['transferegov_pix']} fonte_id
from tmp.tg_pa p join tmp.cods k on k.cod = p.cod_parlamentar""")
c.execute(f"""create or replace table saida.emenda_pix_show as
select row_number() over (order by p.candidato_id, p.ano, s.v desc) id, p.candidato_id, p.ano, coalesce(p.municipio, '(Estado da Bahia)') municipio,
  s.nome_meta meta, s.desc_meta descricao, s.v valor, {fid['transferegov_pix']} fonte_id
from tmp.tg_meta_show s join saida.emenda_pix p on p.id_plano_acao = s.id_plano_acao where p.valido""")

# ------------------------------------------------------------------ cota parlamentar
grupo = lambda col: f"""case
  when {col} ilike '%aliment%' and {col} not ilike '%locomo%' then 'alimentacao'
  when {col} ilike '%hosped%' and {col} not ilike '%locomo%' then 'hospedagem'
  when {col} ilike '%combust%' and {col} not ilike '%locomo%' then 'combustivel'
  when {col} ilike '%locomo%' then 'locomocao_hospedagem_alimentacao_combustivel'
  when {col} ilike '%passage%' or {col} ilike '%a_reo%' or {col} ilike '%bilhete%' then 'passagem'
  when {col} ilike '%loca%ve_culo%' or {col} ilike '%fretamento%' or {col} ilike '%ve_culo%' then 'locacao_veiculo'
  when {col} ilike '%divulga%' or {col} ilike '%publicidade%' then 'divulgacao'
  when {col} ilike '%consultori%' or {col} ilike '%pesquisa%' or {col} ilike '%trabalhos t_cnicos%' then 'consultoria'
  when {col} ilike '%telefon%' or {col} ilike '%postais%' or {col} ilike '%correio%' then 'telefonia_postal'
  when {col} ilike '%seguran%' then 'seguranca'
  when {col} ilike '%t_xi%' or {col} ilike '%ped_gio%' or {col} ilike '%estacionamento%' then 'taxi_pedagio_estacionamento'
  when {col} ilike '%escrit_rio%' or {col} ilike '%im_ve%' or {col} ilike '%material%' or {col} ilike '%software%' or {col} ilike '%assinatura%' then 'escritorio'
  when {col} ilike '%curso%' or {col} ilike '%evento%' or {col} ilike '%palestra%' then 'eventos_cursos'
  else 'outros' end"""
ceap = sorted(glob.glob(cache("camara", "ceap", "Ano-*.csv")))
# CEAPS vem em Windows-1252 (tem “aspas curvas” e travessões, fora do latin-1): converte para UTF-8 num arquivo ao lado
ceaps = []
for orig in sorted(glob.glob(cache("senado", "ceaps", "despesa_ceaps_*.csv"))):
    dest = os.path.join(os.path.dirname(orig), "utf8", os.path.basename(orig))
    if not os.path.exists(dest) or os.path.getmtime(dest) < os.path.getmtime(orig):
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(orig, encoding="cp1252", errors="replace", newline="") as f, open(dest, "w", encoding="utf-8", newline="") as g:
            g.write(f.read())
    ceaps.append(dest)
alba = exige(cache("alba", "verba.csv"))
c.execute(f"""create or replace table tmp.ceap as select * from {csv_sql(ceap, encoding=None, escape="'\"'", strict_mode='false', union_by_name='true')}
where ideCadastro in (select idc from tmp.cam)""")
c.execute(f"""create or replace table tmp.ceaps as select * from {csv_sql(ceaps, encoding=None, skip=1, escape="'\"'", strict_mode='false', union_by_name='true')}
where SENADOR in (select nome_ceaps from tmp.sen)""")
c.execute(f"""create or replace table saida.cota_despesa as
select row_number() over (order by candidato_id, casa, ano, mes) id, * from (
select k.cid candidato_id, 'camara' casa, e.numAno::int ano, try_cast(e.numMes as int) mes, try_cast(left(e.datEmissao, 10) as date) data_documento,
  e.txtDescricao categoria, {grupo('e.txtDescricao')} categoria_grupo, nullif(e.txtDescricaoEspecificacao, '') especificacao, e.txtFornecedor fornecedor,
  py_cnpj(e.txtCNPJCPF) fornecedor_cnpj, py_pf(e.txtCNPJCPF) fornecedor_pf, nullif(e.txtNumero, '') numero_documento,
  try_cast(e.vlrDocumento as decimal(18,2)) valor_documento, try_cast(e.vlrGlosa as decimal(18,2)) valor_glosa,
  try_cast(e.vlrLiquido as decimal(18,2)) valor_liquido, nullif(e.txtPassageiro, '') passageiro, nullif(e.txtTrecho, '') trecho,
  null::varchar detalhamento, null::varchar processo, nullif(e.urlDocumento, '') url_documento, {fid['camara_ceap']} fonte_id
from tmp.ceap e join tmp.cam k on k.idc = e.ideCadastro
union all
select k.cid, 'senado', e.ANO::int, try_cast(e.MES as int), try_strptime(e.DATA, '%d/%m/%Y')::date, e.TIPO_DESPESA, {grupo('e.TIPO_DESPESA')}, null,
  e.FORNECEDOR, py_cnpj(e.CNPJ_CPF), py_pf(e.CNPJ_CPF), nullif(e.DOCUMENTO, ''), {V('e.VALOR_REEMBOLSADO')}, null, {V('e.VALOR_REEMBOLSADO')},
  null, null, nullif(e.DETALHAMENTO, ''), null, null, {fid['senado_ceaps']}
from tmp.ceaps e join tmp.sen k on k.nome_ceaps = e.SENADOR
union all
select k.id, 'alba', a.ano::int, a.mes::int, null, a.tipo_despesa, {grupo('a.tipo_despesa')}, null, a.nome_fornecedor, py_cnpj(a.cnpj_cpf_fornecedor),
  py_pf(a.cnpj_cpf_fornecedor), a.num_documento, a.vlr_documento::decimal(18,2), a.vlr_glosa::decimal(18,2), a.vlr_liquido::decimal(18,2),
  null, null, null, a.num_processo, a.url_documento, {fid['alba_verba']}
from {csv_sql(alba, encoding=None)} a join saida.candidato k on k.id_alba = a.id_alba::int)""")

# ------------------------------------------------------------------ Câmara: votações e votos (2019–2026)
A = lambda t: csv_sql(sorted(glob.glob(cache("camara", "arquivos", f"{t}-*.csv"))), encoding=None, escape="'\"'", strict_mode="false", union_by_name="true")
c.execute(f"create or replace table tmp.vcam as select v.*, k.cid from {A('votacoesVotos')} v join tmp.cam k on k.idc = v.deputado_id")
kv = ler_json(os.path.join(BASE, "votacoes_chave.json"))["votacoes"]
c.execute("create or replace table tmp.kv (id varchar, rot varchar)")
c.executemany("insert into tmp.kv values (?,?)", [(v["id"], v["rotulo"]) for v in kv])
c.execute(f"""create or replace table tmp.votacoes as select distinct on (id) * from {A('votacoes')}
where id in (select idVotacao from tmp.vcam) or id in (select id from tmp.kv)""")
c.execute(f"""create or replace table tmp.orient as
select idVotacao, arg_min(orientacao, case siglaBancada when 'Governo' then 0 else 1 end) orientacao
from {A('votacoesOrientacoes')} where siglaBancada in ('Governo', 'GOV.') and idVotacao in (select id from tmp.votacoes) group by 1""")
c.execute(f"""create or replace table tmp.vprop1 as
select idVotacao, arg_min(proposicao_id, proposicao_id) pid, arg_min(proposicao_titulo, proposicao_id) titulo,
  arg_min(proposicao_ementa, proposicao_id) ementa, arg_min(proposicao_uri, proposicao_id) uri
from {A('votacoesProposicoes')} where idVotacao in (select id from tmp.votacoes) group by 1""")
c.execute(f"create or replace table tmp.ptemas as select uriProposicao, tema, relevancia from {A('proposicoesTemas')}")
c.execute("create or replace table tmp.tema1 as select uriProposicao, arg_min(tema, try_cast(relevancia as int)) tema from tmp.ptemas group by 1")
c.execute(f"""create or replace table saida.votacao as
select 'camara:' || v.id id, 'camara' casa, try_cast(v.data as date) as "data", v.siglaOrgao orgao, v.descricao, p.titulo proposicao,
  p.ementa proposicao_ementa, t.tema, case v.aprovacao when '1' then true when '0' then false end aprovada, null::varchar resultado,
  try_cast(v.votosSim as int) votos_sim, try_cast(v.votosNao as int) votos_nao, try_cast(v.votosOutros as int) votos_outros,
  o.orientacao orientacao_governo, kv.id is not null eh_chave, kv.rot rotulo_chave,
  case when p.pid is not null then 'https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=' || p.pid end url,
  'https://dadosabertos.camara.leg.br/api/v2/votacoes/' || v.id url_api, {fid['camara_votacoes']} fonte_id
from tmp.votacoes v left join tmp.vprop1 p on p.idVotacao = v.id left join tmp.orient o on o.idVotacao = v.id
left join tmp.kv kv on kv.id = v.id left join tmp.tema1 t on t.uriProposicao = p.uri""")
c.execute("""create or replace table saida.voto as
select v.cid candidato_id, 'camara:' || v.idVotacao votacao_id, coalesce(nullif(trim(v.voto), ''), '(vazio)') voto, v.deputado_siglaPartido partido_na_epoca,
  case when o.orientacao in ('Sim', 'Não') and v.voto in ('Sim', 'Não') then o.orientacao = v.voto end alinhado_governo, null::varchar contradicao
from tmp.vcam v left join tmp.orient o on o.idVotacao = v.idVotacao
qualify row_number() over (partition by v.cid, v.idVotacao) = 1""")

# ------------------------------------------------------------------ Senado: votações e matérias (API, por senador)
SEN = "https://legis.senado.leg.br/dadosabertos"
votos, props = [], []
anos = range(2019, int(os.environ.get("SENADO_ANO_FIM", "2026")) + 1)
for cid, cod in c.execute("select cid, ids from tmp.sen").fetchall():
    for a in anos:
        for i, f in (("01-01", "06-30"), ("07-01", "12-31")):
            for v in api("senado", f"{SEN}/votacao?codigoParlamentar={cod}&dataInicio={a}-{i}&dataFim={a}-{f}") or []:
                meu = next((x for x in v.get("votos") or [] if str(x.get("codigoParlamentar")) == str(cod)), {})
                votos.append((cid, cod, str(v.get("codigoSessaoVotacao")), v.get("dataSessao"), v.get("identificacao"), v.get("codigoMateria"),
                              v.get("descricaoVotacao"), v.get("ementa"), v.get("resultadoVotacao"), meu.get("siglaVotoParlamentar"),
                              meu.get("siglaPartidoParlamentar")))
    for p in api("senado", f"{SEN}/processo?codigoParlamentarAutor={cod}") or []:
        props.append((cid, p.get("codigoMateria"), p.get("identificacao"), p.get("dataApresentacao"), p.get("ementa"), p.get("situacaoAtual"),
                      p.get("tipoDocumento"), p.get("urlDocumento")))
c.execute("""create or replace table tmp.sen_votos (cid int, cod int, sessao varchar, data varchar, identificacao varchar, codigoMateria varchar,
  descricao varchar, ementa varchar, resultado varchar, voto varchar, partido varchar)""")
if votos:
    c.executemany("insert into tmp.sen_votos values (?,?,?,?,?,?,?,?,?,?,?)", votos)
c.execute("""create or replace table tmp.sen_props (cid int, codigoMateria varchar, identificacao varchar, data varchar, ementa varchar, situacao varchar,
  tipoDocumento varchar, urlDocumento varchar)""")
if props:
    c.executemany("insert into tmp.sen_props values (?,?,?,?,?,?,?,?)", props)
c.execute(f"""insert into saida.votacao
select distinct on (s.sessao) 'senado:' || s.sessao, 'senado', try_cast(s.data as date), 'PLEN', s.descricao, s.identificacao, s.ementa, null,
  case when s.resultado ilike 'aprovad%' then true when s.resultado ilike 'rejeitad%' then false end, s.resultado, null, null, null, null, false, null,
  case when s.codigoMateria is not null then 'https://www25.senado.leg.br/web/atividade/materias/-/materia/' || s.codigoMateria end,
  '{SEN}/votacao?codigoParlamentar=' || s.cod, {fid['senado_votacoes']}
from tmp.sen_votos s where 'senado:' || s.sessao not in (select id from saida.votacao)""")
c.execute("""insert into saida.voto
select cid, 'senado:' || sessao, coalesce(voto, '(vazio)'), partido, null, null from tmp.sen_votos
qualify row_number() over (partition by cid, sessao) = 1""")

# ------------------------------------------------------------------ proposições
c.execute(f"create or replace table tmp.pautores as select * from {A('proposicoesAutores')} where idDeputadoAutor in (select idc from tmp.cam) and ordemAssinatura = '1'")
c.execute(f"""create or replace table tmp.props as select distinct on (id) * from {A('proposicoes')}
where id in (select idProposicao from tmp.pautores) order by id, ultimoStatus_dataHora desc""")
c.execute(f"""create or replace table saida.proposicao as
select 'camara:' || p.id id, k.cid candidato_id, 'camara' casa, p.siglaTipo sigla_tipo, p.numero, try_cast(p.ano as int) ano,
  try_cast(left(p.dataApresentacao, 10) as date) data_apresentacao, p.ementa, t.tema,
  p.ultimoStatus_descricaoSituacao situacao, true autor_principal, p.siglaTipo in ('PL', 'PLP', 'PEC', 'PDL', 'PLV', 'MPV', 'PRC') tipo_principal, false destaque,
  'https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=' || p.id url, nullif(p.urlInteiroTeor, '') url_inteiro_teor, {fid['camara_proposicoes']} fonte_id
from tmp.pautores a join tmp.props p on p.id = a.idProposicao join tmp.cam k on k.idc = a.idDeputadoAutor
left join tmp.tema1 t on t.uriProposicao = p.uri
qualify row_number() over (partition by p.id, k.cid) = 1""")
c.execute(f"""insert into saida.proposicao
select 'senado:' || s.codigoMateria, s.cid, 'senado', split_part(s.identificacao, ' ', 1), regexp_extract(s.identificacao, ' (\\d+)/', 1),
  year(try_cast(s.data as date)), try_cast(s.data as date), s.ementa, null, s.situacao, null,
  s.tipoDocumento ilike 'Projeto%' or s.tipoDocumento ilike 'Proposta de Emenda%', false,
  'https://www25.senado.leg.br/web/atividade/materias/-/materia/' || s.codigoMateria, nullif(s.urlDocumento, ''), {fid['senado_processos']}
from tmp.sen_props s qualify row_number() over (partition by s.codigoMateria, s.cid) = 1""")

for t in ["emenda", "emenda_favorecido", "emenda_convenio", "emenda_pix", "emenda_pix_show", "cota_despesa", "votacao", "voto", "proposicao"]:
    print(f"  {t:18s}", c.execute(f"select count(*), count(distinct {'candidato_id' if t != 'votacao' else 'casa'}) from saida.{t}").fetchone())
print(c.sql("select casa, count(distinct candidato_id) candidatos, count(*) notas, sum(valor_liquido)::bigint total from saida.cota_despesa group by 1"))
