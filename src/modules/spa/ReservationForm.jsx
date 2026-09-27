import { useMemo, useState } from 'react';
import { Check, Clock, HeartPulse, Plus, Search, UserRound } from 'lucide-react';
import { notify } from '../../components/toast/index.js';
import { makeSearchMatcher } from '../../utils/searchText.js';
import { formatJourSemaine } from '../../utils/dateHelpers.js';
import {
  Avatar, Modale, decalerJour, dureeLisible, formatPrix, heureFin, hhmm, jourComplet,
  minutes, nomClient, st,
} from './spaUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Réserver un soin. Pensé pour la réception au téléphone, dans l'ordre où la
// conversation se déroule : qui (retrouvé en deux lettres, ou créé sur place),
// quel soin (sa durée suit), quand (jour, puis créneau libre du praticien),
// avec qui et dans quelle cabine.
//
// Les chevauchements (même praticien, même cabine ou même client) sont
// signalés mais ne bloquent pas : un soin à quatre mains en duo, c'est un
// chevauchement voulu.
// ─────────────────────────────────────────────────────────────────────────────

const DUREES = [30, 45, 60, 75, 90, 120];
const OUVERTURE = 9 * 60;
const FERMETURE = 20 * 60;
const ACTIF = (r) => !['annulee', 'absent'].includes(r.statut);

function chevauche(debA, dureeA, debB, dureeB) {
  return debA < debB + dureeB && debB < debA + dureeA;
}
const memeTexte = (x, y) => x && y && x.trim().toLowerCase() === y.trim().toLowerCase();

