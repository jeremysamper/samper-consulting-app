import React from 'react';
import { DUREE_MAX_JOURS, validerEtiquettePerso } from '../../utils/etiquettesDlc.js';
import { hcfg, hs } from './HACCP.styles.js';

// ─────────────────────────────────────────────────────────────────────────────
// ÉTIQUETTE MAISON — création / modification
//
// Une étiquette maison, c'est une préparation courante qui n'a pas de fiche
// recette et qui doit quand même sortir du poste avec son nom sur le bac.
// Le formulaire ne demande donc que ce qui figure sur l'étiquette : un nom et
// des durées de vie.
//
// Les durées relèvent de l'autocontrôle de l'établissement : elles se saisissent
// ici, elles ne se calculent nulle part. C'est la raison du verrou sur la
// modification (responsable cuisine et au-dessus) : changer une durée déjà en
// service, c'est réviser un plan de maîtrise sanitaire.
//
// « Préparation congelable » commande les deux durées de surgélation : décoché,
// l'étiquette n'existe qu'en froid positif et les modes Surgélation /
// Décongélation la laisseront grisée dans la liste — même règle que sur une
// fiche recette sans durée de surgélation.
//
// Formulaire court → bottom sheet sur mobile (modal-sheet), pas plein écran.
// ─────────────────────────────────────────────────────────────────────────────

// Saisie tenue en chaîne : un champ nombre vidé pour être retapé ne doit pas
// se remplir tout seul d'un 0. La conversion se fait à l'enregistrement, la
// validation accepte la chaîne (cf. validerEtiquettePerso).
const champNombre = (v) => (v == null ? '' : String(v));

const EtiquettePersoForm = ({ etiquette, existantes = [], busy = false, onSave, onCancel }) => {
  const [f, setF] = React.useState(() => ({
    nom: etiquette?.nom || '',
    dureeVieJours: champNombre(etiquette?.dureeVieJours ?? 3),
    // Une étiquette existante est congelable si — et seulement si — elle porte
    // une durée de surgélation. Même convention qu'une fiche recette.
    congelable: etiquette ? etiquette.dureeVieCongeleJours != null : false,
    dureeVieCongeleJours: champNombre(etiquette?.dureeVieCongeleJours ?? 90),
    dureeVieDecongeleJours: champNombre(etiquette?.dureeVieDecongeleJours ?? 2),
  }));
  const [erreur, setErreur] = React.useState(null);

  const set = (patch) => { setF(prev => ({ ...prev, ...patch })); setErreur(null); };

  const handleSave = () => {
    if (busy) return;
    const msg = validerEtiquettePerso(f, { existantes, id: etiquette?.id || null });
    if (msg) { setErreur(msg); return; }
    onSave({
      id: etiquette?.id || null,
      nom: f.nom.trim(),
      dureeVieJours: Number(f.dureeVieJours),
      // null = non congelable : c'est cette valeur qui ferme les modes
      // Surgélation et Décongélation à l'étiquette.
      dureeVieCongeleJours: f.congelable ? Number(f.dureeVieCongeleJours) : null,
      dureeVieDecongeleJours: f.congelable ? Number(f.dureeVieDecongeleJours) : 2,
    });
  };

  const champDuree = (label, cle, aide) => (
    <div style={hs.field}>
      <label style={hs.fLabel}>{label}</label>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={DUREE_MAX_JOURS}
        step={1}
        style={hs.fInput}
        value={f[cle]}
        onChange={e => set({ [cle]: e.target.value })}
      />
      {aide && <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.4 }}>{aide}</div>}
    </div>
  );

  return (
    <div className="modal-sheet-overlay" style={hs.overlay} onClick={onCancel}>
      <div className="modal-sheet" style={{ ...hs.modal, width: 460 }} onClick={e => e.stopPropagation()}>
        <div style={hs.modalHeader}>
          <div style={hs.modalTitle}>
            {etiquette?.id ? 'Modifier l\'étiquette' : 'Ajouter une étiquette'}
          </div>
          <button type="button" style={hs.closeBtn} onClick={onCancel} aria-label="Fermer">✕</button>
        </div>

        <div style={hs.modalBody}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            <div style={hs.field}>
              <label style={hs.fLabel}>Nom de la préparation *</label>
              <input
                style={hs.fInput}
                placeholder="ex. Fond blanc, Pâte à crumble, Marinade maison…"
                value={f.nom}
                onChange={e => set({ nom: e.target.value })}
                autoFocus
              />
              <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.4 }}>
                C'est ce nom qui s'imprime en tête de l'étiquette.
              </div>
            </div>

            {champDuree(
              'Durée au froid positif (jours) *',
              'dureeVieJours',
              'Conservation entre 0 et 3 °C, à partir de la date de fabrication.',
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{ ...hcfg.toggle, background: f.congelable ? 'var(--accent)' : 'var(--border)' }}
                onClick={() => set({ congelable: !f.congelable })}
                role="switch"
                aria-checked={f.congelable}
                aria-label="Préparation congelable"
              >
                <div style={{ ...hcfg.toggleThumb, left: f.congelable ? 'calc(100% - 20px)' : '2px' }} />
              </div>
              <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>Préparation congelable</span>
            </div>

            {f.congelable ? (
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {champDuree(
                  'Durée au congélateur (jours) *',
                  'dureeVieCongeleJours',
                  'Conservation à -18 °C, à partir de la date de surgélation.',
                )}
                {champDuree(
                  'Durée après décongélation (jours) *',
                  'dureeVieDecongeleJours',
                  'Compte à partir de la mise en décongélation. Ne jamais recongeler.',
                )}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 }}>
                Sans durée de surgélation, l'étiquette reste grisée dans les modes
                Surgélation et Décongélation.
              </div>
            )}

            {erreur && (
              <div style={{ padding: '10px 12px', background: 'var(--danger-bg-soft)', border: '1px solid var(--danger-bd)', borderRadius: 8, fontSize: 12, color: 'var(--danger-strong)', lineHeight: 1.4 }}>
                {erreur}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <button type="button" style={hs.cancelBtn} onClick={onCancel} disabled={busy}>Annuler</button>
            <button
              type="button"
              style={{ ...hs.saveBtn, opacity: busy ? 0.6 : 1 }}
              onClick={handleSave}
              disabled={busy}
            >
              {busy ? 'Enregistrement…' : (etiquette?.id ? 'Enregistrer' : 'Ajouter l\'étiquette')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EtiquettePersoForm;
