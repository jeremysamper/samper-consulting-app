import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen, Check, CircleCheck, Code2, Copy, Download, ExternalLink, Globe, Link2, Mail, Plus, QrCode, Send,
  Trash2, UserRound,
} from 'lucide-react';
import { notify } from '../../components/toast/index.js';
import { useSpaParametres } from './spaData.js';
import { Champ, EtatVide, Puce, TitreSection, st } from './spaUi.jsx';
import {
  COULEUR_DEFAUT, codeBouton, codeIntegre, lienGmail, lienGuide, lienMailto, lienReservation, messageWebmaster,
} from './integration.js';

// ─────────────────────────────────────────────────────────────────────────────
// Réservation en ligne (direction : consultant et patron).
//
// Le spa ouvre ses créneaux sur son propre site : une ligne de code à coller
// (bouton « Réserver un soin » qui ouvre la réservation par-dessus le site, ou
// réservation intégrée dans la page). Les visiteurs choisissent un soin et un
// créneau ; leur demande arrive dans l'agenda « à confirmer ».
//
// Un créneau est proposé s'il tient dans les horaires du jour, après le délai
// minimal, et si au moins un praticien « en ligne » est libre sur toute la
// durée du soin (calcul et réservation côté serveur, spa-mailer).
// ─────────────────────────────────────────────────────────────────────────────

const JOURS = [
  [1, 'Lundi'], [2, 'Mardi'], [3, 'Mercredi'], [4, 'Jeudi'], [5, 'Vendredi'], [6, 'Samedi'], [7, 'Dimanche'],
];
const HORAIRES_DEFAUT = Object.fromEntries([1, 2, 3, 4, 5, 6].map((j) => [String(j), [{ de: '09:00', a: '19:00' }]]));

