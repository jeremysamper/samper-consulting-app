import React from 'react';
import { Trash2, X } from 'lucide-react';
import { pls } from './Planning.styles.js';
import { notifyLegacy, confirmLegacy } from '../../legacy/legacyApi.js';
import { useBackLayer } from '../../hooks/useBackLayer.js';
import { userDisplayName } from '../../utils/userDisplay.js';
import { MOTIFS_ABSENCE, metaMotif, periodeAbsence } from '../../utils/absences.js';

// ─────────────────────────────────────────────────────────────────────────────
// Absences de l'équipe (Planning) : congé, formation, absence.
//
// La direction les pose ici (équipier, motif, du / au) ; toute l'équipe les
// voit, dans la grille du planning et sur le tableau de bord. Les autres rôles
// ouvrent la même fenêtre en lecture seule.
//
// Pas de champ libre : le motif « Absence » couvre maladie ou raison
// personnelle sans la nommer (la ligne est lue par toute l'équipe).
// ─────────────────────────────────────────────────────────────────────────────

export default function AbsencesModal({ onClose, employees, absences, status, canWrite, creer, supprimer, aujourdhui }) {
  const [form, setForm] = React.useState({ userId: '', motif: 'conge', dateDebut: aujourdhui, dateFin: aujourdhui });
  const [enCours, setEnCours] = React.useState(false);
  useBackLayer(true, onClose, 'absences');

  const aVenir = React.useMemo(
    () => (absences || []).filter((a) => a.dateFin >= aujourdhui).sort((a, b) => a.dateDebut.localeCompare(b.dateDebut)),
    [absences, aujourdhui]
  );
  const set = (cle, valeur) => setForm((f) => {
    const suivant = { ...f, [cle]: valeur };
    // Une date de début posée après la fin entraîne la fin avec elle.
    if (cle === 'dateDebut' && suivant.dateFin < valeur) suivant.dateFin = valeur;
    return suivant;
  });

  async function ajouter(e) {
    e.preventDefault();
    if (!form.userId) { notifyLegacy('Choisis un équipier.', 'error'); return; }
    if (!form.dateDebut || !form.dateFin) { notifyLegacy('Indique les dates.', 'error'); return; }
    setEnCours(true);
    try {
      const { error } = await creer(form);
      if (error) { notifyLegacy(error, 'error'); return; }
      notifyLegacy(`Enregistré : ${metaMotif(form.motif).label.toLowerCase()} pour ${userDisplayName(form.userId)}.`, 'success');
      setForm((f) => ({ ...f, userId: '' }));
    } finally {
      setEnCours(false);
    }
  }

  async function retirer(a) {
    if (!confirmLegacy(`Retirer cette absence de ${userDisplayName(a.userId)} (${metaMotif(a.motif).label.toLowerCase()}, ${periodeAbsence(a)}) ?`)) return;
    const { error } = await supprimer(a.id);
    if (error) notifyLegacy(error, 'error');
  }

  return (
    <div className="modal-full-overlay" style={pls.overlay} onClick={onClose}>
      <div className="modal-full" style={{ ...pls.modal, width: 520 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Absences de l'équipe">
        <div style={pls.modalHeader}>
          <div style={pls.modalTitle}>Absences de l'équipe</div>
          <button type="button" style={{ ...pls.closeBtn, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44 }} onClick={onClose} aria-label="Fermer">
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {status === 'absent' && (
            <div style={s.info}>Les absences ne sont pas encore activées sur la base de données.</div>
          )}

          {canWrite && status !== 'absent' && (
            <form onSubmit={ajouter} style={s.formulaire}>
              <div>
                <label style={pls.fieldLabel} htmlFor="absence-equipier">Équipier</label>
                <select id="absence-equipier" style={pls.fieldInput} value={form.userId} onChange={(e) => set('userId', e.target.value)}>
                  <option value="">Sélectionner…</option>
                  {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.prenom} {emp.nom}</option>)}
                </select>
              </div>
              <div>
                <span style={pls.fieldLabel}>Motif</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="radiogroup" aria-label="Motif">
                  {MOTIFS_ABSENCE.map((m) => {
                    const actif = form.motif === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="radio"
                        aria-checked={actif}
                        onClick={() => set('motif', m.id)}
                        style={{
                          ...s.choix,
                          ...(actif ? { background: m.fond, color: m.texte, borderColor: m.bordure } : null),
                        }}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
                <div style={s.aide}>« Absence » : maladie ou raison personnelle, sans la préciser.</div>
              </div>
              <div style={s.dates}>
                <div>
                  <label style={pls.fieldLabel} htmlFor="absence-du">Du</label>
                  <input id="absence-du" type="date" style={pls.fieldInput} value={form.dateDebut} onChange={(e) => set('dateDebut', e.target.value)} />
                </div>
                <div>
                  <label style={pls.fieldLabel} htmlFor="absence-au">Au (inclus)</label>
                  <input id="absence-au" type="date" style={pls.fieldInput} value={form.dateFin} min={form.dateDebut} onChange={(e) => set('dateFin', e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" disabled={enCours} style={{ ...pls.addBtn, minHeight: 44, opacity: enCours ? 0.6 : 1 }}>
                  {enCours ? 'Enregistrement…' : 'Ajouter l\'absence'}
                </button>
              </div>
            </form>
          )}

          {status !== 'absent' && (
            <div>
              <div style={s.titreListe}>En cours et à venir</div>
              {status === 'loading' && !aVenir.length && <div style={s.vide}>Chargement…</div>}
              {status !== 'loading' && !aVenir.length && <div style={s.vide}>Aucune absence prévue.</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {aVenir.map((a) => {
                  const m = metaMotif(a.motif);
                  const enCoursAbs = a.dateDebut <= aujourdhui;
                  return (
                    <div key={a.id} style={s.ligne}>
                      <span style={{ ...s.puce, background: m.fond, color: m.texte, borderColor: m.bordure }}>{m.label}</span>
                      <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                        <span style={s.nom} data-no-translate>{userDisplayName(a.userId)}</span>
                        <span style={s.periode}>{periodeAbsence(a)}{enCoursAbs ? ', en cours' : ''}</span>
                      </span>
                      {canWrite && (
                        <button type="button" onClick={() => retirer(a)} style={s.retirer} aria-label={`Retirer l'absence de ${userDisplayName(a.userId)}`}>
                          <Trash2 size={16} strokeWidth={1.8} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const s = {
  formulaire: {
    display: 'flex', flexDirection: 'column', gap: 14, padding: 14,
    borderRadius: 12, background: 'var(--surface2)', border: '1px solid var(--border)',
  },
  dates: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 },
  choix: {
    minHeight: 40, padding: '8px 14px', borderRadius: 999, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600,
    background: 'var(--surface)', color: 'var(--text2)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
  },
  aide: { fontSize: 12, color: 'var(--text2)', marginTop: 6 },
  titreListe: { fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
  vide: { fontSize: 13, color: 'var(--text2)', padding: '6px 0' },
  ligne: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', minHeight: 48,
    borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)',
  },
  puce: {
    flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
    borderWidth: 1, borderStyle: 'solid',
  },
  nom: { display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  periode: { display: 'block', fontSize: 12, color: 'var(--text2)' },
  retirer: {
    flexShrink: 0, width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'none', border: 'none', borderRadius: 10, color: 'var(--danger-text)', cursor: 'pointer',
  },
  info: { fontSize: 13, padding: '10px 12px', borderRadius: 10, background: 'var(--info-bg-soft)', color: 'var(--info-text)', border: '1px solid var(--info-bd)' },
};
