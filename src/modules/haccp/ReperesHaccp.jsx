import React from 'react';
import { ClipboardCheck, RotateCcw, Thermometer, TriangleAlert } from 'lucide-react';
import { CarteRepere } from '../../components/ui/index.jsx';
import { joursEntre } from './haccpJour.js';

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
// Sans aucun relevé aujourd'hui, les deux cartes du milieu ne disent plus
// « aucun relevé trop chaud » ni « aucun frigo à relever de nouveau », qui se
// lisaient comme une cuisine conforme (audit du 19.11.2026 : dernier relevé à
// Woodland le 10.07). La deuxième dit depuis combien de jours rien n'a été
// relevé (dernierReleveJour, tous frigos actifs), dès deux jours.
//
// Au téléphone (haccp.css), seuls les relevés faits et les contrôles sont
// rendus, sur une ligne : les deux autres sont dits par la carte « Maintenant »
// (frigo à relever de nouveau), et la page ne s'allonge pas.
// Avec des relevés aujourd'hui, les deux cartes du milieu disent un chiffre,
// zéro compris (« 0 relevé hors limite sur 5 »), plutôt qu'une phrase
// rassurante : le zéro porte son ensemble. Sans relevé, une phrase. Rien
// n'est rendu tant que la lecture n'a pas abouti, ni sans frigo réglé.
// Nombres et noms dans leurs propres nœuds : la phrase autour reste une entrée
// du glossaire. Crochets du banc : data-haccp-reperes, data-repere.
// ─────────────────────────────────────────────────────────────────────────────

const N = ({ children }) => <span data-no-translate="">{children}</span>;

// 2026-07-10 → 10.07.2026
const dateCourte = (iso) => String(iso || '').split('-').reverse().join('.');

export default function ReperesHaccp({ etat, relevesDuJour = [], controles, dernierReleveJour = null, today = null }) {
  if (!etat || etat.statut === 'non_regle') return null;
  const avecTournees = etat.tournees.length > 0;
  const faits = avecTournees ? etat.faitsJour : etat.zonesFaitesJour;
  const horsPlage = relevesDuJour.filter(r => !r.conforme).length;
  const aRevoir = etat.aRevoir || [];
  // Sans relevé aujourd'hui, « aucun relevé trop chaud » et « aucun frigo à
  // relever de nouveau » sont vrais mais trompeurs : ils se lisent comme une
  // cuisine conforme. On dit alors depuis quand rien n'a été relevé.
  const aucunAujourdhui = relevesDuJour.length === 0;
  const joursSans = aucunAujourdhui ? joursEntre(dernierReleveJour, today) : null;

  return (
    <div className="haccp-reperes" data-haccp-reperes="">
      <CarteRepere
        data-repere="releves"
        Icone={Thermometer}
        valeur={faits}
        libelle={avecTournees
          ? <>{faits > 1 ? 'relevés faits sur' : 'relevé fait sur'} <N>{etat.totalJour}</N> prévus</>
          : <>sur <N>{etat.totalZones}</N> frigos et appareils relevés aujourd'hui</>}
      />
      {!aucunAujourdhui ? (
        <CarteRepere
          data-repere="hors-plage"
          Icone={TriangleAlert}
          valeur={horsPlage > 0 ? <span style={{ color: 'var(--danger-strong)' }}>{horsPlage}</span> : 0}
          libelle={<>{horsPlage > 1 ? 'relevés hors limite sur' : 'relevé hors limite sur'} <N>{relevesDuJour.length}</N></>}
          detail="aujourd'hui"
        />
      ) : joursSans >= 2 ? (
        <CarteRepere
          data-repere="hors-plage"
          Icone={TriangleAlert}
          valeur={joursSans}
          libelle="jours sans relevé"
          detail={<>dernier relevé le <N>{dateCourte(dernierReleveJour)}</N></>}
        />
      ) : !dernierReleveJour ? (
        <CarteRepere data-repere="hors-plage" Icone={TriangleAlert} texte="Aucun relevé enregistré pour l'instant" />
      ) : (
        <CarteRepere data-repere="hors-plage" Icone={TriangleAlert} texte="Pas encore de relevé aujourd'hui" />
      )}
      {aucunAujourdhui ? (
        <CarteRepere data-repere="a-revoir" Icone={RotateCcw} texte="Rien à vérifier tant qu'aucun relevé n'est fait" />
      ) : (
        <CarteRepere
          data-repere="a-revoir"
          Icone={RotateCcw}
          valeur={aRevoir.length}
          libelle={aRevoir.length > 1 ? 'frigos à relever de nouveau' : 'frigo à relever de nouveau'}
          detail={aRevoir.length ? <N>{aRevoir.map(a => a.zone.nom).join(', ')}</N> : <>sur <N>{etat.totalZones}</N> frigos et appareils</>}
        />
      )}
      {controles && (controles.dus > 0 ? (
        <CarteRepere
          data-repere="controles"
          Icone={ClipboardCheck}
          valeur={controles.faits}
          libelle={controles.faits > 1 ? 'contrôles faits' : 'contrôle fait'}
          detail={<>sur <N>{controles.dus}</N> aujourd'hui</>}
        />
      ) : (
        <CarteRepere data-repere="controles" Icone={ClipboardCheck} texte="Aucun contrôle à faire aujourd'hui" />
      ))}
    </div>
  );
}
