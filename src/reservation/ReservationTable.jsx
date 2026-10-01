import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, MapPin, Phone, X } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Réservation d'une table en ligne, vue par le visiteur (module Prévisions).
//
// Même principe que la réservation d'un soin (ReservationEnLigne.jsx), dans
// l'ordre d'un appel au restaurant : combien, quand, puis les coordonnées.
// Selon le réglage du restaurant, la réservation est confirmée tout de suite
// ou arrive « À confirmer » dans le module Prévisions.
//
// Paramètres d'adresse :
//   /table/<adresse>                  quel restaurant
//   mode=modal | integre              affichée par widget-table.js
//   accent=RRGGBB                     couleur du site du client
//   theme=light | dark                clair par défaut
// La page parle à la fenêtre parente (widget) par postMessage : hauteur du
// contenu, fermeture, réservation envoyée. Rien de personnel dans ces messages.
// ─────────────────────────────────────────────────────────────────────────────

const URL_FONCTION = `${import.meta.env.VITE_SUPABASE_URL || 'https://ppmtoiqgajwcdkbnrcll.supabase.co'}/functions/v1/spa-mailer`;
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const SERVICES = { midi: 'Midi', soir: 'Soir', brunch: 'Brunch' };
const EMAIL_OK = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ACCENT_DEFAUT = '#003042';

function lireParametres() {
  const q = new URLSearchParams(window.location.search);
  const chemin = window.location.pathname.match(/\/table\/([a-z0-9-]+)\/?$/i);
  const accent = (q.get('accent') || '').replace('#', '');
  return {
    slug: (chemin?.[1] || '').toLowerCase(),
    mode: ['modal', 'integre'].includes(q.get('mode')) ? q.get('mode') : 'page',
    accent: /^[0-9a-f]{6}$/i.test(accent) ? `#${accent}` : null,
    theme: q.get('theme') === 'dark' ? 'dark' : 'light',
  };
}

// Dates en ISO, calculées en UTC : « aujourd'hui » vient du serveur (Zurich).
const partiesIso = (iso) => iso.split('-').map(Number);
function decaler(iso, n) {
  const [y, m, d] = partiesIso(iso);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function jourIso(iso) {
  const [y, m, d] = partiesIso(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function jourLong(iso) {
  const [, m, d] = partiesIso(iso);
  const nom = JOURS[jourIso(iso)];
  return `${nom.charAt(0).toUpperCase()}${nom.slice(1)} ${d === 1 ? '1er' : d} ${MOIS[m - 1]}`;
}
const personnes = (n) => `${n} personne${n > 1 ? 's' : ''}`;

async function appeler(action, charge) {
  const r = await fetch(URL_FONCTION, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...charge }),
  });
  const corps = await r.json().catch(() => ({}));
  return { ok: r.ok, statut: r.status, corps };
}

function prevenirParent(type, valeur) {
  if (window.parent === window) return;
  try { window.parent.postMessage({ source: 'table-reservation', type, valeur }, '*'); } catch { /* parent fermé */ }
}

// Jetons de la page : autonomes (la page n'embarque pas app.css), clair ou
// sombre, accent repris du site du client avec un texte lisible dessus.
// Neutres clairs froids, jamais crème (même principe que l'app).
function jetons(theme, hex) {
  const accent = hex || ACCENT_DEFAUT;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(accent.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const clair = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) > 0.45;
  const sombre = theme === 'dark';
  return {
    '--t-bg': sombre ? '#12161c' : '#f2f5f6',
    '--t-surface': sombre ? '#1b2129' : '#fcfdfd',
    '--t-sunken': sombre ? '#232a33' : '#e9eef0',
    '--t-ink': sombre ? '#eef1f4' : '#1d2327',
    '--t-ink2': sombre ? '#aab4bf' : '#5b6469',
    '--t-line': sombre ? '#2d3540' : '#dce2e5',
    '--t-accent': sombre && !hex ? '#7fb2c8' : accent,
    '--t-on-accent': sombre && !hex ? '#0d1a20' : (clair ? '#1d2327' : '#ffffff'),
    '--t-ok': sombre ? '#7ccf9f' : '#1f7a4d',
    '--t-ok-soft': sombre ? 'rgba(124,207,159,0.14)' : '#e6f3ec',
    '--t-danger': sombre ? '#f19a9a' : '#a4262c',
    '--t-danger-soft': sombre ? 'rgba(241,154,154,0.12)' : '#fbeceb',
  };
}

