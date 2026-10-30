import React from 'react';
import EcranTache from '../../components/parcours/EcranTache.jsx';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import SearchToggle from '../../components/ui/SearchToggle.jsx';
import { dbService } from '../../services/dbService.js';
import { buildProduitIndex } from '../../services/prixResolution.js';
import { chiffrerCarte, chiffrerFiche, lignesNonChiffrees, niveauFoodCost } from '../../utils/chiffrage.js';
import { makeSearchMatcher } from '../../utils/searchText.js';
import BandeauNonActualise from '../previsions/BandeauNonActualise.jsx';
import { useLecture } from './comptaService.js';
import { Chf, pctTexte, pluriel, st as ui } from './comptaUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Marges (D15) : coût matière, prix de vente et marge par plat et par carte,
// puis par fiche. Lecture seule : aucun prix ne s'écrit d'ici (ils restent
// tenus dans le Chiffrage des Outils consultant), aucune écriture vers les
// fiches ni les plats. Même calcul que le Chiffrage par construction
// (chiffrerFiche de src/utils/chiffrage.js).
//
// Fiches, plats, cartes et catalogue ne sont lus qu'à l'ouverture de cet
// écran (D25). Cartes et fiches cachées : visibles du seul consultant, comme
// dans Cartes & Recettes ; une fiche cachée rattachée à un plat compte quand
// même dans son coût.
// ─────────────────────────────────────────────────────────────────────────────

const PHRASE = 'Même calcul que le Chiffrage des Outils consultant : prix du catalogue, sinon prix noté dans la fiche. Prix de vente TVA comprise. La moyenne de la carte compte un plat de chaque, sans les quantités vendues.';
const COULEURS = { succes: 'var(--success-text)', alerte: 'var(--warning-text)', danger: 'var(--danger-text)' };

function FoodCost({ v }) {
  if (v == null) return <span style={{ color: 'var(--text2)' }}>n/a</span>;
  return <span style={{ fontFamily: 'var(--font-num)', color: COULEURS[niveauFoodCost(v)], fontWeight: 500 }}>{pctTexte(v)}</span>;
}

// Une cellule chiffrée : son libellé n'apparaît que sur un conteneur étroit
// (sur un conteneur large, l'en-tête des colonnes le porte).
function Cellule({ lib, children }) {
  return (
    <span className="compta-marge-cell">
      <span className="compta-marge-lib">{lib}</span>{' '}
      {children}
    </span>
  );
}

function EnTete({ colonnes }) {
  return (
    <div className="compta-marge compta-marge-tete" aria-hidden="true">
      <span />
      <span className="compta-marge-chiffres">
        {colonnes.map(c => <span key={c} className="compta-marge-cell">{c}</span>)}
      </span>
    </div>
  );
}

