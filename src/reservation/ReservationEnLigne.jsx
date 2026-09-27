import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, CalendarCheck, Check, Clock, MapPin, Phone, X,
} from 'lucide-react';
import { Champ, dureeLisible, formatPrix, st } from '../modules/spa/spaUi.jsx';
import '../modules/spa/spa.css';

// ─────────────────────────────────────────────────────────────────────────────
// Réservation en ligne d'un spa, vue par le visiteur.
//
// Trois étapes, dans l'ordre d'une conversation au téléphone : le soin, le
// moment, les coordonnées. La demande part « à confirmer » : le spa répond par
// e-mail. Paiement sur place.
//
// Paramètres d'adresse :
//   /reserver/<adresse>  ou  ?spa=<adresse>   quel spa
//   mode=modal | integre                        affichée par widget-spa.js
//   accent=RRGGBB                               couleur du site du client
//   theme=light | dark                          clair par défaut
// La page parle à la fenêtre parente (widget) par postMessage : hauteur du
// contenu, fermeture, demande envoyée. Rien de personnel dans ces messages.
// ─────────────────────────────────────────────────────────────────────────────

const URL_FONCTION = `${import.meta.env.VITE_SUPABASE_URL || 'https://ppmtoiqgajwcdkbnrcll.supabase.co'}/functions/v1/spa-mailer`;
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const EMAIL_OK = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function lireParametres() {
  const q = new URLSearchParams(window.location.search);
  const chemin = window.location.pathname.match(/\/reserver\/([a-z0-9-]+)\/?$/i);
  const accent = (q.get('accent') || '').replace('#', '');
  return {
    slug: (chemin?.[1] || q.get('spa') || '').toLowerCase(),
    mode: ['modal', 'integre'].includes(q.get('mode')) ? q.get('mode') : 'page',
    accent: /^[0-9a-f]{6}$/i.test(accent) ? `#${accent}` : null,
    theme: q.get('theme') === 'dark' ? 'dark' : 'light',
  };
}

// Dates en ISO, calculées en UTC pour ne dépendre ni du fuseau ni de l'heure
// du visiteur : « aujourd'hui » vient du serveur (heure de Zurich).
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
  try { window.parent.postMessage({ source: 'spa-reservation', type, valeur }, '*'); } catch { /* parent fermé */ }
}

// Couleur d'accent du site du client : texte blanc ou foncé selon sa clarté.
function variablesAccent(hex) {
  if (!hex) return {};
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return {
    '--spa-mizu': hex,
    '--spa-mizu-strong': hex,
    '--spa-mizu-soft': `color-mix(in srgb, ${hex} 12%, var(--spa-surface))`,
    '--spa-on-mizu': luminance > 0.45 ? '#1d2422' : '#ffffff',
  };
}

