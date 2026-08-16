import { useState } from 'react';
import { notify } from '../../components/toast/index.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';

// ═══════════════════════════════════════════════════════════════════════════
// Gestion des salles : ajouter, renommer, réordonner, supprimer.
//
// L'ordre est celui de la maison, pas celui de l'alphabet : on veut la salle
// principale en premier onglet, et l'alphabet mettrait « Bar » devant
// « Salle ». D'où les flèches plutôt qu'un tri automatique.
//
// Supprimer une salle emporte ses tables et donc leur placement : la
// confirmation annonce le nombre de tables perdues, sinon on efface une
// terrasse de douze tables sur un tap malheureux.
// ═══════════════════════════════════════════════════════════════════════════

export default function PlanSallesManager({
  salles, nbTablesParSalle, nbTablesReellesParSalle,
  onClose, onCreate, onRename, onReorder, onDelete,
}) {
  const isMobile = useIsMobile();
  const [nouveau,  setNouveau]  = useState('');
  const [editId,   setEditId]   = useState(null);
  const [editNom,  setEditNom]  = useState('');
  const [confirm,  setConfirm]  = useState(null);
  const [loading,  setLoading]  = useState(false);

  async function ajouter() {
    const nom = nouveau.trim();
    if (!nom) { notify('Donne un nom à la salle.', 'error'); return; }
    setLoading(true);
    try {
      const ok = await onCreate(nom);
      if (ok) setNouveau('');
    } finally { setLoading(false); }
  }

  async function renommer(id) {
    const nom = editNom.trim();
    if (!nom) { notify('Le nom de la salle est obligatoire.', 'error'); return; }
    setLoading(true);
    try {
      const ok = await onRename(id, nom);
      if (ok) { setEditId(null); setEditNom(''); }
    } finally { setLoading(false); }
  }

  async function supprimer(id) {
    setLoading(true);
    try {
      const ok = await onDelete(id);
      if (ok) setConfirm(null);
    } finally { setLoading(false); }
  }

  const inp = {
    width: '100%', padding: '9px 12px',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 8,
    background: 'var(--bg)', color: 'var(--text)',
    fontFamily: 'var(--font)', fontSize: 13, boxSizing: 'border-box',
  };
  const btnIcone = (actif) => ({
    width: 44, height: 44, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
    borderRadius: 8, background: 'var(--surface)',
    color: actif ? 'var(--text)' : 'var(--text3)',
    cursor: actif ? 'pointer' : 'not-allowed',
    fontSize: 14, fontFamily: 'var(--font)',
    opacity: actif ? 1 : 0.45,
  });

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
          background: 'var(--surface)', width: isMobile ? '100%' : 460, maxWidth: '100%',
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
            Salles
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" style={{
            background: 'none', border: 'none', fontSize: 22, cursor: 'pointer',
            color: 'var(--text2)', padding: 4, lineHeight: 1,
          }}>
            ×
          </button>
        </div>

        {/* Corps */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {salles.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--text3)', padding: '8px 0', lineHeight: 1.5 }}>
                Aucune salle. Crée la première ci-dessous (« Salle », « Terrasse »…).
              </div>
            )}

            {salles.map((s, i) => {
              const nbTables    = nbTablesParSalle.get(s.id) || 0;
              // Ce qui partira vraiment à la suppression (cf. commentaire du
              // compte strict côté PlanSalle).
              const nbSupprimees = (nbTablesReellesParSalle?.get(s.id)) ?? nbTables;
              const enEdition = editId === s.id;
              const enConfirm = confirm === s.id;

              return (
                <div key={s.id} style={{
                  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
                  borderRadius: 10, padding: 8, background: 'var(--bg)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {/* Réordonner */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                      <button type="button" aria-label="Monter" disabled={i === 0 || loading}
                        onClick={() => onReorder(i, i - 1)}
                        style={{ ...btnIcone(i > 0), height: 22, width: 30, borderRadius: '8px 8px 0 0' }}>
                        ▲
                      </button>
                      <button type="button" aria-label="Descendre" disabled={i === salles.length - 1 || loading}
                        onClick={() => onReorder(i, i + 1)}
                        style={{ ...btnIcone(i < salles.length - 1), height: 22, width: 30, borderRadius: '0 0 8px 8px' }}>
                        ▼
                      </button>
                    </div>

                    {enEdition ? (
                      <input
                        autoFocus type="text" value={editNom} style={{ ...inp, flex: 1 }}
                        onChange={(e) => setEditNom(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') renommer(s.id);
                          if (e.key === 'Escape') { setEditId(null); setEditNom(''); }
                        }}
                      />
                    ) : (
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13, fontWeight: 700, color: 'var(--text)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {s.nom}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                          {nbTables} table{nbTables > 1 ? 's' : ''}
                        </div>
                      </div>
                    )}

                    {enEdition ? (
                      <>
                        <button type="button" disabled={loading} onClick={() => renommer(s.id)} style={{
                          padding: '9px 14px', borderRadius: 8, border: 'none',
                          background: 'var(--accent)', color: '#fff',
                          fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)',
                          minHeight: 44,
                        }}>
                          OK
                        </button>
                        <button type="button" onClick={() => { setEditId(null); setEditNom(''); }} style={{
                          ...btnIcone(true), fontSize: 18,
                        }} aria-label="Annuler">
                          ×
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" aria-label={`Renommer ${s.nom}`}
                          onClick={() => { setEditId(s.id); setEditNom(s.nom); setConfirm(null); }}
                          style={btnIcone(true)}>
                          ✎
                        </button>
                        <button type="button" aria-label={`Supprimer ${s.nom}`}
                          onClick={() => setConfirm(enConfirm ? null : s.id)}
                          style={{ ...btnIcone(true), color: 'var(--danger-text)' }}>
                          🗑
                        </button>
                      </>
                    )}
                  </div>

                  {enConfirm && (
                    <div style={{
                      marginTop: 8, paddingTop: 8,
                      borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--border)',
                      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                    }}>
                      <span style={{ fontSize: 12, color: 'var(--danger-text)', flex: 1, minWidth: 160 }}>
                        {nbSupprimees > 0
                          ? `Supprimer « ${s.nom} » et ses ${nbSupprimees} table${nbSupprimees > 1 ? 's' : ''} ?`
                          : `Supprimer « ${s.nom} » ?`}
                      </span>
                      <button type="button" disabled={loading} onClick={() => supprimer(s.id)} style={{
                        padding: '8px 14px', borderRadius: 6, border: 'none',
                        background: 'var(--danger-text)', color: '#fff',
                        fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)',
                      }}>
                        Oui
                      </button>
                      <button type="button" onClick={() => setConfirm(null)} style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: '8px 4px',
                        fontSize: 12, color: 'var(--text2)', fontFamily: 'var(--font)',
                      }}>
                        Non
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Ajout */}
          <div style={{
            paddingTop: 14,
            borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--border)',
          }}>
            <label style={{
              fontSize: 12, fontWeight: 700, color: 'var(--text2)',
              marginBottom: 5, display: 'block',
            }}>
              Nouvelle salle
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text" value={nouveau} placeholder="Terrasse, Véranda, Carnotzet…"
                onChange={(e) => setNouveau(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && ajouter()}
                style={{ ...inp, flex: 1 }}
              />
              <button type="button" disabled={loading} onClick={ajouter} style={{
                padding: '9px 18px', borderRadius: 8, border: 'none',
                background: 'var(--accent)', color: '#fff', minHeight: 44,
                fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)',
                flexShrink: 0,
              }}>
                Ajouter
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--border)',
          display: 'flex', justifyContent: 'flex-end',
        }}>
          <button type="button" onClick={onClose} style={{
            padding: '10px 20px', borderRadius: 8,
            borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--accent)',
            background: 'var(--accent)', color: '#fff',
            cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 700,
          }}>
            Terminé
          </button>
        </div>
      </div>
    </div>
  );
}
