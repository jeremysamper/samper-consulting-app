import React from 'react';
import { Clock, Users } from 'lucide-react';
import VignetteFiche from '../../components/fiches/VignetteFiche.jsx';
import SectionFiches, { GrilleFiches } from '../../components/fiches/SectionFiches.jsx';
import PhotoFiche from '../../components/fiches/PhotoFiche.jsx';
import {
  platsDeRecette, photoDeRecette, platsACompleter, platsAEcrire, sectionsDeFiches,
} from '../../components/fiches/rangementFiches.js';
import { categorieDuPlat } from '../../utils/categoriesPlat.js';

// ─── VitrineFiches : la bibliothèque, une grille de fiches ──────────────────
// L'onglet « Bibliothèque recettes » de l'écran d'arrivée, et le résultat de
// sa recherche. Chaque fiche visible est une vignette, rangée par catégorie
// dans l'ordre de service (les préparations de base ensuite, en une seule
// section), et dit dans quel plat elle sert quand ce plat ne porte pas déjà
// son nom. La recherche porte sur le nom de la fiche ET des plats qui la
// contiennent.
// Droit « fiches » seulement : « Plats à compléter » (sans fiche visible ou
// sur aucune carte, avec Modifier), « Tous les plats » (repliée : chaque plat
// de l'établissement et son Modifier, y compris celui qu'aucun onglet ne
// montre, sur une carte archivée ou désactivé), puis « Archivées », repliée,
// ouverte d'office par une recherche qui en trouve.
// Sélection (droit « fiches », menu Gérer) : une case sur chaque vignette,
// toucher coche au lieu d'ouvrir ; les sections de plats et les archivées
// laissent la place.
// Aucun montant.
export const cleFiche = (r) => `fiche:${r.id}`;

const parNom = (a, b) => String(a.nom || '').localeCompare(String(b.nom || ''), 'fr');

// Fiches que montre la bibliothèque pour une recherche : celles dont le nom,
// ou le nom d'un plat qui les contient, correspond. Même règle pour la grille
// et pour « Tout sélectionner », qui ne coche que ce qui est à l'écran.
export function fichesTrouvees(recettesEtab, plats, match) {
  return (recettesEtab || []).filter((r) => match(r.nom, platsDeRecette(r.id, plats).map((p) => p.nom)));
}

// « Plat : Velouté », « Plats : a, b », « Plats : a, b et 2 autres ». Chaque
// nom dans son propre nœud : il se traduit comme partout ailleurs, sans faire
// de la liste une phrase inédite par fiche.
function textePlats(plats) {
  if (!plats.length) return null;
  const montres = plats.slice(0, 2);
  const reste = plats.length - montres.length;
  return (
    <>
      <span>{plats.length > 1 ? 'Plats :' : 'Plat :'}</span>{' '}
      {montres.map((p, i) => (
        <React.Fragment key={p.id}>{i > 0 && ', '}<span>{p.nom}</span></React.Fragment>
      ))}
      {reste > 0 && <>{' '}<span>et</span> <span data-no-translate="">{reste}</span> <span>autres</span></>}
    </>
  );
}

