import { StrictMode, lazy } from "react"
import { createRoot } from "react-dom/client"
import { createBrowserRouter, RouterProvider } from "react-router"
import "./styles/index.css"
import { Layout } from "./components/layout/Layout.jsx"
import { FontesProvider } from "./components/Fonte.jsx"
import { Inicio } from "./pages/Inicio.jsx"
import { NaoEncontrado } from "./pages/NaoEncontrado.jsx"
import { GRUPOS } from "./lib/rotulos.js"

// páginas carregadas sob demanda (a lista traz os seletores Base UI; a ficha cresce na fase 3)
const Lista = lazy(() => import("./pages/Lista.jsx").then((m) => ({ default: m.Lista })))
const Ficha = lazy(() => import("./pages/Ficha.jsx").then((m) => ({ default: m.Ficha })))
const Fontes = lazy(() => import("./pages/Fontes.jsx").then((m) => ({ default: m.Fontes })))

// Intro só no primeiro carregamento (textos do topo entram em sequência); a navegação interna usa View Transitions.
if (typeof document !== "undefined") {
  document.documentElement.classList.add("primeira-carga")
  setTimeout(() => document.documentElement.classList.remove("primeira-carga"), 2600)
}

// View Transitions: uma navegação que interrompe outra (ou aba em segundo plano) rejeita `ready`/`finished`
// com InvalidStateError/AbortError — é esperado; silencia para não poluir o console.
if (typeof document !== "undefined" && document.startViewTransition) {
  const original = document.startViewTransition.bind(document)
  document.startViewTransition = (...args) => {
    const t = original(...args)
    t.ready?.catch(() => {})
    t.finished?.catch(() => {})
    return t
  }
}

// pré-carrega as páginas pesadas quando o navegador estiver ocioso: a transição não passa pelo "carregando"
const preCarregar = () => { import("./pages/Lista.jsx"); import("./pages/Ficha.jsx"); import("./pages/Fontes.jsx") }
if (typeof window !== "undefined") (window.requestIdleCallback ?? ((f) => setTimeout(f, 800)))(preCarregar)

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Inicio /> },
      ...GRUPOS.map((g) => ({ path: `/${g.slug}`, element: <Lista grupo={g.slug} key={g.slug} /> })),
      { path: "/parlamentar", element: <Inicio /> },
      { path: "/candidato/:slug", element: <Ficha /> },
      { path: "/fontes", element: <Fontes /> },
      { path: "*", element: <NaoEncontrado /> },
    ],
  },
])

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <FontesProvider>
      <RouterProvider router={router} />
    </FontesProvider>
  </StrictMode>,
)
