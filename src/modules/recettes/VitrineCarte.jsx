import React from 'react';
import { Clock } from 'lucide-react';
import VignetteFiche from '../../components/fiches/VignetteFiche.jsx';
import SectionFiches, { GrilleFiches } from '../../components/fiches/SectionFiches.jsx';
import { recettesOuvrablesDuPlat } from '../../components/fiches/rangementFiches.js';
import { categorieDuPlat } from '../../utils/categoriesPlat.js';

// ─── VitrineCarte : les plats de la carte du moment, en vignettes ───────────
// Toucher la vignette d'un plat ouvre sa première fiche ouvrable (même nombre
// de gestes que l'ancien lien sous la description, cible dix fois plus
// grande). Un plat à deux fiches ou plus garde la liste « Fiches du plat »
// sous sa vignette ; un plat sans fiche visible n'ouvre rien et le dit.
// Allergènes et temps : toutes les recettes du plat, cachées comprises
// (cacher une préparation ne retire jamais un allergène d'un plat servi).
// Aucun montant : la carte du moment est une vue de service.
//
// Props :
//   plats          : plats de la carte affichée, déjà filtrés (recherche, onglet)
//   categories     : catégories présentes, dans l'ordre de service
//   recettesActives: recettes non archivées, cachées comprises
//   recettesVisibles: recettes ouvrables (ni archivées ni cachées)
//   canFiches      : droit « fiches » (bouton Modifier du plat)
//   onOuvrirRecette(recette, plat), onModifierPlat(plat)
//   ficheQuitteeId, refQuittee : la vignette quittée à l'ouverture d'une
//                    fiche reçoit la ref, pour la ramener à l'écran au retour.
export const clePlat = (plat) => `plat:${plat.id}`;

export default function VitrineCarte({
  plats, categories, recettesActives, recettesVisibles, canFiches,
  onOuvrirRecette, onModifierPlat, ficheQuitteeId, refQuittee,
}) {
  const visiblesParId = React.useMemo(() => new Map((recettesVisibles || []).map((r) => [r.id, r])), [recettesVisibles]);
  const activesParId = React.useMemo(() => new Map((recettesActives || []).map((r) => [r.id, r])), [recettesActives]);

  const vignette = (plat) => {
    const ouvrables = recettesOuvrablesDuPlat(plat, visiblesParId);
    const toutes = (plat.recettes || []).map((pr) => activesParId.get(pr.recetteId)).filter(Boolean);
    const allergenes = [...new Set(toutes.flatMap((r) => r.allergenesIds || []))];
    // Temps le plus long des recettes du plat.
    const tempsMax = Math.max(0, ...toutes.map((r) => Number(r.tempsTotal) || 0));
    const premiere = ouvrables[0] || null;
    const cle = clePlat(plat);
    return (
      <VignetteFiche
        key={plat.id}
        refVignette={cle === ficheQuitteeId ? refQuittee : undefined}
        titre={plat.nom}
        photo={plat.photoUrl}
        categorie={categorieDuPlat(plat)}
        texte={plat.description}
        allergenes={allergenes}
        meta={[tempsMax > 0 && { cle: 'temps', Icone: Clock, contenu: <><span data-no-translate="">{tempsMax}</span> min</> }]}
        mention={premiere ? null : 'Fiche à venir'}
        onOuvrir={premiere ? () => onOuvrirRecette(premiere, plat) : null}
        liens={ouvrables.length > 1 ? {
          titre: 'Fiches du plat',
          items: ouvrables.map((r) => ({ cle: r.id, nom: r.nom, onOuvrir: () => onOuvrirRecette(r, plat) })),
        } : null}
        actions={canFiches ? (nommer) => (
          <button type="button" className="fv-action" {...nommer('modifier')} onClick={() => onModifierPlat(plat)}>Modifier</button>
        ) : null}
      />
    );
  };

  return (
    <GrilleFiches>
      {categories.map((cat) => {
        const platsCat = plats.filter((p) => categorieDuPlat(p) === cat);
        if (!platsCat.length) return null;
        return (
          <SectionFiches key={cat} titre={cat} nombre={platsCat.length}>
            {platsCat.map(vignette)}
          </SectionFiches>
        );
      })}
    </GrilleFiches>
  );
}
