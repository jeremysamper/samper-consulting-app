import React from 'react';
import { ChevronRight } from 'lucide-react';
import PhotoFiche from './PhotoFiche.jsx';
import AllergenesFiche from './AllergenesFiche.jsx';
import './fiches.css';

// ─── VignetteFiche : une fiche en vitrine (plat, recette, fiche salle) ──────
// La vignette entière est la cible : photo, nom, texte, allergènes et méta
// tiennent dans UN bouton (.fv-ouvrir). Les actions secondaires (fiches du
// plat, Étiquette, Modifier) sont des boutons frères posés dessous, jamais
// imbriqués. Pas d'aria-label sur la vignette : son nom accessible vient de
// son texte (une phrase « Ouvrir la fiche X » par plat partirait à l'IA de
// traduction, plat par plat).
// Sans onOuvrir (plat sans fiche), le même contenu dans un bloc inerte : la
// vignette ne promet pas une fiche qu'elle n'ouvrirait pas.
// Sélection (Fiches salle) : une case de 44 x 44 sur la photo, et toucher la
// vignette coche au lieu d'ouvrir.
//
// Props :
//   titre, photo (URL ou null), categorie (visuel de remplacement)
//   texte      : description ou « Plat : … » (2 lignes au plus)
//   allergenes : ids (référentiel) ou valeurs libres
//   meta       : [{ cle, Icone, contenu }] (nombres dans leur propre nœud)
//   pastille   : « Brouillon », « Archivée »… en haut à droite de la photo
//   mention    : ligne discrète (« Fiche à venir »)
//   liens      : { titre, items: [{ cle, nom, onOuvrir }] }
//   actions    : boutons (.fv-action) sous la vignette
//   selection  : { coche, onBasculer } quand la sélection est active
//   refVignette, attenuee (archivées)
export default function VignetteFiche({
  titre, photo, categorie, texte, allergenes, meta, pastille, mention,
  onOuvrir, liens, actions, selection, refVignette, attenuee = false,
}) {
  const idTitre = React.useId();
  const metaVisible = (meta || []).filter(Boolean);
  const Cible = onOuvrir || selection ? 'button' : 'div';
  const auToucher = selection ? selection.onBasculer : onOuvrir;

  return (
    <article
      ref={refVignette}
      className="fv-vignette"
      data-vignette=""
      data-attenuee={attenuee ? '' : undefined}
      data-coche={selection?.coche ? '' : undefined}
    >
      {selection && (
        <label className="fv-coche">
          <input
            type="checkbox"
            checked={Boolean(selection.coche)}
            onChange={selection.onBasculer}
            aria-labelledby={idTitre}
          />
        </label>
      )}
      <Cible
        {...(Cible === 'button' ? { type: 'button', onClick: auToucher } : null)}
        className={Cible === 'button' ? 'fv-ouvrir' : 'fv-ouvrir fv-ouvrir--inerte'}
      >
        <span className="fv-cadre-photo">
          <PhotoFiche src={photo} categorie={categorie} nom={titre} variante="vignette" />
          <span className="fv-voile" aria-hidden="true" />
          {pastille && <span className="fv-pastille">{pastille}</span>}
          <span className="fv-nom" id={idTitre}>{titre}</span>
        </span>
        <span className="fv-texte">
          {texte && <span className="fv-desc">{texte}</span>}
          <AllergenesFiche ids={allergenes} />
          {metaVisible.length > 0 && (
            <span className="fv-meta">
              {metaVisible.map(({ cle, Icone, contenu }) => (
                <span key={cle} className="fv-meta-item">
                  {Icone && <Icone className="fv-meta-picto" strokeWidth={1.75} aria-hidden="true" />}
                  <span>{contenu}</span>
                </span>
              ))}
            </span>
          )}
          {mention && <span className="fv-mention">{mention}</span>}
        </span>
      </Cible>
      {liens && liens.items?.length > 0 && (
        <div className="fv-liens">
          <p className="fv-liens-titre">{liens.titre}</p>
          <ul className="fv-liens-liste">
            {liens.items.map((l) => (
              <li key={l.cle}>
                <button type="button" className="fv-lien" onClick={l.onOuvrir}>
                  <span className="fv-lien-nom">{l.nom}</span>
                  <ChevronRight className="fv-lien-picto" size={16} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {actions && <div className="fv-actions">{actions}</div>}
    </article>
  );
}
