// Peças de votação usadas na Visão geral e na aba Atuação (fora do chunk da aba, que é carregada sob demanda).

// códigos do Senado e da Câmara => rótulo legível
export const VOTO_ROTULO = {
  Sim: "Sim",
  "Não": "Não",
  "Abstenção": "Abstenção",
  "Obstrução": "Obstrução",
  "Artigo 17": "Art. 17 (presidente da sessão)",
  "(vazio)": "Sem registro",
  Votou: "Votou (voto secreto)",
  "P-NRV": "Presente, não registrou voto",
  "P-OD": "Presente (obstrução declarada)",
  AP: "Atividade parlamentar",
  LS: "Licença saúde",
  LP: "Licença particular",
  MIS: "Missão oficial",
  NCom: "Não compareceu",
}
export const rotuloVoto = (v) => VOTO_ROTULO[v] ?? v ?? "Sem voto registrado"

// Cores neutras (sem verde/vermelho: voto não é "certo" ou "errado"). A distinção é por forma + rótulo:
// Sim = selo cheio (●), Não = selo vazado (○), demais = tracejado; sem voto = pontilhado.
const ESTILO_VOTO = {
  Sim: { cls: "border-foreground bg-foreground text-surface", marca: "●" },
  "Não": { cls: "border-foreground bg-surface text-foreground", marca: "○" },
}
const BASE_SELO_VOTO = "inline-flex items-center gap-1 whitespace-nowrap rounded-[2px] border px-1.5 py-0.5 font-mono text-[10.5px] font-medium uppercase leading-4 tracking-[0.06em]"

/** Selo do voto: texto sempre presente; a forma só reforça. */
export function CorVoto({ voto }) {
  if (!voto) {
    return (
      <span className={`${BASE_SELO_VOTO} border-dotted border-grid-strong bg-surface-2 text-muted-foreground`} title="Sem voto registrado nesta votação (ausência, licença ou fora do exercício)">
        Sem voto
      </span>
    )
  }
  const e = ESTILO_VOTO[voto]
  const texto = voto === "(vazio)" ? "Sem registro" : voto.length > 10 ? rotuloVoto(voto) : voto
  return (
    <span className={`${BASE_SELO_VOTO} ${e ? e.cls : "border-dashed border-grid-strong bg-surface text-muted-foreground"}`} title={rotuloVoto(voto)}>
      {e && <span aria-hidden="true" className="text-[9px] leading-none">{e.marca}</span>}
      {texto}
    </span>
  )
}
