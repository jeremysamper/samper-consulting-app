import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Delete, Info, X } from 'lucide-react';
import { useLanguage } from '../../../hooks/useLanguage.js';
import { zurichClock } from '../../../utils/zurichTime.js';
import { ajouterChiffre, codeComplet, LONGUEUR_CODE, lireReponse, retirerChiffre } from './borneLogique.js';
import {
  borneDeCetAppareil, etatDeLaBorne, fermerSessionLocale, fileDeLaBorne, oublierBorne, pointerALaBorne, rejouerFile, retenirBorne, sortirDeLaBorne,
} from './borneService.js';
import './borne.css';

// ─────────────────────────────────────────────────────────────────────────────
// Écran de la borne de pointage (lot L6, 22.11.2026), d'après l'écran 48 du
// labo : l'heure en grand sur la carte nuit, le pavé à côté (au-dessous au
// téléphone), puis le nom et la confirmation. Il s'ouvre en plein écran au
// lancement de l'app sur l'appareil déclaré (main.jsx), sans session.
//
// Il ne montre aucune donnée de l'équipe, hors la personne qui vient de
// pointer, et seulement le temps de la confirmation.
// ─────────────────────────────────────────────────────────────────────────────

const DUREE_REPONSE_MS = 5000;
const LOCALES = { fr: 'fr-CH', en: 'en-GB', es: 'es-ES', de: 'de-CH' };
const TOUCHES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'effacer', '0', 'corriger'];

const dateDuJour = (lang) => new Intl.DateTimeFormat(LOCALES[lang] || 'fr-CH', {
  timeZone: 'Europe/Zurich', weekday: 'long', day: 'numeric', month: 'long',
}).format(new Date());

function Resultat({ reponse }) {
  const Icone = reponse.ton === 'succes' ? Check : reponse.ton === 'info' ? Info : X;
  return (
    <div className={`borne-resultat borne-resultat--${reponse.ton}`} role="status" aria-live="assertive">
      <span className="borne-resultat-picto" aria-hidden="true"><Icone size={40} strokeWidth={2} /></span>
      {reponse.nom ? <p className="borne-resultat-nom" data-no-translate>{reponse.nom}</p> : null}
      <p className="borne-resultat-titre">{reponse.titre}</p>
      {reponse.heure ? <p className="borne-resultat-heure" data-no-translate>{reponse.heure}</p> : null}
      {reponse.detail ? (
        <p className="borne-resultat-detail">
          <span>{reponse.detail}</span>
          {reponse.valeur ? <span data-no-translate> {reponse.valeur}</span> : null}
        </p>
      ) : null}
    </div>
  );
}

