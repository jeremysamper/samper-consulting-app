import React from 'react';
import { notifyLegacy } from '../../legacy/legacyApi.js';
import { Btn } from '../../components/ui/index.jsx';
import { Fenetre, Options, st as stF } from '../../components/ui/Fenetres.jsx';
import { messageErreur } from '../../utils/messageErreur.js';
import {
  csvFiduciaire, dansIntervalle, intervalleMois, lignesFiduciaire, nomFichierExport, titreExport, xlsxFiduciaire,
} from './exportFiduciaire.js';
import { estFacture, intervalleLong, lendemainIso } from './facturesLogic.js';
import { tvaAVerifier } from './tvaAchats.js';
import { zipPiecesFiduciaire } from './achatsPieces.jsx';
import { telechargerFichier } from './exportXlsxInventaire.js';

// ─────────────────────────────────────────────────────────────────────────────
// « Export fiduciaire » (onglet Factures, droit de régler les factures) : une
// période (mois en cours, mois précédent, une période d'inventaire close du
// périmètre affiché, ou deux dates), puis trois sorties : CSV et Excel (une
// ligne par facture d'achat de tous les périmètres, TVA par taux, ligne de
// totaux) et le dossier zip des pièces. Le compte des factures « à vérifier »
// (HT, TTC ou taux manquant ou incohérent) renvoie au filtre de la liste.
//
// Fenêtre de Fenetres.jsx : centrée sur ordinateur, feuille du bas au
// téléphone, refermable par ×, Échap, un tap à côté ou le geste retour.
// ─────────────────────────────────────────────────────────────────────────────

