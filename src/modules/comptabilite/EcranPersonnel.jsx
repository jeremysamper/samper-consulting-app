import React from 'react';
import EcranTache from '../../components/parcours/EcranTache.jsx';
import { BoutonActions } from '../../components/ui/Fenetres.jsx';
import { userDisplayName } from '../../utils/userDisplay.js';
import EtatAbsent from './EtatAbsent.jsx';
import FenetreSalaire from './FenetreSalaire.jsx';
import { ajouterJours } from './periodesCompta.js';
import { Chf, pluriel, st as ui } from './comptaUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Personnel (consultant et patron) : le coût estimé de chaque personne sur la
// période, d'où il vient (salaire mensuel, salaire horaire, coût moyen de la
// maison) et ce qui manque (heures non chiffrées, prévues non pointées, après
// minuit). Un « Gérer » par personne ouvre la fenêtre de son salaire. Jamais
// une fiche de salaire : le pied de l'écran le dit.
// ─────────────────────────────────────────────────────────────────────────────

const PIED = 'Estimation pour piloter : la fiche de salaire, l\'AVS, la LPP et l\'impôt à la source restent chez votre fiduciaire.';

const heuresTexte = (h) => (Math.round(h * 10) / 10).toLocaleString('fr-CH', { maximumFractionDigits: 1 });

function Heures({ h }) {
  return <><span style={{ fontFamily: 'var(--font-num)' }}>{heuresTexte(h)}</span> <span>h</span></>;
}

function Source({ l, coutMoyen }) {
  const s = l.salaire;
  if (l.source === 'mensuel') {
    return <><span>salaire mensuel</span> <Chf v={s.montant} />{s.treizieme !== false && <>, <span>13e salaire</span></>}</>;
  }
  if (l.source === 'horaire') return <><Chf v={s.montant} /> <span>de l'heure</span></>;
  if (l.source === 'moyen') return <><span>coût moyen</span> <Chf v={coutMoyen} /> <span>de l'heure</span></>;
  return <span>sans salaire ni coût moyen</span>;
}

