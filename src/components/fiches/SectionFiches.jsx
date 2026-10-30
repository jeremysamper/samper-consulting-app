import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import './fiches.css';

// ─── GrilleFiches : racine .fv des vignettes ────────────────────────────────
// Conteneur de requête (largeur réellement disponible, menu ouvert ou non) :
// 2 colonnes au téléphone, 3 dès 600 px, 4 dès 860 px, 5 dès 1180 px. Sans
// requêtes de conteneur (iOS 15), la grille garde ses 2 colonnes lisibles.
// Les sections se rangent sur ces mêmes colonnes : une section plus courte
// qu'une rangée (« Plats », un seul plat) se pose à côté de la précédente au
// lieu d'ouvrir une rangée presque vide. Sur l'iPad en paysage, la première
// rangée montre ainsi quatre plats, pas trois suivis d'un trou.
export function GrilleFiches({ children }) {
  return (
    <div className="fv">
      <div className="fv-vitrine">{children}</div>
    </div>
  );
}

// ─── SectionFiches : un titre serif, son nombre, puis la grille ─────────────
// Le nombre vit dans son propre nœud : « Entrées » se traduit par le
// glossaire, le chiffre ne part jamais à la traduction. Un « 1 » à côté
// d'une seule vignette ne dit rien : il n'est écrit que pour une section
// repliable (son contenu peut être caché).
// repliable : { ouvert, onBasculer } fait du titre un bouton (Archivées).
// grille = false : le contenu se pose tel quel (lignes de « Plats à compléter »).
// Une section en grille de 1 à 4 vignettes porte sa taille (fv-section--n1
// à n4) : la feuille lui donne autant de colonnes, sans dépasser la rangée.
// Les autres (repliable, lignes, 5 et plus) prennent toute la largeur.
export default function SectionFiches({ titre, nombre, repliable, grille = true, children }) {
  const taille = grille && !repliable && nombre > 0 && nombre < 5 ? ` fv-section--n${nombre}` : '';
  const titreContenu = (
    <>
      <span>{titre}</span>
      {nombre != null && (nombre !== 1 || repliable) && <span className="fv-section-nombre" data-no-translate="">{nombre}</span>}
    </>
  );
  const ouvert = repliable ? repliable.ouvert : true;
  return (
    <section className={`fv-section${taille}`}>
      <h2 className="fv-section-titre">
        {repliable ? (
          <button type="button" className="fv-section-bascule" aria-expanded={Boolean(ouvert)} onClick={repliable.onBasculer}>
            {ouvert
              ? <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
              : <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />}
            {titreContenu}
          </button>
        ) : titreContenu}
      </h2>
      {ouvert && (grille ? <div className="fv-grille">{children}</div> : children)}
    </section>
  );
}
