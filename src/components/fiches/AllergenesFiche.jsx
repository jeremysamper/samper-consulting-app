import React from 'react';
import { ALLERGENES_LABELS, partitionAllergenes, sortAllergenes } from '../../utils/allergenes.js';
import { ICONES_ALLERGENES } from './visuelFiche.js';
import './fiches.css';

// ─── AllergenesFiche : les allergènes d'une fiche, picto + libellé ──────────
// Tous affichés, dans l'ordre du référentiel : pas de « +2 » qui cacherait un
// allergène à un cuisinier pressé. Le picto ne vient jamais seul, le libellé
// est toujours écrit. Une valeur hors référentiel (texte libre d'un ancien
// import) passe telle quelle, sans picto.
// - variante « ligne » : dans une vignette (que des span, elle vit dans un
//   bouton) ; rien du tout quand la fiche n'en déclare aucun.
// - variante « bandeau » : en tête d'une fiche ouverte, titre compris, et
//   « Aucun allergène déclaré » quand la liste est vide.
const elements = (ids) => {
  const { valides, inconnus } = partitionAllergenes(ids);
  return [
    ...sortAllergenes(valides).map((id) => ({ cle: id, libelle: ALLERGENES_LABELS[id], Icone: ICONES_ALLERGENES[id] })),
    ...inconnus.map((v) => ({ cle: `libre-${v}`, libelle: String(v), Icone: null })),
  ];
};

const Contenu = ({ Icone, libelle }) => (
  <>
    {Icone && <Icone className="fv-allergene-picto" strokeWidth={1.75} aria-hidden="true" />}
    <span>{libelle}</span>
  </>
);

export default function AllergenesFiche({ ids, variante = 'ligne' }) {
  const liste = elements(ids);

  if (variante !== 'bandeau') {
    if (!liste.length) return null;
    return (
      <span className="fv-allergenes">
        {liste.map((a) => (
          <span key={a.cle} className="fv-allergene"><Contenu {...a} /></span>
        ))}
      </span>
    );
  }

  return (
    <section className="fv-bandeau-allergenes" data-fiche-section="allergenes">
      <h3 className="fv-titre-section">Allergènes</h3>
      {liste.length ? (
        <ul className="fv-allergenes fv-allergenes--bandeau">
          {liste.map((a) => (
            <li key={a.cle} className="fv-allergene"><Contenu {...a} /></li>
          ))}
        </ul>
      ) : (
        <p className="fv-vide">Aucun allergène déclaré</p>
      )}
    </section>
  );
}
