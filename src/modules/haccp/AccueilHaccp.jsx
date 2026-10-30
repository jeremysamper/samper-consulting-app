import React from 'react';
import { BookOpen, Camera, ClipboardCheck, Tag } from 'lucide-react';
import AccueilModule from '../../components/parcours/AccueilModule.jsx';
import { ECRANS_HACCP } from './HACCP.constants.js';
import './haccp.css';

// ─────────────────────────────────────────────────────────────────────────────
// Tuiles de l'accueil du module HACCP, sur la grille partagée AccueilModule,
// sous la carte « Maintenant » (qui mène au relevé des températures : pas de
// tuile « relevé » en plus). Les tâches du service d'abord (étiquette, photo),
// puis les contrôles et le registre. Chaque tuile dit en une ligne ce qu'elle
// fait. Une tuile hors droit n'est pas rendue. « Réglages » (consultant) n'est
// plus une tuile : un bouton de la barre Exporter (HACCP.jsx), pour que la
// grille garde quatre tuiles de même hauteur (haccp.css : 2 + 2 sur iPad).
//
// controles : { faits, dus } (compteControles), null tant que la lecture n'a
// pas abouti : jamais « 0 sur 0 » sur des données qu'on n'a pas.
// Nombres dans leurs propres nœuds : la phrase autour reste une entrée du
// glossaire.
// ─────────────────────────────────────────────────────────────────────────────

const N = ({ children }) => <span data-no-translate="">{children}</span>;

export default function AccueilHaccp({ controles, canWrite, onOuvrir }) {
  let etatControles = null;
  if (controles) {
    etatControles = controles.dus > 0
      ? <><N>{controles.faits}</N> sur <N>{controles.dus}</N> faits aujourd'hui</>
      : <>Rien à faire aujourd'hui</>;
  }
  const tuiles = [
    { id: 'etiquettes', Icone: Tag, etat: <>Le nom et la date limite, à coller sur la boîte</>, visible: canWrite },
    { id: 'tracabilite', Icone: Camera, etat: canWrite ? <>Garder l'étiquette d'un produit reçu</> : <>Voir les photos des étiquettes</> },
    { id: 'controles', Icone: ClipboardCheck, etat: etatControles },
    { id: 'releves', Icone: BookOpen, etat: <>Les relevés jour par jour</> },
  ].map(t => ({ ...t, libelle: ECRANS_HACCP[t.id], onClick: () => onOuvrir(t.id) }));
  const rendues = tuiles.filter(t => !('visible' in t) || Boolean(t.visible)).length;
  return (
    <div className="haccp-accueil" data-tuiles={rendues}>
      <AccueilModule tuiles={tuiles} />
    </div>
  );
}