export default function ReservationTable() {
  const parametres = useMemo(lireParametres, []);
  const [infos, setInfos] = useState(null);
  const [etatChargement, setEtatChargement] = useState('chargement'); // chargement | pret | ferme | erreur
  const [etape, setEtape] = useState('moment'); // moment | coordonnees | envoye
  const [couverts, setCouverts] = useState(2);
  const [date, setDate] = useState(null);
  const [creneaux, setCreneaux] = useState({ cle: null, services: [], chargement: false });
  const [choix, setChoix] = useState(null); // { service, heure }
  const [form, setForm] = useState({ prenom: '', nom: '', email: '', telephone: '', message: '', siteWeb: '', actus: false });
  const [envoi, setEnvoi] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [erreur, setErreur] = useState(null);
  const debutSaisie = useRef(performance.now());
  const haut = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = parametres.theme;
    document.title = 'Réserver une table';
    document.body.style.background = jetons(parametres.theme, parametres.accent)['--t-bg'];
    if (!parametres.slug) { setEtatChargement('ferme'); return; }
    appeler('public_table_infos', { slug: parametres.slug })
      .then(({ ok, statut, corps }) => {
        if (ok) {
          setInfos(corps);
          setCouverts((n) => Math.min(n, corps.maxCouverts || n));
          setEtatChargement('pret');
          document.title = `Réserver une table, ${corps.etablissement?.nom || 'restaurant'}`;
        } else setEtatChargement(statut === 404 ? 'ferme' : 'erreur');
      })
      .catch(() => setEtatChargement('erreur'));
  }, [parametres]);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => prevenirParent('hauteur', Math.ceil(document.documentElement.scrollHeight)));
    ro.observe(document.body);
    return () => ro.disconnect();
  }, []);

  const jours = useMemo(() => {
    if (!infos) return [];
    const ouverts = new Set((infos.joursOuverts || []).map((j) => j % 7)); // ISO 7 (dimanche) → 0
    const fermes = new Set(infos.joursFermes || []);
    const n = Math.min(21, (infos.horizonJours || 60) + 1);
    return Array.from({ length: n }, (_, i) => {
      const iso = decaler(infos.aujourdhui, i);
      return { iso, ouvert: ouverts.has(jourIso(iso)) && !fermes.has(iso) };
    });
  }, [infos]);

  const chargerCreneaux = useCallback(async (iso, n) => {
    const cle = `${iso}|${n}`;
    setCreneaux({ cle, services: [], chargement: true });
    const { ok, corps } = await appeler('public_table_creneaux', { slug: parametres.slug, date: iso, couverts: n })
      .catch(() => ({ ok: false, corps: {} }));
    setCreneaux((prev) => (prev.cle === cle ? { cle, services: ok ? corps.services || [] : [], chargement: false } : prev));
    if (!ok) setErreur(corps.error || 'Les heures n\'ont pas pu être chargées. Réessayez.');
  }, [parametres.slug]);

  // Premier jour ouvert choisi d'office : le visiteur voit tout de suite des
  // heures, sans devoir d'abord comprendre le calendrier.
  useEffect(() => {
    if (!infos || date) return;
    const premier = jours.find((j) => j.ouvert)?.iso;
    if (premier) setDate(premier);
  }, [infos, jours, date]);

  useEffect(() => {
    if (date && etape === 'moment') chargerCreneaux(date, couverts);
  }, [date, couverts, etape, chargerCreneaux]);

  function allerA(nouvelle) {
    setEtape(nouvelle);
    setErreur(null);
    haut.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function choisirJour(iso) {
    setErreur(null);
    setChoix(null);
    setDate(iso);
  }

  function jourSuivantOuvert() {
    const i = jours.findIndex((j) => j.iso === date);
    const suivant = jours.slice(i + 1).find((j) => j.ouvert) || null;
    if (suivant) choisirJour(suivant.iso);
    else if (date) choisirJour(decaler(date, 1));
  }

  async function envoyer(e) {
    e.preventDefault();
    const f = form;
    if (!f.prenom.trim() || !f.nom.trim()) { setErreur('Indiquez votre prénom et votre nom.'); return; }
    if (!EMAIL_OK.test(f.email.trim())) { setErreur('Votre adresse e-mail semble incorrecte.'); return; }
    if (f.telephone.replace(/\D/g, '').length < 6) { setErreur('Indiquez un numéro de téléphone.'); return; }
    setEnvoi(true);
    setErreur(null);
    try {
      const { ok, statut, corps } = await appeler('public_table_reserver', {
        slug: parametres.slug, date, service: choix.service, heure: choix.heure, couverts,
        prenom: f.prenom, nom: f.nom, email: f.email, telephone: f.telephone, message: f.message,
        // Accord pour les actualités et bons cadeaux : décoché par défaut,
        // seul un geste du client le donne (nLPD / RGPD).
        consentement: f.actus === true,
        siteWeb: f.siteWeb, dureeSaisie: Math.round(performance.now() - debutSaisie.current),
      });
      if (ok) {
        setResultat(corps.statut === 'confirme' ? 'confirmee' : 'demande');
        allerA('envoye');
        prevenirParent('envoyee');
        return;
      }
      setErreur(corps.error || 'La réservation n\'a pas pu être envoyée. Réessayez.');
      if (statut === 409) {
        setChoix(null);
        setEtape('moment');
      }
    } catch {
      setErreur('Connexion impossible. Vérifiez votre réseau et réessayez.');
    } finally {
      setEnvoi(false);
    }
  }

  function recommencer() {
    setChoix(null);
    setResultat(null);
    setForm((p) => ({ ...p, message: '' }));
    debutSaisie.current = performance.now();
    allerA('moment');
  }

  const integre = parametres.mode === 'integre';
  const racine = {
    ...s.racine,
    ...jetons(parametres.theme, parametres.accent),
    ...(integre ? { background: 'transparent', padding: '8px 4px 16px', minHeight: 0 } : null),
  };
  const max = infos?.maxCouverts || 8;
  const tel = infos?.etablissement?.tel;
  const lienTel = tel ? `tel:${tel.replace(/\s+/g, '')}` : null;
  const auto = infos?.mode === 'auto';
  const services = creneaux.cle === `${date}|${couverts}` ? creneaux.services : [];
  const aucuneHeure = !creneaux.chargement && creneaux.cle === `${date}|${couverts}` && !services.some((x) => x.creneaux.length);

  return (
    <div style={racine} ref={haut}>
      <main style={s.colonne}>
        {parametres.mode === 'modal' && (
          <button type="button" onClick={() => prevenirParent('fermer')} aria-label="Fermer" style={s.fermer}>
            <X size={20} strokeWidth={1.8} aria-hidden="true" />
          </button>
        )}

        {etatChargement === 'chargement' && <div style={s.chargement} aria-live="polite">Chargement…</div>}
        {etatChargement === 'ferme' && (
          <div style={s.carte}>
            <h1 style={s.titre}>Réservation en ligne</h1>
            <p style={s.texte}>La réservation en ligne n'est pas ouverte pour le moment. Contactez directement le restaurant pour réserver.</p>
          </div>
        )}
        {etatChargement === 'erreur' && (
          <div style={s.carte}>
            <h1 style={s.titre}>Un instant…</h1>
            <p style={s.texte}>La réservation n'a pas pu se charger. Vérifiez votre connexion et rechargez la page.</p>
          </div>
        )}

        {etatChargement === 'pret' && infos && (
          <>
            <header style={{ marginBottom: 18 }}>
              <div style={s.surTitre}>Réserver une table</div>
              <h1 style={s.titre} data-no-translate>{infos.etablissement?.nom}</h1>
              {infos.message && <p style={{ ...s.texte, marginTop: 6 }}>{infos.message}</p>}
              {(infos.etablissement?.adresse || tel) && (
                <div style={s.coordonnees}>
                  {infos.etablissement?.adresse && <span style={s.coord}><MapPin size={14} strokeWidth={1.8} aria-hidden="true" /> {infos.etablissement.adresse}</span>}
                  {tel && <a href={lienTel} style={s.coord}><Phone size={14} strokeWidth={1.8} aria-hidden="true" /> {tel}</a>}
                </div>
              )}
            </header>

            {erreur && <div role="alert" style={s.erreur}>{erreur}</div>}

            {/* ── 1. Combien et quand ── */}
            {etape === 'moment' && (
              <section>
                <h2 style={s.sousTitre}>Combien serez-vous ?</h2>
                <div style={s.puces} role="radiogroup" aria-label="Nombre de personnes">
                  {Array.from({ length: Math.min(max, 10) }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={couverts === n}
                      aria-label={personnes(n)}
                      onClick={() => { setChoix(null); setCouverts(n); }}
                      style={{ ...s.puce, ...(couverts === n ? s.puceActive : null) }}
                    >
                      {n}
                    </button>
                  ))}
                  {max > 10 && (
                    <select
                      aria-label="Plus de 10 personnes"
                      value={couverts > 10 ? couverts : ''}
                      onChange={(e) => { if (e.target.value) { setChoix(null); setCouverts(Number(e.target.value)); } }}
                      style={{ ...s.puce, width: 'auto', padding: '0 12px', ...(couverts > 10 ? s.puceActive : null) }}
                    >
                      <option value="">11+</option>
                      {Array.from({ length: max - 10 }, (_, i) => i + 11).map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  )}
                </div>
                <p style={{ ...s.texte, fontSize: 13, margin: '6px 0 20px' }}>
                  Plus de {personnes(max)} ?{' '}
                  {lienTel ? <a href={lienTel} style={{ color: 'var(--t-accent)' }}>Appelez-nous</a> : 'Contactez-nous'} pour un groupe.
                </p>

                <h2 style={s.sousTitre}>Quel jour ?</h2>
                <div style={s.jours} role="listbox" aria-label="Jour">
                  {jours.map(({ iso, ouvert }) => {
                    const actif = iso === date;
                    const [, , d] = partiesIso(iso);
                    return (
                      <button
                        key={iso}
                        type="button"
                        role="option"
                        aria-selected={actif}
                        aria-label={`${jourLong(iso)}${ouvert ? '' : ', fermé'}`}
                        disabled={!ouvert}
                        onClick={() => choisirJour(iso)}
                        style={{ ...s.jour, ...(actif ? s.jourActif : null), ...(!ouvert ? s.jourFerme : null) }}
                      >
                        <span style={{ fontSize: 12 }}>{iso === infos.aujourdhui ? 'Auj.' : JOURS_COURTS[jourIso(iso)]}</span>
                        <span style={{ fontSize: 17, fontWeight: 600 }}>{d}</span>
                      </button>
                    );
                  })}
                </div>
                <label style={s.autreDate}>
                  Autre date
                  <input
                    type="date"
                    value={date || ''}
                    min={infos.aujourdhui}
                    max={decaler(infos.aujourdhui, infos.horizonJours || 60)}
                    onChange={(e) => e.target.value && choisirJour(e.target.value)}
                    style={s.champDate}
                  />
                </label>

                <h2 style={s.sousTitre}>{date ? `${jourLong(date)}, à quelle heure ?` : 'À quelle heure ?'}</h2>
                <div aria-live="polite">
                  {creneaux.chargement && <div style={s.texte}>Recherche des tables libres…</div>}
                  {aucuneHeure && (
                    <div style={s.aucun}>
                      <span>Plus de table en ligne ce jour-là pour {personnes(couverts)}.</span>
                      <button type="button" onClick={jourSuivantOuvert} style={s.lien}>Voir le jour suivant</button>
                    </div>
                  )}
                  {!creneaux.chargement && !aucuneHeure && services.map((x) => (
                    <div key={x.service} style={{ marginBottom: 16 }}>
                      <div style={s.service}>{SERVICES[x.service] || x.service}</div>
                      {x.creneaux.length ? (
                        <div style={s.creneaux}>
                          {x.creneaux.map((h) => (
                            <button
                              key={h}
                              type="button"
                              onClick={() => { setChoix({ service: x.service, heure: h }); allerA('coordonnees'); }}
                              style={{ ...s.creneau, ...(choix?.service === x.service && choix?.heure === h ? s.creneauActif : null) }}
                            >
                              {h}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div style={{ ...s.texte, fontSize: 14 }}>{x.complet ? 'Complet' : 'Plus d\'heure disponible'}</div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── 2. Les coordonnées ── */}
            {etape === 'coordonnees' && choix && (
              <form onSubmit={envoyer} noValidate>
                <Recap date={date} choix={choix} couverts={couverts} onModifier={() => allerA('moment')} />
                <h2 style={s.sousTitre}>Vos coordonnées</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={s.grille2}>
                    <Champ label="Prénom" id="t-prenom">
                      <input id="t-prenom" autoComplete="given-name" style={s.champ} value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} required />
                    </Champ>
                    <Champ label="Nom" id="t-nom">
                      <input id="t-nom" autoComplete="family-name" style={s.champ} value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} required />
                    </Champ>
                  </div>
                  <div style={s.grille2}>
                    <Champ label="E-mail" id="t-email" aide="La confirmation vous sera envoyée ici.">
                      <input id="t-email" type="email" inputMode="email" autoComplete="email" style={s.champ} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                    </Champ>
                    <Champ label="Téléphone" id="t-tel">
                      <input id="t-tel" type="tel" inputMode="tel" autoComplete="tel" style={s.champ} value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} required />
                    </Champ>
                  </div>
                  <Champ label="Un mot pour le restaurant (facultatif)" id="t-message">
                    <textarea id="t-message" style={{ ...s.champ, minHeight: 76, resize: 'vertical' }} value={form.message} placeholder="Allergie, anniversaire, chaise haute…" onChange={(e) => setForm({ ...form, message: e.target.value })} />
                  </Champ>

                  <label htmlFor="t-actus" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minHeight: 44, cursor: 'pointer' }}>
                    <input
                      id="t-actus"
                      type="checkbox"
                      checked={form.actus}
                      onChange={(e) => setForm({ ...form, actus: e.target.checked })}
                      style={{ width: 20, height: 20, marginTop: 2, flexShrink: 0, accentColor: 'var(--t-accent)' }}
                    />
                    <span style={{ ...s.texte, fontSize: 14 }}>
                      J'accepte de recevoir les actualités et les bons cadeaux de <span data-no-translate>{infos.etablissement?.nom}</span> par e-mail. Désinscription possible à tout moment.
                    </span>
                  </label>

                  {/* Champ piège : invisible pour un humain, rempli par les robots. */}
                  <div aria-hidden="true" style={s.piege}>
                    <label htmlFor="t-site">Site web</label>
                    <input id="t-site" tabIndex={-1} autoComplete="off" value={form.siteWeb} onChange={(e) => setForm({ ...form, siteWeb: e.target.value })} />
                  </div>

                  <p style={{ ...s.texte, fontSize: 12 }}>
                    Vos coordonnées servent à gérer votre réservation avec <span data-no-translate>{infos.etablissement?.nom}</span>{form.actus ? ' et à vous envoyer ses actualités' : ''}. Elles ne sont transmises à personne.
                  </p>

                  <button type="submit" disabled={envoi} style={{ ...s.principal, opacity: envoi ? 0.6 : 1 }}>
                    {envoi ? 'Envoi…' : auto ? 'Réserver' : 'Envoyer ma demande'}
                  </button>
                </div>
              </form>
            )}

            {/* ── Envoyée ── */}
            {etape === 'envoye' && choix && (
              <section style={s.carte} aria-live="polite">
                <h2 style={{ ...s.titre, fontSize: 26, paddingRight: 0, margin: '0 0 6px' }}>
                  {resultat === 'confirmee' ? 'Table réservée' : 'Demande envoyée'}
                </h2>
                <p style={s.texte}>
                  {resultat === 'confirmee'
                    ? <>Merci {form.prenom.trim()}, c'est noté. Un récapitulatif part à <strong style={{ color: 'var(--t-ink)' }}>{form.email.trim()}</strong>.</>
                    : <>Merci {form.prenom.trim()}. Nous vous confirmons la réservation par e-mail à <strong style={{ color: 'var(--t-ink)' }}>{form.email.trim()}</strong>.</>}
                </p>
                {/* Le bon de réservation, tel que le restaurant le notera. */}
                <dl style={s.bon}>
                  {[
                    ['Table pour', personnes(couverts)],
                    ['Le', jourLong(date)],
                    ['À', choix.heure],
                    ['Au nom de', `${form.prenom.trim()} ${form.nom.trim()}`],
                  ].map(([label, valeur]) => (
                    <div key={label} style={s.bonLigne}>
                      <dt style={s.bonLabel}>{label}</dt>
                      <dd style={s.bonValeur} data-no-translate={label === 'Au nom de' ? true : undefined}>{valeur}</dd>
                    </div>
                  ))}
                </dl>
                <button type="button" onClick={recommencer} style={s.secondaire}>Faire une autre réservation</button>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Champ({ label, id, aide, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
      <label htmlFor={id} style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-ink)' }}>{label}</label>
      {children}
      {aide && <span style={{ fontSize: 12, color: 'var(--t-ink2)' }}>{aide}</span>}
    </div>
  );
}

function Recap({ date, choix, couverts, onModifier }) {
  return (
    <div style={s.recap}>
      <div style={{ minWidth: 0, flex: '1 1 auto' }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, lineHeight: 1.25 }}>{personnes(couverts)}</div>
        <div style={{ fontSize: 14, color: 'var(--t-ink2)' }}>{jourLong(date)}, {choix.heure}</div>
      </div>
      <button type="button" onClick={onModifier} style={{ ...s.lien, flexShrink: 0 }}>
        <ArrowLeft size={15} strokeWidth={2} aria-hidden="true" /> Changer
      </button>
    </div>
  );
}

const bouton = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer',
  fontFamily: 'var(--font)', fontSize: 15, fontWeight: 600, borderRadius: 6,
};

const s = {
  racine: {
    minHeight: '100vh', background: 'var(--t-bg)', color: 'var(--t-ink)', padding: '28px 16px 40px',
    fontFamily: 'var(--font)', fontSize: 15,
  },
  colonne: { position: 'relative', maxWidth: 620, margin: '0 auto' },
  fermer: {
    position: 'absolute', top: -8, right: 0, width: 44, height: 44, borderRadius: 6, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--t-surface)', color: 'var(--t-ink2)', border: '1px solid var(--t-line)',
  },
  chargement: { padding: '60px 0', textAlign: 'center', color: 'var(--t-ink2)' },
  carte: { padding: '28px 22px', borderRadius: 10, background: 'var(--t-surface)', border: '1px solid var(--t-line)' },
  surTitre: { fontSize: 14, color: 'var(--t-ink2)' },
  titre: { margin: '6px 0 0', fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 32, lineHeight: 1.15, paddingRight: 48 },
  texte: { margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--t-ink2)' },
  coordonnees: { display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 10 },
  coord: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--t-ink2)', textDecoration: 'none' },
  erreur: {
    marginBottom: 14, padding: '12px 14px', borderRadius: 6, fontSize: 14, lineHeight: 1.5,
    background: 'var(--t-danger-soft)', color: 'var(--t-danger)', border: '1px solid var(--t-danger)',
  },
  sousTitre: { margin: '0 0 10px', fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 20 },
  puces: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  puce: {
    minWidth: 46, height: 46, borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 16, fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--t-line)',
    background: 'var(--t-surface)', color: 'var(--t-ink)',
  },
  puceActive: { borderColor: 'var(--t-accent)', background: 'var(--t-accent)', color: 'var(--t-on-accent)' },
  jours: { display: 'flex', gap: 6, paddingBottom: 4, marginBottom: 10, overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  jour: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, flexShrink: 0,
    minWidth: 52, minHeight: 56, padding: '6px 4px', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--t-line)',
    background: 'var(--t-surface)', color: 'var(--t-ink)',
  },
  jourActif: { borderColor: 'var(--t-accent)', background: 'var(--t-accent)', color: 'var(--t-on-accent)' },
  jourFerme: { opacity: 0.4, cursor: 'not-allowed', background: 'transparent' },
  autreDate: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--t-ink2)', marginBottom: 20 },
  champDate: {
    minHeight: 40, padding: '6px 12px', borderRadius: 6, border: '1px solid var(--t-line)',
    background: 'var(--t-surface)', color: 'var(--t-ink)', fontFamily: 'var(--font)', fontSize: 14,
  },
  service: { fontSize: 14, fontWeight: 600, color: 'var(--t-ink)', marginBottom: 8 },
  creneaux: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))', gap: 8 },
  creneau: {
    minHeight: 46, borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 15, fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--t-line)',
    background: 'var(--t-surface)', color: 'var(--t-ink)',
  },
  creneauActif: { borderColor: 'var(--t-accent)', background: 'var(--t-accent)', color: 'var(--t-on-accent)' },
  aucun: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12,
    padding: '12px 16px', borderRadius: 6, border: '1px dashed var(--t-line)', color: 'var(--t-ink2)', fontSize: 14,
  },
  recap: {
    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18,
    padding: '14px 16px', borderRadius: 8, background: 'var(--t-surface)', border: '1px solid var(--t-line)',
  },
  grille2: { display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' },
  champ: {
    width: '100%', boxSizing: 'border-box', minHeight: 46, padding: '10px 14px', borderRadius: 6,
    border: '1px solid var(--t-line)', background: 'var(--t-surface)', color: 'var(--t-ink)',
    fontFamily: 'var(--font)', fontSize: 16,
  },
  piege: { position: 'absolute', left: -10000, top: 'auto', width: 1, height: 1, overflow: 'hidden' },
  principal: {
    ...bouton, width: '100%', minHeight: 52, fontSize: 16, border: 'none',
    background: 'var(--t-accent)', color: 'var(--t-on-accent)',
  },
  secondaire: {
    ...bouton, minHeight: 44, padding: '10px 20px',
    border: '1px solid var(--t-line)', background: 'var(--t-surface)', color: 'var(--t-ink)',
  },
  lien: {
    ...bouton, fontSize: 14, minHeight: 40, padding: '6px 4px', border: 'none', background: 'none', color: 'var(--t-accent)',
  },
  bon: { margin: '18px 0', padding: 0, borderTop: '1px solid var(--t-line)' },
  bonLigne: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12,
    padding: '10px 0', borderBottom: '1px solid var(--t-line)',
  },
  bonLabel: { margin: 0, fontSize: 14, color: 'var(--t-ink2)' },
  bonValeur: { margin: 0, fontSize: 15, fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums', minWidth: 0, overflowWrap: 'anywhere' },
};
