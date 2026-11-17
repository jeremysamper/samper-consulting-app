import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, MapPin, Phone, X } from 'lucide-react';
import './reservationTable.css';

// ─────────────────────────────────────────────────────────────────────────────
// Réservation d'une table en ligne, vue par le visiteur (module Prévisions).
//
// Même principe que la réservation d'un soin (ReservationEnLigne.jsx), dans
// l'ordre d'un appel au restaurant : combien, quand, puis les coordonnées.
// Selon le réglage du restaurant, la réservation est confirmée tout de suite
// ou arrive « À confirmer » dans le module Prévisions.
//
// Apparence : celle de l'app (cartes blanches à grand rayon et ombre douce,
// pilules, aplat sombre pour le choix en cours), avec ses jetons à elle :
// la page n'embarque pas app.css. États et mouvements : reservationTable.css.
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
// Espace fine insécable devant « ? » : le signe ne part jamais seul à la ligne.
const FINE = '\u202f';

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
const mouvementReduit = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Décalage d'entrée des éléments d'une liste, borné : la dernière heure
// arrive vite même quand il y en a vingt.
const delai = (i, pas = 22) => ({ '--rt-delai': `${Math.min(i * pas, 260)}ms` });

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

// Jetons de la page : les valeurs de l'app (bloc :root et bloc sombre
// d'app.css), recopiées ici parce que la page vit seule. Accent repris du
// site du client, avec un texte lisible dessus.
function jetons(theme, hex) {
  const accent = hex || ACCENT_DEFAUT;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(accent.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const clair = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) > 0.45;
  const sombre = theme === 'dark';
  return {
    '--t-bg': sombre ? '#071319' : '#e8ebee',
    '--t-surface': sombre ? '#11252e' : '#ffffff',
    '--t-piste': sombre ? '#0c1c24' : '#eef1f4',
    '--t-ink': sombre ? '#e9f1f4' : '#10191d',
    '--t-ink2': sombre ? '#b5c5cc' : '#47535a',
    '--t-ink3': sombre ? '#95a9b1' : '#57636a',
    '--t-line': sombre ? '#223a45' : '#d6dce0',
    '--t-champ': sombre ? '#66838f' : '#b4bdc4',
    '--t-btn-bord': sombre ? '#4f6d79' : '#c2cad0',
    '--t-selection': sombre ? '#1b3540' : '#dae1e6',
    '--t-sh': sombre ? '0 2px 8px rgba(0, 0, 0, 0.5)' : '0 1px 2px rgba(9, 30, 40, 0.04), 0 8px 24px rgba(9, 30, 40, 0.06)',
    '--t-focus': sombre ? '#74aec3' : '#12587a',
    '--t-accent': sombre && !hex ? '#74aec3' : accent,
    '--t-on-accent': sombre && !hex ? '#06202b' : (clair ? '#10191d' : '#ffffff'),
    '--t-ok': sombre ? '#86d6a0' : '#116530',
    '--t-ok-soft': sombre ? 'rgba(134, 214, 160, 0.14)' : '#dcfce7',
    '--t-danger': sombre ? '#fb8f8f' : '#a11616',
    '--t-danger-soft': sombre ? 'rgba(251, 143, 143, 0.12)' : '#fee2e2',
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
  const bandeJours = useRef(null);

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

  // Le jour choisi glisse dans la bande quand il était caché (jour suivant,
  // autre date). La bande seule défile : jamais la page ni le site parent.
  useEffect(() => {
    const bande = bandeJours.current;
    const bouton = bande?.querySelector('[aria-selected="true"]');
    if (!bande || !bouton) return;
    const gauche = bouton.offsetLeft; // la bande est positionnée : repère des boutons
    if (gauche < bande.scrollLeft || gauche + bouton.offsetWidth > bande.scrollLeft + bande.clientWidth) {
      bande.scrollTo({ left: Math.max(0, gauche - 8), behavior: mouvementReduit() ? 'auto' : 'smooth' });
    }
  }, [date, etape]);

  function allerA(nouvelle) {
    setEtape(nouvelle);
    setErreur(null);
    haut.current?.scrollIntoView({ block: 'start', behavior: mouvementReduit() ? 'auto' : 'smooth' });
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
  const cleCreneaux = `${date}|${couverts}`;
  const services = creneaux.cle === cleCreneaux ? creneaux.services : [];
  const aucuneHeure = !creneaux.chargement && creneaux.cle === cleCreneaux && !services.some((x) => x.creneaux.length);

  return (
    <div className="rt-racine" style={racine} ref={haut}>
      <main style={s.colonne}>
        {parametres.mode === 'modal' && (
          <button type="button" className="rt-bouton rt-secondaire" onClick={() => prevenirParent('fermer')} aria-label="Fermer" style={s.fermer}>
            <X size={20} strokeWidth={1.8} aria-hidden="true" />
          </button>
        )}

        {etatChargement === 'chargement' && (
          <div aria-live="polite" aria-label="Chargement" style={s.chargement}>
            <div className="rt-squelette" style={{ width: 140, height: 14 }} />
            <div className="rt-squelette" style={{ width: 260, height: 30, marginTop: 10 }} />
            <div className="rt-squelette" style={{ height: 150, borderRadius: 20, marginTop: 28 }} />
            <div className="rt-squelette" style={{ height: 130, borderRadius: 20, marginTop: 16 }} />
          </div>
        )}
        {etatChargement === 'ferme' && (
          <div className="rt-entree" style={s.carte}>
            <h1 style={s.titreCarte}>Réservation en ligne</h1>
            <p style={{ ...s.texte, marginTop: 8 }}>La réservation en ligne n'est pas ouverte pour le moment. Contactez directement le restaurant pour réserver.</p>
          </div>
        )}
        {etatChargement === 'erreur' && (
          <div className="rt-entree" style={s.carte}>
            <h1 style={s.titreCarte}>Un instant…</h1>
            <p style={{ ...s.texte, marginTop: 8 }}>La réservation n'a pas pu se charger. Vérifiez votre connexion et rechargez la page.</p>
          </div>
        )}

        {etatChargement === 'pret' && infos && (
          <>
            <header className="rt-entree" style={s.entete}>
              <div style={s.surTitre}>Réserver une table</div>
              <h1 style={s.titre} data-no-translate>{infos.etablissement?.nom}</h1>
              {infos.message && <p style={{ ...s.texte, marginTop: 8 }}>{infos.message}</p>}
              {(infos.etablissement?.adresse || tel) && (
                <div style={s.coordonnees}>
                  {infos.etablissement?.adresse && (
                    <span style={s.pastille}><MapPin size={14} strokeWidth={1.8} aria-hidden="true" /> {infos.etablissement.adresse}</span>
                  )}
                  {tel && (
                    <a href={lienTel} className="rt-pastille" style={{ ...s.pastille, color: 'var(--t-ink)' }}>
                      <Phone size={14} strokeWidth={1.8} aria-hidden="true" /> {tel}
                    </a>
                  )}
                </div>
              )}
            </header>

            {etape !== 'envoye' && <Avancement etape={etape} />}

            {erreur && <div key={erreur} role="alert" className="rt-apparait" style={s.erreur}>{erreur}</div>}

            {/* ── 1. Combien et quand ── */}
            {etape === 'moment' && (
              <section key="moment" style={s.pile}>
                <div className="rt-entree" style={{ ...s.carte, '--rt-delai': '60ms' }}>
                  <h2 style={s.titreCarte}>Combien serez-vous{FINE}?</h2>
                  <div style={s.puces} role="radiogroup" aria-label="Nombre de personnes">
                    {Array.from({ length: Math.min(max, 10) }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={couverts === n}
                        aria-label={personnes(n)}
                        data-actif={couverts === n ? '1' : undefined}
                        className="rt-choix rt-puce"
                        onClick={() => { setChoix(null); setCouverts(n); }}
                      >
                        {n}
                      </button>
                    ))}
                    {max > 10 && (
                      <select
                        aria-label="Plus de 10 personnes"
                        value={couverts > 10 ? couverts : ''}
                        data-actif={couverts > 10 ? '1' : undefined}
                        className="rt-choix rt-puce rt-puce-liste"
                        onChange={(e) => { if (e.target.value) { setChoix(null); setCouverts(Number(e.target.value)); } }}
                      >
                        <option value="">11+</option>
                        {Array.from({ length: max - 10 }, (_, i) => i + 11).map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    )}
                  </div>
                  <p style={s.note}>
                    Plus de {personnes(max)}{FINE}?{' '}
                    {lienTel ? <a href={lienTel} style={{ color: 'var(--t-ink)', textUnderlineOffset: 3 }}>Appelez-nous</a> : 'Contactez-nous'} pour un groupe.
                  </p>
                </div>

                <div className="rt-entree" style={{ ...s.carte, '--rt-delai': '120ms' }}>
                  <h2 style={s.titreCarte}>Quel jour{FINE}?</h2>
                  <div ref={bandeJours} className="rt-jours" role="listbox" aria-label="Jour" style={{ position: 'relative' }}>
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
                          data-actif={actif ? '1' : undefined}
                          className="rt-choix rt-jour"
                          onClick={() => choisirJour(iso)}
                        >
                          <span className="rt-jour-nom">{iso === infos.aujourdhui ? 'Auj.' : JOURS_COURTS[jourIso(iso)]}</span>
                          <span className="rt-jour-num">{d}</span>
                        </button>
                      );
                    })}
                  </div>
                  <label style={s.autreDate}>
                    Autre date
                    <input
                      type="date"
                      className="rt-champ"
                      value={date || ''}
                      min={infos.aujourdhui}
                      max={decaler(infos.aujourdhui, infos.horizonJours || 60)}
                      onChange={(e) => e.target.value && choisirJour(e.target.value)}
                      style={s.champDate}
                    />
                  </label>
                </div>

                <div className="rt-entree" style={{ ...s.carte, '--rt-delai': '180ms' }}>
                  <h2 style={s.titreCarte}>{date ? `${jourLong(date)}, à quelle heure${FINE}?` : `À quelle heure${FINE}?`}</h2>
                  <div aria-live="polite" style={{ marginTop: 16 }}>
                    {creneaux.chargement && (
                      <div aria-label="Recherche des tables libres">
                        <div className="rt-squelette" style={{ width: 60, height: 14, marginBottom: 10 }} />
                        <div className="rt-creneaux">
                          {Array.from({ length: 8 }, (_, i) => <div key={i} className="rt-squelette" style={{ animationDelay: `${i * 60}ms` }} />)}
                        </div>
                      </div>
                    )}
                    {aucuneHeure && (
                      <div className="rt-apparait" style={s.aucun}>
                        <span>Plus de table en ligne ce jour-là pour {personnes(couverts)}.</span>
                        <button type="button" className="rt-bouton rt-secondaire" onClick={jourSuivantOuvert} style={{ minHeight: 40, padding: '0 16px', fontSize: 14 }}>
                          Voir le jour suivant
                        </button>
                      </div>
                    )}
                    {!creneaux.chargement && !aucuneHeure && services.map((x, iService) => (
                      <div key={`${cleCreneaux}|${x.service}`} style={{ marginTop: iService ? 20 : 0 }}>
                        <div className="rt-apparait" style={{ ...s.service, ...delai(iService, 80) }}>{SERVICES[x.service] || x.service}</div>
                        {x.creneaux.length ? (
                          <div className="rt-creneaux">
                            {x.creneaux.map((h, i) => (
                              <button
                                key={h}
                                type="button"
                                data-actif={choix?.service === x.service && choix?.heure === h ? '1' : undefined}
                                className="rt-choix rt-creneau rt-apparait"
                                style={delai(i + iService * 4)}
                                onClick={() => { setChoix({ service: x.service, heure: h }); allerA('coordonnees'); }}
                              >
                                {h}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="rt-apparait" style={{ ...s.texte, fontSize: 14 }}>{x.complet ? 'Complet' : 'Plus d\'heure disponible'}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* ── 2. Les coordonnées ── */}
            {etape === 'coordonnees' && choix && (
              <form key="coordonnees" onSubmit={envoyer} noValidate style={s.pile}>
                <Recap date={date} choix={choix} couverts={couverts} onModifier={() => allerA('moment')} />
                <div className="rt-entree" style={{ ...s.carte, '--rt-delai': '80ms' }}>
                  <h2 style={s.titreCarte}>Vos coordonnées</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
                    <div style={s.grille2}>
                      <Champ label="Prénom" id="t-prenom">
                        <input id="t-prenom" className="rt-champ" autoComplete="given-name" style={s.champ} value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} required />
                      </Champ>
                      <Champ label="Nom" id="t-nom">
                        <input id="t-nom" className="rt-champ" autoComplete="family-name" style={s.champ} value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} required />
                      </Champ>
                    </div>
                    <div style={s.grille2}>
                      <Champ label="E-mail" id="t-email">
                        <input id="t-email" className="rt-champ" type="email" inputMode="email" autoComplete="email" style={s.champ} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                      </Champ>
                      <Champ label="Téléphone" id="t-tel">
                        <input id="t-tel" className="rt-champ" type="tel" inputMode="tel" autoComplete="tel" style={s.champ} value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} required />
                      </Champ>
                    </div>
                    <Champ label="Un mot pour le restaurant (facultatif)" id="t-message">
                      <textarea id="t-message" className="rt-champ" style={{ ...s.champ, minHeight: 84, resize: 'vertical' }} value={form.message} placeholder="Allergie, anniversaire, chaise haute…" onChange={(e) => setForm({ ...form, message: e.target.value })} />
                    </Champ>

                    <label htmlFor="t-actus" style={s.accord}>
                      <input
                        id="t-actus"
                        type="checkbox"
                        checked={form.actus}
                        onChange={(e) => setForm({ ...form, actus: e.target.checked })}
                        style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0, accentColor: 'var(--t-accent)' }}
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

                    <p style={{ ...s.texte, fontSize: 12, color: 'var(--t-ink3)' }}>
                      Vos coordonnées servent à gérer votre réservation avec <span data-no-translate>{infos.etablissement?.nom}</span>{form.actus ? ' et à vous envoyer ses actualités' : ''}. Elles ne sont transmises à personne.
                    </p>

                    <button type="submit" disabled={envoi} className="rt-bouton rt-principal" style={{ ...s.principal, opacity: envoi ? 0.75 : 1 }}>
                      {envoi && <span className="rt-roue" aria-hidden="true" />}
                      {envoi ? 'Envoi…' : auto ? 'Réserver' : 'Envoyer ma demande'}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* ── Envoyée ── */}
            {etape === 'envoye' && choix && (
              <section key="envoye" className="rt-entree" style={{ ...s.carte, padding: '32px 24px 24px' }} aria-live="polite">
                <svg className="rt-coche" width="56" height="56" viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block', marginBottom: 16 }}>
                  <circle cx="12" cy="12" r="12" fill="var(--t-ok-soft)" />
                  <path d="M7.5 12.4l3 3 6-6.4" pathLength="1" fill="none" stroke="var(--t-ok)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <h2 style={{ ...s.titre, fontSize: 24, paddingRight: 0, margin: '0 0 6px' }}>
                  {resultat === 'confirmee' ? 'Table réservée' : 'Demande envoyée'}
                </h2>
                <p style={s.texte}>
                  {resultat === 'confirmee'
                    ? <>Merci {form.prenom.trim()}, votre réservation est bien prise en compte.</>
                    : <>Merci {form.prenom.trim()}, votre demande de réservation est bien prise en compte.</>}
                </p>
                {/* Le bon de réservation, tel que le restaurant le notera. */}
                <dl style={s.bon}>
                  {[
                    ['Table pour', personnes(couverts)],
                    ['Le', jourLong(date)],
                    ['À', choix.heure],
                    ['Au nom de', `${form.prenom.trim()} ${form.nom.trim()}`],
                  ].map(([label, valeur], i, liste) => (
                    <div key={label} className="rt-apparait" style={{ ...s.bonLigne, ...delai(i + 4, 60), ...(i === liste.length - 1 ? { borderBottomWidth: 0 } : null) }}>
                      <dt style={s.bonLabel}>{label}</dt>
                      <dd style={s.bonValeur} data-no-translate={label === 'Au nom de' ? true : undefined}>{valeur}</dd>
                    </div>
                  ))}
                </dl>
                <button type="button" onClick={recommencer} className="rt-bouton rt-secondaire" style={{ minHeight: 44, padding: '0 20px' }}>
                  Faire une autre réservation
                </button>
              </section>
            )}
          </>
        )}

        <footer style={{ marginTop: 28, textAlign: 'center' }}>
          <a href="/confidentialite/" target="_blank" rel="noopener" style={{ fontSize: 12, color: 'var(--t-ink3)' }} data-no-translate="">
            Confidentialité
          </a>
        </footer>
      </main>
    </div>
  );
}

// Deux étapes avant l'envoi : une barre fine par étape, remplie en douceur.
function Avancement({ etape }) {
  const deuxieme = etape === 'coordonnees';
  return (
    <div className="rt-entree" style={{ ...s.avancement, '--rt-delai': '30ms' }} aria-label={deuxieme ? 'Étape 2 sur 2' : 'Étape 1 sur 2'}>
      {[['Le moment', true], ['Vos coordonnées', deuxieme]].map(([libelle, fait]) => (
        <div key={libelle} style={{ flex: 1, minWidth: 0 }}>
          <div className="rt-barre"><span style={{ transform: `scaleX(${fait ? 1 : 0})` }} /></div>
          <div style={{ ...s.etapeLibelle, color: fait ? 'var(--t-ink)' : 'var(--t-ink3)' }}>{libelle}</div>
        </div>
      ))}
    </div>
  );
}

function Champ({ label, id, aide, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <label htmlFor={id} style={{ fontSize: 14, fontWeight: 500, color: 'var(--t-ink)' }}>{label}</label>
      {children}
      {aide && <span style={{ fontSize: 12, color: 'var(--t-ink3)' }}>{aide}</span>}
    </div>
  );
}

// Le choix en cours, en aplat sombre (couleur d'action du site) : c'est ce
// que le visiteur confirme en remplissant ses coordonnées.
function Recap({ date, choix, couverts, onModifier }) {
  return (
    <div className="rt-entree" style={s.recap}>
      <div style={{ minWidth: 0, flex: '1 1 auto' }}>
        <div style={{ fontSize: 12, opacity: 0.78 }}>Votre table</div>
        <div style={{ fontSize: 24, fontWeight: 400, lineHeight: 1.2, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{personnes(couverts)}</div>
        <div style={{ fontSize: 14, marginTop: 2, opacity: 0.86 }}>{jourLong(date)}, {choix.heure}</div>
      </div>
      <button type="button" onClick={onModifier} className="rt-bouton rt-inverse" style={{ flexShrink: 0, minHeight: 40, padding: '0 16px', fontSize: 14 }}>
        <ArrowLeft size={15} strokeWidth={2} aria-hidden="true" /> Changer
      </button>
    </div>
  );
}

const carte = {
  padding: '20px 20px 22px', borderRadius: 20, background: 'var(--t-surface)',
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--t-line)', boxShadow: 'var(--t-sh)',
};

const s = {
  racine: {
    minHeight: '100vh', background: 'var(--t-bg)', color: 'var(--t-ink)', padding: '32px 16px 40px',
    fontFamily: 'var(--font)', fontSize: 15,
  },
  colonne: { position: 'relative', maxWidth: 620, margin: '0 auto' },
  fermer: { position: 'absolute', top: -6, right: 0, width: 44, height: 44, padding: 0, color: 'var(--t-ink2)', zIndex: 1 },
  chargement: { paddingTop: 4 },
  carte,
  pile: { display: 'flex', flexDirection: 'column', gap: 16 },
  entete: { marginBottom: 20 },
  surTitre: { fontSize: 14, color: 'var(--t-ink3)' },
  titre: { margin: '4px 0 0', fontFamily: 'var(--font)', fontWeight: 500, fontSize: 29, lineHeight: 1.15, letterSpacing: '-0.01em', paddingRight: 52 },
  titreCarte: { margin: 0, fontFamily: 'var(--font)', fontWeight: 600, fontSize: 17, lineHeight: 1.3 },
  texte: { margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--t-ink2)' },
  note: { margin: '12px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--t-ink3)' },
  coordonnees: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  pastille: {
    display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 32, padding: '0 12px', borderRadius: 999,
    background: 'var(--t-surface)', color: 'var(--t-ink2)', fontSize: 13, textDecoration: 'none',
    transition: 'background-color 0.18s ease',
  },
  avancement: { display: 'flex', gap: 10, marginBottom: 16 },
  etapeLibelle: { fontSize: 12, marginTop: 6, transition: 'color 0.3s ease' },
  erreur: {
    marginBottom: 16, padding: '12px 16px', borderRadius: 14, fontSize: 14, lineHeight: 1.5,
    background: 'var(--t-danger-soft)', color: 'var(--t-danger)',
  },
  puces: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 16 },
  autreDate: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--t-ink2)', marginTop: 8 },
  champDate: {
    minHeight: 40, padding: '6px 14px', borderRadius: 999,
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--t-champ)',
    background: 'var(--t-surface)', color: 'var(--t-ink)', fontFamily: 'var(--font)', fontSize: 14,
  },
  service: { fontSize: 14, fontWeight: 500, color: 'var(--t-ink2)', marginBottom: 10 },
  aucun: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
    padding: '14px 16px', borderRadius: 14, background: 'var(--t-piste)', color: 'var(--t-ink2)', fontSize: 14,
  },
  recap: {
    display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
    padding: '20px 20px 20px 22px', borderRadius: 24, background: 'var(--t-accent)', color: 'var(--t-on-accent)',
    boxShadow: 'var(--t-sh)',
  },
  grille2: { display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' },
  champ: {
    width: '100%', boxSizing: 'border-box', minHeight: 46, padding: '10px 14px', borderRadius: 14,
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--t-champ)',
    background: 'var(--t-surface)', color: 'var(--t-ink)', fontFamily: 'var(--font)', fontSize: 16,
  },
  accord: { display: 'flex', alignItems: 'flex-start', gap: 10, minHeight: 44, cursor: 'pointer' },
  piege: { position: 'absolute', left: -10000, top: 'auto', width: 1, height: 1, overflow: 'hidden' },
  principal: { width: '100%', minHeight: 52, fontSize: 16, marginTop: 4 },
  bon: { margin: '20px 0', padding: '4px 16px', borderRadius: 14, background: 'var(--t-piste)' },
  bonLigne: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12,
    padding: '12px 0', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--t-line)',
  },
  bonLabel: { margin: 0, fontSize: 14, color: 'var(--t-ink2)' },
  bonValeur: { margin: 0, fontSize: 15, fontWeight: 500, textAlign: 'right', fontVariantNumeric: 'tabular-nums', minWidth: 0, overflowWrap: 'anywhere' },
};