function versSlug(nom) {
  return String(nom || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
}
const SLUG_OK = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export default function ReglagesEnLigne({ etablissement, soins, praticiens, onModifierSoin }) {
  const etabId = etablissement?.id;
  const { parametres, status, enregistrer } = useSpaParametres(etabId);
  const [form, setForm] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [nouveauPraticien, setNouveauPraticien] = useState('');
  const [couleur, setCouleur] = useState(COULEUR_DEFAUT);
  const [qr, setQr] = useState(null);
  const slugForm = form?.slug || '';

  // Premier réglage : adresse tirée du nom, semaine type lundi-samedi 9 h-19 h.
  useEffect(() => {
    if (status !== 'ready') return;
    setForm({
      ...parametres,
      slug: parametres.slug || versSlug(etablissement?.nom),
      horaires: Object.keys(parametres.horaires || {}).length ? parametres.horaires : HORAIRES_DEFAUT,
    });
  }, [parametres, status, etablissement?.nom]);

  // QR code du lien de réservation (carte en cabine, flyer, vitrine). La
  // bibliothèque n'est chargée qu'ici.
  useEffect(() => {
    if (!SLUG_OK.test(slugForm)) { setQr(null); return undefined; }
    let vivant = true;
    const minuterie = setTimeout(async () => {
      try {
        const lib = await import('qrcode');
        const versDataUrl = lib.toDataURL || lib.default?.toDataURL;
        const url = await versDataUrl(lienReservation(slugForm), { margin: 2, width: 1024, color: { dark: '#25302c', light: '#ffffff' } });
        if (vivant) setQr(url);
      } catch (e) {
        console.error('[spa] QR code', e);
        if (vivant) setQr(null);
      }
    }, 300);
    return () => { vivant = false; clearTimeout(minuterie); };
  }, [slugForm]);

  const soinsActifs = useMemo(() => soins.filter((x) => x.actif), [soins]);
  const praticiensConnus = useMemo(
    () => [...new Set([...(praticiens || []), ...((form?.praticiensEnLigne) || [])])].sort((a, b) => a.localeCompare(b, 'fr')),
    [praticiens, form?.praticiensEnLigne]
  );

  if (status === 'absent') return <div style={st.encartAttention}>Base de données du module non installée.</div>;
  if (!form) return <div style={{ color: 'var(--spa-ink2)', fontSize: 14 }}>Chargement…</div>;

  const set = (cle, valeur) => setForm((p) => ({ ...p, [cle]: valeur }));
  const slugValide = SLUG_OK.test(form.slug || '');
  const joursOuverts = Object.values(form.horaires || {}).filter((pl) => (pl || []).some((x) => x.de && x.a && x.de < x.a)).length;
  const soinsEnLigne = soinsActifs.filter((x) => x.enLigne).length;
  const checklist = [
    { ok: slugValide, texte: 'Une adresse de réservation' },
    { ok: form.praticiensEnLigne.length > 0, texte: 'Au moins un praticien ouvert en ligne' },
    { ok: joursOuverts > 0, texte: 'Au moins un jour d\'ouverture' },
    { ok: soinsEnLigne > 0, texte: 'Au moins un soin réservable en ligne' },
  ];
  const pret = checklist.every((c) => c.ok);
  const modifie = JSON.stringify(form) !== JSON.stringify({
    ...parametres,
    slug: parametres.slug || versSlug(etablissement?.nom),
    horaires: Object.keys(parametres.horaires || {}).length ? parametres.horaires : HORAIRES_DEFAUT,
  });
  const publie = parametres.enLigneActif && parametres.slug;
  const lienPage = lienReservation(form.slug);
  const apercu = `${window.location.origin}/reserver/${form.slug}`;
  const guide = lienGuide(form.slug, couleur);
  const slugModifie = Boolean(parametres.slug) && form.slug !== parametres.slug;
  const mailWebmaster = messageWebmaster({ nomSpa: etablissement?.nom, slug: form.slug, couleur });

  function telechargerQr() {
    if (!qr) return;
    const a = document.createElement('a');
    a.href = qr;
    a.download = `reservation-${form.slug}-qr.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function majJour(jour, plages) {
    setForm((p) => ({ ...p, horaires: { ...p.horaires, [String(jour)]: plages } }));
  }

  function ajouterPraticien() {
    const nom = nouveauPraticien.trim();
    if (!nom) return;
    if (!form.praticiensEnLigne.some((x) => x.toLowerCase() === nom.toLowerCase())) {
      set('praticiensEnLigne', [...form.praticiensEnLigne, nom]);
    }
    setNouveauPraticien('');
  }

  async function sauver(activer = form.enLigneActif) {
    if (!slugValide) { notify('Adresse invalide : lettres minuscules, chiffres et tirets (3 à 40 caractères).', 'error'); return; }
    if (activer && !pret) { notify('Complétez la liste avant d\'ouvrir la réservation en ligne.', 'error'); return; }
    setEnCours(true);
    try {
      const { error } = await enregistrer({ ...form, enLigneActif: activer }, 'en_ligne');
      if (error) { notify(error, 'error'); return; }
      notify(activer ? 'Réservation en ligne ouverte.' : 'Réglages enregistrés.', 'success');
    } finally {
      setEnCours(false);
    }
  }

  async function copier(texte, message = 'Copié. Collez-le sur le site du spa.') {
    try {
      await navigator.clipboard.writeText(texte);
      notify(message, 'success');
    } catch {
      notify('Copie impossible : sélectionnez le texte et copiez-le à la main.', 'warning');
    }
  }

  async function basculerSoin(x) {
    const { error } = await onModifierSoin(x.id, { en_ligne: !x.enLigne });
    if (error) notify(error, 'error');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ── État ── */}
      <div style={{ ...s.etat, ...(publie ? s.etatOuvert : null) }}>
        <span aria-hidden="true" style={{ ...s.etatIcone, color: publie ? 'var(--spa-matcha)' : 'var(--spa-ink2)' }}>
          <Globe size={22} strokeWidth={1.8} />
        </span>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20 }}>
            {publie ? 'La réservation en ligne est ouverte' : 'La réservation en ligne est fermée'}
          </div>
          <div style={{ fontSize: 14, color: 'var(--spa-ink2)', marginTop: 2 }}>
            {publie
              ? <>Les demandes arrivent dans l'agenda, « à confirmer ». Page : <a href={apercu} target="_blank" rel="noreferrer" style={{ color: 'var(--spa-mizu)' }} data-no-translate>{lienPage.replace('https://', '')}</a></>
              : 'Réglez les horaires et les praticiens, puis ouvrez-la : un bouton « Réserver un soin » apparaîtra sur le site du spa.'}
          </div>
        </div>
        {publie ? (
          <button type="button" onClick={() => sauver(false)} disabled={enCours} style={st.secondaire}>Fermer la réservation</button>
        ) : (
          <button type="button" onClick={() => sauver(true)} disabled={enCours || !pret} style={{ ...st.principal, opacity: enCours || !pret ? 0.55 : 1 }}>
            <Check size={18} strokeWidth={2} aria-hidden="true" /> Ouvrir la réservation
          </button>
        )}
      </div>

      {!publie && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {checklist.map((c) => (
            <Puce key={c.texte} icone={c.ok ? CircleCheck : null} ton={c.ok ? 'matcha' : 'neutre'}>{c.texte}</Puce>
          ))}
        </div>
      )}

      <div style={s.deuxColonnes}>
        {/* ── Réglages ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <div style={st.carte}>
            <TitreSection>Adresse de réservation</TitreSection>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, minWidth: 0 }}>
              <span style={s.prefixe} data-no-translate>samperconsulting-app.com/reserver/</span>
              <input
                aria-label="Adresse de réservation"
                style={{ ...st.champ, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, flex: '1 1 120px', minWidth: 0 }}
                value={form.slug}
                onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                autoComplete="off"
              />
            </div>
            <div style={st.aide}>{slugValide ? 'Lettres minuscules, chiffres et tirets.' : 'Entre 3 et 40 caractères : lettres minuscules, chiffres et tirets.'}</div>
          </div>

          <div style={st.carte}>
            <TitreSection>Horaires de réservation</TitreSection>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {JOURS.map(([jour, nom]) => {
                const plages = form.horaires[String(jour)] || [];
                const ouvert = plages.length > 0;
                return (
                  <div key={jour} style={s.jour}>
                    <label style={{ ...st.caseLabel, width: 130, flexShrink: 0, alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={ouvert}
                        onChange={(e) => majJour(jour, e.target.checked ? [{ de: '09:00', a: '19:00' }] : [])}
                        style={{ ...st.case, margin: 0 }}
                      />
                      <span style={{ fontWeight: 600 }}>{nom}</span>
                    </label>
                    {ouvert ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 auto', minWidth: 0 }}>
                        {plages.map((pl, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <input type="time" step="900" aria-label={`${nom}, ouverture`} value={pl.de} style={s.heure}
                              onChange={(e) => majJour(jour, plages.map((x, k) => (k === i ? { ...x, de: e.target.value } : x)))} />
                            <span style={{ color: 'var(--spa-ink2)', fontSize: 13 }}>à</span>
                            <input type="time" step="900" aria-label={`${nom}, fermeture`} value={pl.a} style={s.heure}
                              onChange={(e) => majJour(jour, plages.map((x, k) => (k === i ? { ...x, a: e.target.value } : x)))} />
                            {plages.length > 1 && (
                              <button type="button" onClick={() => majJour(jour, plages.filter((_, k) => k !== i))} aria-label={`Retirer cette plage du ${nom.toLowerCase()}`} style={{ ...st.discret, minHeight: 36, padding: '4px 8px' }}>
                                <Trash2 size={15} strokeWidth={1.8} aria-hidden="true" />
                              </button>
                            )}
                            {i === plages.length - 1 && plages.length < 2 && (
                              <button type="button" onClick={() => majJour(jour, [...plages, { de: '14:00', a: '19:00' }])} style={{ ...st.lien, minHeight: 36 }}>
                                <Plus size={14} strokeWidth={2} aria-hidden="true" /> Pause de midi
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : <span style={{ fontSize: 13, color: 'var(--spa-ink3)' }}>Fermé en ligne</span>}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={st.carte}>
            <TitreSection>Praticiens ouverts en ligne</TitreSection>
            <div style={{ fontSize: 13, color: 'var(--spa-ink2)', marginBottom: 10, lineHeight: 1.5 }}>
              Un créneau est proposé tant qu'au moins l'un d'eux est libre. Le premier libre est attribué à la demande ; vous pouvez le changer ensuite.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {praticiensConnus.map((x) => {
                const actif = form.praticiensEnLigne.includes(x);
                return (
                  <button key={x} type="button" aria-pressed={actif}
                    onClick={() => set('praticiensEnLigne', actif ? form.praticiensEnLigne.filter((y) => y !== x) : [...form.praticiensEnLigne, x])}
                    style={{ ...st.choix, ...(actif ? st.choixActif : null) }}>
                    <UserRound size={14} strokeWidth={1.8} aria-hidden="true" /> <span data-no-translate>{x}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                aria-label="Ajouter un praticien"
                placeholder="Ajouter un praticien"
                style={{ ...st.champ, flex: '1 1 auto', minWidth: 0 }}
                value={nouveauPraticien}
                onChange={(e) => setNouveauPraticien(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ajouterPraticien(); } }}
                autoComplete="off"
              />
              <button type="button" onClick={ajouterPraticien} style={st.secondaire}>Ajouter</button>
            </div>
          </div>

          <div style={st.carte}>
            <TitreSection>Règles</TitreSection>
            <div style={st.grille2}>
              <Champ label="Délai minimal" htmlFor="en-ligne-delai">
                <select id="en-ligne-delai" style={st.champ} value={form.delaiMinHeures} onChange={(e) => set('delaiMinHeures', Number(e.target.value))}>
                  {[0, 1, 2, 4, 12, 24, 48].map((h) => <option key={h} value={h}>{h === 0 ? 'Aucun' : `${h} h avant`}</option>)}
                </select>
              </Champ>
              <Champ label="Réservable jusqu'à" htmlFor="en-ligne-horizon">
                <select id="en-ligne-horizon" style={st.champ} value={form.horizonJours} onChange={(e) => set('horizonJours', Number(e.target.value))}>
                  {[14, 30, 60, 90, 180].map((j) => <option key={j} value={j}>{j} jours à l'avance</option>)}
                </select>
              </Champ>
              <Champ label="Créneaux toutes les" htmlFor="en-ligne-pas">
                <select id="en-ligne-pas" style={st.champ} value={form.pasMinutes} onChange={(e) => set('pasMinutes', Number(e.target.value))}>
                  {[15, 30, 60].map((m) => <option key={m} value={m}>{m === 60 ? '1 heure' : `${m} minutes`}</option>)}
                </select>
              </Champ>
            </div>
            <div style={{ marginTop: 14 }}>
              <Champ label="Message d'accueil" htmlFor="en-ligne-message" aide="Affiché en haut de la page de réservation.">
                <textarea id="en-ligne-message" style={{ ...st.zone, minHeight: 64 }} value={form.messageEnLigne} placeholder="Choisissez votre soin et votre moment, nous vous confirmons le rendez-vous par e-mail." onChange={(e) => set('messageEnLigne', e.target.value)} />
              </Champ>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => sauver()} disabled={enCours || !modifie} style={{ ...st.principal, opacity: enCours || !modifie ? 0.55 : 1 }}>
              Enregistrer les réglages
            </button>
          </div>
        </div>

        {/* ── Soins et intégration ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <div style={st.carte}>
            <TitreSection>Soins proposés en ligne</TitreSection>
            {!soinsActifs.length && <EtatVide texte="La carte des soins est vide : ajoutez d'abord vos soins dans l'onglet Carte des soins." />}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {soinsActifs.map((x) => (
                <label key={x.id} style={{ ...st.caseLabel, alignItems: 'center', padding: '4px 0' }}>
                  <input type="checkbox" checked={x.enLigne} onChange={() => basculerSoin(x)} style={{ ...st.case, margin: 0 }} />
                  <span style={{ flex: '1 1 auto', minWidth: 0 }} data-no-translate>{x.nom}</span>
                  <span style={{ fontSize: 13, color: 'var(--spa-ink2)' }}>{x.dureeMin} min</span>
                </label>
              ))}
            </div>
          </div>

          <div style={st.carte}>
            <TitreSection>Brancher sur le site du spa</TitreSection>
            {!publie && (
              <div style={{ ...st.encartInfo, marginBottom: 12, fontSize: 13 }}>
                Tout est prêt à partager, mais la page affichera « réservation fermée » tant que vous ne l'avez pas ouverte.
              </div>
            )}
            {slugModifie && (
              <div style={{ ...st.encartAttention, marginBottom: 12, fontSize: 13 }}>
                Adresse modifiée : enregistrez les réglages avant de partager le lien.
              </div>
            )}

            {/* ── Le lien : rien à installer ── */}
            <div style={s.bloc}>
              <div style={s.blocTitre}><Link2 size={16} strokeWidth={1.8} aria-hidden="true" style={{ color: 'var(--spa-mizu)' }} /> Le lien de réservation</div>
              <div style={s.blocTexte}>
                Rien à installer : il suffit de le mettre sur le bouton « Réserver » du site, sur Instagram ou sur la fiche Google du spa.
              </div>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 220px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={s.lienDirect} data-no-translate>{lienPage.replace('https://', '')}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => copier(lienPage, 'Lien copié.')} style={{ ...st.principal, minHeight: 40 }}>
                      <Copy size={15} strokeWidth={1.8} aria-hidden="true" /> Copier le lien
                    </button>
                    <a href={apercu} target="_blank" rel="noreferrer" style={{ ...st.secondaire, minHeight: 40, textDecoration: 'none', boxSizing: 'border-box' }}>
                      <ExternalLink size={15} strokeWidth={1.8} aria-hidden="true" /> Voir
                    </a>
                  </div>
                </div>
                <button type="button" onClick={telechargerQr} disabled={!qr} style={s.qr} aria-label="Télécharger le QR code de réservation">
                  {qr ? <img src={qr} alt="" width={84} height={84} style={{ display: 'block', borderRadius: 6 }} /> : <QrCode size={32} strokeWidth={1.5} aria-hidden="true" />}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}>
                    <Download size={13} strokeWidth={1.8} aria-hidden="true" /> QR code
                  </span>
                </button>
              </div>
            </div>

            {/* ── Envoi à la personne qui gère le site ── */}
            <div style={s.bloc}>
              <div style={s.blocTitre}><Send size={16} strokeWidth={1.8} aria-hidden="true" style={{ color: 'var(--spa-mizu)' }} /> Envoyer à la personne qui gère le site</div>
              <div style={s.blocTexte}>
                Un e-mail tout prêt avec le lien et un guide pas à pas (WordPress, Wix, Squarespace, Webflow…). Elle n'a plus qu'à suivre.
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <a href={lienGmail(mailWebmaster)} target="_blank" rel="noreferrer" style={{ ...st.secondaire, minHeight: 40, textDecoration: 'none', boxSizing: 'border-box' }}>
                  <Mail size={15} strokeWidth={1.8} aria-hidden="true" /> Préparer l'e-mail dans Gmail
                </a>
                <a href={lienMailto(mailWebmaster)} style={{ ...st.lien, minHeight: 40 }}>Autre messagerie</a>
                <button type="button" onClick={() => copier(guide, 'Lien du guide copié.')} style={{ ...st.lien, minHeight: 40 }}>
                  <BookOpen size={14} strokeWidth={1.8} aria-hidden="true" /> Copier le lien du guide
                </button>
              </div>
            </div>

            {/* ── Le code, pour installer soi-même ── */}
            <details style={{ marginTop: 4 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 14, minHeight: 40, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Code2 size={16} strokeWidth={1.8} aria-hidden="true" style={{ color: 'var(--spa-mizu)' }} /> Installer soi-même avec le code
              </summary>
              <div style={{ paddingTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                  <label htmlFor="en-ligne-couleur" style={{ fontSize: 13, color: 'var(--spa-ink2)' }}>Couleur du bouton</label>
                  <input id="en-ligne-couleur" type="color" value={couleur} onChange={(e) => setCouleur(e.target.value)} style={s.couleur} />
                  {couleur !== COULEUR_DEFAUT && (
                    <button type="button" onClick={() => setCouleur(COULEUR_DEFAUT)} style={{ ...st.lien, minHeight: 32 }}>Couleur par défaut</button>
                  )}
                </div>
                <BlocCode
                  titre="Bouton « Réserver un soin »"
                  texte="La réservation s'ouvre par-dessus le site, sans le quitter."
                  code={codeBouton(form.slug, couleur)}
                  onCopier={copier}
                />
                <BlocCode
                  titre="Réservation intégrée dans une page"
                  texte="Pour une page « Réserver » dédiée : la réservation s'affiche directement dans la page."
                  code={codeIntegre(form.slug, couleur)}
                  onCopier={copier}
                />
                <a href={guide} target="_blank" rel="noreferrer" style={{ ...st.lien, minHeight: 36 }}>
                  <BookOpen size={14} strokeWidth={1.8} aria-hidden="true" /> Où coller le code : le guide complet
                </a>
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}

function BlocCode({ titre, texte, code, onCopier }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14 }}>
        <Code2 size={16} strokeWidth={1.8} aria-hidden="true" style={{ color: 'var(--spa-mizu)' }} /> {titre}
      </div>
      <div style={{ fontSize: 13, color: 'var(--spa-ink2)', margin: '2px 0 8px' }}>{texte}</div>
      <div style={{ position: 'relative' }}>
        <pre style={s.code} data-no-translate>{code}</pre>
        <button type="button" onClick={() => onCopier(code)} style={s.copier}>
          <Copy size={14} strokeWidth={1.8} aria-hidden="true" /> Copier
        </button>
      </div>
    </div>
  );
}

const s = {
  etat: {
    display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
    padding: '18px 20px', borderRadius: 'var(--spa-r)', background: 'var(--spa-surface)',
    border: '1px solid var(--spa-line)', boxShadow: 'var(--spa-shadow)',
  },
  etatOuvert: { background: 'var(--spa-matcha-soft)' },
  etatIcone: {
    width: 48, height: 48, borderRadius: 24, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--spa-surface2)',
  },
  deuxColonnes: {
    display: 'grid', gap: 18, alignItems: 'start',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))',
  },
  prefixe: {
    flexShrink: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    padding: '0 10px', minHeight: 46, display: 'inline-flex', alignItems: 'center', boxSizing: 'border-box',
    fontSize: 13, color: 'var(--spa-ink2)', background: 'var(--spa-sunken)',
    border: '1px solid var(--spa-line)', borderRight: 'none', borderRadius: 'var(--spa-r-sm) 0 0 var(--spa-r-sm)',
  },
  jour: { display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', minWidth: 0 },
  heure: {
    padding: '6px 10px', minHeight: 38, borderRadius: 999, border: '1px solid var(--spa-line)',
    background: 'var(--spa-surface2)', color: 'var(--spa-ink)', fontFamily: 'var(--font)', fontSize: 14,
  },
  code: {
    margin: 0, padding: '12px 14px', paddingRight: 92, borderRadius: 'var(--spa-r-sm)', overflowX: 'auto',
    background: 'var(--spa-sunken)', border: '1px solid var(--spa-line)', color: 'var(--spa-ink)',
    fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace', fontSize: 12, lineHeight: 1.6,
    whiteSpace: 'pre-wrap', wordBreak: 'break-all',
  },
  copier: {
    position: 'absolute', top: 8, right: 8, display: 'inline-flex', alignItems: 'center', gap: 5,
    minHeight: 32, padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
    background: 'var(--spa-surface)', color: 'var(--spa-ink)', border: '1px solid var(--spa-line2)',
    fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)',
  },
  couleur: { width: 44, height: 32, padding: 0, border: '1px solid var(--spa-line)', borderRadius: 8, background: 'none', cursor: 'pointer' },
  bloc: { paddingBottom: 16, marginBottom: 16, borderBottom: '1px solid var(--spa-line)' },
  blocTitre: { display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14 },
  blocTexte: { fontSize: 13, color: 'var(--spa-ink2)', margin: '2px 0 10px', lineHeight: 1.5 },
  lienDirect: {
    padding: '10px 14px', borderRadius: 'var(--spa-r-sm)', background: 'var(--spa-sunken)', border: '1px solid var(--spa-line)',
    fontSize: 14, fontWeight: 600, color: 'var(--spa-ink)', overflowWrap: 'anywhere',
  },
  // Fond blanc dans les deux thèmes : un QR code se lit sur fond clair.
  qr: {
    display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, flexShrink: 0,
    width: 112, minHeight: 124, padding: 10, borderRadius: 'var(--spa-r-sm)', cursor: 'pointer',
    background: '#ffffff', color: '#25302c', border: '1px solid var(--spa-line)', fontFamily: 'var(--font)',
  },
};
