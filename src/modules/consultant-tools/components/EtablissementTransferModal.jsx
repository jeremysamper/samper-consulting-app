import React from 'react';
import { normalizeSearch } from '../../../utils/searchText.js';
import { cts } from '../ConsultantTools.styles.js';

// ─────────────────────────────────────────────────────────────────────────────
// EtablissementTransferModal - envoi groupé de recettes vers un autre
// établissement, depuis le mode sélection de « Plats & Recettes ».
//
// Deux modes :
//   copie       - les recettes sont dupliquées ; l'établissement de départ ne
//                 bouge pas (plats et cartes qui les utilisent restent intacts).
//                 C'est le cas courant : déployer une recette d'un restaurant
//                 à l'autre.
//   deplacement - les recettes changent d'établissement. Elles quittent la
//                 bibliothèque de départ ET les plats qui les référencent
//                 là-bas (sinon un plat garderait un composant invisible).
//
// Doublons : dès qu'un établissement cible est choisi, on lit ses recettes pour
// signaler celles qui portent déjà le même nom. Par défaut on ne les transfère
// pas - transférer deux fois la même sélection ne doit pas créer de doublons
// silencieux dans la bibliothèque de la brigade.
//
// La modale ne fait AUCUNE écriture : elle renvoie le choix final au parent.
//
// Props :
//   recettes         : recettes sélectionnées (objets)
//   etablissements   : cibles possibles (déjà filtrées : accessibles, hors source)
//   sourceNom        : nom de l'établissement de départ (affichage)
//   loadRecettesCible: (etabId) => Promise<recettes[]> - détection des doublons
//   busy             : verrouille la modale pendant l'écriture
//   onConfirm        : ({ etablissementId, mode, ignorerDoublons, doublonsIds }) => void
//   onClose          : () => void
// ─────────────────────────────────────────────────────────────────────────────

