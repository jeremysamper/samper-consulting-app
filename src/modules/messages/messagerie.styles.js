// Messagerie : styles partagés par la page Messages et le panneau de la barre
// du haut (ligne d'une personne, pastille d'initiales, fil, bulles, zone de
// saisie). Valeurs écrites par les jetons (direction Galet,
// .claude/rules/direction-galet.md) : graisses --g1 à --g3, tailles --t1 à
// --t4, rayon --r pour une ligne, --r-lg pour une bulle, filets --rule-soft,
// ligne choisie en --selection. Les contours s'écrivent en borderWidth,
// borderStyle et borderColor.

// Hauteur d'une cible d'action : 44 px au doigt (coque téléphone ou
// tablette), --controle (40 px) à l'ordinateur.
export const cibleDe = (tactile) => (tactile ? 44 : 'var(--controle)');

export const sm = {
  // Ligne d'une personne (conversation ou contact). 56 px de haut, 2 px entre
  // deux lignes : un pas de 58. flexShrink 0 : dans une colonne flex qui
  // défile, la règle tactile globale (min-height 44 px) superposerait sinon
  // les lignes sur iPad.
  ligne: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 56, padding: 8, boxSizing: 'border-box', background: 'transparent', borderWidth: 0, borderRadius: 'var(--r)', cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left', color: 'var(--text)', flexShrink: 0 },
  ligneActive: { background: 'var(--selection)' },
  pastille: { width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--selection)', color: 'var(--text2)', fontWeight: 'var(--g3)', fontSize: 'var(--t1)', flexShrink: 0 },
  corps: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 },
  haut: { display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 },
  nom: { flex: 1, minWidth: 0, fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  date: { fontSize: 'var(--t1)', color: 'var(--text3)', flexShrink: 0 },
  bas: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
  apercu: { flex: 1, minWidth: 0, fontSize: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  // Compteur de non-lus : --on-accent obligatoire. En --surface, la règle
  // « pastilles en texte » d'app.css retirait le fond (compteur invisible).
  nonLus: { minWidth: 18, height: 18, padding: '0 5px', borderRadius: 'var(--r-full)', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 'var(--t1)', fontWeight: 'var(--g3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  // Liste qui défile dans sa zone.
  liste: { flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: 2 },
  vide: { padding: 14, textAlign: 'center', color: 'var(--text2)', fontSize: 'var(--t1)', fontStyle: 'italic' },

  // Fil : en-tête, messages qui défilent, zone de saisie.
  filTete: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)', flexShrink: 0, minWidth: 0 },
  filTetePanneau: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px 6px 6px', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)', flexShrink: 0, minWidth: 0 },
  retour: { minHeight: 44, flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6 },
  filNom: { display: 'block', fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  filRole: { display: 'block', fontSize: 'var(--t1)', color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  messages: { flex: 1, minHeight: 160, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: 8, padding: 14, background: 'var(--bg)' },
  messagesPanneau: { flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: 8, padding: 12, background: 'var(--bg)' },
  jour: { alignSelf: 'center', fontSize: 'var(--t1)', fontWeight: 'var(--g2)', color: 'var(--text3)', padding: '4px 0', margin: '4px 0', flexShrink: 0 },
  bulleRang: { display: 'flex', alignItems: 'flex-end', gap: 4, flexShrink: 0, minWidth: 0 },
  // Bulles : data-cadre les soustrait à la règle « Plus de carrés », qui
  // aplatissait la bulle reçue (fond et contour retirés). Largeur de lecture :
  // 560 px au plus, quelle que soit la largeur du fil.
  bulle: { padding: '8px 14px', minWidth: 0, borderWidth: 1, borderStyle: 'solid', borderRadius: 'var(--r-lg)' },
  bulleMoi: { background: 'var(--selection)', borderColor: 'var(--selection)' },
  bulleAutre: { background: 'var(--surface)', borderColor: 'var(--rule-soft)' },
  bulleTexte: { fontSize: 'var(--t2)', color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'break-word' },
  bulleMeta: { fontSize: 'var(--t1)', color: 'var(--text2)', marginTop: 4 },
  supprimer: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, background: 'none', borderWidth: 0, borderRadius: 'var(--r)', color: 'var(--text3)', cursor: 'pointer', fontSize: 'var(--t3)', lineHeight: 1, flexShrink: 0 },
  saisie: { display: 'flex', flexDirection: 'column', gap: 6, padding: 10, borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--rule-soft)', flexShrink: 0 },
  saisieLigne: { display: 'flex', alignItems: 'flex-end', gap: 8, minWidth: 0 },
  champ: { flex: 1, minWidth: 0, padding: '10px 12px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r)', fontSize: 'var(--t2)', color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', boxSizing: 'border-box', resize: 'none', lineHeight: 1.5 },
  aide: { fontSize: 'var(--t1)', color: 'var(--text3)' },
  // Bouton micro de la ligne de saisie : carré, à la hauteur d'une cible.
  micro: { flexShrink: 0, padding: 0 },

  // Zone vocale (lot C3) : le texte d'état prend la place libre, les boutons
  // se rangent à droite et passent à la ligne quand la largeur manque.
  vocalLigne: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: 8, minWidth: 0 },
  vocalCorps: { flex: '1 1 180px', minWidth: 0 },
  vocalActions: { display: 'flex', gap: 8, flexShrink: 0, marginLeft: 'auto' },
  vocalEtat: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' },
  vocalColonne: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  vocalPoint: { width: 10, height: 10, borderRadius: '50%', background: 'var(--danger-text)', flexShrink: 0 },
  vocalTexte: { fontSize: 'var(--t2)', color: 'var(--text)', minWidth: 0, overflowWrap: 'break-word' },
  vocalTemps: { fontFamily: 'var(--font-num)', fontWeight: 'var(--g-chiffre)', fontSize: 'var(--t2)', color: 'var(--text2)', whiteSpace: 'nowrap' },
  vocalAide: { fontSize: 'var(--t1)', color: 'var(--text2)', minWidth: 0, overflowWrap: 'break-word' },
};
