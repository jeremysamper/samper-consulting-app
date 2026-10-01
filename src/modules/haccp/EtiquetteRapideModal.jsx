import React from 'react';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import { notifyLegacy } from '../../legacy/legacyApi.js';
import { pdfUtils } from '../../services/pdf.js';
import { agentDisponible } from '../../services/printQueue.js';
import { zurichToday } from '../../utils/zurichTime.js';
import {
  ETIQUETTE_MEDIA, ETIQUETTE_MODES, QUANTITE_MAX, QUANTITE_MIN,
  calculerDlc, dureeVieMode, estEligible, formatDateFr, getMode, lignesEtiquette, motifNonEligible,
} from '../../utils/etiquettesDlc.js';
import { DernierLot, imprimerLot } from './impressionEtiquettes.jsx';
import { hs } from './HACCP.styles.js';

// ─────────────────────────────────────────────────────────────────────────────
// ÉTIQUETTE RAPIDE - une recette, un mode, N étiquettes
//
// Raccourci ouvert depuis Cartes & Recettes : on a la fiche sous les yeux, on
// imprime son étiquette sans passer par le module HACCP. Même contenu, même
// calcul de DLC et même circuit d'impression que le poste d'étiquetage
// (impressionEtiquettes.jsx) : seul l'écran est réduit à une préparation.
//
// Les durées de vie viennent de la fiche telle qu'elle a été chargée : une
// durée modifiée dans la fiche ouverte est relue à la réouverture.
//
// Fermer reste toujours possible, impression en cours comprise : le lot déjà
// parti ne dépend plus de la fenêtre.
// ─────────────────────────────────────────────────────────────────────────────

