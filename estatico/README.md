# Versão estática

O site também roda sem servidor e sem banco: o conteúdo do Postgres é exportado para arquivos JSON e o front,
compilado em modo estático, lê esses arquivos e faz no navegador os filtros, a busca, a ordenação e a paginação que
a API faz no servidor. As URLs, as telas e o comportamento são os mesmos.

## Gerar

Pré-requisitos: os mesmos do modo servidor (Node 20+ e o banco `ba2026` no Postgres; ver o README principal).

```bash
npm run estatico            # na raiz: exporta os JSON, compila o front e monta publicar/
npm run estatico:servir     # serve publicar/ em http://localhost:4173 para conferir
```

`npm run estatico` roda `estatico/gerar.mjs`, que:

1. exporta o banco com `estatico/exportar.mjs` para `estatico/saida/dados/` (alguns segundos);
2. compila o front com `VITE_MODO=estatico` para `estatico/saida/web/` (não mexe em `web/dist/`, que é o do modo servidor);
3. monta `publicar/` = front compilado (com `fotos/` e `hero/`) + `dados/` + `_redirects` (toda rota do site devolve
   `index.html`) + `_headers` (cabeçalhos de segurança e cache de `/assets`, `/fotos`, `/hero` e `/dados`);
4. confere os limites (quantidade de arquivos, tamanho do maior arquivo, tamanho do `_headers`) e mostra o resumo.

`publicar/` é uma pasta de arquivos estáticos comum: qualquer servidor que devolva `index.html` para rotas
desconhecidas (fallback de SPA) consegue servi-la. `_redirects` e `_headers` seguem um formato aceito por várias
hospedagens e são ignorados pelas demais; nesse caso configure no servidor o fallback do SPA e, se quiser, os mesmos
cabeçalhos (a lista está em `api/seguranca.js`).

Opções: `node estatico/gerar.mjs --sem-exportar` reaproveita os JSON já exportados;
`node estatico/exportar.mjs --so slug1,slug2` exporta só algumas fichas (para testes).

## Tamanho (30/09/2026)

| pasta | arquivos | tamanho |
|---|---:|---:|
| `dados/` | 2.380 | 89 MB |
| `fotos/` | 1.224 | 7 MB |
| `assets/` (JS, CSS, fontes) | 34 | 1 MB |
| outros (`index.html`, `favicon.svg`, `hero/`, `_redirects`, `_headers`) | 5 | < 1 MB |
| **total** | **3.643** | **97 MB** |

O maior arquivo tem 3,5 MB (`dados/votacoes.json`); o exportador falha se algum passar de 20 MB.

## Formato dos dados

Cada arquivo tem exatamente o formato da resposta da rota da API correspondente, porque o exportador chama os
próprios handlers de `api/rotas/*.js` (a lógica de consulta não é duplicada).

| arquivo | conteúdo |
|---|---|
| `dados/inicio.json`, `dados/fontes.json` | respostas de `/api/inicio` e `/api/fontes` |
| `dados/listas/<grupo>.json` | todos os candidatos do grupo (`senado`, `deputado-federal`, `deputado-estadual`, `parlamentar`), todas as situações, com os campos da lista e a chapa; o cliente filtra, conta as facetas (`/api/filtros`), ordena e pagina |
| `dados/busca.json` | índice leve de todos os candidatos para a busca global |
| `dados/candidatos/<slug>.json` | ficha (`/api/candidatos/:slug`) + todas as seções pequenas (visão geral, patrimônio, campanha por ano, atuação, emendas, cota, sanções, trajetória, fontes) |
| `dados/candidatos/<slug>/<lista>.json` | só quando há linhas: todas as linhas de `campanha-despesas`, `atuacao-votos`, `atuacao-proposicoes`, `emendas-lista`, `cota-notas`, em formato colunar (`{ colunas, linhas }`) |
| `dados/votacoes.json` | dicionário das votações (descrição, proposição, orientação do governo, link…) compartilhado pelos arquivos de votos |

No front, `web/src/lib/api.js` escolhe o modo pelo `VITE_MODO` do build (`api`, padrão, ou `estatico`); no modo
estático, `web/src/lib/estatico.js` responde às mesmas URLs `/api/...` a partir desses arquivos. A busca sem acento e
aproximada reproduz a do banco (`unaccent` + `word_similarity` do `pg_trgm`, limiar 0,6).

## Conferir contra a API

```bash
node estatico/conferir.mjs                 # ~10 mil URLs (listas, facetas, busca, fichas, seções, tabelas com filtros)
node estatico/conferir.mjs --amostra 400   # mais fichas na amostra (~30 mil URLs)
```

Compara, URL a URL, a resposta dos handlers da API (chamados direto, sem HTTP) com a do modo estático lendo os JSON
exportados. Na última geração: 30.050 URLs, nenhuma diferença.
