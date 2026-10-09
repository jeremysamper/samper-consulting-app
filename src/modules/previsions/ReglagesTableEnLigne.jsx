import { useEffect, useState } from 'react';
import BoiteEnvoiReservations from './BoiteEnvoiReservations.jsx';
import { notify } from '../../components/toast/index.js';
import { useBackLayer } from '../../hooks/useBackLayer.js';
import { formatDateLongue } from '../../utils/dateHelpers.js';
import { zurichToday } from '../../utils/zurichTime.js';
import {
  COULEUR_DEFAUT, SLUG_OK, codeBouton, codeIntegre, lienGmail, lienMailto, lienReservation, messageWebmaster,
  useParametresEnLigne, versSlug,
} from './reservationEnLigne.js';

// ─────────────────────────────────────────────────────────────────────────────
// Réservation d'une table en ligne : réglages (patron et consultant).
//
// Même principe que l'onglet « En ligne » du Spa : le restaurant choisit ses
// heures d'arrivée par service, le nombre de couverts qu'il ouvre en ligne et
// s'il confirme lui-même chaque réservation. Il partage ensuite un lien (ou un
// QR code, ou un bouton à coller sur son site).
//
// La capacité compte TOUTES les réservations du service, celles prises au
// téléphone comprises : c'est le seul chiffre qui évite de surbooker.
// ─────────────────────────────────────────────────────────────────────────────

const JOURS = [
  [1, 'Lundi'], [2, 'Mardi'], [3, 'Mercredi'], [4, 'Jeudi'], [5, 'Vendredi'], [6, 'Samedi'], [7, 'Dimanche'],
];
const SERVICES = [
  ['midi', 'Midi', { de: '12:00', a: '13:30' }],
  ['soir', 'Soir', { de: '19:00', a: '21:00' }],
  ['brunch', 'Brunch', { de: '10:00', a: '12:00' }],
];

const enMin = (hhmm) => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const enH = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const finDemiHeure = (h) => enH(enMin(h) + 29);

// Demi-heures couvertes par un service, tous jours confondus : de la
// demi-heure de la première arrivée à celle de la dernière.
function demiHeuresDuService(horaires, service) {
  let min = Infinity;
  let max = -Infinity;
  Object.values(horaires || {}).forEach((jour) => {
    const p = jour?.[service];
    if (p?.de && p?.a && p.de <= p.a) { min = Math.min(min, enMin(p.de)); max = Math.max(max, enMin(p.a)); }
  });
  if (!Number.isFinite(min)) return [];
  const liste = [];
  for (let t = Math.floor(min / 30) * 30; t <= max; t += 30) liste.push(enH(t));
  return liste;
}