export default function ReservationForm({
  reservation = null, dateInitiale = null, heureInitiale = null, praticienInitial = '', clientInitial = null,
  aujourdhui, clients, soins, reservations, praticiens, cabines, onSave, onCreerClient, onClose,
}) {
  const [form, setForm] = useState(() => ({
    clientId: reservation?.clientId || clientInitial?.id || '',
    soinId: reservation?.soinId || '',
    soinLibelle: reservation?.soinLibelle || '',
    dateRdv: reservation?.dateRdv || dateInitiale || aujourdhui,
    heureDebut: reservation?.heureDebut || heureInitiale || '',
    dureeMin: reservation?.dureeMin || 60,
    praticien: reservation?.praticien || praticienInitial || '',
    cabine: reservation?.cabine || '',
    notes: reservation?.notes || '',
  }));
  const [recherche, setRecherche] = useState('');
  const [nouveau, setNouveau] = useState(null); // { prenom, nom, telephone, email }
  const [autreSoin, setAutreSoin] = useState(() => Boolean(reservation && !reservation.soinId && reservation.soinLibelle));
  const [enCours, setEnCours] = useState(false);
  const set = (cle, valeur) => setForm((p) => ({ ...p, [cle]: valeur }));

  const client = clients.find((c) => c.id === form.clientId) || null;
  const soinsActifs = soins.filter((s) => s.actif || s.id === form.soinId);
  const duree = Number(form.dureeMin) || 0;

  const resultats = useMemo(() => {
    const match = makeSearchMatcher(recherche);
    if (!match.active) return [];
    return clients.filter((c) => !c.archive && match(c.prenom, c.nom, c.telephone, c.email)).slice(0, 6);
  }, [clients, recherche]);

  const autresDuJour = useMemo(
    () => reservations.filter((r) => r.id !== reservation?.id && r.dateRdv === form.dateRdv && ACTIF(r)),
    [reservations, reservation, form.dateRdv]
  );

  // Créneaux de 30 min : occupés quand le praticien choisi (ou la cabine) est
  // déjà pris sur la durée du soin.
  const creneaux = useMemo(() => {
    const liste = [];
    for (let m = OUVERTURE; m + Math.min(duree, 30) <= FERMETURE; m += 30) {
      const occupe = autresDuJour.some((r) => chevauche(m, duree || 30, minutes(r.heureDebut), r.dureeMin)
        && (memeTexte(r.praticien, form.praticien) || memeTexte(r.cabine, form.cabine)));
      liste.push({ m, occupe });
    }
    return liste;
  }, [autresDuJour, duree, form.praticien, form.cabine]);
  const horsGrille = form.heureDebut && !creneaux.some((c) => hhmm(c.m) === form.heureDebut);

  const conflits = useMemo(() => {
    if (!form.heureDebut) return [];
    const d = minutes(form.heureDebut);
    return autresDuJour.filter((r) => chevauche(d, duree, minutes(r.heureDebut), r.dureeMin)
      && (memeTexte(r.praticien, form.praticien) || memeTexte(r.cabine, form.cabine) || r.clientId === form.clientId));
  }, [autresDuJour, form, duree]);

  const jours = Array.from({ length: 7 }, (_, i) => decalerJour(aujourdhui, i));
  const soinChoisi = soins.find((s) => s.id === form.soinId) || null;

  function choisirSoin(s) {
    setAutreSoin(false);
    if (form.soinId === s.id) { setForm((p) => ({ ...p, soinId: '', soinLibelle: '' })); return; }
    setForm((p) => ({ ...p, soinId: s.id, soinLibelle: s.nom, dureeMin: s.dureeMin }));
  }

  function commencerNouveau() {
    const mots = recherche.trim().split(/\s+/).filter(Boolean);
    setNouveau({ prenom: mots[0] || '', nom: mots.slice(1).join(' '), telephone: '', email: '' });
  }

  async function creerClient() {
    if (!nouveau.prenom.trim() && !nouveau.nom.trim()) { notify('Indique au moins le prénom ou le nom.', 'error'); return; }
    setEnCours(true);
    try {
      const { data, error } = await onCreerClient(nouveau);
      if (error) { notify(error, 'error'); return; }
      set('clientId', data.id);
      setNouveau(null);
      setRecherche('');
      notify('Client créé. Sa fiche se complète plus tard (date de naissance, accord e-mail).', 'success');
    } finally {
      setEnCours(false);
    }
  }

  async function enregistrer() {
    if (!form.clientId) { notify('Choisis ou crée le client.', 'error'); return; }
    if (!form.dateRdv || !form.heureDebut) { notify('Choisis le jour et l\'heure.', 'error'); return; }
    if (!Number.isFinite(duree) || duree < 5 || duree > 600) { notify('Durée invalide (5 à 600 minutes).', 'error'); return; }
    if (conflits.length && !window.confirm(`Ce créneau chevauche ${conflits.length} autre${conflits.length > 1 ? 's' : ''} rendez-vous. Enregistrer quand même ?`)) return;
    setEnCours(true);
    try {
      const { error } = await onSave({ ...form, dureeMin: duree });
      if (error) { notify(error, 'error'); return; }
      notify(reservation ? 'Rendez-vous modifié.' : 'Rendez-vous enregistré.', 'success');
      onClose();
    } finally {
      setEnCours(false);
    }
  }

  const pret = form.clientId && form.dateRdv && form.heureDebut;

  return (
    <Modale
      surTitre={reservation ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous'}
      titre="Réserver un soin"
      onClose={onClose}
      largeur={680}
      pied={(
        <>
          <div style={s.recap}>
            {pret ? (
              <>
                <strong data-no-translate>{nomClient(client)}</strong>
                <span>
                  {capitaliser(jourComplet(form.dateRdv))}, de {form.heureDebut} à {heureFin(form.heureDebut, duree)}
                  {form.soinLibelle ? `, ${form.soinLibelle}` : ''}
                </span>
              </>
            ) : (
              <span>
                Reste à choisir : {[!form.clientId && 'le client', !form.heureDebut && "l'heure"].filter(Boolean).join(' et ')}
              </span>
            )}
          </div>
          <button type="button" onClick={onClose} style={st.discret}>Fermer</button>
          <button type="button" onClick={enregistrer} disabled={enCours || Boolean(nouveau)} style={{ ...st.principal, opacity: enCours || nouveau || !pret ? 0.6 : 1 }}>
            <Check size={18} strokeWidth={2} aria-hidden="true" /> {enCours ? 'Enregistrement…' : 'Réserver'}
          </button>
        </>
      )}
    >
      {/* ── 1. Client ── */}
      <Etape n={1} titre="Client">
        {client ? (
          <div style={{ ...st.ligne, cursor: 'default', boxShadow: 'none', background: 'var(--spa-surface2)' }}>
            <Avatar client={client} taille={44} />
            <span style={{ flex: '1 1 auto', minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 600, fontSize: 15 }} data-no-translate>{nomClient(client)}</span>
              <span style={{ display: 'block', fontSize: 13, color: 'var(--spa-ink2)' }} data-no-translate>
                {[client.telephone, client.email].filter(Boolean).join(', ') || 'Pas de coordonnées'}
              </span>
            </span>
            {!reservation && <button type="button" onClick={() => set('clientId', '')} style={st.lien}>Changer</button>}
          </div>
        ) : nouveau ? (
          <div style={{ ...st.carte, boxShadow: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14 }}>
              <UserRound size={17} strokeWidth={1.8} aria-hidden="true" /> Nouveau client
            </div>
            <div style={st.grille2}>
              <input aria-label="Prénom" placeholder="Prénom" style={st.champ} value={nouveau.prenom} onChange={(e) => setNouveau({ ...nouveau, prenom: e.target.value })} autoComplete="off" />
              <input aria-label="Nom" placeholder="Nom" style={st.champ} value={nouveau.nom} onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })} autoComplete="off" />
              <input aria-label="Téléphone" placeholder="Téléphone" type="tel" style={st.champ} value={nouveau.telephone} onChange={(e) => setNouveau({ ...nouveau, telephone: e.target.value })} autoComplete="off" />
              <input aria-label="E-mail" placeholder="E-mail" type="email" style={st.champ} value={nouveau.email} onChange={(e) => setNouveau({ ...nouveau, email: e.target.value })} autoComplete="off" />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setNouveau(null)} style={st.discret}>Retour</button>
              <button type="button" onClick={creerClient} disabled={enCours} style={st.principal}>Créer le client</button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ position: 'relative' }}>
              <Search size={18} strokeWidth={1.8} aria-hidden="true" style={s.loupe} />
              <input
                type="search"
                style={{ ...st.champ, paddingLeft: 44, borderRadius: 999 }}
                placeholder="Nom, prénom, téléphone ou e-mail"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                autoComplete="off"
                aria-label="Rechercher un client"
              />
            </div>
            {recherche.trim() && (
              <div style={{ ...st.liste, marginTop: 10 }}>
                {resultats.map((c) => (
                  <button key={c.id} type="button" className="spa-carte-action" style={{ ...st.ligne, minHeight: 56, boxShadow: 'none' }} onClick={() => { set('clientId', c.id); setRecherche(''); }}>
                    <Avatar client={c} taille={36} />
                    <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 600, fontSize: 14 }} data-no-translate>{nomClient(c)}</span>
                      <span style={{ display: 'block', fontSize: 12, color: 'var(--spa-ink2)' }} data-no-translate>{[c.telephone, c.email].filter(Boolean).join(', ')}</span>
                    </span>
                  </button>
                ))}
                <button type="button" style={{ ...st.secondaire, justifyContent: 'flex-start', borderStyle: 'dashed' }} onClick={commencerNouveau}>
                  <Plus size={16} strokeWidth={2} aria-hidden="true" />
                  Créer « <span data-no-translate>{recherche.trim()}</span> »
                </button>
              </div>
            )}
          </>
        )}
        {client?.notesSante && (
          <div style={{ ...st.encartSante, marginTop: 10 }}>
            <HeartPulse size={18} strokeWidth={1.8} color="var(--spa-sakura)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
            <span><strong>Santé :</strong> {client.notesSante}</span>
          </div>
        )}
      </Etape>

      {/* ── 2. Soin ── */}
      <Etape n={2} titre="Soin">
        {soinsActifs.length > 0 && (
          <div style={s.soins}>
            {soinsActifs.map((so) => {
              const actif = form.soinId === so.id;
              return (
                <button
                  key={so.id}
                  type="button"
                  aria-pressed={actif}
                  onClick={() => choisirSoin(so)}
                  className="spa-carte-action"
                  style={{ ...s.soin, ...(actif ? s.soinActif : null) }}
                >
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, width: '100%' }}>
                    <span style={s.soinNom} data-no-translate>{so.nom}</span>
                    {actif && <Check size={16} strokeWidth={2.2} color="var(--spa-mizu)" aria-hidden="true" style={{ flexShrink: 0 }} />}
                  </span>
                  <span style={s.soinMeta}>
                    <Clock size={12} strokeWidth={2} aria-hidden="true" /> {dureeLisible(so.dureeMin)}
                    {so.prix !== null && <span style={{ marginLeft: 'auto' }}>{formatPrix(so.prix)}</span>}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={autreSoin}
              onClick={() => { setAutreSoin(true); setForm((p) => ({ ...p, soinId: '', soinLibelle: p.soinId ? '' : p.soinLibelle })); }}
              style={{ ...s.soin, ...(autreSoin ? s.soinActif : null), borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' }}
            >
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--spa-ink2)' }}>Autre soin</span>
            </button>
          </div>
        )}
        {(autreSoin || !soinsActifs.length) && (
          <input
            style={{ ...st.champ, marginTop: soinsActifs.length ? 10 : 0 }}
            placeholder={soinsActifs.length ? 'Nom du soin' : 'Soin (la carte des soins se remplit dans son onglet)'}
            value={form.soinLibelle}
            onChange={(e) => set('soinLibelle', e.target.value)}
            aria-label="Soin en texte libre"
            autoComplete="off"
          />
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--spa-ink2)', marginRight: 4 }}>Durée</span>
          {DUREES.map((d) => (
            <button key={d} type="button" aria-pressed={duree === d} onClick={() => set('dureeMin', d)} style={{ ...st.choix, minHeight: 38, ...(duree === d ? st.choixActif : null) }}>
              {dureeLisible(d)}
            </button>
          ))}
          <input
            type="number" min={5} max={600} step={5} inputMode="numeric"
            aria-label="Durée en minutes"
            style={{ ...st.champ, width: 90, minHeight: 38, borderRadius: 999 }}
            value={form.dureeMin}
            onChange={(e) => set('dureeMin', e.target.value)}
          />
        </div>
      </Etape>

      {/* ── 3. Praticien et cabine (avant l'heure : les créneaux en dépendent) ── */}
      <Etape n={3} titre="Praticien et cabine">
        <div style={st.grille2}>
          <ChoixTexte label="Praticien" id="rdv-praticien" valeur={form.praticien} options={praticiens} onChange={(v) => set('praticien', v)} />
          <ChoixTexte label="Cabine" id="rdv-cabine" valeur={form.cabine} options={cabines} onChange={(v) => set('cabine', v)} />
        </div>
      </Etape>

      {/* ── 4. Jour et heure ── */}
      <Etape n={4} titre="Jour et heure">
        <div className="spa-defile" style={{ display: 'flex', gap: 8, paddingBottom: 2 }}>
          {jours.map((iso, i) => {
            const actif = form.dateRdv === iso;
            return (
              <button key={iso} type="button" aria-pressed={actif} onClick={() => set('dateRdv', iso)} style={{ ...s.jourChoix, ...(actif ? s.jourChoixActif : null) }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{i === 0 ? 'Auj.' : i === 1 ? 'Demain' : formatJourSemaine(iso)}</span>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 19 }} data-no-translate>{Number(iso.slice(8))}</span>
              </button>
            );
          })}
          <label style={{ ...s.jourChoix, ...(jours.includes(form.dateRdv) ? null : s.jourChoixActif), minWidth: 150, cursor: 'pointer' }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Autre date</span>
            <input type="date" value={form.dateRdv} onChange={(e) => e.target.value && set('dateRdv', e.target.value)} style={s.dateNue} aria-label="Autre date" />
          </label>
        </div>

        <div style={{ fontSize: 13, color: 'var(--spa-ink2)', margin: '14px 0 8px' }}>
          {form.praticien
            ? <>Créneaux de <span data-no-translate>{form.praticien}</span> pour {dureeLisible(duree || 30)}</>
            : `Créneaux pour ${dureeLisible(duree || 30)}`}
        </div>
        <div style={s.creneaux}>
          {creneaux.map(({ m, occupe }) => {
            const h = hhmm(m);
            const actif = form.heureDebut === h;
            return (
              <button
                key={m}
                type="button"
                aria-pressed={actif}
                aria-label={`${h}${occupe ? ', occupé' : ''}`}
                onClick={() => set('heureDebut', h)}
                style={{ ...s.creneau, ...(occupe ? s.creneauOccupe : null), ...(actif ? s.creneauActif : null) }}
              >
                {h}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          <label htmlFor="rdv-heure" style={{ fontSize: 13, color: 'var(--spa-ink2)' }}>Autre heure</label>
          <input
            id="rdv-heure" type="time" step="300"
            style={{ ...st.champ, width: 'auto', minHeight: 40, borderRadius: 999, ...(horsGrille ? { boxShadow: 'var(--spa-focus)' } : null) }}
            value={form.heureDebut}
            onChange={(e) => set('heureDebut', e.target.value)}
          />
        </div>

        {conflits.length > 0 && (
          <div style={{ ...st.encartAttention, marginTop: 12 }}>
            <Clock size={18} strokeWidth={1.8} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2, color: 'var(--spa-kin)' }} />
            <span>
              Chevauche :{' '}
              {conflits.map((r) => {
                const c = clients.find((x) => x.id === r.clientId);
                return `${r.heureDebut}-${heureFin(r.heureDebut, r.dureeMin)} ${nomClient(c)}${r.praticien ? ` (${r.praticien})` : ''}${r.cabine ? `, ${r.cabine}` : ''}`;
              }).join(' ; ')}
            </span>
          </div>
        )}
      </Etape>

      <Etape titre="Note pour l'équipe">
        <textarea style={{ ...st.zone, minHeight: 60 }} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Offert, en duo, arrivée anticipée…" aria-label="Note pour l'équipe" />
        {soinChoisi?.description && <div style={st.aide} data-no-translate>{soinChoisi.description}</div>}
      </Etape>
    </Modale>
  );
}

function Etape({ n, titre, children }) {
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        {n && <span aria-hidden="true" style={s.numero}>{n}</span>}
        <h3 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 18, color: 'var(--spa-ink)' }}>{titre}</h3>
      </div>
      {children}
    </section>
  );
}

// Choix rapide parmi les valeurs déjà utilisées, ou saisie libre.
function ChoixTexte({ label, id, valeur, options, onChange }) {
  return (
    <div style={{ minWidth: 0 }}>
      <label htmlFor={id} style={st.label}>{label}</label>
      {options.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {options.map((o) => {
            const actif = memeTexte(o, valeur);
            return (
              <button key={o} type="button" aria-pressed={Boolean(actif)} onClick={() => onChange(actif ? '' : o)} style={{ ...st.choix, minHeight: 38, ...(actif ? st.choixActif : null) }}>
                <span data-no-translate>{o}</span>
              </button>
            );
          })}
        </div>
      )}
      <input id={id} style={st.champ} value={valeur} onChange={(e) => onChange(e.target.value)} placeholder={options.length ? 'Ou saisir un nom' : ''} autoComplete="off" />
    </div>
  );
}

