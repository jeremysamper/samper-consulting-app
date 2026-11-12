// ─────────────────────────────────────────────────────────────────────────────
// En-tête d'un écran de module monté dans la page des réglages (module en
// écran fixe, useEcranModule) : la ligne d'état et les actions de l'écran,
// sans « Retour » ni titre, que la page porte déjà. Remplace EcranTache dans
// ce seul cas ; rien n'est rendu s'il n'y a ni état ni action.
// ─────────────────────────────────────────────────────────────────────────────

export default function EnTeteSection({ etat = null, actions = null }) {
  if (!etat && !actions) return null;
  return (
    <div style={st.enTete} className="no-print">
      {etat ? <div style={st.etat}>{etat}</div> : <span />}
      {actions && <div className="module-actions">{actions}</div>}
    </div>
  );
}

const st = {
  enTete: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', minWidth: 0 },
  etat: { fontSize: 12, color: 'var(--text2)', lineHeight: 1.4, flex: '1 1 260px', minWidth: 0 },
};
