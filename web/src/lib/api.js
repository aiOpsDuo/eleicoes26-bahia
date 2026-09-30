// Acesso aos dados + hook de carregamento com cache em memória. Dois modos, escolhidos no build:
//   VITE_MODO=api (padrão)  -> GET /api/... (API Node; no desenvolvimento, proxy do Vite para a porta 3333)
//   VITE_MODO=estatico      -> as mesmas URLs /api/... são resolvidas no navegador a partir dos JSON de /dados
//                              (lib/estatico.js, gerados por estatico/exportar.mjs). As telas não mudam.
import { useEffect, useRef, useState } from "react"
import { ErroApi } from "./erro.js"

export { ErroApi }
export const MODO = import.meta.env.VITE_MODO === "estatico" ? "estatico" : "api"

const cache = new Map() // url -> dados (o site é estático entre cargas: cache da sessão basta)

export async function buscarJSON(url, { signal } = {}) {
  if (cache.has(url)) return cache.get(url)
  if (MODO === "estatico") {
    const { resolverEstatico } = await import("./estatico.js")
    const dados = await resolverEstatico(url)
    if (signal?.aborted) throw new DOMException("cancelado", "AbortError")
    cache.set(url, dados)
    return dados
  }
  const r = await fetch(url, { signal, headers: { Accept: "application/json" } })
  if (!r.ok) {
    let msg = `Erro ${r.status}`
    try {
      msg = (await r.json()).erro ?? msg
    } catch {
      /* corpo não é JSON */
    }
    throw new ErroApi(r.status, msg)
  }
  const dados = await r.json()
  cache.set(url, dados)
  return dados
}

/** Monta /api/rota?params ignorando vazios. */
export function urlApi(rota, params = {}) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") sp.set(k, v)
  const qs = sp.toString()
  return `/api/${rota}${qs ? `?${qs}` : ""}`
}

/**
 * useApi(url): { dados, erro, carregando, recarregar }.
 * Mantém os dados anteriores enquanto a nova URL carrega (paginação/filtros sem "piscar").
 * url = null => não carrega.
 */
export function useApi(url) {
  const [estado, setEstado] = useState(() => ({
    dados: url && cache.has(url) ? cache.get(url) : null,
    erro: null,
    carregando: Boolean(url && !cache.has(url)),
    url,
  }))
  const [tentativa, setTentativa] = useState(0)
  const ultimo = useRef(url)

  useEffect(() => {
    ultimo.current = url
    if (!url) return
    if (cache.has(url)) {
      setEstado({ dados: cache.get(url), erro: null, carregando: false, url })
      return
    }
    const ctrl = new AbortController()
    setEstado((s) => ({ ...s, carregando: true, erro: null }))
    buscarJSON(url, { signal: ctrl.signal })
      .then((dados) => {
        if (ultimo.current === url) setEstado({ dados, erro: null, carregando: false, url })
      })
      .catch((erro) => {
        if (erro.name === "AbortError") return
        if (ultimo.current === url) setEstado((s) => ({ ...s, erro, carregando: false }))
      })
    return () => ctrl.abort()
  }, [url, tentativa])

  return {
    ...estado,
    // dados correspondem à URL atual? (false enquanto mostra os anteriores)
    atual: estado.url === url && !estado.carregando,
    recarregar: () => {
      cache.delete(url)
      setTentativa((t) => t + 1)
    },
  }
}
