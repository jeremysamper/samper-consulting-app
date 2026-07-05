import { useState } from 'react';
import { notify } from '../../components/toast/index.js';
import { useReservations } from '../../hooks/useReservations.js';
import { useReservationTags } from '../../hooks/useReservationTags.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import ReservationTagSelector from './ReservationTagSelector.jsx';

const SUGGESTIONS = {
  midi:   ['12:00', '12:30', '13:00', '13:30'],
  soir:   ['19:00', '19:30', '20:00', '20:30', '21:00'],
  brunch: ['10:30', '11:00', '11:30', '12:00'],
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function defaultState() {
  return {
    date: todayISO(), service: 'soir', heure: '20:00', heureCustom: false,
    couverts: 2, nom: '', telephone: '', groupe: false, tags: [], notes: '',
  };
}

function validateForm(form) {
  const errors = [];
  if (!form.nom.trim())                         errors.push('Le nom est obligatoire.');
  if (!form.date)                               errors.push('La date est obligatoire.');
  if (!form.heure)                              errors.push("L'heure d'arrivée est obligatoire.");
  if (form.couverts < 1 || form.couverts > 50) errors.push('Le nombre de couverts doit être entre 1 et 50.');
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function formFromResa(resa) {
  const heure   = (resa.heure_arrivee || '').slice(0, 5);
  const service = resa.service || 'soir';
  return {
    date:        resa.date_service  || todayISO(),
    service,
    heure,
    heureCustom: !(SUGGESTIONS[service] || []).includes(heure),
    couverts:    resa.nb_couverts   || 2,
    nom:         resa.nom           || '',
    telephone:   resa.telephone     || '',
    groupe:      resa.est_groupe    || false,
    tags:        Array.isArray(resa.reservation_tags) ? resa.reservation_tags : [],
    notes:       resa.notes_libres  || '',
  };
}

export default function ReservationForm({ etablissementId, onClose, onSaved, initialResa = null }) {
  const isMobile = useIsMobile();
  const [form, setForm] = useState(() => initialResa ? formFromResa(initialResa) : defaultState());
  const [loading, setLoading] = useState(false);
  const reservations = useReservations(etablissementId);
  const tags = useReservationTags();

  const set = (key, val) => setForm((p) => ({ ...p, [key]: val }));

  function changeService(s) {
    setForm((p) => ({ ...p, service: s, heure: SUGGESTIONS[s][0], heureCustom: false }));
  }

  function resetForNext() {
    setForm((p) => ({
      ...defaultState(),
      date: p.date,
      service: p.service,
      heure: p.heure,
      heureCustom: p.heureCustom,
    }));
  }

  async function submit(keepOpen) {
    const { ok, errors } = validateForm(form);
    if (!ok) { errors.forEach((e) => notify(e, 'error')); return; }

    setLoading(true);
    try {
      const payload = {
        date_service:  form.date,
        service:       form.service,
        heure_arrivee: form.heure,
        nb_couverts:   form.couverts,
        nom:           form.nom.trim(),
        telephone:     form.telephone.trim() || null,
        est_groupe:    form.groupe,
        notes_libres:  form.notes.trim() || null,
      };

      if (initialResa) {
        // ── MODE ÉDITION ──
        const { error: eUpd } = await reservations.update(initialResa.id, payload);
        if (eUpd) { notify(eUpd, 'error'); return; }
        // Remplacement des tags : supprime tous → recrée
        const { error: eDel } = await tags.deleteByReservationId(initialResa.id);
        if (eDel) { notify(eDel, 'error'); return; }
        if (form.tags.length > 0) {
          const { error: eTags } = await tags.bulkCreate(initialResa.id, form.tags);
          if (eTags) { notify(eTags, 'error'); return; }
        }
        notify(`Résa ${form.nom.trim()} · ${form.couverts} pax · ${form.heure.slice(0, 5)} modifiée ✓`, 'success');
        onSaved?.();
        onClose();
      } else {
        // ── MODE CRÉATION ──
        const { data: resa, error: eResa } = await reservations.create({ ...payload, statut: 'confirme' });
        if (eResa || !resa) {
          notify(eResa || 'Erreur lors de la création de la réservation.', 'error');
          return;
        }
        if (form.tags.length > 0) {
          const { error: eTags } = await tags.bulkCreate(resa.id, form.tags);
          if (eTags) {
            // Rollback : soft-delete via statut='annule'
            // → le trigger recalcule previsions_jour proprement
            console.error('[ReservationForm] erreur tags, tentative rollback', resa.id, eTags);
            const { error: eRollback } = await reservations.delete(resa.id);
            if (eRollback) {
              console.error('[ReservationForm] ROLLBACK ÉCHOUÉ', resa.id, eRollback);
              notify(
                `Tags KO et rollback impossible. Résa ${resa.id} à supprimer manuellement.`,
                'error'
              );
            } else {
              notify(eTags || 'Erreur tags - réservation annulée.', 'error');
            }
            return;
          }
        }
        const h = resa.heure_arrivee?.slice(0, 5) ?? form.heure;
        notify(`Résa ${resa.nom} · ${resa.nb_couverts} pax · ${h} enregistrée ✓`, 'success');
        onSaved?.(resa);
        keepOpen ? resetForNext() : onClose();
      }
    } finally {
      setLoading(false);
    }
  }

  const suggestions = SUGGESTIONS[form.service];

  const inp = {
    width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8,
    background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 13,
    boxSizing: 'border-box',
  };
  const lbl = { fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 5, display: 'block' };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center', zIndex: 1000, padding: isMobile ? 0 : 16,
      }}
      onClick={onClose}>
      <div
        className="modal-sheet"
        style={{
          background: 'var(--surface)', width: isMobile ? '100%' : 520, maxWidth: '100%',
          maxHeight: isMobile ? '95vh' : '90vh',
          borderRadius: isMobile ? '16px 16px 0 0' : 14,
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          borderRadius: isMobile ? '16px 16px 0 0' : '14px 14px 0 0',
        }}>
          <div style={{ fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>
            {initialResa ? 'Modifier la réservation' : 'Nouvelle réservation'}
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer"
            style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text2)', padding: 4, lineHeight: 1 }}>
            ×
          </button>
        </div>

        {/* ── Corps scrollable ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Date + Service */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Date</label>
              <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Service</label>
              <div style={{ display: 'flex', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
                {['midi', 'soir', 'brunch'].map((s) => (
                  <button key={s} type="button" onClick={() => changeService(s)}
                    style={{
                      flex: 1, padding: '9px 2px', border: 'none', cursor: 'pointer',
                      fontSize: 12, fontWeight: 700, fontFamily: 'var(--font)', transition: 'all 0.15s',
                      background: form.service === s ? 'var(--accent)' : 'var(--bg)',
                      color:      form.service === s ? '#fff' : 'var(--text2)',
                    }}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Heure */}
          <div>
            <label style={lbl}>Heure d'arrivée</label>
            {!form.heureCustom ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {suggestions.map((h) => (
                  <button key={h} type="button" onClick={() => set('heure', h)}
                    style={{
                      padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                      fontSize: 13, fontFamily: 'var(--font)', fontWeight: 600, transition: 'all 0.15s',
                      border:      `1px solid ${form.heure === h ? 'var(--accent)' : 'var(--border)'}`,
                      background:  form.heure === h ? 'var(--accent)' : 'var(--bg)',
                      color:       form.heure === h ? '#fff' : 'var(--text)',
                    }}>
                    {h}
                  </button>
                ))}
                <button type="button" onClick={() => set('heureCustom', true)}
                  style={{ padding: '8px 14px', borderRadius: 8, border: '1px dashed var(--border)', background: 'var(--bg)', color: 'var(--text2)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font)' }}>
                  Autre heure
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="time" value={form.heure} onChange={(e) => set('heure', e.target.value)} style={{ ...inp, width: 'auto' }} />
                <button type="button"
                  onClick={() => setForm((p) => ({ ...p, heureCustom: false, heure: suggestions[0] }))}
                  style={{ fontSize: 12, color: 'var(--text2)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }}>
                  ← Suggestions
                </button>
              </div>
            )}
          </div>

          {/* Nb couverts */}
          <div>
            <label style={lbl}>Nombre de couverts</label>
            <div style={{ display: 'flex', alignItems: 'center', width: 'fit-content', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <button type="button" aria-label="Diminuer"
                onClick={() => set('couverts', Math.max(1, form.couverts - 1))}
                style={{ width: 44, height: 44, fontSize: 20, fontWeight: 700, background: 'var(--bg)', border: 'none', cursor: 'pointer', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                −
              </button>
              <div style={{ width: 52, textAlign: 'center', fontWeight: 800, fontSize: 17, color: 'var(--text)', fontFamily: 'var(--font-serif)' }}>
                {form.couverts}
              </div>
              <button type="button" aria-label="Augmenter"
                onClick={() => set('couverts', Math.min(50, form.couverts + 1))}
                style={{ width: 44, height: 44, fontSize: 20, fontWeight: 700, background: 'var(--bg)', border: 'none', cursor: 'pointer', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                +
              </button>
            </div>
          </div>

          {/* Nom */}
          <div>
            <label style={lbl}>Nom *</label>
            <input
              autoFocus
              type="text"
              placeholder="Dupont, Famille Martin…"
              value={form.nom}
              onChange={(e) => set('nom', e.target.value)}
              style={inp}
            />
          </div>

          {/* Téléphone */}
          <div>
            <label style={lbl}>
              Téléphone{' '}
              <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(optionnel)</span>
            </label>
            <input type="tel" placeholder="+41 79 123 45 67" value={form.telephone}
              onChange={(e) => set('telephone', e.target.value)} style={inp} />
          </div>

          {/* Groupe toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="button" aria-label="Groupe" onClick={() => set('groupe', !form.groupe)}
              style={{
                width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                transition: 'background 0.2s', flexShrink: 0, position: 'relative',
                background: form.groupe ? 'var(--accent)' : 'var(--border)',
              }}>
              <span style={{
                position: 'absolute', top: 2, left: form.groupe ? 20 : 2, width: 18, height: 18,
                borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </button>
            <span style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font)' }}>Groupe</span>
          </div>

          {/* Tags */}
          <div>
            <label style={lbl}>
              Tags{' '}
              <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(allergènes, régimes, occasions)</span>
            </label>
            <ReservationTagSelector value={form.tags} onChange={(v) => set('tags', v)} />
          </div>

          {/* Notes */}
          <div>
            <label style={lbl}>
              Notes{' '}
              <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(optionnel)</span>
            </label>
            <textarea
              placeholder="Table près de la fenêtre, allergie sévère, etc."
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={3}
              style={{ ...inp, resize: 'vertical', minHeight: 70 }}
            />
          </div>
        </div>

        {/* ── Footer fixe ── */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--surface)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
        }}>
          {!initialResa && (
            <button type="button" disabled={loading} onClick={() => submit(true)}
              style={{ background: 'none', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 12, color: 'var(--accent)', fontFamily: 'var(--font)', fontWeight: 600, padding: 0, opacity: loading ? 0.5 : 1 }}>
              + Saisir une autre
            </button>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" disabled={loading} onClick={onClose}
              style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600 }}>
              Annuler
            </button>
            <button type="button" disabled={loading} onClick={() => submit(false)}
              style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 700, opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
