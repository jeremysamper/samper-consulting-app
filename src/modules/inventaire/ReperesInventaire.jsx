import React from 'react';
import { CalendarCheck, ClipboardList, Layers } from 'lucide-react';
import { Anneau, CarteAvant, CarteRepere, carteAvantStyles } from '../../components/ui/index.jsx';
import { dateCH, estCompte } from './inventaireLignes.js';
import { avancementZones } from './zones.js';
import './inventaire.css';

// ─────────────────────────────────────────────────────────────────────────────
// Accueil de l'Inventaire (direction Galet) : la rangée de repères et la carte
// de l'inventaire du périmètre, posées par AccueilInventaire autour des tuiles.
// Rien n'est lu en plus : tout vient des piles d'inventaires déjà chargées.
//
//   repères      produits comptés sur le total du dernier inventaire du
//                périmètre ; date du dernier inventaire validé ; nombre de
//                périmètres et leurs noms
//   carte nuit   le dernier inventaire du périmètre : une tuile par zone, dans
//                l'ordre du tour, avec ce qui y est compté et son anneau (mêmes
//                comptes que les onglets de zone du comptage, avancementZones)
//
// La carte n'a pas de flèche : la tuile « Je compte » ouvre le comptage. Au
// téléphone (inventaire.css), le repère des produits comptés n'est pas rendu :
// la carte le dit déjà. Sans inventaire, la carte n'est pas rendue.
// Nombres, dates et noms dans leurs propres nœuds : la phrase autour reste une
// entrée du glossaire. Crochets du banc : data-inventaire-reperes,
// data-repere, data-inventaire-carte, data-inventaire-zone.
// ─────────────────────────────────────────────────────────────────────────────

const N = ({ children }) => <span data-no-translate="">{children}</span>;

export default function ReperesInventaire({ dernier, perimetreActif, perimetres, pilesParPerimetre }) {
  const lignes = dernier?.lignes || [];
  const comptes = lignes.filter(estCompte).length;
  const valide = (pilesParPerimetre.get(perimetreActif) || []).find(i => i.statut === 'validé');
  return (
    <div className="inv-reperes" data-inventaire-reperes="">
      {dernier ? (
        <CarteRepere
          data-repere="comptes"
          Icone={ClipboardList}
          valeur={comptes}
          libelle={<>{comptes > 1 ? 'produits comptés sur' : 'produit compté sur'} <N>{lignes.length}</N></>}
          detail={dernier.statut === 'validé'
            ? <>inventaire du <N>{dateCH(dernier.date)}</N>, validé</>
            : <>inventaire du <N>{dateCH(dernier.date)}</N>, en cours</>}
        />
      ) : (
        <CarteRepere data-repere="comptes" Icone={ClipboardList} texte="Aucun inventaire" />
      )}
      {valide ? (
        <CarteRepere data-repere="valide" Icone={CalendarCheck} texte={<>Dernier inventaire validé le <N>{dateCH(valide.date)}</N></>} />
      ) : (
        <CarteRepere data-repere="valide" Icone={CalendarCheck} texte="Aucun inventaire validé" />
      )}
      <CarteRepere
        data-repere="perimetres"
        Icone={Layers}
        valeur={perimetres.length}
        libelle={perimetres.length > 1 ? 'périmètres' : 'périmètre'}
        detail={<N>{perimetres.join(', ')}</N>}
      />
    </div>
  );
}

const cs = carteAvantStyles('nuit');

export function CarteInventaire({ dernier, perimetreActif }) {
  if (!dernier) return null;
  const lignes = dernier.lignes || [];
  const valide = dernier.statut === 'validé';
  const comptes = lignes.filter(estCompte).length;
  const zones = avancementZones(lignes);
  return (
    <CarteAvant
      ton="nuit"
      className="inv-carte-nuit"
      data-inventaire-carte=""
      titre={<span style={{ ...st.surtitre, color: valide ? 'var(--carte-nuit-succes)' : 'var(--carte-nuit-info)' }}>{valide ? 'Validé' : 'En cours'}</span>}
    >
      <div style={{ minWidth: 0 }}>
        <div style={st.titre}>Inventaire du <N>{dateCH(dernier.date)}</N></div>
        <div style={{ ...cs.libelle, ...st.ligne }}>
          <N>{comptes}</N> {comptes > 1 ? 'produits comptés sur' : 'produit compté sur'} <N>{lignes.length}</N>
        </div>
      </div>
      <div className={zones.length > 1 ? 'inv-zones' : 'inv-zones inv-zones--une'}>
        {zones.map(z => {
          const fini = z.total > 0 && z.comptes === z.total;
          const encre = fini ? 'var(--carte-nuit-succes)' : 'var(--carte-nuit-info)';
          return (
            <div key={z.zone || '__tout__'} data-inventaire-zone={z.zone} style={{ ...cs.tuile, ...st.tuile }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ ...cs.chiffre, ...st.tuileChiffre }} data-no-translate="">{z.comptes}/{z.total}</span>
                {z.zone
                  ? <span style={{ ...cs.libelle, ...st.tuileNom }}>{z.zone}</span>
                  : <span style={{ ...cs.libelle, ...st.tuileNom }} data-no-translate="">{perimetreActif}</span>}
                <span style={{ ...st.tuileEtat, color: encre }}>{fini ? 'compté' : 'à compter'}</span>
              </span>
              <Anneau part={z.total ? z.comptes / z.total : 0} couleur={encre} piste="var(--carte-nuit)" />
            </div>
          );
        })}
      </div>
    </CarteAvant>
  );
}

const st = {
  surtitre: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)' },
  titre: { fontFamily: 'var(--font)', fontSize: 'var(--t4)', fontWeight: 'var(--g3)', lineHeight: 1.2, color: 'var(--carte-nuit-texte)' },
  ligne: { display: 'block', marginTop: 6, fontSize: 'var(--t2)' },
  tuile: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  tuileChiffre: { display: 'block', fontSize: 'var(--t5)' },
  tuileNom: { display: 'block', marginTop: 4, fontSize: 'var(--t2)', color: 'var(--carte-nuit-texte)', overflowWrap: 'anywhere' },
  tuileEtat: { display: 'block', marginTop: 2, fontSize: 'var(--t1)', fontWeight: 'var(--g3)' },
};
