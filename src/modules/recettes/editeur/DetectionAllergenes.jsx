import React from 'react';
import { confirmLegacy, notifyLegacy } from '../../../legacy/legacyApi.js';
import { dbService } from '../../../services/dbService.js';
import { messageErreur } from '../../../utils/messageErreur.js';
import { ALLERGENES_OPTIONS } from '../../consultant-tools/ConsultantTools.constants.js';

// ─────────────────────────────────────────────────────────────────────────────
// Détection des allergènes de toutes les fiches (IA, consultant seul), dans
// Gérer de Cartes & Recettes. Reprise des Outils consultant : par lots de
// trois, ajoute sans retirer, interruptible. Les archivées ne sont pas
// analysées ; les cachées le sont (leurs allergènes comptent dans les plats).
// ─────────────────────────────────────────────────────────────────────────────

export default function DetectionAllergenes({ recettes = [], style, onFini }) {
  const legacySB = dbService.getBridge();
  const [progression, setProgression] = React.useState(null);
  const annulerRef = React.useRef(false);

  const lancer = async () => {
    const cibles = recettes.filter(r => r.statut !== 'archivée' && (r.ingredients || []).length > 0);
    if (!cibles.length) { notifyLegacy('Aucune fiche avec des ingrédients à analyser.', 'info'); return; }
    if (!confirmLegacy(`Détecter les allergènes de ${cibles.length} fiche(s) ?\n\nCela lance ${cibles.length} analyse(s). Les allergènes détectés sont ajoutés sans retirer les existants.`)) return;
    annulerRef.current = false;
    setProgression({ fait: 0, total: cibles.length, ajoutes: 0 });
    let fait = 0;
    let ajoutes = 0;
    try {
      const { detectAllergens } = await import('../../../services/aiService.js');
      const valides = new Set(ALLERGENES_OPTIONS.map(a => a.id));
      for (let i = 0; i < cibles.length; i += 3) {
        if (annulerRef.current) break;
        const lot = cibles.slice(i, i + 3);
        const res = await Promise.allSettled(lot.map(async (r) => {
          const noms = (r.ingredients || []).map(x => x.nom).filter(Boolean);
          const out = await detectAllergens(noms, r.nom);
          const trouves = (out.allergenes || []).filter(id => valides.has(id));
          const actuels = r.allergenesIds || [];
          const fusion = [...new Set([...actuels, ...trouves])];
          const n = fusion.length - actuels.length;
          if (n > 0) await legacySB.db.upsertRecette({ ...r, allergenesIds: fusion });
          return n;
        }));
        res.forEach((x) => { fait += 1; if (x.status === 'fulfilled') ajoutes += x.value; });
        setProgression({ fait, total: cibles.length, ajoutes });
      }
    } catch (err) {
      notifyLegacy('Détection groupée interrompue. ' + messageErreur(err, 'recettes'), 'error');
    }
    setProgression(null);
    notifyLegacy(`Détection terminée : ${fait} fiche(s) analysée(s), ${ajoutes} allergène(s) ajouté(s)${annulerRef.current ? ', interrompue' : ''}.`, 'success');
    onFini?.();
  };

  return (
    <>
      <button type="button" style={style} onClick={lancer} disabled={!!progression} title="Analyse des ingrédients de chaque fiche, à vérifier ensuite">
        Détecter les allergènes
      </button>
      {progression && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(20,16,12,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, width: 'min(420px,94vw)', padding: 20, boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)', marginBottom: 4 }}>Détection des allergènes</div>
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>
              <span data-no-translate>{progression.fait} / {progression.total}</span> fiche(s), <span data-no-translate>{progression.ajoutes}</span> allergène(s) ajouté(s)
            </div>
            <div style={{ height: 10, background: 'var(--bg)', borderRadius: 6, margin: '12px 0', overflow: 'hidden', border: '1px solid var(--border)' }}>
              <div style={{ height: '100%', width: `${progression.total ? (progression.fait / progression.total) * 100 : 0}%`, background: 'var(--accent)' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" style={{ ...style, color: 'var(--danger-strong)' }} onClick={() => { annulerRef.current = true; }}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
