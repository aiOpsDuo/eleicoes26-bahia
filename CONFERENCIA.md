# Conferência de dados (30/09/2026)

Amostra de valores exibidos no site conferidos (a) contra o banco `ba2026` e (b) contra a fonte oficial,
abrindo o link/documento ou consultando a API oficial. Só GETs públicos. Cobre senador, deputados federais e estaduais
(escopo atual do site). Os itens abaixo foram conferidos de novo depois que a carga passou a ser feita só a partir de
fontes oficiais (`coleta/run_all.sh`): mesmos valores. O item 3 pode ser refeito a qualquer momento com
`coleta/ferramentas/conferir_emendas_api.mjs` (precisa de `PORTAL_API_KEY` no ambiente).

| # | Valor exibido | Onde aparece | Fonte conferida | Resultado |
|---|---|---|---|---|
| 1 | Kel Torres (dep. federal, sem mandato) — patrimônio **R$ 117.000** e arrecadado **R$ 500.000** | `/candidato/kel-torres` | DivulgaCandContas, SQ 50002532507: bens 117000; receitas R$ 500.000,00 | OK |
| 2 | Robinson (dep. estadual) e Pastor Sargento Isidório (dep. federal) — patrimônio **R$ 1.376.762,74** e **R$ 753.926,59** | fichas | DivulgaCandContas: 1376762.74 e 753926.59 | OK |
| 3 | Félix Mendonça Júnior — emendas **2024**: 8 emendas, empenhado **R$ 37.872.992,39**, pago no exercício R$ 36.850.528,99, RP pagos R$ 892.165,03 | `/candidato/felix-mendonca?aba=emendas` (por ano) | API do Portal da Transparência (`/emendas?nomeAutor=FELIX MENDONCA JUNIOR&ano=2024`, consulta ao vivo) | OK (idêntico) |
| 4 | Alice Portugal — emendas **2023**: 18 emendas, empenhado **R$ 27.704.526,00** | aba Emendas | API do Portal (ao vivo) | OK |
| 5 | Elmar Nascimento — emendas **2025**: 8 emendas, empenhado **R$ 39.141.730,70**, pago R$ 28.204.605,08 | aba Emendas | API do Portal (ao vivo) | OK |
| 6 | Emenda 202427420007 (Félix, 2024, Defesa nacional) — empenhado **R$ 299.734,00**, pago R$ 280.685,00 | aba Emendas → lista, link “Portal” | Link `portaldatransparencia.gov.br/emendas/detalhe?codigoEmenda=202427420007` abre a emenda com os mesmos valores | OK |
| 7 | Nota da cota — Félix, 16/11/2025, HGIG Comércio e Serviços (Posto BTS), **R$ 2.000,00** | aba Cota → notas (combustível) | Link da nota (`camara.leg.br/cota-parlamentar/nota-fiscal-eletronica?ideDocumentoFiscal=8016241`) abre a NFC-e na SEFAZ-BA: R$ 2.000,00, mesmo fornecedor e nº 22611. Total 2025 do deputado (420 notas, **R$ 482.474,21**) = soma do arquivo oficial `Ano-2025.csv` da Câmara | OK |
| 8 | Jaques Wagner (senador) — cota 2025: 771 reembolsos, **R$ 529.168,12** | `/candidato/jaques-wagner?aba=cota` | Arquivo oficial `despesa_ceaps_2025.csv` do Senado (soma de VALOR_REEMBOLSADO) | OK |
| 9 | Robinson (ALBA) — nota de dez/2025, GRASB Gráfica Santa Bárbara, **R$ 24.200,00** | `/candidato/robinson?aba=cota` | PDF no portal da ALBA (`al.ba.gov.br/fserver/:anexo:NFE20341.pdf`): NFS-e Salvador, valor total R$ 24.200,00, tomador Robinson Santos Almeida | OK |
| 10 | Voto — Afonso Florence, Licenciamento ambiental (PL 2159/2021), 16/07/2025: **Não**; placar 267×116 | aba Atuação → votações-chave | API da Câmara (`/votacoes/257161-454/votos`): Afonso Florence “Não” (registrado 17/07/2025 01:38); votação aprovada, Sim 267 / Não 116 | OK |
| 11 | Proposição — PL 5451/2026, Alice Portugal, apresentada 23/09/2026 (Instituto Nacional de Supervisão e Avaliação da Educação Superior) | aba Atuação → proposições | API da Câmara (`/proposicoes/2646961` e `/autores`: Alice Portugal, 1ª signatária); link da ficha de tramitação abre (200) | OK |


## Coerência interna (banco inteiro, SQL)

| Checagem | Resultado |
|---|---|
| Patrimônio 2026 da lista/cartão = soma dos bens 2026 (1.210 candidatos) | 0 divergências |
| Emendas: resumo = soma das emendas; `v_emenda_por_ano` = soma por ano | 0 divergências |
| Cota: resumo = soma das notas | 0 divergências |
| Arrecadado do cartão = `campanha_resumo`; receitas linha a linha = total (1.563 prestações TSE 2022/2026) | 0 divergências |
| Votos duplicados; emendas duplicadas | 0 |
| Notas de cota “duplicadas” (433 grupos) | Legítimas: complementação mensal do auxílio-moradia (mesmo valor todo mês, Câmara) e faturas mensais com nº de contrato repetido (ALBA, processos diferentes) |
| Valores negativos na cota (4.679, todos Câmara) | Legítimos: compensação de bilhete aéreo e desconto de auxílio-moradia, como a Câmara publica — agora explicado na aba |
| Datas fora do período | 1 despesa de campanha datada 03/10/2026 (Josy Almeida) e 1 nota do Senado com data 21/06/2002 em 2024 (Jaques Wagner): exatamente como na fonte; mantidas |
| Casamentos ALBA por nome com confiança média (15) | Todos conferidos por nome civil completo + candidatura de 2018/2022 a deputado estadual (eleito ou suplente) + período das notas coerente com a posse (suplentes começam em 2024–2026). Nenhum desligado |
| `mandato_atual = deputado_federal` × deputados da legislatura 57 na API da Câmara | 39; a regra é "tem mandato na legislatura 2023–2027", não "em exercício hoje" (lacuna conhecida) |

## Problemas encontrados e corrigidos na revisão

1. **CPF de fornecedor pessoa física no nº do documento** — despesas de campanha (o TSE usa o CPF do prestador como nº do recibo) e notas da ALBA exibiam CPF válido. Agora `***CPF***` (`coleta/carregar/91_pos_carga.sql`) e checagem no `95_validar.py`.
2. **Patrimônio em dobro** para quem tinha dois registros no mesmo ano (registros refeitos, ex.: PROS 2022), gerando “variação” falsa de −50%; também duplicava a trajetória. A montagem (`coleta/montar/30_tse.py`) usa um registro por (ano, CPF).
3. Redes sociais do TSE em caixa alta e com espaço (“HTTPS://WWW.FACEBOOK.COM/ FANPAGE…”) viravam link quebrado; agora normalizadas.
4. Cartão “Cota parlamentar” do topo da ficha mostrava só 2023–2026 enquanto a Visão geral e a aba mostravam todos os anos: agora o mesmo total, com o período.
