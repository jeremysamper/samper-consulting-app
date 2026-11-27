import { useEffect, useState } from 'react';
import { Btn } from './ui/index.jsx';
import { Fenetre } from './ui/Fenetres.jsx';
import { ADRESSE_JOUANET, compterBrouillons, estAncienneAdresse, resumerAttente } from '../utils/demenagement.js';
import { PREFIXE_BROUILLON } from '../utils/brouillonRecette.js';
import { punchQueue } from '../services/offline/punchQueue.js';
import { inventaireQueue } from '../services/offline/inventaireQueue.js';
import { haccpReleveQueue } from '../services/offline/haccpReleveQueue.js';
import { etagesQueue } from '../services/offline/etagesQueue.js';
import { caisseQueue } from '../services/offline/caisseQueue.js';
import { fileDeLaBorne } from '../modules/planning/borne/borneService.js';

/**
 * DemenagementJouanet
 *
 * Sur l'ancienne adresse seulement (samperconsulting-app.com), un bandeau
 * propose de passer l'appareil sur jouanet.com. La fenêtre compte ce qui
 * attend encore le réseau sur cet appareil, lu dans les files elles-mêmes, et
 * n'allume « Ouvrir Jouanet » qu'une fois tout parti : ces files restent liées
 * à l'ancienne adresse et ne se liraient plus depuis jouanet.com.
 * Étape 4 du plan de bascule du 27.11.2026. Ailleurs, le composant ne rend rien.
 */
const ANCIENNE_ADRESSE = typeof window !== 'undefined' && estAncienneAdresse(window.location);

const lireFile = async (file) => {
  try { return await file.count(); } catch { return null; }
};

async function compterEnAttente() {
  const [pointages, inventaire, haccp, etages, ventes] = await Promise.all(
    [punchQueue, inventaireQueue, haccpReleveQueue, etagesQueue, caisseQueue].map(lireFile)
  );
  let borne = null;
  try { borne = fileDeLaBorne().length; } catch { borne = null; }
  let brouillons = null;
  try { brouillons = compterBrouillons(window.localStorage, PREFIXE_BROUILLON); } catch { brouillons = null; }
  return { pointages, borne, inventaire, haccp, etages, ventes, brouillons };
}

export default function DemenagementJouanet() {
  const [ouvert, setOuvert] = useState(false);
  if (!ANCIENNE_ADRESSE) return null;
  return (
    <>
      <div role="status" style={s.bande}>
        <span style={s.texte}>
          L&apos;app s&apos;appelle maintenant <span data-no-translate="">Jouanet</span> et change d&apos;adresse.
        </span>
        <button type="button" onClick={() => setOuvert(true)} style={s.bouton}>
          Passer sur <span data-no-translate="">Jouanet</span>
        </button>
      </div>
      {ouvert && <FenetreDemenagement onClose={() => setOuvert(false)} />}
    </>
  );
}

function FenetreDemenagement({ onClose }) {
  const [comptes, setComptes] = useState(null);

  // Relu toutes les trois secondes : les files se vident seules dès que le
  // réseau revient, et le bouton s'allume sans rien toucher.
  useEffect(() => {
    let vivant = true;
    const relire = () => compterEnAttente().then((c) => { if (vivant) setComptes(c); });
    relire();
    const minuteur = setInterval(relire, 3000);
    return () => { vivant = false; clearInterval(minuteur); };
  }, []);

  const resume = comptes ? resumerAttente(comptes) : null;
  const pret = Boolean(resume?.pret);

  const ouvrirJouanet = () => {
    // Un nouvel onglet : sur l'iPad, l'app installée l'ouvre dans Safari, où
    // l'on peut ajouter jouanet.com à l'écran d'accueil.
    window.open(ADRESSE_JOUANET, '_blank', 'noopener');
  };

  const pied = (
    <div style={s.pied}>
      <Btn variant="ghost" onClick={onClose}>Plus tard</Btn>
      <Btn variant="primary" onClick={ouvrirJouanet} disabled={!pret}>
        Ouvrir <span data-no-translate="">Jouanet</span>
      </Btn>
    </div>
  );

  return (
    <Fenetre id="demenagement-jouanet" titre="Passer sur Jouanet" onClose={onClose} largeur={520} pied={pied}>
      <p style={s.paragraphe}>
        L&apos;app a une nouvelle adresse : <span data-no-translate="">jouanet.com</span>. Sur cet appareil, elle ouvre
        encore l&apos;ancienne. Faites le passage en dehors du service.
      </p>

      <div style={{ ...s.etat, background: pret ? 'var(--success-bg-soft, var(--success-bg))' : 'var(--piste)' }}>
        {!resume && <span>Lecture de ce qui attend l&apos;envoi sur cet appareil.</span>}
        {resume?.illisible && (
          <span>Impossible de lire ce qui attend l&apos;envoi sur cet appareil. Rechargez l&apos;app, puis rouvrez cette fenêtre.</span>
        )}
        {resume && !resume.illisible && resume.enAttente.length > 0 && (
          <span>
            Encore en attente sur cet appareil : {resume.enAttente.join(', ')}. Gardez l&apos;appareil connecté au réseau :
            l&apos;envoi se fait tout seul, et le bouton s&apos;allume quand tout est parti.
          </span>
        )}
        {pret && <span>Rien n&apos;attend l&apos;envoi sur cet appareil. Vous pouvez passer.</span>}
      </div>

      {resume?.brouillons && (
        <p style={s.avertissement}>
          Attention : {resume.brouillons} sur cet appareil. Ouvrez-la et enregistrez-la avant de passer, sinon elle sera perdue.
        </p>
      )}

      <ol style={s.etapes}>
        <li>Touchez « Ouvrir Jouanet ». La nouvelle adresse s&apos;ouvre dans Safari.</li>
        <li>Connectez-vous avec votre e-mail et votre mot de passe. En cas d&apos;oubli, touchez « Mot de passe oublié ».</li>
        <li>Touchez Partager, puis « Sur l&apos;écran d&apos;accueil ».</li>
        <li>Dans la nouvelle app, refaites les réglages de cet appareil : établissement, poste de caisse ou de cuisine, borne de pointage, langue, notifications.</li>
        <li>Supprimez l&apos;ancienne icône de l&apos;écran d&apos;accueil : appui long, puis Supprimer.</li>
      </ol>
    </Fenetre>
  );
}

const s = {
  bande: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 12,
    padding: '8px 16px',
    background: 'var(--info-bg-soft, var(--info-bg))',
    borderBottom: '1.5px solid var(--info-bd, var(--info-text))',
    flexShrink: 0,
  },
  texte: {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--info-text)',
    fontFamily: 'var(--font)',
    lineHeight: 1.4,
    textAlign: 'center',
  },
  bouton: {
    padding: '6px 14px',
    borderRadius: 999,
    border: '1.5px solid var(--info-text)',
    background: 'transparent',
    color: 'var(--info-text)',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
  paragraphe: { margin: '0 0 14px', fontSize: 14, lineHeight: 1.5, color: 'var(--text)' },
  etat: { padding: '12px 14px', borderRadius: 'var(--r-md, 14px)', fontSize: 14, lineHeight: 1.5, color: 'var(--text)', marginBottom: 14 },
  avertissement: { margin: '0 0 14px', fontSize: 14, lineHeight: 1.5, color: 'var(--warning-text)' },
  etapes: { margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.6, color: 'var(--text2)', display: 'grid', gap: 6 },
  pied: { display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' },
};