const DATE_VALIDE = /^20\d{2}-\d{2}-\d{2}$/;
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export default function FenetreExportFiduciaire({
  docs, periodes, avecPieces, etabId, aujourdhui, onFiltrerAVerifier, onClose,
}) {
  const moisCourant = intervalleMois(aujourdhui, 0);
  const moisPrecedent = intervalleMois(aujourdhui, -1);
  const [choix, setChoix] = React.useState('mois');
  const [debut, setDebut] = React.useState(moisCourant.debut);
  const [fin, setFin] = React.useState(moisCourant.fin);
  // { n, total } pendant la constitution du dossier des pièces.
  const [zip, setZip] = React.useState(null);
  const abortRef = React.useRef(null);
  React.useEffect(() => () => abortRef.current?.abort(), []);

  // Périodes d'inventaire closes du périmètre affiché, les trois plus récentes.
  const periodesCloses = (periodes || [])
    .filter(p => !p.ouverte && !p.anterieures && p.debut && p.fin)
    .slice(0, 3)
    .map(p => ({ id: p.id, debut: p.debutInclus ? p.debut : lendemainIso(p.debut), fin: p.fin }));
  const options = [
    { v: 'mois', label: 'Mois en cours', detail: intervalleLong(moisCourant.debut, moisCourant.fin) },
    { v: 'mois_prec', label: 'Mois précédent', detail: intervalleLong(moisPrecedent.debut, moisPrecedent.fin) },
    ...periodesCloses.map(p => ({ v: `periode:${p.id}`, label: 'Période d’inventaire', detail: intervalleLong(p.debut, p.fin) })),
    { v: 'dates', label: 'Deux dates', detail: 'Du premier au dernier jour, inclus.' },
  ];
  const changerChoix = (v) => {
    setChoix(v);
    const borne = v === 'mois' ? moisCourant
      : v === 'mois_prec' ? moisPrecedent
        : v.startsWith('periode:') ? periodesCloses.find(p => `periode:${p.id}` === v)
          : null;
    if (borne) { setDebut(borne.debut); setFin(borne.fin); }
  };

  const valide = DATE_VALIDE.test(debut) && DATE_VALIDE.test(fin) && debut <= fin;
  const factures = valide
    ? (docs || []).filter(d => estFacture(d) && !d.exclu && dansIntervalle(d.dateDocument, { debut, fin }))
    : [];
  const nbAVerifier = factures.filter(tvaAVerifier).length;
  const pieces = new Map(factures.filter(f => avecPieces?.has(f.id)).map(f => [f.id, 1]));
  const lignes = () => lignesFiduciaire(factures, { debut, fin, pieces });
  const pret = valide && factures.length > 0 && !zip;

  const exporterCsv = () => {
    telechargerFichier(csvFiduciaire(lignes()), nomFichierExport(debut, fin, 'csv'), 'text/csv;charset=utf-8');
    notifyLegacy('Fichier CSV téléchargé.', 'success');
  };
  const exporterExcel = () => {
    telechargerFichier(xlsxFiduciaire(lignes(), titreExport(debut, fin)), nomFichierExport(debut, fin, 'xlsx'), MIME_XLSX);
    notifyLegacy('Classeur Excel téléchargé.', 'success');
  };
  const exporterPieces = async () => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setZip({ n: 0, total: factures.length });
    try {
      const { octets, erreurs } = await zipPiecesFiduciaire(factures, {
        etabId, signal: ctrl.signal, onProgress: (n, total) => setZip({ n, total }),
      });
      telechargerFichier(octets, nomFichierExport(debut, fin, 'zip'), 'application/zip');
      notifyLegacy(erreurs.length
        ? 'Dossier des pièces téléchargé ; des pièces manquent, voir erreurs.txt dans le dossier.'
        : 'Dossier des pièces téléchargé.', erreurs.length ? 'warning' : 'success');
    } catch (err) {
      if (err?.name !== 'AbortError') notifyLegacy('Dossier des pièces non constitué. ' + messageErreur(err, 'pièces des achats'), 'error');
    } finally {
      abortRef.current = null;
      setZip(null);
    }
  };

  return (
    <Fenetre
      id="factures-export"
      titre="Export fiduciaire"
      sousTitre="Factures d’achat de tous les périmètres, une ligne par facture, TVA par taux."
      onClose={onClose}
      largeur={520}
      pied={zip ? (
        <>
          <span style={st.progression}>Pièces en cours : <span data-no-translate>{zip.n} / {zip.total}</span></span>
          <Btn variant="ghost" onClick={() => abortRef.current?.abort()}>Annuler</Btn>
        </>
      ) : (
        <>
          <Btn variant="ghost" onClick={exporterPieces} disabled={!pret}>Pièces (zip)</Btn>
          <Btn variant="ghost" onClick={exporterExcel} disabled={!pret}>Excel</Btn>
          <Btn variant="primary" onClick={exporterCsv} disabled={!pret}>CSV</Btn>
        </>
      )}
    >
      <Options nom="Période" valeur={choix} onChange={changerChoix} options={options} />
      {choix === 'dates' && (
        <div style={st.dates}>
          <label style={st.champ}>
            <span style={stF.label}>Début</span>
            <input type="date" value={debut} min="2000-01-01" max="2099-12-31" onChange={e => setDebut(e.target.value)} style={stF.champ} />
          </label>
          <label style={st.champ}>
            <span style={stF.label}>Fin</span>
            <input type="date" value={fin} min="2000-01-01" max="2099-12-31" onChange={e => setFin(e.target.value)} style={stF.champ} />
          </label>
        </div>
      )}
      <div style={stF.apercu}>
        {!valide ? 'Choisissez deux dates, la première avant la seconde.'
          : factures.length === 0 ? 'Aucune facture d’achat sur cette période.'
            : (
              <>
                <span>{factures.length}</span> {factures.length > 1 ? 'factures d’achat' : 'facture d’achat'}, {intervalleLong(debut, fin)}.
                {nbAVerifier > 0 && (
                  <>
                    {' '}
                    <button type="button" style={st.lien} onClick={() => { onFiltrerAVerifier(); onClose(); }}>
                      <span>{nbAVerifier}</span> à vérifier
                    </button>
                    {' '}
                    <span style={stF.remarque}>(HT, TTC ou taux de TVA manquant ou incohérent)</span>
                  </>
                )}
              </>
            )}
      </div>
    </Fenetre>
  );
}

const st = {
  dates: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))', gap: 10 },
  champ: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  lien: { background: 'none', border: 'none', padding: 0, color: 'var(--accent)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)', textDecoration: 'underline', minHeight: 44 },
  progression: { fontSize: 13, color: 'var(--text2)', marginRight: 'auto' },
};