export default function VitrineFiches({
  recettesEtab, recettesArchivees, plats, match, q, recherche,
  canFiches, canEtiqueter, voirArchivees, onBasculerArchivees,
  voirPlats = false, onBasculerPlats, selection = null,
  onOuvrir, onEtiquette, onModifierPlat, ficheQuitteeId, refQuittee,
}) {
  const visiblesParId = React.useMemo(() => new Map((recettesEtab || []).map((r) => [r.id, r])), [recettesEtab]);
  const platsParRecette = React.useMemo(() => {
    const m = new Map();
    [...(recettesEtab || []), ...(recettesArchivees || [])].forEach((r) => m.set(r.id, platsDeRecette(r.id, plats)));
    return m;
  }, [recettesEtab, recettesArchivees, plats]);
  const platsDe = (r) => platsParRecette.get(r.id) || [];
  // Préfixe des ids des lignes de plats (bouton Modifier nommé par le nom du
  // plat, comme dans les vignettes).
  const idLignes = React.useId();

  const fiches = (recettesEtab || []).filter((r) => match(r.nom, platsDe(r).map((p) => p.nom)));
  const groupes = sectionsDeFiches(fiches);
  const gere = canFiches && !selection;
  const aCompleter = gere ? platsACompleter(plats, visiblesParId).filter(({ plat }) => match(plat.nom)) : [];
  const tousLesPlats = gere && onBasculerPlats ? (plats || []).filter((p) => p && match(p.nom)) : [];
  const archivees = gere ? (recettesArchivees || []).filter((r) => match(r.nom)).sort(parNom) : [];
  const archiveesOuvertes = Boolean(voirArchivees || q);

  const vignette = (r, archivee = false) => {
    const cle = cleFiche(r);
    const portions = Number(r.portions) || 0;
    const temps = Number(r.tempsTotal) || 0;
    return (
      <VignetteFiche
        key={r.id}
        refVignette={cle === ficheQuitteeId ? refQuittee : undefined}
        titre={r.nom}
        photo={photoDeRecette(r, plats, visiblesParId)}
        categorie={categorieDuPlat(r)}
        texte={textePlats(platsAEcrire(r, platsDe(r)))}
        allergenes={r.allergenesIds}
        meta={[
          temps > 0 && { cle: 'temps', Icone: Clock, contenu: <><span data-no-translate="">{temps}</span> min</> },
          portions > 0 && { cle: 'portions', Icone: Users, contenu: <><span data-no-translate="">{portions}</span> {portions > 1 ? 'portions' : 'portion'}</> },
        ]}
        pastille={archivee ? 'Archivée' : (r.statut === 'brouillon' ? 'Brouillon' : null)}
        attenuee={archivee}
        onOuvrir={() => onOuvrir(r, cle)}
        selection={selection ? { coche: selection.isSelected(r.id), onBasculer: () => selection.toggle(r.id) } : null}
        actions={canEtiqueter && !archivee && !selection ? (nommer) => (
          <button type="button" className="fv-action" {...nommer('etiquette')} onClick={() => onEtiquette(r)}>Étiquette</button>
        ) : null}
      />
    );
  };

  // Une ligne de plat : miniature, nom, une précision, Modifier.
  const lignePlat = (plat, precision, prefixe) => (
    <li key={plat.id} className="fv-ligne">
      <span className="fv-miniature">
        <PhotoFiche src={plat.photoUrl} categorie={categorieDuPlat(plat)} nom={plat.nom} variante="miniature" />
      </span>
      <span className="fv-ligne-texte">
        <span className="fv-ligne-nom" id={`${idLignes}-${prefixe}-${plat.id}`}>{plat.nom}</span>
        <span className="fv-ligne-raison">{precision}</span>
      </span>
      <button
        type="button"
        className="fv-action"
        id={`${idLignes}-${prefixe}-${plat.id}-modifier`}
        aria-labelledby={`${idLignes}-${prefixe}-${plat.id}-modifier ${idLignes}-${prefixe}-${plat.id}`}
        onClick={() => onModifierPlat(plat)}
      >Modifier</button>
    </li>
  );
  // « Entrées, 2 fiches » : les fiches visibles du plat (ni cachées ni
  // archivées, comme partout dans le module). Le nombre dans son nœud : la
  // phrase autour reste au glossaire.
  const compositionDuPlat = (plat) => {
    const n = (plat.recettes || []).filter((pr) => visiblesParId.has(pr.recetteId)).length;
    return <><span>{categorieDuPlat(plat)}</span>, <span data-no-translate="">{n}</span> <span>{n > 1 ? 'fiches' : 'fiche'}</span></>;
  };

  // Rien à montrer : une recherche sans résultat le dit avec son texte ; sans
  // recherche (toutes les fiches cachées, plats créés avant leurs fiches, rôle
  // sans droit fiches), l'écran le dit aussi au lieu de rester blanc.
  const rien = !fiches.length && !aCompleter.length && !tousLesPlats.length && !archivees.length;

  return (
    <GrilleFiches>
      {rien && q && (
        <p className="fv-vide-recherche">
          Aucune fiche ne correspond à «&nbsp;<span data-no-translate="">{String(recherche || '').trim()}</span>&nbsp;».
        </p>
      )}
      {rien && !q && (
        <p className="fv-vide-recherche">
          {canFiches
            ? 'Aucune recette pour cet établissement. Le bouton « Nouvelle fiche » en crée une.'
            : 'Aucune recette pour cet établissement.'}
        </p>
      )}

      {groupes.map(([cat, items]) => (
        <SectionFiches key={cat} titre={cat} nombre={items.length}>
          {items.slice().sort(parNom).map((r) => vignette(r))}
        </SectionFiches>
      ))}

      {aCompleter.length > 0 && (
        <SectionFiches titre="Plats à compléter" nombre={aCompleter.length} grille={false}>
          <ul className="fv-lignes">
            {aCompleter.map(({ plat, raison }) => lignePlat(plat, raison === 'sansFiche' ? 'aucune fiche' : 'sur aucune carte', 'c'))}
          </ul>
        </SectionFiches>
      )}

      {tousLesPlats.length > 0 && (
        <SectionFiches
          titre="Tous les plats"
          nombre={tousLesPlats.length}
          grille={false}
          repliable={{ ouvert: voirPlats, onBasculer: onBasculerPlats }}
        >
          <ul className="fv-lignes">
            {tousLesPlats.map((plat) => lignePlat(plat, compositionDuPlat(plat), 'p'))}
          </ul>
        </SectionFiches>
      )}

      {archivees.length > 0 && (
        <SectionFiches
          titre="Archivées"
          nombre={archivees.length}
          repliable={{ ouvert: archiveesOuvertes, onBasculer: onBasculerArchivees }}
        >
          {archivees.map((r) => vignette(r, true))}
        </SectionFiches>
      )}
    </GrilleFiches>
  );
}
