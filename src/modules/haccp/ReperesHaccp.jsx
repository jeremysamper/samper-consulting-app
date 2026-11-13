import React from 'react';
import { ClipboardCheck, RotateCcw, Thermometer, TriangleAlert } from 'lucide-react';
import { CarteRepere } from '../../components/ui/index.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Repères du jour, en tête de l'accueil HACCP : quatre petites cartes blanches
// (CarteRepere), les chiffres qu'on lit en ouvrant le module. Rien n'est lu en
// plus : tout vient de l'état du jour déjà calculé par HACCP.jsx.
//
//   relevés faits        etat.faitsJour sur etat.totalJour (zones x heures de
//                        relevé) ; sans heures de relevé, les zones relevées
//                        aujourd'hui sur les zones actives
//   trop chaud ou froid  relevés du jour hors plage
//   à relever de nouveau etat.aRevoir : zones dont le dernier relevé du jour
//                        est hors plage
//   contrôles            compteControles : faits sur dus aujourd'hui
//
// Sans chiffre à dire, la carte porte une phrase, jamais un gros zéro. Rien
// n'est rendu tant que la lecture n'a pas abouti, ni sans frigo réglé.
// Nombres et noms dans leurs propres nœuds : la phrase autour reste une entrée
// du glossaire. Crochet du banc : data-haccp-reperes.
// ─────────────────────────────────────────────────────────────────────────────

const N = ({ children }) => <span data-no-translate="">{children}</span>;

export default function ReperesHaccp({ etat, relevesDuJour = [], controles }) {
  if (!etat || etat.statut === 'non_regle') return null;
  const avecTournees = etat.tournees.length > 0;
  const faits = avecTournees ? etat.faitsJour : etat.zonesFaitesJour;
  const horsPlage = relevesDuJour.filter(r => !r.conforme).length;
  const aRevoir = etat.aRevoir || [];

  return (
    <div className="haccp-reperes" data-haccp-reperes="">
      <CarteRepere
        Icone={Thermometer}
        valeur={faits}
        libelle={avecTournees
          ? <>{faits > 1 ? 'relevés faits sur' : 'relevé fait sur'} <N>{etat.totalJour}</N> prévus</>
          : <>sur <N>{etat.totalZones}</N> frigos et appareils relevés aujourd'hui</>}
      />
      {horsPlage > 0 ? (
        <CarteRepere Icone={TriangleAlert} valeur={horsPlage} libelle="trop chaud ou trop froid" detail="aujourd'hui" />
      ) : (
        <CarteRepere Icone={TriangleAlert} texte="Aucun relevé trop chaud ou trop froid aujourd'hui" />
      )}
      {aRevoir.length > 0 ? (
        <CarteRepere
          Icone={RotateCcw}
          valeur={aRevoir.length}
          libelle={aRevoir.length > 1 ? 'frigos à relever de nouveau' : 'frigo à relever de nouveau'}
          detail={<N>{aRevoir.map(a => a.zone.nom).join(', ')}</N>}
        />
      ) : (
        <CarteRepere Icone={RotateCcw} texte="Aucun frigo à relever de nouveau" />
      )}
      {controles && (controles.dus > 0 ? (
        <CarteRepere
          Icone={ClipboardCheck}
          valeur={controles.faits}
          libelle={controles.faits > 1 ? 'contrôles faits' : 'contrôle fait'}
          detail={<>sur <N>{controles.dus}</N> aujourd'hui</>}
        />
      ) : (
        <CarteRepere Icone={ClipboardCheck} texte="Aucun contrôle à faire aujourd'hui" />
      ))}
    </div>
  );
}
