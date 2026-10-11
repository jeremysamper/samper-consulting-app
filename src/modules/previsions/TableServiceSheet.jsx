import { useState } from 'react';
import { useBackLayer } from '../../hooks/useBackLayer.js';
import { makeSearchMatcher } from '../../utils/searchText.js';
import { metaStatut } from './statutsReservation.js';

// ═══════════════════════════════════════════════════════════════════════════
// Ce qui s'ouvre quand on touche une table du plan pendant le service.
//
// Trois façons de donner une table, dans l'ordre où elles arrivent au coup de
// feu :
//   • Client de passage : on demande seulement le nombre de couverts. La
//     réservation est créée « arrivée », à l'heure qu'il est, et posée sur la
//     table.
//   • Réserver la table : le formulaire de réservation habituel, pré-rempli
//     sur le jour et le service ; la réservation enregistrée est posée ici.
//   • Assigner la table : choisir une réservation du service. Celles qui
//     n'ont pas de table d'abord ; une réservation déjà placée ailleurs est
//     déplacée ici.
//
// Au-dessus, les clients déjà à cette table, avec leurs gestes du service
// (arrivé, parti, libérer la table). Une tablée rapprochée (tables fusionnées)
// s'ouvre comme une seule table, sous le numéro choisi parmi les siens
// (« Numéro de la tablée ») : c'est lui qu'on annonce au passe.
//
// En mode « Ajuster la salle », la même fiche ne propose que les gestes sur
// la table elle-même : la séparer de sa tablée, la remettre à sa place.
// ═══════════════════════════════════════════════════════════════════════════

const COUVERTS_RAPIDES = [1, 2, 3, 4, 5, 6, 7, 8];

const styleBouton = (principal = false) => ({
  width: '100%', minHeight: 48, padding: '10px 14px', borderRadius: 10,
  borderWidth: 1, borderStyle: 'solid',
  borderColor: principal ? 'var(--accent)' : 'var(--border)',
  background: principal ? 'var(--accent)' : 'var(--surface)',
  color: principal ? 'var(--on-accent)' : 'var(--text)',
  fontSize: 14, fontWeight: 700, fontFamily: 'var(--font)',
  cursor: 'pointer', textAlign: 'left',
  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
});

const stylePetit = (ton) => {
  const c = ton === 'succes'
    ? { bd: 'var(--success-bd)', bg: 'var(--success-bg-soft)', tx: 'var(--success-text)' }
    : ton === 'danger'
      ? { bd: 'var(--danger-bd)', bg: 'transparent', tx: 'var(--danger-text)' }
      : { bd: 'var(--border)', bg: 'var(--surface)', tx: 'var(--text2)' };
  return {
    flexShrink: 0, minHeight: 40, padding: '6px 12px', borderRadius: 20,
    borderWidth: 1, borderStyle: 'solid', borderColor: c.bd,
    background: c.bg, color: c.tx,
    fontSize: 12, fontWeight: 700, fontFamily: 'var(--font)',
    cursor: 'pointer', whiteSpace: 'nowrap',
  };
};

function SousTitre({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5,
      color: 'var(--text3)', margin: '4px 0 8px',
    }}>
      {children}
    </div>
  );
}

