import React from 'react';
import { Anneau, Btn } from '../../components/ui/index.jsx';
import { ETAPES, lireMiseEnRoute } from './demarrageService.js';

// ─────────────────────────────────────────────────────────────────────────────
// Mise en route sur le tableau de bord (lot LD, repris en widget au lot A1).
//
// useMiseEnRoute : lecture des étapes de l'établissement, sous la garde posée
// par le tableau de bord (consultant et patron). Relue quand la page de mise
// en route signale un changement (EVENEMENT_DEMARRAGE).
//   { statut: 'absent' | 'chargement' | 'pret', termine, faites, registre }
// 'absent' : garde fermée, migration pas appliquée ou lecture en échec ; le
// widget n'est pas rendu (une carte qui ne sait pas ce qui est fait ne guide
// personne).
//
// CarteDemarrage : la part faite en anneau, la prochaine étape en une phrase,
// et l'action principale « Continuer ».
// ─────────────────────────────────────────────────────────────────────────────

export const EVENEMENT_DEMARRAGE = 'sc:demarrage';

const PROCHAINE = {
  etablissement: "Vérifiez d'abord les informations de l'établissement.",
  recettes: 'Ajoutez vos fiches : une photo de chaque fiche suffit.',
  catalogue: 'Ajoutez vos produits : une photo de facture les remplit.',
  planning: "Faites la première semaine de l'équipe.",
};

export function useMiseEnRoute({ etabId, enabled }) {
  const cle = enabled && etabId ? etabId : null;
  const [etat, setEtat] = React.useState({ cle: null, statut: 'absent' });

  React.useEffect(() => {
    if (!cle) return undefined;
    let vivant = true;
    const relire = () => {
      lireMiseEnRoute(cle)
        .then((e) => { if (vivant) setEtat({ cle, statut: 'pret', ...e }); })
        .catch((err) => {
          console.warn('[mise en route] lecture', err);
          if (vivant) setEtat((prec) => (prec.cle === cle && prec.statut === 'pret' ? prec : { cle, statut: 'absent' }));
        });
    };
    relire();
    window.addEventListener(EVENEMENT_DEMARRAGE, relire);
    return () => { vivant = false; window.removeEventListener(EVENEMENT_DEMARRAGE, relire); };
  }, [cle]);

  if (!cle) return { statut: 'absent' };
  if (etat.cle !== cle) return { statut: 'chargement' };
  return etat;
}

export default function CarteDemarrage({ etat, onContinuer }) {
  if (!etat || etat.statut !== 'pret' || etat.termine) return null;
  const faites = etat.faites || new Set();
  const n = ETAPES.filter((e) => faites.has(e)).length;
  const exempleCharge = (etat.registre || []).length > 0;
  const prochaine = ['etablissement', 'recettes', 'catalogue', 'planning'].find((e) => !faites.has(e));
  const phrase = exempleCharge
    ? "L'exemple est encore chargé : effacez-le depuis la mise en route quand vos données sont là."
    : (PROCHAINE[prochaine] || "Il ne reste qu'à terminer la mise en route.");
  return (
    <section className="tdb-panneau" aria-labelledby="carte-demarrage-titre" style={s.carte} data-mise-en-route="">
      <div style={s.gauche}>
        <Anneau part={n / ETAPES.length} couleur="var(--accent)" taille={56} />
        <span style={{ minWidth: 0 }}>
          <h2 id="carte-demarrage-titre" className="tdb-titre" style={s.titre}>Mise en route</h2>
          <span style={s.compte}><span data-no-translate>{n}</span>{' '}<span>{n > 1 ? 'étapes faites sur 5' : 'étape faite sur 5'}</span></span>
          <span style={s.texte}>{phrase}</span>
        </span>
      </div>
      {onContinuer && <Btn variant="primary" onClick={onContinuer}>Continuer</Btn>}
    </section>
  );
}

const s = {
  carte: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', minWidth: 0, boxSizing: 'border-box' },
  gauche: { display: 'flex', alignItems: 'center', gap: 16, minWidth: 0, flex: '1 1 280px' },
  titre: { margin: 0, fontFamily: 'var(--font)', fontWeight: 'var(--g3)', fontSize: 'var(--t3)', lineHeight: 1.2, color: 'var(--text)' },
  compte: { display: 'block', marginTop: 4, fontSize: 'var(--t2)', color: 'var(--text2)' },
  texte: { display: 'block', marginTop: 4, fontSize: 'var(--t2)', lineHeight: 1.45, color: 'var(--text)' },
};