export default function ReglagesTableEnLigne({ etablissement, onClose, consultant = false }) {
  const etabId = etablissement?.id;
  const { parametres, existe, status, enregistrer } = useParametresEnLigne(etabId);
  const [form, setForm] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [jourFerme, setJourFerme] = useState('');
  const [serviceFerme, setServiceFerme] = useState('jour');
  const [couleur, setCouleur] = useState(COULEUR_DEFAUT);
  const [qr, setQr] = useState(null);
  const slugForm = form?.slug || '';

  useBackLayer(true, onClose, 'reglages-resa-en-ligne');

  useEffect(() => {
    if (status !== 'ready' || !parametres) return;
    setForm({ ...parametres, slug: parametres.slug || versSlug(etablissement?.nom) });
  }, [parametres, status, etablissement?.nom]);

  // QR code du lien (carte, vitrine, table) ; bibliothèque chargée ici seulement.
  useEffect(() => {
    if (!SLUG_OK.test(slugForm)) { setQr(null); return undefined; }
    let vivant = true;
    const minuterie = setTimeout(async () => {
      try {
        const lib = await import('qrcode');
        const versDataUrl = lib.toDataURL || lib.default?.toDataURL;
        const url = await versDataUrl(lienReservation(slugForm), { margin: 2, width: 1024, color: { dark: '#003042', light: '#ffffff' } });
        if (vivant) setQr(url);
      } catch (e) {
        console.error('[resa en ligne] QR code', e);
        if (vivant) setQr(null);
      }
    }, 300);
    return () => { vivant = false; clearTimeout(minuterie); };
  }, [slugForm]);

  const set = (cle, valeur) => setForm((p) => ({ ...p, [cle]: valeur }));

  function majRythme(service, h, valeur) {
    setForm((p) => {
      const cases = { ...((p.rythme || {})[service] || {}) };
      if (valeur === '') delete cases[h]; else cases[h] = valeur;
      return { ...p, rythme: { ...(p.rythme || {}), [service]: cases } };
    });
  }

  function majCapaciteJour(jour, service, valeur) {
    setForm((p) => {
      const cases = { ...((p.capaciteJours || {})[String(jour)] || {}) };
      if (valeur === '') delete cases[service]; else cases[service] = valeur;
      return { ...p, capaciteJours: { ...(p.capaciteJours || {}), [String(jour)]: cases } };
    });
  }

  function majService(jour, service, valeur) {
    setForm((p) => {
      const jourActuel = { ...(p.horaires[String(jour)] || {}) };
      if (valeur) jourActuel[service] = valeur; else delete jourActuel[service];
      const horaires = { ...p.horaires };
      if (Object.keys(jourActuel).length) horaires[String(jour)] = jourActuel; else delete horaires[String(jour)];
      return { ...p, horaires };
    });
  }

  const contenu = (() => {
    if (status === 'absent') {
      return <div style={s.info}>La réservation en ligne n'est pas encore activée sur la base de données.</div>;
    }
    if (status === 'error') return <div style={s.erreur}>Les réglages n'ont pas pu être lus. Réessaie dans un instant.</div>;
    if (!form) return <div style={{ color: 'var(--text2)', fontSize: 13 }}>Chargement…</div>;

    const slugValide = SLUG_OK.test(form.slug || '');
    const joursOuverts = Object.values(form.horaires || {}).filter((j) => Object.values(j || {}).some((x) => x?.de && x?.a && x.de <= x.a)).length;
    const pret = slugValide && joursOuverts > 0;
    const publie = existe && parametres.enLigneActif && parametres.slug;
    const lienPage = lienReservation(form.slug);
    const apercu = `${window.location.origin}/table/${form.slug}`;
    const slugModifie = Boolean(parametres.slug) && form.slug !== parametres.slug;
    const mailWebmaster = messageWebmaster({ nomEtab: etablissement?.nom, slug: form.slug, couleur });
    const aujourdhui = zurichToday();

    async function sauver(activer = form.enLigneActif) {
      if (!slugValide) { notify('Adresse invalide : lettres minuscules, chiffres et tirets (3 à 40 caractères).', 'error'); return; }
      if (activer && !pret) { notify('Choisissez au moins un jour et un service avant d\'ouvrir la réservation.', 'error'); return; }
      const incoherent = Object.values(form.horaires || {}).some((j) => Object.values(j || {}).some((x) => x && x.de > x.a));
      if (incoherent) { notify('Une heure de fin est avant l\'heure de début : corrigez les horaires.', 'error'); return; }
      setEnCours(true);
      try {
        const { error } = await enregistrer({ ...form, enLigneActif: activer });
        if (error) { notify(error, 'error'); return; }
        notify(activer && !publie ? 'Réservation en ligne ouverte.' : !activer && publie ? 'Réservation en ligne fermée.' : 'Réglages enregistrés.', 'success');
      } finally {
        setEnCours(false);
      }
    }

    async function copier(texte, message = 'Copié.') {
      try {
        await navigator.clipboard.writeText(texte);
        notify(message, 'success');
      } catch {
        notify('Copie impossible : sélectionnez le texte et copiez-le à la main.', 'warning');
      }
    }

    function telechargerQr() {
      if (!qr) return;
      const a = document.createElement('a');
      a.href = qr;
      a.download = `reservation-${form.slug}-qr.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }

    // Fermeture d'une date : toute la journée (joursFermes) ou un seul
    // service (servicesFermes). Fermer la journée remplace les fermetures de
    // service de cette date.
    function ajouterJourFerme() {
      if (!jourFerme || jourFerme < aujourdhui) return;
      const services = { ...(form.servicesFermes || {}) };
      if (serviceFerme === 'jour') {
        delete services[jourFerme];
        setForm((p) => ({
          ...p,
          joursFermes: p.joursFermes.includes(jourFerme) ? p.joursFermes : [...p.joursFermes, jourFerme].sort(),
          servicesFermes: services,
        }));
      } else {
        if (form.joursFermes.includes(jourFerme)) { notify('Ce jour est déjà fermé toute la journée.', 'info'); return; }
        const deja = services[jourFerme] || [];
        services[jourFerme] = SERVICES.map(([sid]) => sid).filter((sid) => sid === serviceFerme || deja.includes(sid));
        set('servicesFermes', services);
      }
      setJourFerme('');
    }

    function retirerServiceFerme(date, service) {
      const services = { ...(form.servicesFermes || {}) };
      const reste = (services[date] || []).filter((x) => x !== service);
      if (reste.length) services[date] = reste; else delete services[date];
      set('servicesFermes', services);
    }

    // Services proposés au choix : midi et soir d'office, le brunch s'il
    // ouvre au moins un jour de la semaine.
    const servicesProposes = SERVICES.filter(([sid]) => sid === 'midi' || sid === 'soir'
      || Object.values(form.horaires || {}).some((j) => j?.[sid]?.de && j?.[sid]?.a));
    const rangService = (sid) => SERVICES.findIndex(([x]) => x === sid);
    const fermetures = [
      ...form.joursFermes.filter((d) => d >= aujourdhui).map((d) => ({ date: d, service: null })),
      ...Object.entries(form.servicesFermes || {}).filter(([d]) => d >= aujourdhui)
        .flatMap(([d, liste]) => (liste || []).map((service) => ({ date: d, service }))),
    ].sort((a, b) => a.date.localeCompare(b.date) || rangService(a.service) - rangService(b.service));
    const libelleService = (sid) => (SERVICES.find(([x]) => x === sid)?.[1] || sid).toLowerCase();

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* ── Boîte d'envoi : d'où partent les confirmations de réservation ── */}
        <BoiteEnvoiReservations etablissementId={etablissement?.id} consultant={consultant} />

        {/* ── État ── */}
        <div style={{ ...s.carte, ...(publie ? { background: 'var(--success-bg-soft)', borderColor: 'var(--success-bd)' } : null), display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)' }}>
              {publie ? 'La réservation en ligne est ouverte' : 'La réservation en ligne est fermée'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2, lineHeight: 1.5 }}>
              {publie
                ? <>Les réservations arrivent dans ce module{form.mode === 'demande' ? ', en « À confirmer »' : ', déjà confirmées'}. Votre page : <a href={apercu} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }} data-no-translate>{lienPage.replace('https://', '')}</a></>
                : 'Réglez vos horaires et vos couverts ci-dessous, puis ouvrez la réservation.'}
            </div>
          </div>
          {publie ? (
            <button type="button" onClick={() => sauver(false)} disabled={enCours} style={s.secondaire}>Fermer la réservation</button>
          ) : (
            <button type="button" onClick={() => sauver(true)} disabled={enCours || !pret} style={{ ...s.principal, opacity: enCours || !pret ? 0.55 : 1 }}>
              Ouvrir la réservation
            </button>
          )}
        </div>

        <div style={s.deuxColonnes}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            {/* ── Adresse ── */}
            <div style={s.carte}>
              <div style={s.titre}>Adresse de réservation</div>
              <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                <span style={s.prefixe} data-no-translate>samperconsulting-app.com/table/</span>
                <input
                  aria-label="Adresse de réservation"
                  style={{ ...s.champ, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, flex: '1 1 120px', minWidth: 0 }}
                  value={form.slug}
                  onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  autoComplete="off"
                />
              </div>
              <div style={s.aide}>{slugValide ? 'La fin de votre lien de réservation.' : 'Entre 3 et 40 caractères : lettres minuscules, chiffres et tirets seulement.'}</div>
            </div>

            {/* ── Confirmation ── */}
            <div style={s.carte}>
              <div style={s.titre}>Confirmation</div>
              {[
                ['demande', 'Je confirme chaque réservation', 'Elles arrivent « À confirmer » en tête du module. Le client reçoit la réponse par e-mail.'],
                ['auto', 'Confirmée tout de suite', 'Tant qu\'il reste des couverts ouverts en ligne, la table est réservée sans attendre.'],
              ].map(([id, titre, texte]) => (
                <label key={id} style={s.option}>
                  <input type="radio" name="mode-en-ligne" checked={form.mode === id} onChange={() => set('mode', id)} style={{ margin: '3px 0 0' }} />
                  <span>
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{titre}</span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>{texte}</span>
                  </span>
                </label>
              ))}
            </div>

            {/* ── Horaires ── */}
            <div style={s.carte}>
              <div style={s.titre}>Heures d'arrivée proposées</div>
              <div style={{ ...s.aide, marginTop: 0, marginBottom: 10 }}>Première et dernière heure à laquelle un client peut arriver, par service. Les mêmes heures sont proposées à l'équipe quand elle saisit une réservation, même si la réservation en ligne est désactivée.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {JOURS.map(([jour, nom]) => {
                  const services = form.horaires[String(jour)] || {};
                  return (
                    <div key={jour} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap', paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                      <div style={{ width: 84, flexShrink: 0, fontSize: 13, fontWeight: 700, color: 'var(--text)', paddingTop: 10 }}>{nom}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 220px', minWidth: 0 }}>
                        {SERVICES.map(([sid, libelle, defaut]) => {
                          const plage = services[sid];
                          return (
                            <div key={sid} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minHeight: 40 }}>
                              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 90, minHeight: 40, cursor: 'pointer', fontSize: 13, color: plage ? 'var(--text)' : 'var(--text3)' }}>
                                <input
                                  type="checkbox"
                                  checked={Boolean(plage)}
                                  onChange={(e) => majService(jour, sid, e.target.checked ? defaut : null)}
                                  style={{ width: 18, height: 18, margin: 0 }}
                                />
                                {libelle}
                              </label>
                              {plage && (
                                <>
                                  <input type="time" step="60" aria-label={`${nom}, ${libelle}, première arrivée`} value={plage.de} style={s.heure}
                                    onChange={(e) => majService(jour, sid, { ...plage, de: e.target.value })} />
                                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>à</span>
                                  <input type="time" step="60" aria-label={`${nom}, ${libelle}, dernière arrivée`} value={plage.a} style={s.heure}
                                    onChange={(e) => majService(jour, sid, { ...plage, a: e.target.value })} />
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            {/* ── Couverts ── */}
            <div style={s.carte}>
              <div style={s.titre}>Couverts</div>
              <div style={s.grille}>
                <Champ label="Au plus par service" aide="Réservations prises au téléphone comprises. Réglable jour par jour plus bas.">
                  <input type="number" min="1" max="2000" inputMode="numeric" style={s.champ} value={form.capaciteService}
                    onChange={(e) => set('capaciteService', e.target.value)} />
                </Champ>
                <Champ label="Au plus par demi-heure" aide="Arrivées entre hh:00 et hh:29, puis hh:30 et hh:59. Vide = pas de limite.">
                  <input type="number" min="1" max="2000" inputMode="numeric" style={s.champ} value={form.capaciteDemiHeure ?? ''}
                    onChange={(e) => set('capaciteDemiHeure', e.target.value === '' ? null : e.target.value)} />
                </Champ>
                <Champ label="Table la plus grande en ligne" aide="Au-delà, le client est invité à appeler.">
                  <input type="number" min="1" max="50" inputMode="numeric" style={s.champ} value={form.maxCouverts}
                    onChange={(e) => set('maxCouverts', e.target.value)} />
                </Champ>
              </div>
            </div>

            {/* ── Couverts jour par jour ── */}
            {joursOuverts > 0 && (
              <div style={s.carte}>
                <div style={s.titre}>Couverts jour par jour</div>
                <div style={{ ...s.aide, marginTop: 0, marginBottom: 10 }}>
                  Pour ouvrir moins (ou plus) certains jours : mercredi 40, jeudi 70…
                  Case vide = {form.capaciteService || '-'} (valeur par défaut) ; 0 = pas de réservation en ligne sur ce service ce jour-là.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {JOURS.map(([jour, nom]) => {
                    const services = SERVICES.filter(([sid]) => {
                      const p = (form.horaires[String(jour)] || {})[sid];
                      return p?.de && p?.a;
                    });
                    if (!services.length) return null;
                    const valeurs = (form.capaciteJours || {})[String(jour)] || {};
                    return (
                      <div key={jour} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minHeight: 44 }}>
                        <div style={{ width: 84, flexShrink: 0, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{nom}</div>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flex: '1 1 160px', minWidth: 0 }}>
                          {services.map(([sid, libelle]) => (
                            <label key={sid} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)' }}>
                              {libelle}
                              <input
                                type="number" min="0" max="2000" inputMode="numeric"
                                aria-label={`${nom}, ${libelle}, couverts au plus`}
                                placeholder={String(form.capaciteService || '')}
                                value={valeurs[sid] ?? ''}
                                onChange={(e) => majCapaciteJour(jour, sid, e.target.value)}
                                style={{ ...s.champ, width: 76, minHeight: 38, padding: '6px 8px', textAlign: 'center' }}
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Rythme du service ── */}
            {SERVICES.some(([sid]) => demiHeuresDuService(form.horaires, sid).length > 0) && (
              <div style={s.carte}>
                <div style={s.titre}>Rythme par demi-heure</div>
                <div style={{ ...s.aide, marginTop: 0, marginBottom: 10 }}>
                  Couverts qui peuvent arriver dans chaque demi-heure, réservations au téléphone comprises.
                  Case vide = {form.capaciteDemiHeure ? `${form.capaciteDemiHeure} (valeur par défaut)` : 'pas de limite'} ; 0 = pas de réservation en ligne sur cette demi-heure.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {SERVICES.map(([sid, libelle]) => {
                    const demiHeures = demiHeuresDuService(form.horaires, sid);
                    if (!demiHeures.length) return null;
                    const valeurs = (form.rythme || {})[sid] || {};
                    return (
                      <div key={sid}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{libelle}</div>
                        <div style={s.grilleRythme}>
                          {demiHeures.map((h) => (
                            <label key={h} style={s.caseRythme}>
                              <span style={{ fontSize: 12, color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>{h}</span>
                              <input
                                type="number" min="0" max="2000" inputMode="numeric"
                                aria-label={`${libelle}, couverts entre ${h} et ${finDemiHeure(h)}`}
                                placeholder={form.capaciteDemiHeure ? String(form.capaciteDemiHeure) : '-'}
                                value={valeurs[h] ?? ''}
                                onChange={(e) => majRythme(sid, h, e.target.value)}
                                style={{ ...s.champ, minHeight: 38, padding: '6px 8px', textAlign: 'center' }}
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Règles ── */}
            <div style={s.carte}>
              <div style={s.titre}>Règles</div>
              <div style={s.grille}>
                <Champ label="Délai minimal">
                  <select style={s.champ} value={form.delaiMinHeures} onChange={(e) => set('delaiMinHeures', Number(e.target.value))}>
                    {[0, 1, 2, 3, 4, 12, 24, 48].map((h) => <option key={h} value={h}>{h === 0 ? 'Aucun' : `${h} h avant`}</option>)}
                  </select>
                </Champ>
                <Champ label="Réservable jusqu'à">
                  <select style={s.champ} value={form.horizonJours} onChange={(e) => set('horizonJours', Number(e.target.value))}>
                    {[14, 30, 60, 90, 180, 365].map((j) => <option key={j} value={j}>{j} jours à l'avance</option>)}
                  </select>
                </Champ>
                <Champ label="Heures proposées toutes les" aide="En ligne et dans la saisie d'une réservation.">
                  <select style={s.champ} value={form.pasMinutes} onChange={(e) => set('pasMinutes', Number(e.target.value))}>
                    {[15, 30, 60].map((m) => <option key={m} value={m}>{m === 60 ? '1 heure' : `${m} minutes`}</option>)}
                  </select>
                </Champ>
              </div>
              <div style={{ marginTop: 12 }}>
                <Champ label="Message d'accueil" aide="Il s'affiche en haut de votre page de réservation.">
                  <textarea style={{ ...s.champ, minHeight: 64, resize: 'vertical' }} value={form.messageEnLigne}
                    placeholder="Terrasse ouverte dès les beaux jours. Pour un groupe, appelez-nous."
                    onChange={(e) => set('messageEnLigne', e.target.value)} />
                </Champ>
              </div>
            </div>

            {/* ── Jours fermés ── */}
            <div style={s.carte}>
              <div style={s.titre}>Jours de fermeture</div>
              <div style={{ ...s.aide, marginTop: 0, marginBottom: 8 }}>Vacances, privatisation : toute la journée, ou seulement le midi ou le soir. Rien n'est alors proposé en ligne sur ce moment-là.</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input type="date" aria-label="Jour de fermeture" min={aujourdhui} value={jourFerme} onChange={(e) => setJourFerme(e.target.value)} style={{ ...s.champ, width: 200, flex: '0 0 auto' }} />
                <select aria-label="Moment fermé" value={serviceFerme} onChange={(e) => setServiceFerme(e.target.value)} style={{ ...s.champ, width: 'auto', flex: '0 0 auto' }}>
                  <option value="jour">Toute la journée</option>
                  {servicesProposes.map(([sid, libelle]) => <option key={sid} value={sid}>{libelle} seulement</option>)}
                </select>
                <button type="button" onClick={ajouterJourFerme} disabled={!jourFerme} style={{ ...s.secondaire, opacity: jourFerme ? 1 : 0.55 }}>Ajouter</button>
              </div>
              {fermetures.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  {fermetures.map(({ date: d, service }) => {
                    const libelle = service ? `${formatDateLongue(d)}, ${libelleService(service)}` : formatDateLongue(d);
                    return (
                      <span key={`${d}|${service || 'jour'}`} style={s.puce}>
                        {libelle}
                        <button
                          type="button"
                          aria-label={`Retirer le ${libelle}`}
                          onClick={() => (service ? retirerServiceFerme(d, service) : set('joursFermes', form.joursFermes.filter((x) => x !== d)))}
                          style={s.puceX}
                        >×</button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={() => sauver()} disabled={enCours} style={{ ...s.principal, opacity: enCours ? 0.55 : 1 }}>
            Enregistrer les réglages
          </button>
        </div>

        {/* ── Partager ── */}
        <div style={s.carte}>
          <div style={s.titre}>Mettre la réservation sur votre site</div>
          {!publie && <div style={{ ...s.info, marginBottom: 10 }}>Vous pouvez déjà partager le lien. Tant que la réservation n'est pas ouverte, la page indique qu'elle est fermée.</div>}
          {slugModifie && <div style={{ ...s.attention, marginBottom: 10 }}>Adresse modifiée : enregistrez les réglages avant de partager le lien.</div>}

          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 240px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
                Collez ce lien sur le bouton « Réserver » de votre site, sur Google ou Instagram. Rien à installer.
              </div>
              <div style={s.lienDirect} data-no-translate>{lienPage.replace('https://', '')}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => copier(lienPage, 'Lien copié.')} style={s.principal}>Copier le lien</button>
                <a href={apercu} target="_blank" rel="noreferrer" style={{ ...s.secondaire, textDecoration: 'none', boxSizing: 'border-box' }}>Voir la page</a>
              </div>
            </div>
            <button type="button" onClick={telechargerQr} disabled={!qr} style={s.qr} aria-label="Télécharger le QR code de réservation">
              {qr ? <img src={qr} alt="" width={84} height={84} style={{ display: 'block', borderRadius: 6 }} /> : <span style={{ fontSize: 12 }}>QR code</span>}
              <span style={{ fontSize: 12, fontWeight: 600 }}>Télécharger</span>
            </button>
          </div>

          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Quelqu'un gère votre site ?</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', margin: '2px 0 8px', lineHeight: 1.5 }}>Envoyez-lui cet e-mail tout prêt, avec le lien et le code à coller.</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <a href={lienGmail(mailWebmaster)} target="_blank" rel="noreferrer" style={{ ...s.secondaire, textDecoration: 'none', boxSizing: 'border-box' }}>Préparer l'e-mail dans Gmail</a>
              <a href={lienMailto(mailWebmaster)} style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>Autre messagerie</a>
            </div>
          </div>

          <details style={{ marginTop: 14 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 13, minHeight: 40, display: 'flex', alignItems: 'center', color: 'var(--text)' }}>
              Le code, pour l'installer soi-même
            </summary>
            <div style={{ paddingTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                <label htmlFor="resa-couleur" style={{ fontSize: 12, color: 'var(--text2)' }}>Couleur du bouton</label>
                <input id="resa-couleur" type="color" value={couleur} onChange={(e) => setCouleur(e.target.value)} style={{ width: 44, height: 32, padding: 0, border: '1px solid var(--border)', borderRadius: 8, background: 'none', cursor: 'pointer' }} />
              </div>
              <BlocCode titre="Bouton « Réserver une table »" texte="Ouvre la réservation par-dessus le site, sans le quitter." code={codeBouton(form.slug, couleur)} onCopier={copier} />
              <BlocCode titre="Réservation dans une page" texte="La réservation affichée directement dans une page du site." code={codeIntegre(form.slug, couleur)} onCopier={copier} />
            </div>
          </details>
        </div>
      </div>
    );
  })();

  return (
    <div className="modal-full-overlay" style={s.voile} onClick={onClose}>
      <div className="modal-full" style={s.fenetre} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Réservation en ligne">
        <div style={s.entete}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', fontFamily: 'var(--font-serif)' }}>Réservation en ligne</div>
          <button type="button" onClick={onClose} aria-label="Fermer" style={s.fermer}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px 18px' }}>{contenu}</div>
      </div>
    </div>
  );
}

function Champ({ label, aide, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>{label}</span>
      {children}
      {aide && <span style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.4 }}>{aide}</span>}
    </label>
  );
}

function BlocCode({ titre, texte, code, onCopier }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{titre}</div>
      <div style={{ fontSize: 12, color: 'var(--text2)', margin: '2px 0 6px' }}>{texte}</div>
      <div style={{ position: 'relative' }}>
        <pre style={s.code} data-no-translate>{code}</pre>
        <button type="button" onClick={() => onCopier(code, 'Code copié.')} style={s.copier}>Copier</button>
      </div>
    </div>
  );
}

const s = {
  voile: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  fenetre: {
    background: 'var(--surface)', borderRadius: 14, width: 920, maxWidth: '100%', maxHeight: '90vh',
    display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  },
  entete: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    padding: '12px 18px', borderBottom: '1px solid var(--border)',
  },
  fermer: {
    width: 44, height: 44, border: 'none', background: 'none', fontSize: 22, lineHeight: 1,
    cursor: 'pointer', color: 'var(--text2)',
  },
  deuxColonnes: {
    display: 'grid', gap: 14, alignItems: 'start',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
  },
  carte: {
    padding: '14px 16px', borderRadius: 12, background: 'var(--bg)', minWidth: 0,
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
  },
  titre: { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text2)', marginBottom: 10 },
  aide: { fontSize: 12, color: 'var(--text3)', marginTop: 6, lineHeight: 1.5 },
  grille: { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))' },
  champ: {
    width: '100%', boxSizing: 'border-box', minHeight: 42, padding: '8px 12px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)',
    fontFamily: 'var(--font)', fontSize: 14,
  },
  heure: {
    minHeight: 38, padding: '4px 8px', borderRadius: 8, border: '1px solid var(--border)',
    background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 13,
  },
  prefixe: {
    flexShrink: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    padding: '0 10px', minHeight: 42, display: 'inline-flex', alignItems: 'center', boxSizing: 'border-box',
    fontSize: 12, color: 'var(--text2)', background: 'var(--surface)',
    border: '1px solid var(--border)', borderRight: 'none', borderRadius: '8px 0 0 8px',
  },
  grilleRythme: { display: 'grid', gap: 6, gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))' },
  caseRythme: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 0 },
  option: { display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', cursor: 'pointer' },
  principal: {
    padding: '9px 16px', minHeight: 42, borderRadius: 8, border: 'none', cursor: 'pointer',
    background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  },
  secondaire: {
    padding: '9px 16px', minHeight: 42, borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer',
    background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  },
  info: {
    padding: '10px 12px', borderRadius: 8, fontSize: 12, lineHeight: 1.5,
    background: 'var(--info-bg-soft)', border: '1px solid var(--info-bd)', color: 'var(--info-text)',
  },
  attention: {
    padding: '10px 12px', borderRadius: 8, fontSize: 12, lineHeight: 1.5,
    background: 'var(--warning-bg-soft)', border: '1px solid var(--warning-bd)', color: 'var(--warning-text)',
  },
  erreur: {
    padding: '10px 12px', borderRadius: 8, fontSize: 13,
    background: 'var(--danger-bg-soft)', border: '1px solid var(--danger-bd)', color: 'var(--danger-text)',
  },
  puce: {
    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 4px 2px 10px', borderRadius: 20,
    fontSize: 12, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)',
  },
  puceX: {
    width: 32, height: 32, border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--text2)',
  },
  lienDirect: {
    padding: '9px 12px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)',
    fontSize: 13, fontWeight: 600, color: 'var(--text)', overflowWrap: 'anywhere',
  },
  // Fond blanc dans les deux thèmes : un QR code se lit sur fond clair.
  qr: {
    display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, flexShrink: 0,
    width: 112, minHeight: 124, padding: 10, borderRadius: 10, cursor: 'pointer',
    background: '#ffffff', color: '#003042', border: '1px solid var(--border)', fontFamily: 'var(--font)',
  },
  code: {
    margin: 0, padding: '10px 12px', paddingRight: 80, borderRadius: 8, overflowX: 'auto',
    background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)',
    fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace', fontSize: 11, lineHeight: 1.6,
    whiteSpace: 'pre-wrap', wordBreak: 'break-all',
  },
  copier: {
    position: 'absolute', top: 6, right: 6, minHeight: 32, padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
    background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)',
    fontSize: 11, fontWeight: 600, fontFamily: 'var(--font)',
  },
};
