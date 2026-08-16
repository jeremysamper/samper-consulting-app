import { useState } from 'react';
import { notify } from '../../components/toast/index.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { tailleParDefaut } from '../../hooks/usePlanSalle.js';

// ═══════════════════════════════════════════════════════════════════════════
// Réglages d'une table du plan : nom, couverts, forme, zone, activité.
//
// Pas de poignées de redimensionnement sur le canevas : la taille découle de
// la forme et du nombre de places (une table de 8 est plus grande qu'un
// deux-couverts). Redimensionner à la main aurait ajouté un geste de plus au
// doigt pour un plan qui n'a pas à être à l'échelle du mètre — il doit être
// reconnaissable, pas exact.
// ═══════════════════════════════════════════════════════════════════════════

const FORMES = [
  { id: 'ronde',     label: 'Ronde' },
  { id: 'carree',    label: 'Carrée' },
  { id: 'rectangle', label: 'Rectangle' },
];

export default function PlanTableForm({
  table, salles = [], onClose, onSave, onDelete, onDuplicate, nbOccupants = 0,
}) {
  const isMobile = useIsMobile();
  const [nom,     setNom]     = useState(table.nom || '');
  const [places,  setPlaces]  = useState(table.nb_places || 2);
  const [forme,   setForme]   = useState(table.forme || 'ronde');
  const [salleId, setSalleId] = useState(table.salle_id || (salles[0]?.id ?? ''));
  const [actif,   setActif]   = useState(table.actif !== false);
  // Une table pivotée est simplement une table plus haute que large : pas
  // besoin d'une colonne d'angle en base pour poser une rectangulaire le long
  // d'un mur. Le quart de tour suffit, le reste serait de la maquette 3D.
  const [pivotee, setPivotee] = useState(Number(table.hauteur) > Number(table.largeur));
  const [loading, setLoading] = useState(false);
  const [confirmSuppr, setConfirmSuppr] = useState(false);

  function tailleFinale() {
    // La taille suit la forme et le nombre de places, sauf si ni l'une ni
    // l'autre n'a bougé : on garde alors ce qui est en base.
    const formeChangee  = forme  !== (table.forme || 'ronde');
    const placesChangee = places !== (table.nb_places || 2);
    const base = (formeChangee || placesChangee)
      ? tailleParDefaut(forme, places)
      : { largeur: Number(table.largeur), hauteur: Number(table.hauteur) };
    // L'orientation survit au changement de couverts : une table dressée
    // contre un mur ne doit pas se recoucher parce qu'on lui ajoute deux
    // places.
    const estPivotee = pivotee && forme === 'rectangle';
    const l = Math.max(base.largeur, base.hauteur);
    const h = Math.min(base.largeur, base.hauteur);
    return estPivotee ? { largeur: h, hauteur: l } : { largeur: l, hauteur: h };
  }

  async function enregistrer() {
    if (!nom.trim()) { notify('Le nom de la table est obligatoire.', 'error'); return; }
    if (places < 1 || places > 40) { notify('Le nombre de places doit être entre 1 et 40.', 'error'); return; }
    if (salles.length > 0 && !salleId) { notify('Choisis une salle.', 'error'); return; }

    setLoading(true);
    try {
      const taille = tailleFinale();
      const ok = await onSave(table.id, {
        nom: nom.trim(),
        nb_places: places,
        forme,
        salle_id: salleId || null,
        actif,
        largeur: taille.largeur,
        hauteur: taille.hauteur,
      });
      if (ok) onClose();
    } finally {
      setLoading(false);
    }
  }

  async function dupliquer() {
    setLoading(true);
    try {
      const taille = tailleFinale();
      const ok = await onDuplicate({
        nom: nom.trim(), nb_places: places, forme,
        salle_id: salleId || null, actif,
        largeur: taille.largeur, hauteur: taille.hauteur,
        pos_x: Number(table.pos_x), pos_y: Number(table.pos_y),
      });
      if (ok) onClose();
    } finally {
      setLoading(false);
    }
  }

  async function supprimer() {
    setLoading(true);
    try {
      const ok = await onDelete(table.id);
      if (ok) { notify(`Table ${table.nom} supprimée`, 'info'); onClose(); }
    } finally {
      setLoading(false);
    }
  }

  const inp = {
    width: '100%', padding: '9px 12px',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 8,
    background: 'var(--bg)', color: 'var(--text)',
    fontFamily: 'var(--font)', fontSize: 13, boxSizing: 'border-box',
  };
  const lbl = { fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 5, display: 'block' };

  return (
    <div
      className="modal-sheet"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center', zIndex: 1000, padding: isMobile ? 0 : 16,
      }}
      onClick={onClose}
    >
      <div
        className="modal-sheet"
        style={{
          background: 'var(--surface)', width: isMobile ? '100%' : 420, maxWidth: '100%',
          maxHeight: isMobile ? '92vh' : '88vh',
          borderRadius: isMobile ? '16px 16px 0 0' : 14,
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)',
        }}>
          <div style={{ fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>
            Table {table.nom}
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" style={{
            background: 'none', border: 'none', fontSize: 22, cursor: 'pointer',
            color: 'var(--text2)', padding: 4, lineHeight: 1,
          }}>
            ×
          </button>
        </div>

        {/* Corps */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '18px 20px',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          <div>
            <label style={lbl}>Nom *</label>
            <input
              type="text" value={nom} onChange={(e) => setNom(e.target.value)}
              placeholder="12, T3, Bar 1…" style={inp}
            />
          </div>

          <div>
            <label style={lbl}>Nombre de places</label>
            <div style={{
              display: 'flex', alignItems: 'center', width: 'fit-content',
              borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
              borderRadius: 8, overflow: 'hidden',
            }}>
              <button type="button" aria-label="Diminuer"
                onClick={() => setPlaces((p) => Math.max(1, p - 1))}
                style={{
                  width: 44, height: 44, fontSize: 20, fontWeight: 700, background: 'var(--bg)',
                  border: 'none', cursor: 'pointer', color: 'var(--text)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                −
              </button>
              <div style={{
                width: 52, textAlign: 'center', fontWeight: 800, fontSize: 17,
                color: 'var(--text)', fontFamily: 'var(--font-serif)',
              }}>
                {places}
              </div>
              <button type="button" aria-label="Augmenter"
                onClick={() => setPlaces((p) => Math.min(40, p + 1))}
                style={{
                  width: 44, height: 44, fontSize: 20, fontWeight: 700, background: 'var(--bg)',
                  border: 'none', cursor: 'pointer', color: 'var(--text)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                +
              </button>
            </div>
          </div>

          <div>
            <label style={lbl}>Forme</label>
            <div style={{
              display: 'flex', borderRadius: 8, overflow: 'hidden',
              borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
            }}>
              {FORMES.map((f) => (
                <button key={f.id} type="button" onClick={() => setForme(f.id)} style={{
                  flex: 1, padding: '10px 2px', border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 700, fontFamily: 'var(--font)',
                  background: forme === f.id ? 'var(--accent)' : 'var(--bg)',
                  color:      forme === f.id ? '#fff' : 'var(--text2)',
                }}>
                  {f.label}
                </button>
              ))}
            </div>
            {forme === 'rectangle' && (
              <button type="button" onClick={() => setPivotee((p) => !p)} style={{
                marginTop: 8, padding: '9px 14px', borderRadius: 8, minHeight: 44,
                borderWidth: 1, borderStyle: 'solid',
                borderColor: pivotee ? 'var(--accent)' : 'var(--border)',
                background: pivotee ? 'var(--accent)' : 'var(--bg)',
                color: pivotee ? '#fff' : 'var(--text2)',
                fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)',
              }}>
                ⟳ {pivotee ? 'Dans le sens de la hauteur' : 'Dans le sens de la largeur'}
              </button>
            )}
          </div>

          <div>
            <label style={lbl}>Salle</label>
            {salles.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>
                Aucune salle définie. Crée-en une depuis le bouton « Salles ».
              </div>
            ) : (
              <select
                value={salleId} onChange={(e) => setSalleId(e.target.value)}
                style={{ ...inp, minHeight: 44 }}
              >
                {salles.map((s) => (
                  <option key={s.id} value={s.id}>{s.nom}</option>
                ))}
              </select>
            )}
          </div>

          {/* Actif — cible tactile de 44px, la case nue est trop petite au doigt */}
          <label style={{
            display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer',
          }}>
            <span style={{
              width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, marginLeft: -10,
            }}>
              <input
                type="checkbox" checked={actif} onChange={(e) => setActif(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
              />
            </span>
            <span style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font)' }}>
              Table active
              <span style={{ display: 'block', fontSize: 11, color: 'var(--text3)' }}>
                Inactive : conservée dans le plan mais retirée du placement.
              </span>
            </span>
          </label>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10, flexWrap: 'wrap',
        }}>
          {!confirmSuppr ? (
            <button type="button" disabled={loading} onClick={() => setConfirmSuppr(true)} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              fontSize: 12, color: 'var(--danger-text)', fontWeight: 600, fontFamily: 'var(--font)',
            }}>
              Supprimer
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--danger-text)' }}>
                {nbOccupants > 0
                  ? `${nbOccupants} réservation${nbOccupants > 1 ? 's' : ''} placée${nbOccupants > 1 ? 's' : ''} dessus. Supprimer ?`
                  : 'Supprimer cette table ?'}
              </span>
              <button type="button" disabled={loading} onClick={supprimer} style={{
                padding: '6px 12px', borderRadius: 6, border: 'none',
                background: 'var(--danger-text)', color: '#fff',
                fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)',
              }}>
                Oui
              </button>
              <button type="button" onClick={() => setConfirmSuppr(false)} style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                fontSize: 12, color: 'var(--text2)', fontFamily: 'var(--font)',
              }}>
                Non
              </button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
            {/* Dupliquer : dresser une rangée de dix deux-couverts identiques
                se fait en dix taps, pas en dix formulaires. */}
            <button type="button" disabled={loading} onClick={dupliquer} style={{
              padding: '10px 16px', borderRadius: 8,
              borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
              background: 'var(--surface)', color: 'var(--text)',
              cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600,
            }}>
              Dupliquer
            </button>
            <button type="button" disabled={loading} onClick={onClose} style={{
              padding: '10px 18px', borderRadius: 8,
              borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
              background: 'var(--surface)', color: 'var(--text)',
              cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600,
            }}>
              Annuler
            </button>
            <button type="button" disabled={loading} onClick={enregistrer} style={{
              padding: '10px 20px', borderRadius: 8,
              borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--accent)',
              background: 'var(--accent)', color: '#fff',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font)', fontSize: 13, fontWeight: 700,
              opacity: loading ? 0.7 : 1,
            }}>
              {loading ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
