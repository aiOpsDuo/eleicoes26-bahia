// Configuração visual do site.
// HERO: imagem de destaque do topo. Coloque o arquivo em web/public/hero/ e troque `imagem`
// (ou defina VITE_HERO_IMAGEM=/hero/minha-foto.jpg num arquivo .env em web).
// O padrão é um relevo em pixels azul-claro gerado por `npm run hero` (scripts/gerar-hero.mjs).
export const HERO = {
  imagem: import.meta.env.VITE_HERO_IMAGEM || "/hero/relevo.svg",
  // posição da imagem dentro do hero (CSS object-position)
  posicao: import.meta.env.VITE_HERO_POSICAO || "right bottom",
  // "arte" = ilustração clara ocupando a base do hero; "foto" = imagem cobrindo o hero com véu claro por cima
  modo: import.meta.env.VITE_HERO_MODO || "arte",
}

export const SITE = {
  titulo: "Eleições 2026 · Bahia",
  rodape: "Dados públicos oficiais — cada informação tem link para a fonte",
}
