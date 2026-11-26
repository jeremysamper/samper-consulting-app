import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronRight } from 'lucide-react';
import { envoyerDemande, idAppareil, ouvrirChambre, suivreDemandes } from './api.js';
import { LIMITES, estJetonDemo, jetonValide, notePropre } from './regles.js';
import { LANGUES, NOMS_LANGUES, TEXTES, langueDe } from './textes.js';
import './chambre.css';

// Demande de l'hôte par le QR de la chambre (lot 17 du panel, 25.11.2026).
//
// Chaque chambre porte un QR à elle : /chambre/<jeton>. L'hôte voit les
// demandes que la maison a ouvertes aux hôtes, en touche une, ajoute un mot
// s'il le veut et envoie. La demande arrive dans Demandes au bon pôle ; l'hôte
// suit ensuite son état (Reçue, Prise en charge, Faite).
//
// Page autonome, sans app.css ni session : jetons --h-* et mise en page dans
// chambre.css. Thème du téléphone, ou ?theme=dark | light. Phrases fixes en
// trois langues (textes.js) ; les libellés de la maison s'affichent tels quels.

const RELEVE_MS = 20000;
const ERREURS_ENVOI = ['reseau', 'trop_vite', 'en_attente', 'occupe', 'demande', 'hors_sejour'];

function lireParametres() {
  const q = new URLSearchParams(window.location.search);
  const chemin = window.location.pathname.match(/\/chambre\/([^/]+)\/?$/);
  const prefere = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = q.get('theme') === 'dark' || q.get('theme') === 'light' ? q.get('theme') : (prefere ? 'dark' : 'light');
  return { jeton: chemin?.[1] || '', theme };
}

const enCours = (liste) => (liste || []).some((d) => d.etat === 'recue' || d.etat === 'prise');

