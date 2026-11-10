import React from 'react';
import { Btn } from '../../components/ui/index.jsx';
import { Fenetre, Options, st as fs } from '../../components/ui/Fenetres.jsx';
import { notify } from '../../components/toast/index.js';
import { messageErreur } from '../../utils/messageErreur.js';
import { estFacture } from '../inventaire/facturesLogic.js';
import { dansIntervalle, lignesFiduciaire, nomFichierExport } from '../inventaire/exportFiduciaire.js';
import { zipPiecesFiduciaire } from '../inventaire/achatsPieces.jsx';
import { telechargerFichier } from '../inventaire/exportXlsxInventaire.js';
import { isModuleActiveForEtab } from '../moduleConfig.js';
import * as caisseService from '../../services/caisseService.js';
import { fusionnerReglages } from '../caisse/reglages.js';
import { etatDe, useCompta } from './useCompta.js';
import { feuillesCompta, nomFichierCompta, xlsxCompta, zipCsvCompta } from './exportCompta.js';
import { ajouterJours, libellePeriode, periodeMois } from './periodesCompta.js';
import { pluriel } from './comptaUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// « Exporter pour la fiduciaire » (droit « Régler les factures ») : une
// période (celle affichée, le mois précédent, le décompte de TVA, ou deux
// dates), puis trois sorties : classeur Excel de cinq feuilles, les mêmes
// feuilles en CSV dans un zip, et le dossier des pièces des factures d'achat
// (zipPiecesFiduciaire de Factures & achats). Les salaires par personne ne
// sortent jamais : le Résumé porte le coût du personnel total.
//
// Caisse v8 : pour la direction d'une maison qui a la caisse, une quatrième
// sortie, « Caisse (zip) », le dossier fiduciaire de la caisse pour la même
// période (journal des ventes par jour et par taux, encaissements, clôtures,
// tickets, annulations, contrôle d'intégrité ; jours clôturés seulement). Les
// trois sorties d'avant ne changent pas.
//
// La période affichée reprend les chiffres déjà lus par l'accueil ; une autre
// période est lue à l'ouverture de la fenêtre par le même useCompta, pour que
// le classeur dise exactement ce que l'écran dirait de cette période.
// ─────────────────────────────────────────────────────────────────────────────

const DATE_VALIDE = /^20\d{2}-\d{2}-\d{2}$/;
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const pretOuAbsent = (s) => (s === 'absente' || s === 'inactif' ? 'ready' : s);