export default function EcranPersonnel({ etabId, libelle, periode, aujourdhui, personnel, etat, salaires, onRetour, onChange }) {
  const [fenetre, setFenetre] = React.useState(null); // { mode, personne, salaire }
  const fermer = React.useCallback(() => setFenetre(null), []);

  const lignes = React.useMemo(() => (personnel?.lignes || [])
    .map(l => ({ ...l, nom: userDisplayName(l.userId) }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')), [personnel]);

  const etatEcran = etat !== 'ready' || !personnel ? null
    : (
      <>
        <span>{libelle}</span> : <Chf v={personnel.total} /> <span>estimés, charges sociales de</span>{' '}
        <span>{personnel.chargesPct}</span> <span>% comprises</span>
      </>
    );

  // Début proposé d'un nouveau salaire : la période affichée, ou le lendemain
  // du dernier salaire arrêté.
  const ouvrir = (mode, l) => {
    const dernier = l.salaire;
    let debutPropose = periode.debut;
    if (mode === 'nouveau' && dernier?.fin) debutPropose = ajouterJours(dernier.fin, 1);
    if (mode === 'changer') {
      const premierDuMois = `${aujourdhui.slice(0, 7)}-01`;
      debutPropose = premierDuMois > dernier.debut ? premierDuMois : aujourdhui;
    }
    setFenetre({ mode, personne: { userId: l.userId, nom: l.nom }, salaire: dernier || null, debutPropose });
  };

  // Le salaire le plus récent de la personne, même hors de la période.
  const dernierSalaire = (userId) => (salaires || [])
    .filter(s => s.profileId === userId)
    .sort((a, b) => b.debut.localeCompare(a.debut))[0] || null;

  return (
    <EcranTache titre="Personnel" etat={etatEcran} onRetour={onRetour}>
      <div style={ui.page}>
        {etat === 'absente' ? <EtatAbsent />
          : etat === 'loading' ? <p style={ui.remarque}>Chargement…</p>
            : etat === 'error' || !personnel ? <p style={{ ...ui.remarque, color: 'var(--danger-text)' }}>Lecture du personnel impossible pour l'instant. Nouvel essai en cours.</p>
              : (
                <>
                  {!lignes.length && <p style={ui.remarque}>Aucune personne avec un contrat, un salaire ou un horaire sur la période.</p>}
                  <div data-personnel="">
                    {lignes.map((l) => {
                      const salaire = l.salaire || dernierSalaire(l.userId);
                      const items = !salaire
                        ? [{ titre: 'Saisir le salaire', detail: 'Salaire mensuel ou horaire, brut.', onClick: () => ouvrir('nouveau', l) }]
                        : [
                          { titre: 'Modifier le salaire', detail: 'Montant, 13e salaire, dates.', onClick: () => ouvrir('modifier', { ...l, salaire }) },
                          salaire.fin
                            ? { titre: 'Saisir un nouveau salaire', detail: 'Après la fin du salaire précédent.', onClick: () => ouvrir('nouveau', { ...l, salaire }) }
                            : { titre: 'Nouveau salaire dès une date', detail: 'L\'ancien reste pour les mois passés.', onClick: () => ouvrir('changer', { ...l, salaire }) },
                        ];
                      const total = l.heures + l.heuresPrevues;
                      return (
                        <div key={l.userId} style={ui.ligne} data-personne={l.userId}>
                          <span style={ui.ligneGauche}>
                            <span style={ui.ligneTitre} data-no-translate>{l.nom}</span>
                            <span style={ui.ligneDetail}>
                              <Source l={l} coutMoyen={personnel.coutMoyen} />, <Heures h={total} />
                              {l.heuresPrevues > 0 && <>, <span>dont</span> <Heures h={l.heuresPrevues} /> <span>prévues non pointées</span></>}
                              {l.heuresNonChiffrees > 0 && <>, <Heures h={l.heuresNonChiffrees} /> <span>non chiffrées</span></>}
                              {l.apresMinuit > 0 && <>, <span>{l.apresMinuit}</span> <span>{pluriel(l.apresMinuit, 'horaire après minuit non compté', 'horaires après minuit non comptés')}</span></>}
                            </span>
                          </span>
                          <span style={st.droite}>
                            <span style={ui.num}>{l.cout == null ? <span style={{ color: 'var(--text2)' }}>non chiffré</span> : <Chf v={l.cout} />}</span>
                            <BoutonActions
                              id={`compta-salaire-${l.userId}`}
                              label="Gérer"
                              style={st.gerer}
                              titre={l.nom}
                              sections={[{ items }]}
                            />
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {personnel.heuresNonChiffrees > 0 && (
                    <p style={{ ...ui.texte, color: 'var(--warning-text)', margin: 0 }} data-non-chiffrees="">
                      <span>Sans salaire ni coût moyen :</span> <Heures h={personnel.heuresNonChiffrees} /> <span>non chiffrées</span>
                    </p>
                  )}
                  <p style={{ ...ui.remarque, margin: 0 }}>
                    Heures pointées, comme le relevé du Planning ; un horaire passé non pointé compte ses heures prévues. Charges sociales et coût horaire moyen : dans les Réglages.
                  </p>
                </>
              )}
        <p style={st.pied} data-pied-personnel="">{PIED}</p>
      </div>

      {fenetre && (
        <FenetreSalaire
          etabId={etabId}
          personne={fenetre.personne}
          mode={fenetre.mode}
          salaire={fenetre.salaire}
          debutPropose={fenetre.debutPropose}
          onClose={fermer}
          onEnregistre={onChange}
        />
      )}
    </EcranTache>
  );
}

const st = {
  droite: { display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto', flexShrink: 0 },
  gerer: {
    minHeight: 44, padding: '8px 14px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', flexShrink: 0,
    background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
  },
  pied: { margin: '4px 0 0', fontSize: 12, color: 'var(--text3)', lineHeight: 1.5, maxWidth: 640 },
};