export default function DemandeChambre() {
  const { jeton, theme } = useMemo(lireParametres, []);
  const formeOk = jetonValide(jeton) || estJetonDemo(jeton);
  const appareil = useMemo(idAppareil, []);
  const [langue, setLangue] = useState(() => langueDe(typeof navigator !== 'undefined' ? navigator.language : 'fr'));
  const t = TEXTES[langue];

  const [etat, setEtat] = useState(formeOk ? 'chargement' : 'introuvable'); // chargement | introuvable | reseau | hors_sejour | pret
  const [chambre, setChambre] = useState(null);
  const [vue, setVue] = useState('liste'); // liste | confirmer | suivi
  const [choix, setChoix] = useState(null);
  const [note, setNote] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [annonce, setAnnonce] = useState(null); // envoyee | deja
  const [suivi, setSuivi] = useState(null);
  const [suiviEnEchec, setSuiviEnEchec] = useState(false);
  const verrou = useRef(false);

  useEffect(() => { document.documentElement.lang = langue; }, [langue]);
  useEffect(() => { document.title = t.titre; }, [t]);
  useEffect(() => {
    document.documentElement.style.background = theme === 'dark' ? '#071319' : '#e8ebee';
  }, [theme]);

  const releverSuivi = useCallback(async () => {
    const r = await suivreDemandes({ jeton, appareil });
    if (r?.erreur === 'introuvable') { setEtat('introuvable'); return; }
    if (!r || r.erreur || !Array.isArray(r.demandes)) { setSuiviEnEchec(true); return; }
    setSuiviEnEchec(false);
    setSuivi(r.demandes);
  }, [jeton, appareil]);

  const charger = useCallback(async () => {
    if (!formeOk) { setEtat('introuvable'); return; }
    setEtat('chargement');
    const r = await ouvrirChambre(jeton);
    if (r?.erreur === 'introuvable') { setEtat('introuvable'); return; }
    if (!r || r.erreur || typeof r.chambre !== 'string') { setEtat('reseau'); return; }
    setChambre(r);
    setEtat(r.hors_sejour ? 'hors_sejour' : 'pret');
    if (!r.hors_sejour) releverSuivi();
  }, [formeOk, jeton, releverSuivi]);

  useEffect(() => { charger(); }, [charger]);

  // Relevé du suivi toutes les 20 secondes tant que l'onglet est visible et
  // qu'une demande n'est ni faite ni annulée (ou que le dernier relevé a
  // échoué : le suivant réessaie). S'arrête sinon.
  const doitRelever = etat === 'pret' && (enCours(suivi) || suiviEnEchec);
  useEffect(() => {
    if (!doitRelever) return undefined;
    let minuterie = null;
    const lancer = () => {
      window.clearInterval(minuterie);
      minuterie = document.visibilityState === 'visible' ? window.setInterval(releverSuivi, RELEVE_MS) : null;
    };
    const auRetour = () => {
      if (document.visibilityState === 'visible') releverSuivi();
      lancer();
    };
    lancer();
    document.addEventListener('visibilitychange', auRetour);
    return () => {
      window.clearInterval(minuterie);
      document.removeEventListener('visibilitychange', auRetour);
    };
  }, [doitRelever, releverSuivi]);

  const choisir = (libelle) => {
    setChoix(libelle);
    setNote('');
    setErreur(null);
    setVue('confirmer');
    window.scrollTo({ top: 0 });
  };

  const envoyer = async () => {
    if (verrou.current || !choix) return;
    verrou.current = true;
    setEnvoi(true);
    setErreur(null);
    const r = await envoyerDemande({ jeton, libelle: choix, note: notePropre(note), appareil });
    verrou.current = false;
    setEnvoi(false);
    if (r?.ok) {
      setAnnonce(r.deja ? 'deja' : 'envoyee');
      setNote('');
      setVue('suivi');
      window.scrollTo({ top: 0 });
      releverSuivi();
      return;
    }
    if (r?.erreur === 'introuvable') { setEtat('introuvable'); return; }
    if (r?.erreur === 'hors_sejour') { setErreur('hors_sejour'); return; }
    setErreur(ERREURS_ENVOI.includes(r?.erreur) ? r.erreur : 'reseau');
    if (r?.erreur === 'demande') charger();
  };

  const heure = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString(`${langue}-CH`, { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' });
  };

  const demandes = chambre?.demandes || [];
  const nbSuivi = suivi?.length || 0;

  return (
    <div className="ch-racine" data-theme={theme === 'dark' ? 'dark' : 'light'}>
      <main className="ch-page">
        <header className="ch-tete">
          {chambre?.etablissement ? <p className="ch-sur">{chambre.etablissement}</p> : <p className="ch-sur">&nbsp;</p>}
          <h1 className="ch-titre">
            {chambre?.chambre ? `${t.chambre} ${chambre.chambre}` : t.titre}
          </h1>
        </header>

        {etat === 'chargement' && (
          <section className="ch-carte ch-message" aria-busy="true">
            <span className="ch-roue" aria-hidden="true" />
            <p>{t.chargement}</p>
          </section>
        )}

        {etat === 'introuvable' && (
          <section className="ch-carte ch-message">
            <p className="ch-fort">{t.introuvable}</p>
            <p>{t.introuvableDetail}</p>
          </section>
        )}

        {etat === 'reseau' && (
          <section className="ch-carte ch-message" role="alert">
            <p className="ch-fort">{t.reseau}</p>
            <p>{t.reseauDetail}</p>
            <button type="button" className="ch-bouton ch-principal" onClick={charger}>{t.reessayer}</button>
          </section>
        )}

        {etat === 'hors_sejour' && (
          <section className="ch-carte ch-message">
            <p className="ch-fort">{t.horsSejour}</p>
            <p>{t.horsSejourDetail}</p>
          </section>
        )}

        {etat === 'pret' && vue === 'liste' && (
          <div className="ch-entree">
            {demandes.length === 0 ? (
              <section className="ch-carte ch-message">
                <p className="ch-fort">{t.aucune}</p>
                <p>{t.aucuneDetail}</p>
              </section>
            ) : (
              <>
                <h2 className="ch-question">{t.choisir}</h2>
                <ul className="ch-liste">
                  {demandes.map((d) => (
                    <li key={d.libelle}>
                      <button type="button" className="ch-demande" onClick={() => choisir(d.libelle)}>
                        <span>{d.libelle}</span>
                        <ChevronRight size={22} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {nbSuivi > 0 && (
              <button type="button" className="ch-bouton ch-secondaire ch-voir" onClick={() => { setAnnonce(null); setVue('suivi'); }}>
                {t.voirSuivi} ({nbSuivi})
              </button>
            )}
          </div>
        )}

        {etat === 'pret' && vue === 'confirmer' && choix && (
          <div className="ch-entree">
            <button type="button" className="ch-bouton ch-lien" onClick={() => { setVue('liste'); setErreur(null); }}>
              <ArrowLeft size={18} aria-hidden="true" />
              <span>{t.retour}</span>
            </button>
            <section className="ch-carte ch-bloc">
              <h2 className="ch-choix">{choix}</h2>
              <label className="ch-champ-bloc">
                <span className="ch-label">{t.mot}</span>
                <textarea
                  className="ch-champ"
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, LIMITES.note * 2))}
                  rows={3}
                  maxLength={LIMITES.note}
                  enterKeyHint="send"
                />
                <span className="ch-aide">{t.motAide}</span>
              </label>
            </section>
            {erreur && <p className="ch-erreur" role="alert">{t[`err_${erreur}`]}</p>}
            <button type="button" className="ch-bouton ch-principal ch-envoyer" onClick={envoyer} disabled={envoi}>
              {envoi ? <span className="ch-roue ch-roue-claire" aria-hidden="true" /> : null}
              <span>{envoi ? t.envoi : t.envoyer}</span>
            </button>
          </div>
        )}

        {etat === 'pret' && vue === 'suivi' && (
          <div className="ch-entree">
            {annonce && (
              <section className="ch-carte ch-annonce" aria-live="polite">
                <span className="ch-coche" aria-hidden="true"><Check size={22} /></span>
                <p>{annonce === 'deja' ? t.deja : t.envoyee}</p>
              </section>
            )}
            <section className="ch-carte ch-bloc">
              <h2 className="ch-bloc-titre">{t.suivi}</h2>
              {nbSuivi === 0 && !suiviEnEchec && <p className="ch-doux">{t.suiviVide}</p>}
              {nbSuivi > 0 && (
                <ul className="ch-suivi">
                  {suivi.map((d) => (
                    <li key={`${d.libelle}-${d.at}`} className="ch-suivi-ligne">
                      <span className="ch-suivi-texte">
                        <span className="ch-suivi-nom">{d.libelle}</span>
                        <span className="ch-doux">{heure(d.at)}</span>
                      </span>
                      <span className="ch-etat" data-etat={d.etat}>{t[`etat_${d.etat}`] || d.etat}</span>
                    </li>
                  ))}
                </ul>
              )}
              {suiviEnEchec && <p className="ch-discret" role="status">{t.suiviErreur}</p>}
            </section>
            <button type="button" className="ch-bouton ch-secondaire" onClick={() => { setAnnonce(null); setVue('liste'); }}>
              {t.autre}
            </button>
          </div>
        )}

        <footer className="ch-pied">
          <div className="ch-langues" role="group" aria-label={t.langue}>
            {LANGUES.map((l) => (
              <button
                key={l}
                type="button"
                lang={l}
                className="ch-pilule"
                data-actif={l === langue ? '1' : undefined}
                aria-pressed={l === langue}
                onClick={() => setLangue(l)}
              >
                {NOMS_LANGUES[l]}
              </button>
            ))}
          </div>
        </footer>
      </main>
    </div>
  );
}