export default function EcranMarges({ etabId, user, onRetour }) {
  const legacySB = dbService.getBridge();
  const consultant = user?.role === 'consultant';
  const [onglet, setOnglet] = React.useState('cartes');
  const [carteId, setCarteId] = React.useState(null);
  const [recherche, setRecherche] = React.useState('');

  const lire = React.useCallback(async () => {
    const [recettes, plats, cartes, produits] = await Promise.all([
      legacySB.db.listRecettes(etabId, { strict: true }),
      legacySB.db.listPlats(etabId, { strict: true }),
      legacySB.db.listCartes(etabId, { strict: true }),
      legacySB.db.listProduits(etabId),
    ]);
    return { recettes: recettes || [], plats: plats || [], cartes: cartes || [], produits: produits || [] };
  }, [etabId]);
  const lecture = useLecture(`marges|${etabId}`, lire, { actif: !!etabId && !!legacySB, tables: ['recettes', 'plats', 'cartes', 'produits'] });
  const d = lecture.data;

  const index = React.useMemo(() => buildProduitIndex(d?.produits || []), [d]);
  const recettesParId = React.useMemo(() => new Map((d?.recettes || []).map(r => [r.id, r])), [d]);
  const cartes = React.useMemo(() => (d?.cartes || []).filter(c => !c.archive && (consultant || !c.masquee)), [d, consultant]);
  const carte = cartes.find(c => c.id === carteId) || cartes[0] || null;
  const calculCarte = React.useMemo(() => {
    if (!carte) return null;
    const plats = (d?.plats || []).filter(p => p.actif !== false && (p.carteIds || []).includes(carte.id));
    return chiffrerCarte(plats, recettesParId, index);
  }, [carte, d, recettesParId, index]);

  const fiches = React.useMemo(() => {
    const correspond = makeSearchMatcher(recherche);
    return (d?.recettes || [])
      .filter(r => r.statut !== 'archivée' && Number(r.prixVente) > 0 && (consultant || r.masquee !== true) && correspond(r.nom))
      .map(r => ({ r, c: chiffrerFiche(r, index), sansPrix: lignesNonChiffrees(r, index).length }));
  }, [d, consultant, index, recherche]);

  const etat = lecture.status !== 'ready' ? null
    : onglet === 'fiches'
      ? <><span>{fiches.length}</span> <span>{pluriel(fiches.length, 'fiche à prix de vente', 'fiches à prix de vente')}</span></>
      : carte && calculCarte?.foodCost != null
        ? (
          <>
            <span data-no-translate>{carte.nom}</span> : <span>food cost</span> <span>{pctTexte(calculCarte.foodCost)}</span>,{' '}
            <span>marge</span> <Chf v={calculCarte.marge} /> <span>pour un plat de chaque</span>
          </>
        )
        : carte ? <span data-no-translate>{carte.nom}</span> : null;

  return (
    <EcranTache titre="Marges" etat={etat} onRetour={onRetour}>
      <div style={ui.page} data-marges="">
        {lecture.enEchec && <BandeauNonActualise onRetry={lecture.reload} />}
        <SegmentedTabs
          tabs={[{ id: 'cartes', label: 'Cartes' }, { id: 'fiches', label: 'Fiches' }]}
          active={onglet}
          onChange={setOnglet}
        />
        {lecture.status === 'loading' || lecture.status === 'inactif' ? <p style={ui.remarque}>Chargement…</p>
          : lecture.status === 'error' ? <p style={{ ...ui.remarque, color: 'var(--danger-text)' }}>Lecture des fiches impossible pour l'instant. Nouvel essai en cours.</p>
            : onglet === 'cartes' ? (
              <OngletCartes cartes={cartes} carte={carte} calcul={calculCarte} onCarte={setCarteId} />
            ) : (
              <section style={ui.section} data-onglet-fiches="">
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <SearchToggle value={recherche} onChange={setRecherche} placeholder="Rechercher une fiche…" />
                </div>
                {!fiches.length && <p style={ui.remarque}>{recherche ? 'Aucune fiche ne correspond.' : 'Aucune fiche avec un prix de vente.'}</p>}
                {fiches.length > 0 && (
                  <div className="compta-marges compta-marges--fiches">
                    <EnTete colonnes={['Coût par portion', 'Food cost', 'Marge par portion']} />
                    {fiches.map(({ r, c, sansPrix }) => (
                      <div key={r.id} className="compta-marge" data-fiche={r.id}>
                        <span className="compta-marge-nom">
                          <span data-no-translate>{r.nom}</span>
                          {sansPrix > 0 && <span style={st.note}><span>{sansPrix}</span> <span>{pluriel(sansPrix, 'ingrédient sans prix', 'ingrédients sans prix')}</span></span>}
                        </span>
                        <span className="compta-marge-chiffres">
                          <Cellule lib="coût par portion"><Chf v={c.coutPortion} /></Cellule>
                          <Cellule lib="food cost"><FoodCost v={c.foodCost} /></Cellule>
                          <Cellule lib="marge par portion"><span style={{ color: c.margeBrute < 0 ? 'var(--danger-text)' : undefined }}><Chf v={c.margeBrute} /></span></Cellule>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
        <p style={{ ...ui.remarque, margin: 0 }}>{PHRASE}</p>
      </div>
    </EcranTache>
  );
}

function OngletCartes({ cartes, carte, calcul, onCarte }) {
  if (!cartes.length) return <p style={ui.remarque}>Aucune carte : rattachez vos plats à une carte dans Cartes & Recettes.</p>;
  return (
    <section style={ui.section} data-onglet-cartes="">
      {cartes.length > 1 && (
        <label style={st.choix}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)' }}>Carte</span>
          <select value={carte?.id || ''} onChange={e => onCarte(e.target.value)} style={st.select} data-no-translate>
            {cartes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </label>
      )}
      {!calcul?.plats.length ? <p style={ui.remarque}>Aucun plat sur cette carte.</p> : (
        <div className="compta-marges">
          <EnTete colonnes={['Prix', 'Coût', 'Food cost', 'Marge']} />
          {calcul.plats.map((l) => (
            <div key={l.plat.id} className="compta-marge" data-plat={l.plat.id}>
              <span className="compta-marge-nom">
                <span data-no-translate>{l.plat.nom}</span>
                {l.cout == null && <span style={st.note}>aucune fiche rattachée</span>}
                {l.cout != null && l.prix == null && <span style={st.note}>prix à saisir dans le Chiffrage</span>}
                {l.sourcePrix === 'fiche' && <span style={st.noteDiscrete}>prix de la fiche</span>}
                {l.nonChiffrees > 0 && <span style={st.note}><span>{l.nonChiffrees}</span> <span>{pluriel(l.nonChiffrees, 'ingrédient sans prix', 'ingrédients sans prix')}</span></span>}
              </span>
              <span className="compta-marge-chiffres">
                <Cellule lib="prix"><Chf v={l.prix} /></Cellule>
                <Cellule lib="coût"><Chf v={l.cout} /></Cellule>
                <Cellule lib="food cost"><FoodCost v={l.foodCost} /></Cellule>
                <Cellule lib="marge"><span style={{ color: l.marge != null && l.marge < 0 ? 'var(--danger-text)' : undefined }}><Chf v={l.marge} /></span></Cellule>
              </span>
            </div>
          ))}
          <div className="compta-marge compta-marge--total" data-total-carte="">
            <span className="compta-marge-nom"><span>Un plat de chaque</span></span>
            <span className="compta-marge-chiffres">
              <Cellule lib="prix"><Chf v={calcul.prix} /></Cellule>
              <Cellule lib="coût"><Chf v={calcul.cout} /></Cellule>
              <Cellule lib="food cost"><FoodCost v={calcul.foodCost} /></Cellule>
              <Cellule lib="marge"><Chf v={calcul.marge} /></Cellule>
            </span>
          </div>
          {(calcul.sansPrix > 0 || calcul.sansFiche > 0) && (
            <p style={{ ...ui.remarque, margin: '8px 0 0' }}>
              <span>Pas comptés dans le total :</span>{' '}
              {calcul.sansPrix > 0 && <><span>{calcul.sansPrix}</span> <span>{pluriel(calcul.sansPrix, 'plat sans prix', 'plats sans prix')}</span></>}
              {calcul.sansPrix > 0 && calcul.sansFiche > 0 && ', '}
              {calcul.sansFiche > 0 && <><span>{calcul.sansFiche}</span> <span>{pluriel(calcul.sansFiche, 'plat sans fiche', 'plats sans fiche')}</span></>}.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

const st = {
  note: { display: 'block', fontSize: 12, color: 'var(--warning-text)', lineHeight: 1.4 },
  noteDiscrete: { display: 'block', fontSize: 12, color: 'var(--text2)', lineHeight: 1.4 },
  choix: { display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 360 },
  select: {
    minHeight: 44, padding: '8px 12px', borderRadius: 8, borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
    background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 14,
  },
};