export default function Borne() {
  const [borne, setBorne] = useState(() => borneDeCetAppareil());
  const { lang } = useLanguage(borne?.etablissementId || null);
  const [code, setCode] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [reponse, setReponse] = useState(null);
  const [oubliee, setOubliee] = useState(null);
  const [attenteJusqua, setAttenteJusqua] = useState(0);
  const [enFile, setEnFile] = useState(() => fileDeLaBorne().length);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const [quitter, setQuitter] = useState(false);
  const minuteur = useRef(null);
  const codeRef = useRef('');
  const jeton = borne?.jeton || null;

  const perdreLaBorne = useCallback((raison) => {
    oublierBorne();
    setBorne(null);
    setOubliee(lireReponse({ raison }));
  }, []);

  // Aucune session sur une borne ; puis la borne relit son état : révoquée
  // ou inconnue, elle s'efface. Sans réseau, elle reste utilisable.
  useEffect(() => {
    fermerSessionLocale();
    if (!jeton) return;
    etatDeLaBorne(jeton).then((r) => {
      if (r?.valide) {
        retenirBorne({ id: borne.id, jeton, nom: r.nom, etablissement_id: r.etablissement_id, etablissementNom: r.etablissement_nom || '' });
        setBorne(borneDeCetAppareil());
      } else if (r?.raison === 'revoquee' || r?.raison === 'borne_inconnue') {
        perdreLaBorne(r.raison);
      }
    }).catch(() => { /* hors ligne : la borne garde ses noms */ });
  }, []);

  // L'horloge (heure de Zurich), à la seconde pour tomber juste sur la minute.
  useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // File hors ligne : rejouée au retour du réseau et toutes les 30 secondes.
  const rejouer = useCallback(async () => {
    if (!jeton || !fileDeLaBorne().length) return;
    const suite = await rejouerFile(jeton);
    if (suite === 'oublier') perdreLaBorne('revoquee');
    setEnFile(fileDeLaBorne().length);
  }, [jeton, perdreLaBorne]);

  useEffect(() => {
    rejouer();
    const t = setInterval(rejouer, 30000);
    window.addEventListener('online', rejouer);
    return () => { clearInterval(t); window.removeEventListener('online', rejouer); };
  }, [rejouer]);

  useEffect(() => () => clearTimeout(minuteur.current), []);

  const enAttente = attenteJusqua > maintenant;

  const envoyer = useCallback(async (saisi) => {
    if (!jeton) return;
    setEnvoi(true);
    const r = await pointerALaBorne(jeton, saisi);
    const lu = lireReponse(r);
    setEnvoi(false);
    codeRef.current = '';
    setCode('');
    setEnFile(fileDeLaBorne().length);
    if (lu.oublier) { perdreLaBorne(r.raison); return; }
    if (lu.attenteSecondes) setAttenteJusqua(Date.now() + lu.attenteSecondes * 1000);
    setReponse(lu);
    clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => setReponse(null), DUREE_REPONSE_MS);
  }, [jeton, perdreLaBorne]);

  const toucher = useCallback((t) => {
    if (envoi || enAttente || !jeton) return;
    if (reponse) { clearTimeout(minuteur.current); setReponse(null); }
    // Le code courant vit dans une référence : deux touches rapides ne lisent
    // jamais un état en retard, et l'envoi part une fois, hors du rendu.
    const avant = codeRef.current;
    const suivant = t === 'effacer' ? '' : t === 'corriger' ? retirerChiffre(avant) : ajouterChiffre(avant, t);
    codeRef.current = suivant;
    setCode(suivant);
    if (/^[0-9]$/.test(t) && codeComplet(suivant) && suivant !== avant) envoyer(suivant);
  }, [envoi, enAttente, jeton, reponse, envoyer]);

  // Clavier (ordinateur, clavier relié à la tablette).
  useEffect(() => {
    const surTouche = (e) => {
      if (quitter) return;
      if (/^[0-9]$/.test(e.key)) toucher(e.key);
      else if (e.key === 'Backspace') toucher('corriger');
      else if (e.key === 'Escape') toucher('effacer');
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [toucher, quitter]);

  const ouvrirApp = async () => {
    sortirDeLaBorne();
    await fermerSessionLocale();
    window.location.reload();
  };

  const secondesRestantes = Math.max(0, Math.ceil((attenteJusqua - maintenant) / 1000));

  return (
    <main className="borne" aria-label="Borne de pointage">
      <section className="borne-heure" data-cadre>
        <p className="borne-lieu" data-no-translate>
          {[borne?.etablissementNom, borne?.nom].filter(Boolean).join(', ')}
        </p>
        <div>
          <p className="borne-horloge" data-no-translate>{zurichClock()}</p>
          <p className="borne-date" data-no-translate>{dateDuJour(lang)}</p>
        </div>
        <div className="borne-pied">
          <p className="borne-consigne">Tapez votre code pour pointer votre arrivée ou votre départ.</p>
          {enFile > 0 ? (
            <p className="borne-file">
              <span>Pointages en attente du réseau :</span>
              <span data-no-translate> {enFile}</span>
            </p>
          ) : null}
          <button type="button" className="borne-quitter" onClick={() => setQuitter(true)}>Quitter la borne</button>
        </div>
      </section>

      <section className="borne-pave" data-cadre>
        {quitter ? (
          <div className="borne-quitter-fenetre" role="dialog" aria-modal="true" aria-labelledby="borne-quitter-titre">
            <p id="borne-quitter-titre" className="borne-pave-titre">Ouvrir l'application sur cet appareil ?</p>
            <p className="borne-quitter-texte">Il faudra vous connecter. La borne reste déclarée et revient au prochain lancement.</p>
            <div className="borne-quitter-actions">
              <button type="button" className="borne-btn borne-btn--principal" onClick={ouvrirApp}>Ouvrir l'application</button>
              <button type="button" className="borne-btn" onClick={() => setQuitter(false)}>Rester sur la borne</button>
            </div>
          </div>
        ) : oubliee ? (
          <div className="borne-oubliee">
            <Resultat reponse={oubliee} />
            <button type="button" className="borne-btn borne-btn--principal" onClick={ouvrirApp}>Ouvrir l'application</button>
          </div>
        ) : reponse ? (
          <button type="button" className="borne-resultat-zone" onClick={() => { clearTimeout(minuteur.current); setReponse(null); }} aria-label="Fermer">
            <Resultat reponse={reponse} />
          </button>
        ) : (
          <>
            <p className="borne-pave-titre">{enAttente ? "Trop d'essais" : envoi ? 'Un instant' : 'Votre code personnel'}</p>
            {enAttente ? (
              <p className="borne-pave-attente">
                <span>Réessayez dans</span>
                <span data-no-translate> {Math.ceil(secondesRestantes / 60)} min</span>
              </p>
            ) : null}
            <div className="borne-points" aria-hidden="true">
              {Array.from({ length: LONGUEUR_CODE }, (_, i) => (
                <i key={i} className={i < code.length ? 'on' : ''} />
              ))}
            </div>
            <div className="borne-touches" role="group" aria-label="Pavé numérique">
              {TOUCHES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`borne-touche${/^[0-9]$/.test(t) ? '' : ' borne-touche--texte'}`}
                  onClick={() => toucher(t)}
                  disabled={envoi || enAttente}
                  aria-label={t === 'corriger' ? 'Corriger' : undefined}
                >
                  {t === 'effacer' ? 'Effacer' : t === 'corriger' ? <Delete size={26} aria-hidden="true" /> : <span data-no-translate>{t}</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