const rs = {
  ligne: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  stepBtn: { width: 44, height: 44, flexShrink: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 20, fontWeight: 700, color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
  qteInput: { width: 64, padding: '10px 6px', border: '1px solid var(--border)', borderRadius: 10, fontSize: 16, fontWeight: 700, textAlign: 'center', color: 'var(--text)', background: 'var(--bg)', fontFamily: 'var(--font)', outline: 'none' },
  apercu: { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: 'var(--text)', lineHeight: 1.55 },
  info: { fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 },
  avert: { padding: '10px 12px', background: 'var(--warning-bg)', border: '1px solid var(--warning-bd)', borderRadius: 8, fontSize: 12, color: 'var(--warning-text)', lineHeight: 1.45 },
};

const EtiquetteRapideModal = ({ recette, etabId, user, onClose }) => {
  const today = zurichToday();
  const [modeId, setModeId] = React.useState('frais');
  const [datesParMode, setDatesParMode] = React.useState(() => Object.fromEntries(
    ETIQUETTE_MODES.map(m => [m.id, Object.fromEntries(m.dates.map(d => [d.id, today]))]),
  ));
  const [quantite, setQuantite] = React.useState(1);
  const [busy, setBusy] = React.useState(false);
  const [dernierLot, setDernierLot] = React.useState(null);
  const [agent, setAgent] = React.useState(null);
  const urlsRef = React.useRef([]);

  // Les blob URL ne sont libérées qu'au démontage : le lien « Ouvrir le PDF »
  // doit rester valable tant que la fenêtre est ouverte.
  React.useEffect(() => () => {
    urlsRef.current.forEach(u => { try { URL.revokeObjectURL(u); } catch { /* déjà libérée */ } });
  }, []);

  React.useEffect(() => {
    let vivant = true;
    agentDisponible(etabId).then(a => { if (vivant) setAgent(a); });
    return () => { vivant = false; };
  }, [etabId]);

  // Préchargement de jsPDF à l'ouverture, pas au clic : la feuille de partage
  // iOS exige un PDF construit sans attente dans la tâche du geste.
  React.useEffect(() => { pdfUtils.precharger?.(); }, []);

  const mode = getMode(modeId);
  const dates = datesParMode[modeId] || {};
  const eligible = estEligible(recette, modeId);
  const duree = dureeVieMode(recette, modeId);
  const dlc = eligible ? calculerDlc(recette, modeId, dates) : null;

  const borner = (v) => Math.min(QUANTITE_MAX, Math.max(QUANTITE_MIN, Math.round(Number(v) || QUANTITE_MIN)));
  const changerQuantite = (v) => setQuantite(borner(v));
  // Mise à jour fonctionnelle : deux taps rapprochés comptent pour deux.
  const pasQuantite = (sens) => setQuantite(q => borner(q + sens));

  const imprimer = () => {
    if (busy || !eligible) return;
    const manquante = mode.dates.find(d => !dates[d.id]);
    if (manquante) {
      notifyLegacy(`Renseignez la ${manquante.label.toLowerCase()}.`, 'warning');
      return;
    }
    const lignes = lignesEtiquette({ recette, modeId, dates });
    const etiquettes = Array.from({ length: quantite }, () => ({ lignes }));
    // Pas d'await avant cet appel : le partage iOS exige la tâche du geste.
    imprimerLot({
      etiquettes,
      nomFichier: `etiquette-dlc-${modeId}-${dates[mode.dlcDepuis]}.pdf`,
      modeLot: modeId,
      agent,
      etabId,
      userId: user?.id,
      urls: urlsRef.current,
      setBusy, setDernierLot, setAgent,
    });
  };

  return (
    <div className="modal-sheet-overlay" style={hs.overlay} onClick={onClose}>
      <div className="modal-sheet" style={{ ...hs.modal, width: 480 }} onClick={e => e.stopPropagation()}>
        <div style={hs.modalHeader}>
          <div style={{ minWidth: 0 }}>
            <div style={hs.modalTitle}>Étiquette DLC</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>{recette.nom}</div>
          </div>
          <button type="button" style={hs.closeBtn} onClick={onClose} aria-label="Fermer">✕</button>
        </div>

        <div style={{ ...hs.modalBody, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SegmentedTabs
            tabs={ETIQUETTE_MODES.map(m => ({ id: m.id, label: m.label }))}
            active={modeId}
            onChange={setModeId}
          />

          {!eligible ? (
            <div style={rs.avert}>
              <strong>{motifNonEligible(recette)}</strong> : cette préparation ne peut pas
              sortir en {mode.label.toLowerCase()}. La durée de surgélation se renseigne
              dans la fiche, rubrique durées de vie.
            </div>
          ) : (
            <>
              {mode.dates.map(champ => (
                <div key={champ.id} style={hs.field}>
                  <label style={hs.fLabel}>{champ.label}</label>
                  <input
                    type="date"
                    style={{ ...hs.fInput, fontSize: 16 }}
                    value={dates[champ.id] || ''}
                    onChange={e => setDatesParMode(prev => ({
                      ...prev,
                      [modeId]: { ...(prev[modeId] || {}), [champ.id]: e.target.value },
                    }))}
                  />
                </div>
              ))}

              <div style={hs.field}>
                <label style={hs.fLabel}>Nombre d'étiquettes</label>
                <div style={rs.ligne}>
                  <button type="button" style={rs.stepBtn} onClick={() => pasQuantite(-1)} aria-label="Retirer une étiquette">−</button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={QUANTITE_MIN}
                    max={QUANTITE_MAX}
                    style={rs.qteInput}
                    value={quantite}
                    onChange={e => changerQuantite(e.target.value)}
                    aria-label="Nombre d'étiquettes"
                  />
                  <button type="button" style={rs.stepBtn} onClick={() => pasQuantite(1)} aria-label="Ajouter une étiquette">+</button>
                </div>
              </div>

              <div style={rs.apercu}>
                <div>{duree} jour{duree > 1 ? 's' : ''} en {mode.label.toLowerCase()} · {mode.temperature}</div>
                <div style={{ fontWeight: 700, color: 'var(--accent)' }}>
                  À consommer jusqu'au {formatDateFr(dlc)}
                </div>
                {mode.avertissement && <div style={{ fontWeight: 700 }}>{mode.avertissement}</div>}
              </div>
            </>
          )}

          <DernierLot lot={dernierLot} />

          <div style={rs.info}>
            Rouleau {ETIQUETTE_MEDIA.ref}
            {agent && (
              <> · impression <strong style={{ color: 'var(--success-text)' }}>directe</strong> sur
                {' '}<strong style={{ color: 'var(--text)' }}>{agent.imprimante || agent.nom}</strong></>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" style={hs.cancelBtn} onClick={onClose}>Fermer</button>
            <button
              type="button"
              style={{ ...hs.saveBtn, opacity: !eligible || busy ? 0.5 : 1 }}
              disabled={!eligible || busy}
              onClick={imprimer}
            >
              {busy
                ? (agent ? 'Envoi…' : 'Génération…')
                : `Imprimer ${quantite} étiquette${quantite > 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EtiquetteRapideModal;
