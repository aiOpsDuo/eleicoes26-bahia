# Front (`web/`)

React 19 + Vite + Tailwind CSS v4. Porta 5173 em desenvolvimento, com proxy de `/api` para a API (3333).

```bash
npm --prefix web i
npm --prefix web run dev      # http://localhost:5173 (precisa da API rodando)
npm --prefix web run build    # web/dist (modo api, servido por start.sh)
```

Rotas: `/` (início), `/senado`, `/deputado-federal`, `/deputado-estadual` (listas com filtros na URL),
`/candidato/:slug` (ficha; aba em `?aba=`), `/fontes`.

## Modos de dados

`src/lib/api.js` concentra o acesso aos dados (`useApi(url)`, `buscarJSON(url)`, `urlApi(rota, params)`); as telas
sempre pedem URLs `/api/...`. O modo é escolhido no build:

- `VITE_MODO=api` (padrão): `fetch` na API Node.
- `VITE_MODO=estatico`: `src/lib/estatico.js` responde às mesmas URLs a partir dos JSON de `/dados` (gerados por
  `estatico/exportar.mjs`), com filtros, busca, ordenação e paginação no navegador. Ver `estatico/README.md`.

## Organização

```
src/
  config.js                 hero (imagem configurável) e textos do site
  styles/index.css          tokens de cor/tipografia (:root) + utilitários
  lib/api.js                useApi(url) com cache; urlApi(); modo api|estatico
  lib/estatico.js           resolvedor das URLs /api/... no modo estático
  lib/format.js             pt-BR: fmtBRLCompacto (R$ 1,2 mi), fmtData (dd/mm/aaaa), fmtInt, fmtPct…
  lib/rotulos.js            cargos, grupos (telas), ordenações, rótulos
  components/ui/            Botao, Moldura, Secao, Selo, Cartao, Esqueleto, Segmentos, Paginacao, seletores, estados
  components/Fonte.jsx      <Fonte>, <CampoComFonte>, <TabelaDocumentos>, FontesProvider/useFonte
  components/candidato.jsx  FotoCandidato (foto ou iniciais), CandidatoCard, CandidatoLinha, Chapa, SeloSituacao
  components/ficha/         ProfileTabs (abas), pecas (Bloco, Numero, Tabela, TabelaServidor…), graficos
  components/layout/        Layout (navbar, rodapé), BuscaGlobal (⌘K)
  pages/                    Inicio, Lista, Ficha, Fontes, NaoEncontrado
  pages/ficha/abas.jsx      registro das abas (visibilidade por candidato); uma Aba*.jsx por seção
```

### Todo dado tem fonte

```jsx
<Fonte chave="tse_bens_2026" />                          // fonte da tabela `fonte` por chave
<Fonte id={linha.fonte_id} href={linha.fonte_url} />     // fonte da linha, apontando para o documento específico
<CampoComFonte rotulo="Patrimônio 2026" valor={fmtBRLCompacto(v)} chave="tse_bens_2026" />
```

### Imagem do topo (hero)

O padrão é um relevo em pixels gerado por `npm --prefix web run hero` (`scripts/gerar-hero.mjs`, determinístico).
Para trocar: coloque o arquivo em `public/hero/` e ajuste `HERO.imagem` em `src/config.js`, ou crie `web/.env` com
`VITE_HERO_IMAGEM=/hero/arquivo.jpg` (foto: `VITE_HERO_MODO=foto`; enquadramento: `VITE_HERO_POSICAO`).

### Fotos

Parlamentares com id na Câmara/Senado usam a foto oficial da Casa. Os demais usam as fotos oficiais do TSE
(`foto_cand2026_BA_div.zip`), extraídas em `public/fotos/tse/{SQ_CANDIDATO}.jpg` (~7 MB, 161×225) pela coleta
(`coleta/carregar/92_fotos_tse.py`). Sem foto, o front mostra as iniciais.