export default function TableServiceSheet({
  titre, composition = '', numeros = [], numeroActuel, onChoisirNumero,
  places, occupants = [], resasService = [], tablesParResa,
  canEdit, ajuster = false, groupe = false, deplacee = false, verticale = false,
  onClose, onPassage, onReserver, onAssigner, onOpenResa, onStatut, onLiberer,
  onSeparer, onRemettre, onTourner,
}) {
  const [etape, setEtape]       = useState('menu');   // menu | passage | assigner
  const [couverts, setCouverts] = useState(2);
  const [recherche, setRecherche] = useState('');

  // Retour (geste, Alt+←) : revient au menu depuis une étape, sinon ferme.
  useBackLayer(true, () => (etape === 'menu' ? onClose() : setEtape('menu')), 'table-service');

  const assis = occupants.reduce((s, r) => s + (r.nb_couverts || 0), 0);
  const idsIci = new Set(occupants.map((r) => r.id));
  const match = makeSearchMatcher(recherche);
  const candidates = resasService
    .filter((r) => !idsIci.has(r.id) && r.statut !== 'parti' && r.statut !== 'no_show')
    .filter((r) => match(`${r.nom} ${r.telephone || ''}`));
  const sansTable = candidates.filter((r) => !(tablesParResa.get(r.id) || []).length);
  const placees   = candidates.filter((r) => (tablesParResa.get(r.id) || []).length);

  const ligneCandidate = (r) => {
    const ailleurs = tablesParResa.get(r.id) || [];
    return (
      <button
        key={r.id}
        type="button"
        onClick={() => { onAssigner(r); onClose(); }}
        style={{
          ...styleBouton(false), minHeight: 52,
          borderColor: r.nb_couverts > places && places > 0 ? 'var(--warning-bd)' : 'var(--border)',
        }}
      >
        <span>{r.nom}, {r.nb_couverts} pax</span>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)' }}>
          {(r.heure_arrivee || '').slice(0, 5)}
          {r.statut === 'arrive' ? ', arrivé' : ''}
          {ailleurs.length ? `, déplacer depuis la table ${ailleurs.join(' + ')}` : ''}
        </span>
      </button>
    );
  };

  return (
    <div
      className="modal-sheet-overlay"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={titre}
        className="modal-sheet"
        style={{
          background: 'var(--surface)', borderRadius: 14,
          width: 420, maxWidth: '100%', maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          padding: '14px 18px',
          borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)',
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', fontFamily: 'var(--font-serif)' }}>
              {titre}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>
              {composition ? `${composition}, ` : ''}
              {places} place{places > 1 ? 's' : ''}
              {occupants.length ? `, ${assis} couvert${assis > 1 ? 's' : ''} ici` : ', libre'}
            </div>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Fermer"
            style={{
              background: 'none', border: 'none', fontSize: 22, minWidth: 44, minHeight: 44,
              cursor: 'pointer', color: 'var(--text2)', lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* ── Tablée rapprochée : le numéro qu'elle porte au passe ── */}
          {numeros.length > 1 && onChoisirNumero && etape === 'menu' && (
            <div style={{ marginBottom: 6 }}>
              <SousTitre>Numéro de la tablée</SousTitre>
              <div role="radiogroup" aria-label="Numéro de la tablée" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {numeros.map((n) => {
                  const actif = n.id === numeroActuel;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      role="radio"
                      aria-checked={actif}
                      onClick={() => { if (!actif) onChoisirNumero(n.id); }}
                      style={{
                        minWidth: 56, minHeight: 48, padding: '6px 14px', borderRadius: 10,
                        borderWidth: actif ? 2 : 1, borderStyle: 'solid',
                        borderColor: actif ? 'var(--accent)' : 'var(--border)',
                        background: actif ? 'var(--ai-bg-soft)' : 'var(--surface)',
                        color: 'var(--text)', fontSize: 16, fontWeight: 800,
                        fontFamily: 'var(--font-num)', cursor: actif ? 'default' : 'pointer',
                      }}
                    >
                      {n.nom}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Ajuster la salle : gestes sur le meuble ── */}
          {ajuster && (
            <>
              {groupe && (
                <button type="button" style={styleBouton(true)} onClick={() => { onSeparer(); onClose(); }}>
                  <span>Séparer cette table</span>
                  <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.85 }}>
                    Elle retourne seule à sa place habituelle.
                  </span>
                </button>
              )}
              {!groupe && deplacee && (
                <button type="button" style={styleBouton(true)} onClick={() => { onRemettre(); onClose(); }}>
                  <span>Remettre à sa place</span>
                  <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.85 }}>
                    Comme sur le plan de base.
                  </span>
                </button>
              )}
              {!groupe && !deplacee && (
                <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
                  Glisse la table pour la déplacer, ou lâche-la sur une autre table pour les rapprocher en une seule tablée.
                </div>
              )}
            </>
          )}
          {ajuster && onTourner && (
            <button type="button" style={styleBouton(false)} onClick={() => { onTourner(); onClose(); }}>
              <span>⟳ Tourner la table</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)' }}>
                {verticale
                  ? 'La remettre à l’horizontale, pour ce service seulement.'
                  : 'La mettre à la verticale, pour ce service seulement.'}
              </span>
            </button>
          )}

          {/* ── Service : clients à cette table ── */}
          {!ajuster && etape === 'menu' && occupants.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <SousTitre>À cette table</SousTitre>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {occupants.map((r) => (
                  <div key={r.id} style={{
                    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                    padding: '8px 10px', borderRadius: 10,
                    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
                  }}>
                    <button
                      type="button"
                      onClick={() => { onOpenResa?.(r); onClose(); }}
                      style={{
                        flex: 1, minWidth: 120, minHeight: 40, textAlign: 'left', background: 'none',
                        border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font)',
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                        {r.nom}, {r.nb_couverts} pax
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                        {(r.heure_arrivee || '').slice(0, 5)}, {metaStatut(r.statut || 'confirme').label}
                      </div>
                    </button>
                    {canEdit && onStatut && (r.statut === 'confirme' || r.statut === 'demande') && (
                      <button type="button" style={stylePetit('succes')} onClick={() => onStatut(r, 'arrive')}>
                        Arrivé
                      </button>
                    )}
                    {canEdit && onStatut && r.statut === 'arrive' && (
                      <button type="button" style={stylePetit()} onClick={() => onStatut(r, 'parti')}>
                        Parti
                      </button>
                    )}
                    {canEdit && (
                      <button type="button" style={stylePetit('danger')} onClick={() => { onLiberer(r); onClose(); }}>
                        Libérer
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Service : donner la table ── */}
          {!ajuster && etape === 'menu' && canEdit && (
            <>
              <SousTitre>{occupants.length ? 'Ajouter à cette table' : 'Donner cette table'}</SousTitre>
              <button type="button" style={styleBouton(true)} onClick={() => setEtape('passage')}>
                <span>Client de passage</span>
                <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.85 }}>Sans réservation, installé maintenant.</span>
              </button>
              <button type="button" style={styleBouton(false)} onClick={() => { onReserver(); onClose(); }}>
                <span>Réserver la table</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)' }}>Nouvelle réservation posée sur cette table.</span>
              </button>
              <button type="button" style={styleBouton(false)} onClick={() => setEtape('assigner')}>
                <span>Assigner la table</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)' }}>Choisir une réservation du service.</span>
              </button>
            </>
          )}

          {/* ── Le meuble, pour ce service : quart de tour ── */}
          {!ajuster && etape === 'menu' && onTourner && (
            <button type="button" style={styleBouton(false)} onClick={() => { onTourner(); onClose(); }}>
              <span>⟳ Tourner la table</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)' }}>
                {verticale
                  ? 'La remettre à l’horizontale, pour ce service seulement.'
                  : 'La mettre à la verticale, pour ce service seulement.'}
              </span>
            </button>
          )}

          {!ajuster && etape === 'menu' && !canEdit && occupants.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>Table libre.</div>
          )}

          {/* ── Client de passage : le nombre de couverts, rien d'autre ── */}
          {!ajuster && etape === 'passage' && (
            <>
              <SousTitre>Combien de couverts ?</SousTitre>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {COUVERTS_RAPIDES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCouverts(n)}
                    aria-pressed={couverts === n}
                    style={{
                      minHeight: 52, borderRadius: 10,
                      borderWidth: couverts === n ? 2 : 1, borderStyle: 'solid',
                      borderColor: couverts === n ? 'var(--accent)' : 'var(--border)',
                      background: couverts === n ? 'var(--ai-bg-soft)' : 'var(--surface)',
                      color: 'var(--text)', fontSize: 18, fontWeight: 800,
                      fontFamily: 'var(--font-num)', cursor: 'pointer',
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                <label htmlFor="passage-couverts" style={{ fontSize: 13, color: 'var(--text2)' }}>Autre nombre</label>
                <input
                  id="passage-couverts"
                  type="number" inputMode="numeric" min={1} max={99}
                  value={couverts}
                  onChange={(e) => setCouverts(Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1)))}
                  style={{
                    width: 90, minHeight: 44, padding: '6px 10px', borderRadius: 8,
                    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
                    background: 'var(--bg)', color: 'var(--text)', fontSize: 16, fontFamily: 'var(--font)',
                  }}
                />
              </div>
              {couverts > places && places > 0 && (
                <div style={{ fontSize: 12, color: 'var(--warning-text)' }}>
                  {couverts} couverts pour {places} places : rapproche une autre table si besoin.
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button type="button" style={{ ...styleBouton(false), width: 'auto', alignItems: 'center' }} onClick={() => setEtape('menu')}>
                  Retour
                </button>
                <button
                  type="button"
                  style={{ ...styleBouton(true), flex: 1, alignItems: 'center' }}
                  onClick={() => { onPassage(couverts); onClose(); }}
                >
                  Installer {couverts} couvert{couverts > 1 ? 's' : ''}
                </button>
              </div>
            </>
          )}

          {/* ── Assigner : une réservation du service ── */}
          {!ajuster && etape === 'assigner' && (
            <>
              <input
                type="search"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Nom ou téléphone"
                aria-label="Chercher une réservation"
                style={{
                  width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '8px 12px', borderRadius: 8,
                  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
                  background: 'var(--bg)', color: 'var(--text)', fontSize: 16, fontFamily: 'var(--font)',
                }}
              />
              {sansTable.length > 0 && <SousTitre>Sans table</SousTitre>}
              {sansTable.map(ligneCandidate)}
              {placees.length > 0 && <SousTitre>Déjà placées</SousTitre>}
              {placees.map(ligneCandidate)}
              {candidates.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--text2)', padding: '8px 0' }}>
                  {recherche ? 'Aucune réservation ne correspond.' : 'Aucune autre réservation sur ce service.'}
                </div>
              )}
              <button type="button" style={{ ...styleBouton(false), alignItems: 'center', marginTop: 6 }} onClick={() => setEtape('menu')}>
                Retour
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