export default function FenetreExportCompta({
  etablissement, direction, periode, data, tvaPeriode, choixInitial = 'periode', aujourdhui, inventaires, onClose,
}) {
  const etabId = etablissement?.id || null;
  const moisPrec = React.useMemo(() => periodeMois(ajouterJours(`${aujourdhui.slice(0, 7)}-01`, -1)), [aujourdhui]);
  const [choix, setChoix] = React.useState(choixInitial);
  const [debut, setDebut] = React.useState(periode.debut);
  const [fin, setFin] = React.useState(periode.fin);
  const [zip, setZip] = React.useState(null); // { n, total } pendant le dossier des pièces
  const abortRef = React.useRef(null);
  const avecCaisse = direction && isModuleActiveForEtab(etablissement, 'caisse');
  const [dossierEnCours, setDossierEnCours] = React.useState(false);
  React.useEffect(() => () => abortRef.current?.abort(), []);

  const type = tvaPeriode?.type === 'semestre' ? 'semestre' : 'trimestre';
  const cible = React.useMemo(() => {
    if (choix === 'periode') return periode;
    if (choix === 'mois_prec') return moisPrec;
    if (choix === 'tva' && tvaPeriode) return { type: 'tva', debut: tvaPeriode.debut, fin: tvaPeriode.fin };
    return { type: 'dates', debut, fin };
  }, [choix, periode, moisPrec, tvaPeriode, debut, fin]);
  const valide = DATE_VALIDE.test(cible.debut) && DATE_VALIDE.test(cible.fin) && cible.debut <= cible.fin;
  const affichee = valide && cible.debut === periode.debut && cible.fin === periode.fin;

  // Une autre période que celle affichée : lue ici, avec les mêmes calculs.
  const autre = useCompta({
    etablissement, periode: valide ? cible : periode, precedente: null, aujourdhui, inventaires, direction, actif: valide && !affichee,
  });
  const source = affichee ? data : autre;
  const pret = valide && etatDe(
    source.etats.ventes, source.etats.achats, pretOuAbsent(source.etats.charges), direction ? pretOuAbsent(source.etats.personnel) : 'ready',
  ) === 'ready';
  const enErreur = valide && [source.etats.ventes, source.etats.achats].includes('error');

  const lignesAchats = React.useMemo(
    () => (pret ? lignesFiduciaire(source.docs, { debut: cible.debut, fin: cible.fin }) : []),
    [pret, source.docs, cible.debut, cible.fin],
  );
  const joursVentes = pret ? source.parJour.filter(j => j.source || j.avecNotes).length : 0;
  const nbAVerifier = lignesAchats.filter(l => l.aVerifier).length;
  const nbCharges = source.synthese?.chargesDetail?.lignes.length ?? null;

  const feuilles = () => feuillesCompta({
    periode: cible, synthese: source.synthese, parJour: source.parJour, lignesAchats, etatTva: source.tvaPeriode, direction,
  });
  const exporterExcel = () => {
    telechargerFichier(xlsxCompta(feuilles()), nomFichierCompta(cible.debut, cible.fin, 'xlsx'), MIME_XLSX);
    notify('Classeur Excel téléchargé.', 'success');
  };
  const exporterCsv = () => {
    telechargerFichier(zipCsvCompta(feuilles()), nomFichierCompta(cible.debut, cible.fin, 'csv'), 'application/zip');
    notify('Fichiers CSV téléchargés.', 'success');
  };
  const exporterPieces = async () => {
    const factures = (source.docs || []).filter(d => estFacture(d) && !d.exclu && dansIntervalle(d.dateDocument, cible));
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setZip({ n: 0, total: factures.length });
    try {
      const { octets, erreurs } = await zipPiecesFiduciaire(factures, {
        etabId, signal: ctrl.signal, onProgress: (n, total) => setZip({ n, total }),
      });
      telechargerFichier(octets, nomFichierExport(cible.debut, cible.fin, 'zip'), 'application/zip');
      notify(erreurs.length
        ? 'Dossier des pièces téléchargé ; des pièces manquent, voir erreurs.txt dans le dossier.'
        : 'Dossier des pièces téléchargé.', erreurs.length ? 'warning' : 'success');
    } catch (err) {
      if (err?.name !== 'AbortError') notify('Dossier des pièces non constitué. ' + messageErreur(err, 'pièces des achats'), 'error');
    } finally {
      abortRef.current = null;
      setZip(null);
    }
  };

  // Dossier de la caisse : lu et construit à la demande (module chargé au tap).
  const exporterCaisse = async () => {
    if (dossierEnCours) return;
    setDossierEnCours(true);
    try {
      const [{ telechargerDossier }, lus] = await Promise.all([
        import('../caisse/rapports/lectureRapport.js'),
        caisseService.getReglages(etabId),
      ]);
      const { data, error } = await telechargerDossier({
        etablissement, reglages: fusionnerReglages(lus.error ? {} : lus.data), debut: cible.debut, fin: cible.fin,
      });
      if (error) { notify(error, 'error'); return; }
      notify(data.rapport.provisoire
        ? 'Dossier de caisse téléchargé ; des jours non clôturés sont restés dehors, voir lisez-moi.txt.'
        : 'Dossier de caisse téléchargé.', data.rapport.provisoire ? 'warning' : 'success');
    } catch (err) {
      notify('Dossier de caisse non constitué. ' + messageErreur(err, 'dossier de caisse'), 'error');
    } finally {
      setDossierEnCours(false);
    }
  };

  const options = [
    { v: 'periode', label: 'La période affichée', detail: libellePeriode(periode) },
    { v: 'mois_prec', label: 'Le mois précédent', detail: libellePeriode(moisPrec) },
    tvaPeriode && {
      v: 'tva',
      label: tvaPeriode.enCours ? `Le ${type} de TVA en cours` : `Le ${type} de TVA à déclarer`,
      detail: tvaPeriode.libelle,
    },
    { v: 'dates', label: 'Deux dates', detail: 'Du premier au dernier jour, inclus.' },
  ];
  const actif = pret && !zip;

  return (
    <Fenetre
      id="compta-export"
      titre="Exporter pour la fiduciaire"
      sousTitre="Ventes, factures d'achat, charges fixes et état TVA."
      onClose={onClose}
      largeur={520}
      pied={zip ? (
        <>
          <span style={st.progression}><span>Pièces en cours :</span> <span data-no-translate>{zip.n} / {zip.total}</span></span>
          <Btn onClick={() => abortRef.current?.abort()} style={st.bouton}>Annuler</Btn>
        </>
      ) : (
        <>
          {avecCaisse && <Btn onClick={exporterCaisse} disabled={!valide || dossierEnCours} style={st.bouton}>{dossierEnCours ? 'Caisse en cours…' : 'Caisse (zip)'}</Btn>}
          <Btn onClick={exporterPieces} disabled={!actif || !lignesAchats.length} style={st.bouton}>Pièces (zip)</Btn>
          <Btn onClick={exporterCsv} disabled={!actif} style={st.bouton}>CSV (zip)</Btn>
          <Btn variant="primary" onClick={exporterExcel} disabled={!actif} style={st.bouton}>Excel</Btn>
        </>
      )}
    >
      <Options nom="Période" valeur={choix} onChange={setChoix} options={options} />
      {choix === 'dates' && (
        <div style={st.dates}>
          <label style={st.champ}>
            <span style={fs.label}>Début</span>
            <input type="date" value={debut} min="2000-01-01" max="2099-12-31" onChange={e => setDebut(e.target.value)} style={fs.champ} />
          </label>
          <label style={st.champ}>
            <span style={fs.label}>Fin</span>
            <input type="date" value={fin} min="2000-01-01" max="2099-12-31" onChange={e => setFin(e.target.value)} style={fs.champ} />
          </label>
        </div>
      )}
      <div style={fs.apercu} data-apercu-export="">
        {!valide ? 'Choisissez deux dates, la première avant la seconde.'
          : enErreur ? <span style={{ color: 'var(--danger-text)' }}>Lecture impossible pour l'instant. Nouvel essai en cours.</span>
            : !pret ? 'Chargement…'
              : (
                <>
                  <span>{joursVentes}</span> <span>{pluriel(joursVentes, 'jour de ventes,', 'jours de ventes,')}</span>{' '}
                  <span>{lignesAchats.length}</span> <span>{pluriel(lignesAchats.length, 'facture d\'achat', 'factures d\'achat')}</span>
                  {' '}(<span>{nbAVerifier}</span> <span>à vérifier</span>),{' '}
                  {nbCharges == null
                    ? <span>charges fixes pas encore activées.</span>
                    : <><span>{nbCharges}</span> <span>{pluriel(nbCharges, 'charge fixe.', 'charges fixes.')}</span></>}
                </>
              )}
      </div>
      <p style={fs.remarque}>
        {direction
          ? 'Le coût du personnel n\'y figure qu\'en total : aucun salaire par personne ne sort de l\'app.'
          : 'Le coût du personnel est réservé à la direction : il ne figure pas dans l\'export.'}
      </p>
    </Fenetre>
  );
}

const st = {
  dates: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))', gap: 10 },
  champ: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  progression: { fontSize: 13, color: 'var(--text2)', marginRight: 'auto' },
  bouton: { minHeight: 44 },
};