export default function EtablissementTransferModal({
  recettes = [],
  etablissements = [],
  sourceNom = '',
  loadRecettesCible,
  busy = false,
  onConfirm,
  onClose,
}) {
  // Sélection figée à l'ouverture : un rafraîchissement realtime pendant qu'on
  // choisit la destination ne doit pas changer sous les doigts ce qui part.
  const [aTransferer] = React.useState(() => recettes);
  const [cibleId, setCibleId] = React.useState('');
  const [mode, setMode] = React.useState('copie');
  const [ignorerDoublons, setIgnorerDoublons] = React.useState(true);
  // 'idle' | 'loading' | 'ready' | 'error' : une lecture en échec ne doit pas
  // passer pour « aucun doublon » - on le dit, et on laisse valider quand même.
  const [statutDoublons, setStatutDoublons] = React.useState('idle');
  const [doublonsIds, setDoublonsIds] = React.useState(() => []);

  // Ref plutôt que dépendance d'effet : l'appelant passe naturellement une
  // lambda recréée à chaque rendu, la mettre en dépendance relancerait la
  // lecture en boucle.
  const loadRef = React.useRef(loadRecettesCible);
  loadRef.current = loadRecettesCible;

  React.useEffect(() => {
    const charger = loadRef.current;
    if (!cibleId || !charger) { setStatutDoublons('idle'); setDoublonsIds([]); return undefined; }
    let mounted = true;
    setStatutDoublons('loading');
    setDoublonsIds([]);
    (async () => {
      try {
        const cibles = await charger(cibleId);
        if (!mounted) return;
        const noms = new Set((cibles || []).map(r => normalizeSearch(r.nom)).filter(Boolean));
        setDoublonsIds(aTransferer.filter(r => noms.has(normalizeSearch(r.nom))).map(r => r.id));
        setStatutDoublons('ready');
      } catch (e) {
        if (mounted) setStatutDoublons('error');
      }
    })();
    return () => { mounted = false; };
  }, [cibleId, aTransferer]);

  const cible = etablissements.find(e => e.id === cibleId) || null;
  const nbDoublons = doublonsIds.length;
  const nbTransferes = ignorerDoublons ? aTransferer.length - nbDoublons : aTransferer.length;
  const peutValider = !!cibleId && nbTransferes > 0 && !busy;

  const verbe = mode === 'copie' ? 'Copier' : 'Déplacer';

  return (
    <div className="modal-full-overlay" style={cts.overlay} onClick={() => { if (!busy) onClose?.(); }}>
      <div
        className="modal-full"
        style={{ ...cts.modal, width: 520, maxWidth: '94vw', maxHeight: '84vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={ts.header}>
          <div style={{ minWidth: 0 }}>
            <div style={ts.title}>🏛 Transférer vers un autre établissement</div>
            <div style={ts.subtitle}>
              {aTransferer.length} recette{aTransferer.length > 1 ? 's' : ''} sélectionnée{aTransferer.length > 1 ? 's' : ''}
              {sourceNom ? ` depuis « ${sourceNom} »` : ''}.
            </div>
          </div>
          <button style={ts.closeBtn} onClick={() => onClose?.()} disabled={busy} title="Fermer">✕</button>
        </div>

        <div style={ts.body}>
          {etablissements.length === 0 ? (
            <div style={ts.empty}>
              Aucun autre établissement accessible avec ce compte. Rattachez-vous à l'établissement
              de destination depuis « Rôles &amp; accès » pour pouvoir y transférer des recettes.
            </div>
          ) : (
            <>
              <div style={ts.sectionLabel}>Établissement de destination</div>
              {etablissements.map(e => (
                <label
                  key={e.id}
                  style={{ ...ts.row, background: cibleId === e.id ? 'var(--accent-light)' : 'transparent', cursor: busy ? 'default' : 'pointer' }}
                >
                  <input
                    type="radio"
                    name="transfert-etab"
                    checked={cibleId === e.id}
                    disabled={busy}
                    onChange={() => setCibleId(e.id)}
                    style={{ width: 16, height: 16, flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={ts.rowNom}>{e.nom}</div>
                    {(e.type || e.adresse) && (
                      <div style={ts.rowMeta}>{[e.type, e.adresse].filter(Boolean).join(' · ')}</div>
                    )}
                  </div>
                </label>
              ))}

              <div style={ts.sectionLabel}>Que devient l'original ?</div>
              <label style={{ ...ts.row, background: mode === 'copie' ? 'var(--accent-light)' : 'transparent', cursor: busy ? 'default' : 'pointer' }}>
                <input
                  type="radio" name="transfert-mode" checked={mode === 'copie'} disabled={busy}
                  onChange={() => setMode('copie')} style={{ width: 16, height: 16, flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={ts.rowNom}>Copier : l'original reste ici</div>
                  <div style={ts.rowMeta}>Les plats et cartes de cet établissement ne sont pas touchés.</div>
                </div>
              </label>
              <label style={{ ...ts.row, background: mode === 'deplacement' ? 'var(--warning-bg)' : 'transparent', cursor: busy ? 'default' : 'pointer' }}>
                <input
                  type="radio" name="transfert-mode" checked={mode === 'deplacement'} disabled={busy}
                  onChange={() => setMode('deplacement')} style={{ width: 16, height: 16, flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={ts.rowNom}>Déplacer : l'original part</div>
                  <div style={ts.rowMeta}>Les recettes quittent la bibliothèque d'ici et sont retirées des plats qui les utilisent.</div>
                </div>
              </label>

              {cible && statutDoublons === 'loading' && (
                <div style={ts.info}>Vérification des recettes déjà présentes chez « {cible.nom} »…</div>
              )}
              {cible && statutDoublons === 'error' && (
                <div style={{ ...ts.info, color: 'var(--warning-text)', background: 'var(--warning-bg)', borderColor: 'var(--warning-bd)' }}>
                  Impossible de lire les recettes de « {cible.nom} » : les doublons ne peuvent pas être détectés.
                </div>
              )}
              {cible && statutDoublons === 'ready' && nbDoublons > 0 && (
                <label style={{ ...ts.row, ...ts.doublonRow, cursor: busy ? 'default' : 'pointer' }}>
                  <input
                    type="checkbox" checked={ignorerDoublons} disabled={busy}
                    onChange={() => setIgnorerDoublons(v => !v)}
                    style={{ width: 16, height: 16, flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={ts.rowNom}>
                      {nbDoublons > 1
                        ? `Ignorer les ${nbDoublons} recettes déjà présentes là-bas`
                        : 'Ignorer la recette déjà présente là-bas'}
                    </div>
                    <div style={ts.rowMeta}>Même nom chez « {cible.nom} ». Décochez pour créer un second exemplaire.</div>
                  </div>
                </label>
              )}

              <div style={ts.note}>
                Les ingrédients sont recopiés tels quels. Quand un produit du même nom existe au catalogue
                de l'établissement de destination, le lien et le prix de ce catalogue sont repris ; sinon
                le prix de départ est conservé, sans lien produit. Photo, étapes, allergènes et durées de
                vie suivent la recette.
              </div>
            </>
          )}
        </div>

        <div style={ts.footer}>
          <div style={{ flex: 1 }} />
          <button style={cts.ghostBtn} onClick={() => onClose?.()} disabled={busy}>Annuler</button>
          <button
            style={{ ...cts.newBtn, padding: '8px 16px', opacity: peutValider ? 1 : 0.5, cursor: peutValider ? 'pointer' : 'default' }}
            onClick={() => onConfirm?.({ etablissementId: cibleId, mode, ignorerDoublons, doublonsIds })}
            disabled={!peutValider}
          >
            {busy
              ? 'Transfert…'
              : `${verbe} ${nbTransferes} recette${nbTransferes > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const ts = {
  header: { padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  title: { fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-serif)', color: 'var(--text)' },
  subtitle: { fontSize: 11, color: 'var(--text2)', marginTop: 2, lineHeight: 1.4 },
  closeBtn: { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text2)', flexShrink: 0, lineHeight: 1 },
  body: { flex: 1, overflowY: 'auto', minHeight: 120, padding: '4px 20px 16px' },
  empty: { padding: 30, textAlign: 'center', color: 'var(--text2)', fontSize: 13, lineHeight: 1.5 },
  sectionLabel: { fontSize: 10, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.6, margin: '14px 0 6px' },
  // flexShrink 0 : sans lui les lignes se superposent sur mobile (min-height
  // global 44px sur les contrôles vs hauteur calculée par flex).
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 6, flexShrink: 0 },
  rowNom: { fontSize: 13, fontWeight: 600, color: 'var(--text)' },
  rowMeta: { fontSize: 11, color: 'var(--text2)', marginTop: 1, lineHeight: 1.4 },
  doublonRow: { marginTop: 10, background: 'var(--surface2)' },
  info: { marginTop: 10, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--text2)', lineHeight: 1.4 },
  note: { marginTop: 14, fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 },
  footer: { padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
};
