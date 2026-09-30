// Link/NavLink com transição de página nativa (View Transitions API) por padrão.
// Navegadores sem suporte simplesmente navegam sem animação.
import { forwardRef } from "react"
import { Link as RRLink, NavLink as RRNavLink } from "react-router"

export const Link = forwardRef(function Link({ viewTransition = true, ...props }, ref) {
  return <RRLink ref={ref} viewTransition={viewTransition} {...props} />
})

export const NavLink = forwardRef(function NavLink({ viewTransition = true, ...props }, ref) {
  return <RRNavLink ref={ref} viewTransition={viewTransition} {...props} />
})
