// Seletores com popup (Base UI): combobox com busca (partido, município) e menu de escolha única
// (ordenação, gênero, cor/raça, faixa). 
import { Combobox } from "@base-ui/react/combobox"
import { Menu } from "@base-ui/react/menu"
import { Check, ChevronDown, X } from "lucide-react"
import { fmtInt } from "../../lib/format.js"
import { juntar } from "./base.jsx"

const CONTROLE = "h-11 md:h-10 rounded-[var(--radius)] border bg-surface font-mono text-[12px] font-medium uppercase tracking-[0.05em] text-foreground outline-none transition-colors"
const POPUP = "z-popover overflow-hidden rounded-[var(--radius)] border border-grid bg-surface shadow-lg outline-none"
const ITEM = "flex cursor-pointer items-center justify-between gap-4 px-3 py-2 font-mono text-[12px] uppercase tracking-[0.04em] text-foreground outline-none select-none data-[highlighted]:bg-accent-soft data-[highlighted]:text-accent-strong"

const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

/**
 * Combobox com busca (partido, município). opcoes: [{ value, label, n }]. valor: string ("" = nenhum).
 */
export function ComboFiltro({ opcoes, valor, onChange, placeholder = "Filtrar…", rotulo, largura = "min-w-[190px]", className }) {
  const selecionado = opcoes.find((o) => o.value === valor) ?? null
  return (
    <Combobox.Root
      items={opcoes}
      value={selecionado}
      onValueChange={(o) => onChange(o?.value ?? "")}
      isItemEqualToValue={(a, b) => a?.value === b?.value}
      filter={(item, query) => semAcento(item.label).includes(semAcento(query))}
      autoHighlight
    >
      <div className={juntar("relative", largura, className)}>
        <Combobox.Input
          placeholder={placeholder}
          aria-label={rotulo}
          className={juntar(CONTROLE, "w-full px-3 pr-16 text-base md:text-[12px] placeholder:text-muted-foreground focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent",
            selecionado ? "border-accent text-accent-strong" : "border-grid-strong")}
        />
        {selecionado && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute right-8 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-[2px] text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            aria-label={`Limpar ${rotulo?.toLowerCase() ?? "filtro"}`}
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        )}
        <Combobox.Trigger aria-label={`Abrir lista: ${rotulo ?? ""}`} className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center text-muted-foreground">
          <ChevronDown aria-hidden="true" className="size-4" />
        </Combobox.Trigger>
      </div>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={6} align="start" className="z-popover">
          <Combobox.Popup className={juntar(POPUP, "w-[max(var(--anchor-width),220px)] max-w-[var(--available-width)]")}>
            <Combobox.Empty className="px-3 py-3 text-[13px] text-muted-foreground empty:p-0">Nada encontrado.</Combobox.Empty>
            <Combobox.List className="max-h-[min(18rem,var(--available-height))] overflow-y-auto overscroll-contain py-1 data-[empty]:p-0">
              {(o) => (
                <Combobox.Item key={o.value} value={o} className={ITEM}>
                  <span className="flex min-w-0 items-center gap-2">
                    <Combobox.ItemIndicator className="text-accent"><Check aria-hidden="true" className="size-3.5" /></Combobox.ItemIndicator>
                    <span className="truncate">{o.label}</span>
                  </span>
                  {o.n != null && <span className="numero shrink-0 text-[11px] text-muted-foreground">{fmtInt(o.n)}</span>}
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}

/**
 * Menu de escolha única (ordenação, gênero, cor/raça, faixa). opcoes: [{ value, label, curto?, n? }].
 * `prefixo` aparece no botão: "Gênero: Mulheres".
 */
export function MenuEscolha({ opcoes, valor, onChange, rotulo, prefixo, destacarAtivo = true, className }) {
  const atual = opcoes.find((o) => o.value === valor) ?? opcoes[0]
  const ativo = destacarAtivo && atual && atual !== opcoes[0]
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger
        className={juntar(CONTROLE, "inline-flex items-center justify-between gap-2 px-3 focus-visible:ring-2 focus-visible:ring-accent",
          ativo ? "border-accent text-accent-strong" : "border-grid-strong hover:border-accent", className)}
        aria-label={`${rotulo}: ${atual?.label ?? ""}`}
      >
        <span className="truncate">
          {prefixo && <span className="text-muted-foreground">{prefixo}: </span>}
          {atual?.curto ?? atual?.label}
        </span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 opacity-70" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align="start" className="z-popover">
          <Menu.Popup className={juntar(POPUP, "min-w-[var(--anchor-width)] max-w-[var(--available-width)] py-1")}>
            <Menu.RadioGroup value={atual?.value} onValueChange={(v) => onChange(v)}>
              {opcoes.map((o) => (
                <Menu.RadioItem key={String(o.value)} value={o.value} className={ITEM} closeOnClick>
                  <span className="flex items-center gap-2">
                    <span className="flex size-3.5 items-center justify-center">
                      <Menu.RadioItemIndicator className="text-accent"><Check aria-hidden="true" className="size-3.5" /></Menu.RadioItemIndicator>
                    </span>
                    {o.label}
                  </span>
                  {o.n != null && <span className="numero text-[11px] text-muted-foreground">{fmtInt(o.n)}</span>}
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