export default function ReservationEnLigne() {
  const parametres = useMemo(lireParametres, []);
  const [infos, setInfos] = useState(null);
  const [etatChargement, setEtatChargement] = useState('chargement'); // chargement | pret | ferme | erreur
  const [etape, setEtape] = useState('soin'); // soin | moment | coordonnees | envoye
  const [soin, setSoin] = useState(null);
  const [date, setDate] = useState(null);
  const [creneaux, setCreneaux] = useState({ date: null, liste: [], chargement: false });
  const [heure, setHeure] = useState(null);
  const [form, setForm] = useState({ prenom: '', nom: '', email: '', telephone: '', message: '', consentement: false, dateNaissance: '', siteWeb: '' });
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);
  const debutSaisie = useRef(performance.now());
  const haut = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = parametres.theme;
    if (!parametres.slug) { setEtatChargement('ferme'); return; }
    appeler('public_infos', { slug: parametres.slug })
      .then(({ ok, statut, corps }) => {
        if (ok) { setInfos(corps); setEtatChargement('pret'); document.title = `Réserver un soin, ${corps.etablissement?.nom || 'spa'}`; }
        else setEtatChargement(statut === 404 ? 'ferme' : 'erreur');
      })
      .catch(() => setEtatChargement('erreur'));
  }, [parametres]);

  // Hauteur transmise au widget (mode intégré : l'iframe suit le contenu).
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => prevenirParent('hauteur', Math.ceil(document.documentElement.scrollHeight)));
    ro.observe(document.body);
    return () => ro.disconnect();
  }, []);

  const jours = useMemo(() => {
    if (!infos) return [];
    const ouverts = new Set((infos.joursOuverts || []).map((j) => j % 7)); // ISO 7 (dimanche) → 0
    const n = Math.min(21, (infos.horizonJours || 60) + 1);
    return Array.from({ length: n }, (_, i) => {
      const iso = decaler(infos.aujourdhui, i);
      return { iso, ouvert: ouverts.has(jourIso(iso)) };
    });
  }, [infos]);

  const chargerCreneaux = useCallback(async (s, iso) => {
    setCreneaux({ date: iso, liste: [], chargement: true });
    const { ok, corps } = await appeler('public_creneaux', { slug: parametres.slug, soinId: s.id, date: iso }).catch(() => ({ ok: false, corps: {} }));
    setCreneaux({ date: iso, liste: ok ? corps.creneaux || [] : [], chargement: false });
    if (!ok) setErreur(corps.error || 'Les créneaux n\'ont pas pu être chargés. Réessayez.');
  }, [parametres.slug]);

  function allerA(nouvelle) {
    setEtape(nouvelle);
    setErreur(null);
    haut.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function choisirSoin(s) {
    setSoin(s);
    setHeure(null);
    const premier = jours.find((j) => j.ouvert)?.iso || infos.aujourdhui;
    const iso = date && jours.some((j) => j.iso === date && j.ouvert) ? date : premier;
    setDate(iso);
    chargerCreneaux(s, iso);
    allerA('moment');
  }

  function choisirJour(iso) {
    setDate(iso);
    setHeure(null);
    chargerCreneaux(soin, iso);
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
      const { ok, statut, corps } = await appeler('public_reserver', {
        slug: parametres.slug, soinId: soin.id, date, heure,
        prenom: f.prenom, nom: f.nom, email: f.email, telephone: f.telephone, message: f.message,
        consentement: f.consentement, dateNaissance: f.consentement ? f.dateNaissance : '',
        siteWeb: f.siteWeb, dureeSaisie: Math.round(performance.now() - debutSaisie.current),
      });
      if (ok) {
        allerA('envoye');
        prevenirParent('envoyee');
        return;
      }
      setErreur(corps.error || 'La demande n\'a pas pu être envoyée. Réessayez.');
      if (statut === 409) {
        setHeure(null);
        chargerCreneaux(soin, date);
        setEtape('moment');
      }
    } catch {
      setErreur('Connexion impossible. Vérifiez votre réseau et réessayez.');
    } finally {
      setEnvoi(false);
    }
  }

  function recommencer() {
    setSoin(null); setHeure(null); setDate(null);
    setForm((p) => ({ ...p, message: '' }));
    debutSaisie.current = performance.now();
    allerA('soin');
  }

  const integre = parametres.mode === 'integre';
  const racine = {
    ...s.racine,
    ...(integre ? { background: 'transparent', padding: '8px 4px 16px', minHeight: 0 } : null),
    ...variablesAccent(parametres.accent),
  };

  return (
    <div className="spa" style={racine} ref={haut}>
      <main style={s.colonne}>
        {parametres.mode === 'modal' && (
          <button type="button" onClick={() => prevenirParent('fermer')} aria-label="Fermer" style={s.fermer}>
            <X size={20} strokeWidth={1.8} aria-hidden="true" />
          </button>
        )}

        {etatChargement === 'chargement' && <div style={s.chargement} aria-live="polite">Chargement…</div>}
        {etatChargement === 'ferme' && (
          <div style={s.carteVide}>
            <h1 style={s.titre}>Réservation en ligne</h1>
            <p style={s.texte}>La réservation en ligne n'est pas ouverte pour le moment. Contactez directement le spa pour prendre rendez-vous.</p>
          </div>
        )}
        {etatChargement === 'erreur' && (
          <div style={s.carteVide}>
            <h1 style={s.titre}>Un instant…</h1>
            <p style={s.texte}>La réservation n'a pas pu se charger. Vérifiez votre connexion et rechargez la page.</p>
          </div>
        )}

        {etatChargement === 'pret' && infos && (
          <>
            <header style={{ marginBottom: 18 }}>
              <div style={st.surTitre}>Réserver un soin</div>
              <h1 style={s.titre} data-no-translate>{infos.etablissement?.nom}</h1>
              {infos.message && <p style={{ ...s.texte, marginTop: 6 }}>{infos.message}</p>}
              {(infos.etablissement?.adresse || infos.etablissement?.tel) && (
                <div style={s.coordonnees}>
                  {infos.etablissement?.adresse && <span style={s.coord}><MapPin size={14} strokeWidth={1.8} aria-hidden="true" /> {infos.etablissement.adresse}</span>}
                  {infos.etablissement?.tel && (
                    <a href={`tel:${infos.etablissement.tel.replace(/\s+/g, '')}`} style={{ ...s.coord, color: 'var(--spa-ink2)' }}>
                      <Phone size={14} strokeWidth={1.8} aria-hidden="true" /> {infos.etablissement.tel}
                    </a>
                  )}
                </div>
              )}
            </header>

            {etape !== 'envoye' && <Etapes etape={etape} />}

            {erreur && <div role="alert" style={{ ...st.encartDanger, marginBottom: 14 }}>{erreur}</div>}

            {/* ── 1. Le soin ── */}
            {etape === 'soin' && (
              <ChoixSoin soins={infos.soins || []} onChoisir={choisirSoin} />
            )}

            {/* ── 2. Le moment ── */}
            {etape === 'moment' && soin && (
              <section>
                <Recap soin={soin} onModifier={() => allerA('soin')} libelleModifier="Changer de soin" />
                <h2 style={s.sousTitre}>Quel jour ?</h2>
                <div className="spa-defile" style={s.jours} role="listbox" aria-label="Jour">
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
                    style={{ ...st.champ, width: 'auto', minHeight: 40, borderRadius: 999 }}
                  />
                </label>

                <h2 style={s.sousTitre}>{date ? `${jourLong(date)}, à quelle heure ?` : 'À quelle heure ?'}</h2>
                <div aria-live="polite">
                  {creneaux.chargement && <div style={s.texte}>Recherche des créneaux libres…</div>}
                  {!creneaux.chargement && creneaux.date === date && !creneaux.liste.length && (
                    <div style={s.aucun}>
                      <span>Plus de créneau libre ce jour-là.</span>
                      <button type="button" onClick={jourSuivantOuvert} style={st.lien}>Voir le jour suivant</button>
                    </div>
                  )}
                  {!creneaux.chargement && creneaux.liste.length > 0 && (
                    <div style={s.creneaux}>
                      {creneaux.liste.map((h) => (
                        <button
                          key={h}
                          type="button"
                          onClick={() => { setHeure(h); allerA('coordonnees'); }}
                          style={{ ...s.creneau, ...(heure === h ? s.creneauActif : null) }}
                        >
                          {h}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ── 3. Les coordonnées ── */}
            {etape === 'coordonnees' && soin && heure && (
              <form onSubmit={envoyer} noValidate>
                <Recap soin={soin} date={date} heure={heure} onModifier={() => allerA('moment')} libelleModifier="Changer l'horaire" />
                <h2 style={s.sousTitre}>Vos coordonnées</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={st.grille2}>
                    <Champ label="Prénom" htmlFor="r-prenom">
                      <input id="r-prenom" autoComplete="given-name" style={st.champ} value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} required />
                    </Champ>
                    <Champ label="Nom" htmlFor="r-nom">
                      <input id="r-nom" autoComplete="family-name" style={st.champ} value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} required />
                    </Champ>
                  </div>
                  <div style={st.grille2}>
                    <Champ label="E-mail" htmlFor="r-email" aide="La confirmation vous sera envoyée ici.">
                      <input id="r-email" type="email" inputMode="email" autoComplete="email" style={st.champ} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                    </Champ>
                    <Champ label="Téléphone" htmlFor="r-tel">
                      <input id="r-tel" type="tel" inputMode="tel" autoComplete="tel" style={st.champ} value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} required />
                    </Champ>
                  </div>
                  <Champ label="Un mot pour le spa (facultatif)" htmlFor="r-message">
                    <textarea id="r-message" style={{ ...st.zone, minHeight: 70 }} value={form.message} placeholder="Allergie, grossesse, préférence de praticien…" onChange={(e) => setForm({ ...form, message: e.target.value })} />
                  </Champ>

                  {/* Champ piège : invisible pour un humain, rempli par les robots. */}
                  <div aria-hidden="true" style={s.piege}>
                    <label htmlFor="r-site">Site web</label>
                    <input id="r-site" tabIndex={-1} autoComplete="off" value={form.siteWeb} onChange={(e) => setForm({ ...form, siteWeb: e.target.value })} />
                  </div>

                  <label style={{ ...st.caseLabel, padding: 14, borderRadius: 'var(--spa-r)', background: 'var(--spa-surface2)', border: '1px solid var(--spa-line)' }}>
                    <input type="checkbox" checked={form.consentement} onChange={(e) => setForm({ ...form, consentement: e.target.checked })} style={st.case} />
                    <span>
                      J'accepte de recevoir les nouvelles du spa et une attention le jour de mon anniversaire.
                      <span style={{ display: 'block', fontSize: 13, color: 'var(--spa-ink2)', marginTop: 2 }}>Facultatif. Désinscription possible depuis chaque e-mail.</span>
                    </span>
                  </label>
                  {form.consentement && (
                    <Champ label="Date de naissance (facultatif)" htmlFor="r-naissance">
                      <input id="r-naissance" type="date" max={infos.aujourdhui} style={{ ...st.champ, maxWidth: 240 }} value={form.dateNaissance} onChange={(e) => setForm({ ...form, dateNaissance: e.target.value })} />
                    </Champ>
                  )}

                  <p style={{ ...s.texte, fontSize: 12 }}>
                    Vos coordonnées servent uniquement à gérer votre rendez-vous avec <span data-no-translate>{infos.etablissement?.nom}</span>. Elles ne sont transmises à personne. Paiement sur place.
                  </p>

                  <button type="submit" disabled={envoi} style={{ ...st.principal, width: '100%', minHeight: 52, fontSize: 16, opacity: envoi ? 0.6 : 1 }}>
                    <CalendarCheck size={19} strokeWidth={1.8} aria-hidden="true" />
                    {envoi ? 'Envoi…' : 'Envoyer ma demande'}
                  </button>
                </div>
              </form>
            )}

            {/* ── Demande envoyée ── */}
            {etape === 'envoye' && soin && (
              <section style={{ ...s.carteVide, textAlign: 'center' }} aria-live="polite">
                <span aria-hidden="true" style={s.succesIcone}><Check size={28} strokeWidth={2} /></span>
                <h2 style={{ ...s.titre, fontSize: 26 }}>Demande envoyée</h2>
                <p style={s.texte}>
                  Merci {form.prenom.trim()}. Nous vous confirmons le rendez-vous par e-mail à <strong style={{ color: 'var(--spa-ink)' }}>{form.email.trim()}</strong>.
                </p>
                <div style={{ ...s.recap, justifyContent: 'center', textAlign: 'left', margin: '16px 0' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18 }} data-no-translate>{soin.nom}</div>
                    <div style={{ fontSize: 14, color: 'var(--spa-ink2)' }}>{jourLong(date)}, {heure} ({dureeLisible(soin.dureeMin)})</div>
                  </div>
                </div>
                <button type="button" onClick={recommencer} style={st.secondaire}>Réserver un autre soin</button>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Etapes({ etape }) {
  const liste = [['soin', 'Soin'], ['moment', 'Moment'], ['coordonnees', 'Coordonnées']];
  const rang = liste.findIndex(([id]) => id === etape);
  return (
    <ol style={s.etapes} aria-label="Étapes de la réservation">
      {liste.map(([id, label], i) => {
        const fait = i < rang;
        const actif = i === rang;
        return (
          <li key={id} style={{ ...s.etape, color: actif ? 'var(--spa-ink)' : 'var(--spa-ink2)' }} aria-current={actif ? 'step' : undefined}>
            <span aria-hidden="true" style={{ ...s.numero, ...(actif || fait ? s.numeroActif : null) }}>
              {fait ? <Check size={13} strokeWidth={2.4} /> : i + 1}
            </span>
            <span style={{ fontWeight: actif ? 600 : 500 }}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function ChoixSoin({ soins, onChoisir }) {
  const familles = [...new Set(soins.map((x) => x.categorie || ''))];
  if (!soins.length) {
    return <div style={s.carteVide}><p style={s.texte}>Aucun soin n'est proposé en ligne pour le moment. Contactez directement le spa.</p></div>;
  }
  return (
    <section>
      {familles.map((f) => (
        <div key={f || 'sans'} style={{ marginBottom: 20 }}>
          {familles.length > 1 && <h2 style={s.famille}>{f || 'Autres soins'}</h2>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {soins.filter((x) => (x.categorie || '') === f).map((x) => (
              <button key={x.id} type="button" onClick={() => onChoisir(x)} className="spa-carte-action" style={s.soin}>
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12, width: '100%', alignItems: 'baseline' }}>
                  <span style={{ fontFamily: 'var(--font-serif)', fontSize: 19, lineHeight: 1.25 }} data-no-translate>{x.nom}</span>
                  {x.prix !== null && <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--spa-kin)', whiteSpace: 'nowrap' }}>{formatPrix(x.prix)}</span>}
                </span>
                {x.description && <span style={{ fontSize: 14, color: 'var(--spa-ink2)', lineHeight: 1.5 }} data-no-translate>{x.description}</span>}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--spa-mizu)', fontWeight: 600 }}>
                  <Clock size={14} strokeWidth={2} aria-hidden="true" /> {dureeLisible(x.dureeMin)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function Recap({ soin, date, heure, onModifier, libelleModifier }) {
  return (
    <div style={s.recap}>
      <div style={{ minWidth: 0, flex: '1 1 auto' }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, lineHeight: 1.25 }} data-no-translate>{soin.nom}</div>
        <div style={{ fontSize: 14, color: 'var(--spa-ink2)' }}>
          {date && heure ? `${jourLong(date)}, ${heure} ` : ''}
          ({dureeLisible(soin.dureeMin)}{soin.prix !== null ? `, ${formatPrix(soin.prix)}` : ''})
        </div>
      </div>
      <button type="button" onClick={onModifier} style={{ ...st.lien, flexShrink: 0 }}>
        <ArrowLeft size={15} strokeWidth={2} aria-hidden="true" /> {libelleModifier}
      </button>
    </div>
  );
}

const s = {
  racine: { minHeight: '100vh', background: 'var(--spa-bg)', color: 'var(--spa-ink)', padding: '28px 16px 40px' },
  colonne: { position: 'relative', maxWidth: 620, margin: '0 auto' },
  fermer: {
    position: 'absolute', top: -8, right: 0, width: 44, height: 44, borderRadius: 22, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--spa-surface)', color: 'var(--spa-ink2)', border: '1px solid var(--spa-line)',
  },
  chargement: { padding: '60px 0', textAlign: 'center', color: 'var(--spa-ink2)' },
  carteVide: {
    padding: '28px 22px', borderRadius: 'var(--spa-r-lg)', background: 'var(--spa-surface)',
    border: '1px solid var(--spa-line)', boxShadow: 'var(--spa-shadow)',
  },
  titre: { margin: '6px 0 0', fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 32, lineHeight: 1.15, paddingRight: 48 },
  texte: { margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--spa-ink2)' },
  coordonnees: { display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 10 },
  coord: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--spa-ink2)', textDecoration: 'none' },
  etapes: { listStyle: 'none', margin: '0 0 18px', padding: 0, display: 'flex', gap: 16, flexWrap: 'wrap' },
  etape: { display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14 },
  numero: {
    width: 24, height: 24, borderRadius: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 700, background: 'var(--spa-sunken)', color: 'var(--spa-ink2)',
  },
  numeroActif: { background: 'var(--spa-mizu)', color: 'var(--spa-on-mizu)' },
  famille: {
    margin: '0 0 10px', fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--spa-ink2)',
  },
  soin: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, width: '100%', textAlign: 'left',
    padding: '16px 18px', borderRadius: 'var(--spa-r)', cursor: 'pointer',
    background: 'var(--spa-surface)', border: '1px solid var(--spa-line)', boxShadow: 'var(--spa-shadow)',
    color: 'var(--spa-ink)', fontFamily: 'var(--font)',
  },
  recap: {
    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18,
    padding: '14px 16px', borderRadius: 'var(--spa-r)', background: 'var(--spa-surface)', border: '1px solid var(--spa-line)',
  },
  sousTitre: { margin: '0 0 10px', fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 20 },
  jours: { display: 'flex', gap: 6, paddingBottom: 4, marginBottom: 10 },
  jour: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, flexShrink: 0,
    minWidth: 52, minHeight: 56, padding: '6px 4px', borderRadius: 12, cursor: 'pointer', fontFamily: 'var(--font)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spa-line)',
    background: 'var(--spa-surface)', color: 'var(--spa-ink)',
  },
  jourActif: { borderColor: 'var(--spa-mizu)', background: 'var(--spa-mizu)', color: 'var(--spa-on-mizu)' },
  jourFerme: { opacity: 0.4, cursor: 'not-allowed', background: 'transparent' },
  autreDate: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--spa-ink2)', marginBottom: 20 },
  creneaux: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))', gap: 8 },
  creneau: {
    minHeight: 46, borderRadius: 999, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 15, fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spa-line)',
    background: 'var(--spa-surface)', color: 'var(--spa-ink)',
  },
  creneauActif: { borderColor: 'var(--spa-mizu)', background: 'var(--spa-mizu)', color: 'var(--spa-on-mizu)' },
  aucun: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
    padding: '12px 16px', borderRadius: 'var(--spa-r)', border: '1px dashed var(--spa-line2)', color: 'var(--spa-ink2)', fontSize: 14,
  },
  piege: { position: 'absolute', left: -10000, top: 'auto', width: 1, height: 1, overflow: 'hidden' },
  succesIcone: {
    width: 60, height: 60, borderRadius: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--spa-matcha-soft)', color: 'var(--spa-matcha)', marginBottom: 6,
  },
};
