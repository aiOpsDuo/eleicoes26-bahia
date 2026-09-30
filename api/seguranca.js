// Cabeçalhos de segurança do site, usados pela API (server.js) e pela versão estática (estatico/gerar.mjs → _headers).
// Imagens externas: fotos oficiais (Câmara, Senado, TSE). Nada de script/estilo de terceiros.
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:", // o build embute fontes pequenas como data:
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ")

export const CABECALHOS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
}

// cache (segundos) por prefixo de caminho do front
const DIA = 86_400
export const CACHE_FRONT = {
  assets: `public, max-age=${365 * DIA}, immutable`, // nomes com hash
  fotos: `public, max-age=${7 * DIA}`,
  hero: `public, max-age=${DIA}`,
}