const capitaliser = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

const s = {
  recap: {
    flex: '1 1 220px', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center',
    fontSize: 13, color: 'var(--spa-ink2)', lineHeight: 1.4, marginRight: 'auto',
  },
  loupe: { position: 'absolute', left: 16, top: '50%', marginTop: -9, color: 'var(--spa-ink3)', pointerEvents: 'none' },
  numero: {
    width: 26, height: 26, borderRadius: 13, flexShrink: 0,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--spa-mizu-soft)', color: 'var(--spa-mizu)', fontSize: 13, fontWeight: 700,
  },
  soins: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8 },
  soin: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, minWidth: 0, minHeight: 72,
    padding: '12px 14px', borderRadius: 'var(--spa-r)', cursor: 'pointer', textAlign: 'left',
    fontFamily: 'var(--font)', color: 'var(--spa-ink)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spa-line)', background: 'var(--spa-surface)',
  },
  soinActif: { borderColor: 'var(--spa-mizu)', background: 'var(--spa-mizu-soft)' },
  soinNom: { fontSize: 14, fontWeight: 600, lineHeight: 1.3 },
  soinMeta: { display: 'flex', alignItems: 'center', gap: 4, width: '100%', fontSize: 12, color: 'var(--spa-ink2)' },
  jourChoix: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
    minWidth: 62, minHeight: 60, padding: '6px 10px', borderRadius: 'var(--spa-r)', cursor: 'pointer', flexShrink: 0,
    fontFamily: 'var(--font)', color: 'var(--spa-ink)', boxSizing: 'border-box',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spa-line)', background: 'var(--spa-surface)',
  },
  jourChoixActif: { borderColor: 'var(--spa-mizu)', background: 'var(--spa-mizu-soft)', color: 'var(--spa-mizu)' },
  dateNue: {
    border: 'none', background: 'transparent', color: 'inherit', fontFamily: 'var(--font)', fontSize: 13,
    padding: 0, minHeight: 24, boxShadow: 'none',
  },
  creneaux: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 6 },
  creneau: {
    minHeight: 40, padding: '6px 4px', borderRadius: 999, cursor: 'pointer',
    fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)', fontVariantNumeric: 'tabular-nums',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spa-line)',
    background: 'var(--spa-surface)', color: 'var(--spa-ink)',
  },
  creneauOccupe: { background: 'var(--spa-sunken)', color: 'var(--spa-ink3)', textDecoration: 'line-through', borderColor: 'transparent' },
  creneauActif: { borderColor: 'var(--spa-mizu)', background: 'var(--spa-mizu)', color: 'var(--spa-on-mizu)', textDecoration: 'none' },
};
