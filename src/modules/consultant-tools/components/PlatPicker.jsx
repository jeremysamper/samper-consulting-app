import React from 'react';
import { grouperParCategorie, categorieDuPlat } from '../../../utils/categoriesPlat.js';
import { normalizeSearch } from '../../../utils/searchText.js';
import { cts } from '../ConsultantTools.styles.js';

// ─────────────────────────────────────────────────────────────────────────────
// PlatPicker - modale « Rattacher à un plat », rangée comme une carte.
//
// Remplace les deux listes à plat (une recette / une sélection de recettes) qui
// déroulaient tous les plats de l'établissement dans l'ordre de la base : sans
// repère de carte ni de rubrique, choisir la bonne entrée relevait du hasard dès
// la deuxième carte.
//
// Rangement : carte (dossier repliable) ▸ catégorie (Entrées → Boissons, ordre
// de service du référentiel partagé) ▸ plat. Un plat présent sur deux cartes
// apparaît dans les deux dossiers, avec la même case à cocher.
//
// Sélection multiple : on coche autant de plats qu'on veut, on valide une fois.
// Le parent reçoit la sélection FINALE et calcule lui-même ce qu'il faut lier
// ou délier - le picker ne déclenche aucune écriture.
//
// Props :
//   title / subtitle : en-tête
//   plats / cartes   : plats de l'établissement, cartes actives
//   initialSelected  : ids pré-cochés, décochables (= liens existants)
//   lockedIds        : ids pré-cochés NON décochables (déjà liés en mode masse)
//   badgeFor         : (plat) => noeud React | null - pastille de droite
//   confirmLabel     : (nbChangements) => libellé du bouton de validation
//   emptyHint        : texte affiché quand l'établissement n'a aucun plat
//   busy             : verrouille la modale pendant l'écriture
//   onConfirm        : (ids: string[]) => void - sélection finale
//   onClose          : () => void
//   onCreatePlat     : () => void | undefined - bouton « + Nouveau plat »
// ─────────────────────────────────────────────────────────────────────────────

const HORS_CARTE = '__hors_carte__';

