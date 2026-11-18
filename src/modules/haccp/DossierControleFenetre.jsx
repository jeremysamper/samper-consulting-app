import React from 'react';
import { Fenetre, st } from '../../components/ui/Fenetres.jsx';
import { notifyLegacy } from '../../legacy/legacyApi.js';
import { userDisplay } from '../../utils/userDisplay.js';
import { zurichClock, zurichToday } from '../../utils/zurichTime.js';
import { messageErreur } from '../../utils/messageErreur.js';
import {
  DUREE_DOSSIER_JOURS, assemblerDossier, erreurPeriode, nomFichierDossier, periodeParDefaut,
} from './dossierControle.js';

// ─────────────────────────────────────────────────────────────────────────────
// « Dossier du contrôle » : la période (les 90 derniers jours par défaut),
// puis un bouton qui télécharge le PDF à remettre à l'inspecteur. Relevés et
// contrôles viennent de l'écran (déjà lus) ; photos de traçabilité, fiches et
// étiquettes maison sont lues au clic, en lecture seule. Assemblage dans
// dossierControle.js, rendu dans dossierControlePdf.js (chargé à la demande,
// avec jsPDF). Ouvert par qui gère le HACCP (canManageModule), garde posée
// par HACCP.jsx.
// ─────────────────────────────────────────────────────────────────────────────

const N = ({ children }) => <span data-no-translate="">{children}</span>;
const dans = (date, p) => date >= p.debut && date <= p.fin;

export default function DossierControleFenetre({ etablissement, etabId, legacySB, zones, releves, tpls, controles, onClose }) {
  const aujourdhui = zurichToday();
  const [periode, setPeriode] = React.useState(() => periodeParDefaut(aujourdhui));
  const [enCours, setEnCours] = React.useState(false);
  const montee = React.useRef(true);
  React.useEffect(() => () => { montee.current = false; }, []);

  const erreur = erreurPeriode(periode.debut, periode.fin, aujourdhui);
  const nbReleves = erreur ? 0 : releves.filter(r => dans(r.date, periode)).length;
  const nbControles = erreur ? 0 : controles.filter(c => dans(c.date, periode)).length;

  const telecharger = async () => {
    if (erreur || enCours) return;
    setEnCours(true);
    try {
      // Lectures du clic : une lecture en échec n'est jamais une liste vide,
      // le dossier le dit dans « À fournir ».
      let tracabilite = [];
      let recettes = [];
      let etiquettesPerso = [];
      const lectures = { tracabilite: !!legacySB, etiquettes: !!legacySB };
      if (legacySB) {
        const [trac, fiches, maison] = await Promise.allSettled([
          legacySB.db.listHaccpTracabilite(etabId),
          legacySB.db.listRecettes(etabId, { strict: true }),
          legacySB.db.listEtiquettesPerso ? legacySB.db.listEtiquettesPerso(etabId, { strict: true }) : [],
        ]);
        if (trac.status === 'fulfilled') tracabilite = trac.value || [];
        else lectures.tracabilite = false;
        if (fiches.status === 'fulfilled' && maison.status === 'fulfilled') {
          recettes = fiches.value || [];
          etiquettesPerso = maison.value || [];
        } else {
          lectures.etiquettes = false;
        }
      }
      const nomEtab = etablissement?.nom || '';
      const dossier = assemblerDossier({
        etablissement: nomEtab,
        debut: periode.debut,
        fin: periode.fin,
        editeLe: zurichToday(),
        heureEdition: zurichClock(),
        zones,
        releves,
        tpls,
        controles,
        tracabilite,
        recettes,
        etiquettesPerso,
        lectures,
        nomPersonne: (v) => (v ? userDisplay(v).name : ''),
      });
      const { exporterDossierControlePdf } = await import('./dossierControlePdf.js');
      await exporterDossierControlePdf(dossier, {
        etablissement,
        filename: nomFichierDossier(nomEtab, periode.debut, periode.fin),
      });
      notifyLegacy('Le dossier du contrôle est téléchargé.', 'success');
      if (montee.current) onClose();
    } catch (err) {
      console.error('[HACCP dossier du contrôle]', err);
      notifyLegacy('Le dossier n\'a pas pu être préparé. ' + messageErreur(err, 'haccp'), 'error');
    } finally {
      if (montee.current) setEnCours(false);
    }
  };

  return (
    <Fenetre
      id="haccp-dossier-controle"
      titre="Dossier du contrôle"
      sousTitre="Le PDF à remettre à l'inspecteur du contrôle des denrées."
      onClose={onClose}
      pied={(
        <>
          <button type="button" style={st.secondaire} onClick={onClose}>Annuler</button>
          <button type="button" style={{ ...st.primaire, opacity: erreur || enCours ? 0.65 : 1 }} disabled={!!erreur || enCours} onClick={telecharger}>
            {enCours ? 'Préparation du dossier…' : 'Télécharger le PDF'}
          </button>
        </>
      )}
    >
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ ...st.section, flex: '1 1 180px', minWidth: 0 }}>
          <span style={st.label}>Du</span>
          <input type="date" style={st.champ} value={periode.debut} max={aujourdhui}
            onChange={e => setPeriode(p => ({ ...p, debut: e.target.value }))} />
        </label>
        <label style={{ ...st.section, flex: '1 1 180px', minWidth: 0 }}>
          <span style={st.label}>Au</span>
          <input type="date" style={st.champ} value={periode.fin} max={aujourdhui}
            onChange={e => setPeriode(p => ({ ...p, fin: e.target.value }))} />
        </label>
      </div>
      {erreur ? (
        <div role="alert" style={{ ...st.remarque, color: 'var(--danger-strong)' }}>{erreur}</div>
      ) : (
        <div style={st.remarque}>
          Par défaut, les <N>{DUREE_DOSSIER_JOURS}</N> derniers jours. Sur cette période : <N>{nbReleves}</N> {nbReleves > 1 ? 'relevés' : 'relevé'} et <N>{nbControles}</N> {nbControles > 1 ? 'contrôles' : 'contrôle'}.
        </div>
      )}
      <div style={st.remarque}>
        Le dossier reprend les relevés, les contrôles, les actions correctives, les problèmes signalés, les photos de traçabilité et les durées de vie des étiquettes. Sa dernière page liste ce que vous devez fournir à côté.
      </div>
    </Fenetre>
  );
}