export default function PlatPicker({
  title,
  subtitle,
  plats = [],
  cartes = [],
  initialSelected = [],
  lockedIds = [],
  badgeFor,
  confirmLabel = (n) => `Rattacher (${n})`,
  emptyHint = 'Aucun plat. Créez-en un d\'abord.',
  busy = false,
  onConfirm,
  onClose,
  onCreatePlat,
}) {
  const locked = React.useMemo(() => new Set(lockedIds), [lockedIds]);
  // Point de départ figé : la sélection de l'utilisateur ne doit pas être
  // réinitialisée par un rafraîchissement realtime pendant qu'il coche.
  const [depart] = React.useState(() => new Set([...initialSelected, ...lockedIds]));
  const [sel, setSel] = React.useState(() => new Set(depart));
  const [query, setQuery] = React.useState('');
  const [replies, setReplies] = React.useState(() => new Set());

  const q = normalizeSearch(query.trim());

  // Un plat matche sur son nom ou sa catégorie (« boisson » sort la rubrique).
  const platsVisibles = React.useMemo(() => (plats || []).filter(p =>
    q === '' ||
    normalizeSearch(p.nom).includes(q) ||
    normalizeSearch(categorieDuPlat(p)).includes(q)
  ), [plats, q]);

  // Dossiers : une carte active par menu + « Hors carte » pour les plats qui
  // n'en ont aucune (ou dont toutes les cartes sont archivées) - sans quoi ils
  // seraient injoignables depuis le picker.
  const dossiers = React.useMemo(() => {
    const carteIdsActives = new Set((cartes || []).map(c => c.id));
    const parCarte = (cartes || []).map(c => ({
      id: c.id,
      nom: c.nom,
      icone: '📋',
      plats: platsVisibles.filter(p => (p.carteIds || []).includes(c.id)),
    }));
    const horsCarte = platsVisibles.filter(p => !(p.carteIds || []).some(id => carteIdsActives.has(id)));
    if (horsCarte.length) parCarte.push({ id: HORS_CARTE, nom: 'Hors carte', icone: '🗂', plats: horsCarte });
    return parCarte.filter(d => d.plats.length > 0);
  }, [cartes, platsVisibles]);

  const toggle = (id) => {
    if (busy || locked.has(id)) return;
    setSel(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Cocher / décocher toute une rubrique d'un coup (les verrouillés restent).
  const toggleGroupe = (platsGroupe) => {
    if (busy) return;
    const ids = platsGroupe.map(p => p.id).filter(id => !locked.has(id));
    if (!ids.length) return;
    const tousCoches = ids.every(id => sel.has(id));
    setSel(prev => {
      const next = new Set(prev);
      ids.forEach(id => (tousCoches ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  // Nombre de changements réels : c'est ce que le bouton de validation annonce.
  const ajouts = [...sel].filter(id => !depart.has(id)).length;
  const retraits = [...depart].filter(id => !sel.has(id)).length;
  const changements = ajouts + retraits;

  return (
    <div className="modal-full-overlay" style={cts.overlay} onClick={() => { if (!busy) onClose?.(); }}>
      <div
        className="modal-full"
        style={{ ...cts.modal, width: 520, maxWidth: '94vw', maxHeight: '84vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={ps.header}>
          <div style={{ minWidth: 0 }}>
            <div style={ps.title}>🍽 {title}</div>
            {subtitle && <div style={ps.subtitle}>{subtitle}</div>}
          </div>
          <button style={ps.closeBtn} onClick={() => onClose?.()} disabled={busy} title="Fermer">✕</button>
        </div>

        {/* Champ de recherche permanent : dans une modale, la loupe repliable
            cacherait le seul moyen de retrouver un plat dans une longue carte. */}
        {plats.length > 0 && (
          <div style={ps.searchRow}>
            <input
              style={ps.searchInput}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Rechercher un plat ou une rubrique…"
              disabled={busy}
            />
            {query && (
              <button style={ps.clearBtn} onClick={() => setQuery('')} title="Effacer la recherche">✕</button>
            )}
          </div>
        )}

        <div style={ps.body}>
          {plats.length === 0 ? (
            <div style={ps.empty}>{emptyHint}</div>
          ) : dossiers.length === 0 ? (
            <div style={ps.empty}>Aucun plat ne correspond à « {query} ».</div>
          ) : (
            dossiers.map(dossier => {
              const replie = replies.has(dossier.id);
              const groupes = grouperParCategorie(dossier.plats);
              return (
                <div key={dossier.id}>
                  <div
                    style={ps.carteHeader}
                    role="button"
                    tabIndex={0}
                    aria-expanded={!replie}
                    onClick={() => setReplies(prev => {
                      const next = new Set(prev);
                      replie ? next.delete(dossier.id) : next.add(dossier.id);
                      return next;
                    })}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setReplies(prev => {
                          const next = new Set(prev);
                          replie ? next.delete(dossier.id) : next.add(dossier.id);
                          return next;
                        });
                      }
                    }}
                    title={replie ? 'Développer' : 'Réduire'}
                  >
                    <span style={{ fontSize: 10, color: 'var(--text2)' }}>{replie ? '▶' : '▼'}</span>
                    <span style={ps.carteNom}>{dossier.icone} {dossier.nom}</span>
                    <span style={ps.carteCount}>{dossier.plats.length}</span>
                  </div>

                  {!replie && groupes.map(([categorie, platsCat]) => {
                    const selectionnables = platsCat.filter(p => !locked.has(p.id));
                    const tousCoches = selectionnables.length > 0 && selectionnables.every(p => sel.has(p.id));
                    return (
                      <div key={dossier.id + '-' + categorie}>
                        <div style={ps.catHeader}>
                          <span style={ps.catNom}>{categorie}</span>
                          {selectionnables.length > 1 && (
                            <button
                              style={ps.catAllBtn}
                              onClick={() => toggleGroupe(platsCat)}
                              disabled={busy}
                              title={tousCoches ? 'Décocher la rubrique' : 'Cocher toute la rubrique'}
                            >{tousCoches ? 'Aucun' : 'Tous'}</button>
                          )}
                        </div>
                        {platsCat.map(p => {
                          const coche = sel.has(p.id);
                          const verrouille = locked.has(p.id);
                          const badge = badgeFor ? badgeFor(p) : null;
                          return (
                            <label
                              key={dossier.id + '-' + p.id}
                              style={{
                                ...ps.platRow,
                                background: coche ? 'var(--accent-light)' : 'transparent',
                                cursor: busy || verrouille ? 'default' : 'pointer',
                                opacity: busy ? 0.6 : 1,
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={coche}
                                disabled={busy || verrouille}
                                onChange={() => toggle(p.id)}
                                style={{ width: 16, height: 16, flexShrink: 0, cursor: busy || verrouille ? 'default' : 'pointer' }}
                              />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={ps.platNom}>{p.nom}</div>
                                <div style={ps.platMeta}>
                                  {p.prixVente != null ? `CHF ${Number(p.prixVente).toFixed(2)} · ` : ''}
                                  {(p.recettes || []).length} composant{(p.recettes || []).length > 1 ? 's' : ''}
                                </div>
                              </div>
                              {badge}
                            </label>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        <div style={ps.footer}>
          {onCreatePlat && (
            <button
              style={cts.ghostBtn}
              onClick={onCreatePlat}
              disabled={busy}
              title="Créer le plat manquant, puis rouvrir ce rattachement"
            >+ Nouveau plat</button>
          )}
          <div style={{ flex: 1 }} />
          <button style={cts.ghostBtn} onClick={() => onClose?.()} disabled={busy}>Annuler</button>
          <button
            style={{ ...cts.newBtn, padding: '8px 16px', opacity: changements === 0 || busy ? 0.5 : 1, cursor: changements === 0 || busy ? 'default' : 'pointer' }}
            onClick={() => onConfirm?.([...sel])}
            disabled={changements === 0 || busy}
          >{busy ? 'Rattachement…' : confirmLabel(changements)}</button>
        </div>
      </div>
    </div>
  );
}

const ps = {
  header: { padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  title: { fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-serif)', color: 'var(--text)' },
  subtitle: { fontSize: 11, color: 'var(--text2)', marginTop: 2, lineHeight: 1.4 },
  closeBtn: { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text2)', flexShrink: 0, lineHeight: 1 },
  searchRow: { display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderBottom: '1px solid var(--border)' },
  searchInput: { flex: 1, minWidth: 0, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box' },
  clearBtn: { background: 'none', border: 'none', fontSize: 13, cursor: 'pointer', color: 'var(--text2)', padding: '4px 6px', flexShrink: 0 },
  body: { flex: 1, overflowY: 'auto', minHeight: 120 },
  empty: { padding: 30, textAlign: 'center', color: 'var(--text2)', fontSize: 13 },
  carteHeader: { display: 'flex', alignItems: 'center', gap: 6, padding: '9px 20px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', cursor: 'pointer' },
  carteNom: { flex: 1, minWidth: 0, fontSize: 11, fontWeight: 800, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  carteCount: { fontSize: 10, fontWeight: 700, color: 'var(--text3)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '1px 8px', flexShrink: 0 },
  catHeader: { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 20px 3px 34px' },
  catNom: { flex: 1, minWidth: 0, fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.6 },
  catAllBtn: { background: 'none', border: 'none', color: 'var(--accent)', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', padding: '2px 4px', flexShrink: 0 },
  // flexShrink 0 : sans lui, les lignes se superposent sur mobile (min-height
  // global 44px sur les contrôles vs hauteur calculée par flex).
  platRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 20px 9px 34px', borderBottom: '1px solid var(--border)', flexShrink: 0 },
  platNom: { fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  platMeta: { fontSize: 11, color: 'var(--text2)', marginTop: 1 },
  footer: { padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
};
