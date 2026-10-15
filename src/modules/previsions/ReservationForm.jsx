import { useState, useRef, useEffect } from 'react';
import { notify } from '../../components/toast/index.js';
import { useReservations } from '../../hooks/useReservations.js';
import { useReservationTags } from '../../hooks/useReservationTags.js';
import { useResaClients } from '../../hooks/useResaClients.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { useBackLayer } from '../../hooks/useBackLayer.js';
import { zurichToday } from '../../utils/zurichTime.js';
import { addDays, isoDate, formatDateLongue, parseLocalDate } from '../../utils/dateHelpers.js';
import { serviceParDefaut } from './statutsReservation.js';
import { useParametresEnLigne, envoyerConfirmation } from './reservationEnLigne.js';
import ReservationTagSelector from './ReservationTagSelector.jsx';
import { BandeJours, GrilleCouverts, caseStyle, dateResumee } from './SaisieMobile.jsx';
import SuggestionsClients, { useFichesClients, fichesCorrespondantes, detailsClient } from './SuggestionsClients.jsx';

// Heures proposées : celles de la réservation en ligne (Prévisions, réglages
// de la réservation en ligne : « Heures d'arrivée proposées » par jour et
// service, « Heures proposées toutes les »). Un seul réglage pour le site et
// pour l'équipe. « Autre heure » reste libre à la minute.
const HEURE_OK = /^\d{2}:\d{2}$/;
const enMinutes = (h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
function plageDHeures(de, a, pas = 15) {
  const heures = [];
  for (let t = enMinutes(de); t <= enMinutes(a); t += pas) {
    heures.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  }
  return heures;
}

// Sans réglage lisible (chargement, table absente) : plages habituelles.
const SUGGESTIONS = {
  midi:   plageDHeures('12:00', '13:30'),
  soir:   plageDHeures('19:00', '21:00'),
  brunch: plageDHeures('10:30', '12:00'),
};

// Plage du service ce jour-là ; un service fermé ce jour (réservation
// téléphonique exceptionnelle) reprend la plage d'un autre jour.
function heuresProposees(parametres, date, service) {
  const horaires = parametres?.horaires;
  if (!horaires || !date) return SUGGESTIONS[service] || [];
  const jourIso = parseLocalDate(date).getDay() || 7;
  const valide = (pl) => pl && HEURE_OK.test(pl.de || '') && HEURE_OK.test(pl.a || '') && enMinutes(pl.de) <= enMinutes(pl.a);
  const plage = [horaires[String(jourIso)]?.[service], ...Object.values(horaires).map((j) => j?.[service])].find(valide);
  if (!plage) return SUGGESTIONS[service] || [];
  const pas = [15, 30, 60].includes(Number(parametres.pasMinutes)) ? Number(parametres.pasMinutes) : 15;
  return plageDHeures(plage.de, plage.a, pas);
}

// Heure la plus demandée de chaque service, et non la première de la liste :
// personne ne réserve à 19:00 par défaut, on vise 20:00.
const HEURE_DEFAUT = { midi: '12:30', soir: '20:00', brunch: '11:00' };

// Canal (reservations.origine) choisi par l'équipe. 'en_ligne' n'en fait pas
// partie : il n'est posé que par la page publique, et une réservation venue
// du site garde son origine quoi qu'on modifie.
const CANAUX = [
  { id: 'equipe',  label: 'Équipe' },
  { id: 'passage', label: 'Passage' },
];

// `zurichToday` et non `new Date()` : l'heure du device peut être n'importe
// quoi, et .toISOString() bascule la date d'un jour dès qu'on est à l'est de
// Greenwich en soirée.
function defaultState(dateInitiale, serviceInitial) {
  const date    = dateInitiale || zurichToday();
  const service = serviceInitial || serviceParDefaut(date);
  return {
    date, service, heure: HEURE_DEFAUT[service], heureCustom: false,
    couverts: 2, nom: '', telephone: '', email: '', accordActus: false,
    groupe: false, passeport: false, tags: [], notes: '', canal: 'equipe',
  };
}

const EMAIL_OK = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function validateForm(form) {
  const errors = [];
  if (!form.nom.trim())                         errors.push('Le nom est obligatoire.');
  if (!form.date)                               errors.push('La date est obligatoire.');
  if (!form.heure)                              errors.push("L'heure d'arrivée est obligatoire.");
  if (form.couverts < 1 || form.couverts > 50) errors.push('Le nombre de couverts doit être entre 1 et 50.');
  if (form.email.trim() && !EMAIL_OK.test(form.email.trim())) errors.push("L'e-mail semble incorrect.");
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function formFromResa(resa) {
  const heure   = (resa.heure_arrivee || '').slice(0, 5);
  const service = resa.service || 'soir';
  return {
    date:        resa.date_service  || zurichToday(),
    service,
    heure,
    heureCustom: !(SUGGESTIONS[service] || []).includes(heure),
    // Champ libre choisi d'office (et non par l'utilisateur) : repasse en
    // bouton si l'heure figure dans les heures réglées une fois chargées.
    heureCustomAuto: true,
    couverts:    resa.nb_couverts   || 2,
    nom:         resa.nom           || '',
    telephone:   resa.telephone     || '',
    email:       resa.email         || '',
    accordActus: false,
    groupe:      resa.est_groupe    || false,
    passeport:   resa.passeport_gourmand || false,
    tags:        Array.isArray(resa.reservation_tags) ? resa.reservation_tags : [],
    notes:       resa.notes_libres  || '',
    canal:       resa.origine === 'passage' ? 'passage' : 'equipe',
  };
}

export default function ReservationForm({
  etablissementId, onClose, onSaved, initialResa = null,
  initialDate = null, initialService = null,
}) {
  const isMobile = useIsMobile();
  const [form, setForm] = useState(() => initialResa
    ? formFromResa(initialResa)
    : defaultState(initialDate, initialService));
  const [loading, setLoading] = useState(false);
  const reservations = useReservations(etablissementId);
  const tags = useReservationTags();
  const fichesClients = useResaClients(etablissementId);
  const { parametres, status: statutReglages } = useParametresEnLigne(etablissementId);
  const suggestions = heuresProposees(statutReglages === 'ready' ? parametres : null, form.date, form.service);
  const cleSuggestions = suggestions.join(',');
  const heureInitiale = (initialResa?.heure_arrivee || '').slice(0, 5);
  // Réservation venue du site : son canal ne se change pas, l'origine n'est
  // jamais renvoyée.
  const enLigne = initialResa?.origine === 'en_ligne';

  // Clients connus proposés pendant la frappe du nom ou du téléphone, à la
  // création seulement : une résa qu'on modifie a déjà son client.
  const fiches = useFichesClients(fichesClients, !initialResa);
  const [champActif, setChampActif] = useState(null); // 'nom' | 'telephone' | null
  const [clientChoisi, setClientChoisi] = useState(null);
  const nomRef = useRef(null);
  const telRef = useRef(null);
  // Téléphone : e-mail, notes, groupe et passeport repliés sous « Plus de
  // détails », sauf quand la résa modifiée en a déjà.
  const [detailsOuverts, setDetailsOuverts] = useState(() => Boolean(initialResa && (
    initialResa.email || initialResa.notes_libres || initialResa.est_groupe || initialResa.passeport_gourmand
  )));

  // Retour (geste, glissé du bord, Alt+←) : referme le formulaire au lieu de
  // quitter la page. En plein écran sur le téléphone, c'est le premier réflexe.
  useBackLayer(true, onClose, 'reservation-form');

  // Heures proposées changées (réglages chargés, autre jour, autre service) :
  // l'heure retenue doit rester visible. Nouvelle résa : heure habituelle du
  // service si elle est proposée, sinon celle du milieu. Résa existante :
  // son heure est gardée, en champ libre si elle n'est plus proposée.
  useEffect(() => {
    const liste = cleSuggestions ? cleSuggestions.split(',') : [];
    if (!liste.length) return;
    setForm((p) => {
      if (p.heureCustom) {
        return p.heureCustomAuto && liste.includes(p.heure) ? { ...p, heureCustom: false, heureCustomAuto: false } : p;
      }
      if (liste.includes(p.heure)) return p;
      if (initialResa && p.heure === heureInitiale) return { ...p, heureCustom: true, heureCustomAuto: true };
      const habituelle = HEURE_DEFAUT[p.service];
      return { ...p, heure: liste.includes(habituelle) ? habituelle : liste[Math.floor(liste.length / 2)] };
    });
  }, [cleSuggestions, initialResa, heureInitiale]);

  // Faux dès que le formulaire est fermé. Le bouton de pied (« Fermer » pendant
  // l'enregistrement) et × restent actifs : l'écriture lancée va à son terme et
  // son issue s'affiche en toast, mais elle ne pilote plus l'interface (refermer
  // ou remettre à zéro toucherait le formulaire rouvert entre-temps).
  const ouvertRef = useRef(true);
  useEffect(() => {
    ouvertRef.current = true;
    return () => { ouvertRef.current = false; };
  }, []);
  // Formulaire déjà fermé : le toast doit dire de quelle réservation il parle
  // et ce qui n'a pas été enregistré (« partiel » : la résa l'est, pas ses tags).
  const echec = (msg, { partiel = false } = {}) => {
    if (ouvertRef.current) { notify(msg, 'error'); return; }
    const nom  = form.nom.trim();
    const quoi = initialResa
      ? `Modification de la résa ${nom} ${partiel ? 'incomplète' : 'non enregistrée'}`
      : `Résa ${nom} non enregistrée`;
    notify(`${quoi} : ${msg}`, 'error');
  };
  // Dernier état saisi, lu à la fin d'un enregistrement (voir keepOpen).
  const formRef = useRef(form);
  formRef.current = form;

  const set = (key, val) => setForm((p) => ({ ...p, [key]: val }));

  function changeService(s) {
    // serviceTouche : à partir d'ici, un changement de date ne réécrit plus le
    // service. L'utilisateur a tranché, on ne le contredit pas.
    setForm((p) => ({
      ...p, service: s, heure: HEURE_DEFAUT[s], heureCustom: false, serviceTouche: true,
    }));
  }

  // Changer de date peut changer le service pertinent : passer d'aujourd'hui
  // 16h à demain ne doit pas laisser « soir » choisi par l'horloge si
  // l'utilisateur n'y a pas touché lui-même.
  function changeDate(d) {
    setForm((p) => {
      if (p.serviceTouche) return { ...p, date: d };
      const s = serviceParDefaut(d);
      return { ...p, date: d, service: s, heure: HEURE_DEFAUT[s], heureCustom: false };
    });
  }

  function resetForNext() {
    setForm((p) => ({
      ...defaultState(p.date, p.service),
      heure: p.heure,
      heureCustom: p.heureCustom,
      serviceTouche: p.serviceTouche,
    }));
    setClientChoisi(null);
    setDetailsOuverts(false);
  }

  // Nom ou téléphone retouché après un choix de fiche : le rappel de la fiche
  // s'efface, les suggestions reviennent, et l'e-mail qu'elle avait mis part
  // avec elle. Replié sous « Plus de détails » sur le téléphone, il aurait
  // sinon suivi la résa d'un autre client (confirmation, rattachement).
  function saisirContact(key, val) {
    const emailFiche = clientChoisi?.email || null;
    setForm((p) => ({
      ...p,
      [key]: val,
      email: emailFiche && p.email === emailFiche ? '' : p.email,
    }));
    if (clientChoisi) setClientChoisi(null);
  }

  function choisirClient(c) {
    const nom = [c.prenom, c.nom].filter(Boolean).join(' ').trim();
    setForm((p) => ({
      ...p,
      nom: nom || p.nom,
      telephone: c.telephone || p.telephone,
      email: c.email || p.email,
    }));
    setClientChoisi(c);
    setChampActif(null);
    // La fiche a tout rempli : le clavier se range, il ne reste qu'à enregistrer.
    nomRef.current?.blur();
    telRef.current?.blur();
  }

  const clientsProposes = !initialResa && champActif && !clientChoisi
    ? fichesCorrespondantes(fiches, { nom: form.nom, telephone: form.telephone })
    : [];
  const quitterChamp = (champ) => setChampActif((c) => (c === champ ? null : c));

  const aujourdhui = zurichToday();
  // parseLocalDate d'abord : addDays fait new Date(str), qui parse une chaîne
  // ISO en UTC et peut donc rendre la veille selon l'heure.
  const demain     = isoDate(addDays(parseLocalDate(aujourdhui), 1));
  // Raccourcis de date : une réservation se prend presque toujours pour
  // aujourd'hui ou demain. Le sélecteur natif reste pour le reste - il est
  // large et lent au doigt, ce n'est pas le chemin par défaut.
  const RACCOURCIS = [
    { id: aujourdhui, label: "Aujourd'hui" },
    { id: demain,     label: 'Demain' },
  ];

  // Accord du client pour les actualités et bons cadeaux, recueilli par
  // l'équipe (au téléphone, sur place). Il vit sur sa fiche client, que la
  // base a rattachée à la réservation grâce à l'e-mail ou au téléphone. Un
  // échec ici ne défait pas la réservation : on le dit, c'est tout.
  async function enregistrerAccord(resa) {
    if (!form.accordActus || !form.email.trim()) return;
    if (!resa?.client_id) {
      notify("Réservation enregistrée, mais la fiche client n'a pas été trouvée : note l'accord depuis l'onglet Clients.", 'warning');
      return;
    }
    const { error } = await fichesClients.setConsentement(resa.client_id, true, 'equipe');
    if (error) notify(`Accord pour les actualités non enregistré : ${error}`, 'warning');
  }

  async function submit(keepOpen) {
    const { ok, errors } = validateForm(form);
    if (!ok) { errors.forEach((e) => notify(e, 'error')); return; }
    const envoye = form;

    setLoading(true);
    try {
      const payload = {
        date_service:  form.date,
        service:       form.service,
        heure_arrivee: form.heure,
        nb_couverts:   form.couverts,
        nom:           form.nom.trim(),
        telephone:     form.telephone.trim() || null,
        email:         form.email.trim().toLowerCase() || null,
        est_groupe:    form.groupe,
        passeport_gourmand: form.passeport,
        notes_libres:  form.notes.trim() || null,
        ...(enLigne ? {} : { origine: form.canal }),
      };
      // Un client de passage est déjà là : il n'a besoin d'aucune
      // confirmation (ni e-mail ni SMS), à la création comme à la modification.
      const passage = !enLigne && form.canal === 'passage';

      if (initialResa) {
        // ── MODE ÉDITION ──
        const { data: maj, error: eUpd } = await reservations.update(initialResa.id, payload);
        if (eUpd) { echec(eUpd); return; }
        await enregistrerAccord(maj);
        // Remplacement des tags : supprime tous → recrée
        const { error: eDel } = await tags.deleteByReservationId(initialResa.id);
        if (eDel) { echec(eDel, { partiel: true }); return; }
        if (form.tags.length > 0) {
          const { error: eTags } = await tags.bulkCreate(initialResa.id, form.tags);
          if (eTags) { echec(eTags, { partiel: true }); return; }
        }
        // Date, heure, service ou couverts changés : le client reçoit le
        // nouveau récapitulatif. Une simple correction de nom ou de note, non.
        const avant = initialResa;
        const change = avant.date_service !== payload.date_service
          || String(avant.heure_arrivee || '').slice(0, 5) !== String(payload.heure_arrivee || '').slice(0, 5)
          || avant.service !== payload.service
          || Number(avant.nb_couverts) !== Number(payload.nb_couverts)
          || (!avant.email && payload.email);
        const mail = change && maj?.statut === 'confirme' && !passage
          ? await envoyerConfirmation(maj, avant.email ? 'modification' : 'creation')
          : { suffixe: '', ton: 'success' };
        notify(`Résa ${form.nom.trim()} (${form.couverts} pax, ${form.heure.slice(0, 5)}) modifiée.${mail.suffixe}`, mail.ton);
        onSaved?.();
        if (ouvertRef.current) onClose();
      } else {
        // ── MODE CRÉATION ──
        // Passage du jour (ou rattrapé après coup) : le client est arrivé.
        // Noté pour une date à venir, il reste attendu comme une réservation.
        const statut = passage && form.date <= aujourdhui ? 'arrive' : 'confirme';
        const { data: resa, error: eResa } = await reservations.create({ ...payload, statut });
        if (eResa || !resa) {
          echec(eResa || 'Erreur lors de la création de la réservation.');
          return;
        }
        await enregistrerAccord(resa);
        if (form.tags.length > 0) {
          const { error: eTags } = await tags.bulkCreate(resa.id, form.tags);
          if (eTags) {
            // Rollback : soft-delete via statut='annule'
            // → le trigger recalcule previsions_jour proprement
            console.error('[ReservationForm] erreur tags, tentative rollback', resa.id, eTags);
            const { error: eRollback } = await reservations.delete(resa.id);
            if (eRollback) {
              console.error('[ReservationForm] ROLLBACK ÉCHOUÉ', resa.id, eRollback);
              notify(
                `Tags KO et rollback impossible. Résa ${resa.id} à supprimer manuellement.`,
                'error'
              );
            } else {
              echec(eTags || 'Erreur tags - réservation annulée.');
            }
            return;
          }
        }
        const h = resa.heure_arrivee?.slice(0, 5) ?? form.heure;
        const mail = passage ? { suffixe: '', ton: 'success' } : await envoyerConfirmation(resa, 'creation');
        notify(`Résa ${resa.nom} (${resa.nb_couverts} pax, ${h}) enregistrée.${mail.suffixe}`, mail.ton);
        onSaved?.(resa);
        if (!ouvertRef.current) return;
        if (!keepOpen) { onClose(); return; }
        // Réseau lent : ce qui a été tapé pendant l'enregistrement appartient
        // déjà à la résa suivante. Seuls les champs restés tels qu'envoyés sont
        // remis à zéro : un tag allergène de la résa précédente ne doit pas
        // glisser sur la suivante, et rien de ce qui vient d'être tapé ne se
        // perd.
        const tape = formRef.current;
        resetForNext();
        if (tape !== envoye) {
          setForm((p) => {
            const suite = { ...p };
            Object.keys(envoye).forEach((k) => { if (tape[k] !== envoye[k]) suite[k] = tape[k]; });
            return suite;
          });
        }
      }
    } finally {
      setLoading(false);
    }
  }

  const inp = {
    width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8,
    background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 13,
    boxSizing: 'border-box',
  };
  const lbl = { fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 5, display: 'block' };

  // ── Blocs placés différemment selon l'écran : sur le téléphone, l'e-mail,
  //    les notes, groupe et passeport passent sous « Plus de détails ». ──
  const blocEmail = (
    <>
      {/* E-mail : complète la fiche client (rattachée par e-mail ou
          téléphone) et permet de lui écrire. */}
      <div>
        <label style={lbl}>
          E-mail{' '}
          <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(optionnel)</span>
        </label>
        <input type="email" inputMode="email" placeholder="client@exemple.ch" value={form.email}
          onChange={(e) => set('email', e.target.value)} style={inp} autoComplete="off" />
      </div>

      {form.email.trim() !== '' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={form.accordActus}
            onChange={(e) => set('accordActus', e.target.checked)}
            style={{ width: 20, height: 20, accentColor: 'var(--accent)', flexShrink: 0 }}
          />
          <span style={{ fontSize: 13, color: 'var(--text)' }}>
            Le client accepte de recevoir les actualités et les bons cadeaux par e-mail
          </span>
        </label>
      )}
    </>
  );

  // Passeport gourmand : la réservation est encadrée en vert dans l'agenda.
  // Bouton à bascule, vert quand il est actif.
  const boutonPasseport = (
    <button
      type="button"
      aria-pressed={form.passeport}
      onClick={() => set('passeport', !form.passeport)}
      style={{
        alignSelf: 'flex-start', minHeight: 44, padding: '8px 16px', borderRadius: 22,
        borderWidth: 2, borderStyle: 'solid',
        borderColor: form.passeport ? 'var(--success-text)' : 'var(--border)',
        background: form.passeport ? 'var(--success-bg-soft)' : 'var(--surface)',
        color: form.passeport ? 'var(--success-text)' : 'var(--text2)',
        fontSize: 13, fontWeight: 700, fontFamily: 'var(--font)', cursor: 'pointer',
      }}
    >
      {form.passeport ? '✓ Passeport gourmand' : 'Passeport gourmand'}
    </button>
  );

  const blocNotes = (
    <div>
      <label style={lbl}>
        Notes{' '}
        <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(optionnel)</span>
      </label>
      <textarea
        placeholder="Table près de la fenêtre, allergie sévère, etc."
        value={form.notes}
        onChange={(e) => set('notes', e.target.value)}
        rows={3}
        style={{ ...inp, resize: 'vertical', minHeight: 70 }}
      />
    </div>
  );

  // Canal : saisie de l'équipe, ou client de passage. Une réservation venue
  // du site le dit, sans sélecteur.
  const blocCanal = enLigne ? (
    <div>
      <label style={lbl}>Canal</label>
      <div style={{ fontSize: 13, color: 'var(--text)' }}>Réservée en ligne</div>
    </div>
  ) : (
    <div>
      <label style={lbl}>Canal</label>
      <div style={{ display: 'flex', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
        {CANAUX.map((c) => (
          <button key={c.id} type="button" aria-pressed={form.canal === c.id} onClick={() => set('canal', c.id)}
            style={{
              flex: 1, minHeight: 40, padding: '9px 2px', border: 'none', cursor: 'pointer',
              fontSize: isMobile ? 14 : 12, fontWeight: 700, fontFamily: 'var(--font)', transition: 'all 0.15s',
              background: form.canal === c.id ? 'var(--accent)' : 'var(--bg)',
              color:      form.canal === c.id ? 'var(--on-accent)' : 'var(--text2)',
            }}>
            {c.label}
          </button>
        ))}
      </div>
      {form.canal === 'passage' && (
        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 5 }}>
          {initialResa
            ? 'Client venu sans réserver. Aucune confirmation ne lui est envoyée.'
            : 'Client venu sans réserver : enregistré arrivé, sans confirmation envoyée.'}
        </div>
      )}
    </div>
  );

  const detailsRenseignes = [
    !enLigne && form.canal === 'passage' && 'passage',
    form.email.trim() && 'e-mail',
    form.notes.trim() && 'notes',
    form.groupe && 'groupe',
    form.passeport && 'passeport gourmand',
  ].filter(Boolean);

  // L'année ne s'écrit que si ce n'est pas celle d'aujourd'hui : « mars »
  // pris au calendrier en octobre, c'est l'an prochain, et ça doit se lire.
  const anneeAutre = String(form.date || '').slice(0, 4) !== aujourdhui.slice(0, 4) ? ` ${String(form.date).slice(0, 4)}` : '';

  // Rappel de la barre du bas : ce qui part si on enregistre maintenant.
  const nbCouverts = Number(form.couverts) || 0;
  const resume = `${dateResumee(form.date)}${anneeAutre}, ${form.service}, ${String(form.heure || '').slice(0, 5) || 'heure ?'}, ${nbCouverts} couvert${nbCouverts > 1 ? 's' : ''}`;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: isMobile ? 'stretch' : 'center',
        justifyContent: 'center', zIndex: 1000, padding: isMobile ? 0 : 16,
      }}
      onClick={onClose}>
      {/* Téléphone : plein écran, sans la classe modal-sheet (elle bornerait la
          hauteur à 85 % et ferait défiler tout le bloc, barre du bas comprise).
          Pas de role="dialog" non plus : la règle mobile globale lui impose une
          marge de 8 px. */}
      <div
        className={isMobile ? undefined : 'modal-sheet'}
        style={{
          background: 'var(--surface)', width: isMobile ? '100%' : 520, maxWidth: '100%',
          height: isMobile ? '100%' : undefined,
          maxHeight: isMobile ? '100%' : '90vh',
          borderRadius: isMobile ? 0 : 14,
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}>

        {/* ── Header. data-cadre : la règle « plus de carrés » lui retirait ses
               marges latérales, le titre touchait le bord. ── */}
        <div data-cadre style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: isMobile ? '6px 8px 6px 16px' : '16px 20px',
          paddingTop: isMobile ? 'max(6px, env(safe-area-inset-top))' : undefined,
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          borderRadius: isMobile ? 0 : '14px 14px 0 0',
        }}>
          <div style={{ fontWeight: 700, fontSize: isMobile ? 16 : 15, fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>
            {initialResa ? 'Modifier la réservation' : 'Nouvelle réservation'}
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer"
            style={{
              background: 'none', border: 'none', fontSize: isMobile ? 28 : 22, cursor: 'pointer',
              color: 'var(--text2)', padding: 4, lineHeight: 1,
              minWidth: isMobile ? 44 : undefined, minHeight: isMobile ? 44 : undefined,
            }}>
            ×
          </button>
        </div>

        {/* ── Corps scrollable ── */}
        <div style={{
          flex: 1, overflowY: 'auto', overscrollBehavior: 'contain',
          padding: isMobile ? '14px 16px 20px' : '18px 20px',
          display: 'flex', flexDirection: 'column', gap: isMobile ? 18 : 16,
        }}>

          {/* Date. Téléphone : les deux prochaines semaines d'un toucher, le
              calendrier pour le reste de l'année. Ordinateur : deux raccourcis
              et le sélectionneur natif. La date choisie est rappelée en toutes
              lettres - « 2026-08-23 » ne dit pas si c'est un samedi, et c'est
              ce que demande la personne au bout du fil. */}
          <div>
            <label style={lbl}>Date</label>
            {isMobile ? (
              <BandeJours
                date={form.date}
                aujourdhui={aujourdhui}
                passeAutorise={Boolean(initialResa)}
                onChange={changeDate}
              />
            ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {RACCOURCIS.map((r) => {
                const actif = form.date === r.id;
                return (
                  <button key={r.id} type="button" onClick={() => changeDate(r.id)}
                    style={{
                      padding: '9px 14px', borderRadius: 8, cursor: 'pointer', minHeight: 44,
                      fontSize: 13, fontFamily: 'var(--font)', fontWeight: 600,
                      borderWidth: 1, borderStyle: 'solid',
                      borderColor: actif ? 'var(--accent)' : 'var(--border)',
                      background:  actif ? 'var(--accent)' : 'var(--bg)',
                      color:       actif ? 'var(--on-accent)' : 'var(--text)',
                    }}>
                    {r.label}
                  </button>
                );
              })}
              <input
                type="date" value={form.date}
                onChange={(e) => e.target.value && changeDate(e.target.value)}
                aria-label="Autre date"
                style={{ ...inp, width: 'auto', flex: '1 1 200px', minHeight: 44 }}
              />
            </div>
            )}
            <div style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600, marginTop: isMobile ? 6 : 0 }}>
              {formatDateLongue(form.date)}{anneeAutre}
            </div>
          </div>

          <div>
            <div>
              <label style={lbl}>Service</label>
              <div style={{ display: 'flex', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
                {['midi', 'soir', 'brunch'].map((s) => (
                  <button key={s} type="button" onClick={() => changeService(s)}
                    style={{
                      flex: 1, padding: '9px 2px', border: 'none', cursor: 'pointer',
                      fontSize: isMobile ? 14 : 12, fontWeight: 700, fontFamily: 'var(--font)', transition: 'all 0.15s',
                      background: form.service === s ? 'var(--accent)' : 'var(--bg)',
                      color:      form.service === s ? 'var(--on-accent)' : 'var(--text2)',
                    }}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Ordinateur : le canal sous le service. Téléphone : dans « Plus de
              détails », la saisie rapide d'une réservation ne s'allonge pas
              (un passage se compte d'abord par « + Passage » du mode service). */}
          {!isMobile && blocCanal}

          {/* Heure */}
          <div>
            <label style={lbl}>Heure d'arrivée</label>
            {!form.heureCustom ? (
              // Téléphone : grille de 4 colonnes en grandes cases, « Autre
              // heure » termine la dernière rangée.
              <div style={isMobile
                ? { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }
                : { display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {suggestions.map((h) => (
                  <button key={h} type="button" aria-pressed={form.heure === h} onClick={() => set('heure', h)}
                    style={isMobile ? caseStyle(form.heure === h, { fontFamily: 'var(--font-num)' }) : {
                      padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                      fontSize: 13, fontFamily: 'var(--font)', fontWeight: 600, transition: 'all 0.15s',
                      border:      `1px solid ${form.heure === h ? 'var(--accent)' : 'var(--border)'}`,
                      background:  form.heure === h ? 'var(--accent)' : 'var(--bg)',
                      color:       form.heure === h ? 'var(--on-accent)' : 'var(--text)',
                    }}>
                    {h}
                  </button>
                ))}
                <button type="button" onClick={() => setForm((p) => ({ ...p, heureCustom: true, heureCustomAuto: false }))}
                  style={isMobile
                    ? caseStyle(false, { gridColumn: `span ${4 - (suggestions.length % 4)}`, borderStyle: 'dashed', color: 'var(--text2)', fontSize: 14 })
                    : { padding: '8px 14px', borderRadius: 8, border: '1px dashed var(--border)', background: 'var(--bg)', color: 'var(--text2)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font)' }}>
                  Autre heure
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="time" value={form.heure} onChange={(e) => set('heure', e.target.value)} style={{ ...inp, width: 'auto' }} />
                <button type="button"
                  onClick={() => setForm((p) => ({ ...p, heureCustom: false, heure: suggestions[0] }))}
                  style={{ fontSize: 12, color: 'var(--text2)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }}>
                  ← Suggestions
                </button>
              </div>
            )}
          </div>

          {/* Nb couverts */}
          <div>
            <label style={lbl}>Nombre de couverts</label>
            {isMobile ? (
              <GrilleCouverts value={form.couverts} onChange={(v) => set('couverts', v)} />
            ) : (
            <div style={{ display: 'flex', alignItems: 'center', width: 'fit-content', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <button type="button" aria-label="Diminuer"
                onClick={() => set('couverts', Math.max(1, (Number(form.couverts) || 0) - 1))}
                style={{ width: 44, height: 44, fontSize: 20, fontWeight: 700, background: 'var(--bg)', border: 'none', cursor: 'pointer', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                −
              </button>
              {/* Saisie au clavier : une tablée de 18 se tape, elle ne se
                  clique pas seize fois. Chiffres seulement ; le champ peut
                  rester vide le temps de la frappe, la validation le refuse
                  ensuite. Tout est sélectionné au toucher pour remplacer d'un
                  coup. 17 px : en dessous, iOS zoome sur le champ. */}
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                aria-label="Nombre de couverts"
                value={form.couverts}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  const chiffres = e.target.value.replace(/\D/g, '').slice(0, 2);
                  set('couverts', chiffres === '' ? '' : Number(chiffres));
                }}
                onBlur={() => { if (form.couverts === '' || form.couverts < 1) set('couverts', 1); }}
                style={{
                  width: 52, height: 44, textAlign: 'center', fontWeight: 800, fontSize: 17,
                  color: 'var(--text)', fontFamily: 'var(--font-num)',
                  background: 'transparent', border: 'none', padding: 0, minWidth: 0,
                }}
              />
              <button type="button" aria-label="Augmenter"
                onClick={() => set('couverts', Math.min(50, (Number(form.couverts) || 0) + 1))}
                style={{ width: 44, height: 44, fontSize: 20, fontWeight: 700, background: 'var(--bg)', border: 'none', cursor: 'pointer', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                +
              </button>
            </div>
            )}
          </div>

          {/* Nom. Pas de focus d'office au téléphone : le clavier cacherait le
              jour et l'heure, qui se choisissent d'abord. « Suivant » du
              clavier passe au téléphone. */}
          <div>
            <label style={lbl}>Nom *</label>
            <input
              ref={nomRef}
              autoFocus={!isMobile}
              type="text"
              placeholder="Dupont, Famille Martin…"
              value={form.nom}
              autoComplete="off"
              autoCapitalize="words"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              onFocus={() => setChampActif('nom')}
              onBlur={() => quitterChamp('nom')}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); telRef.current?.focus(); } }}
              onChange={(e) => saisirContact('nom', e.target.value)}
              style={inp}
            />
            {champActif === 'nom' && <SuggestionsClients fiches={clientsProposes} onChoisir={choisirClient} />}
          </div>

          {/* Téléphone */}
          <div>
            <label style={lbl}>
              Téléphone{' '}
              <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(optionnel)</span>
            </label>
            <input ref={telRef} type="tel" inputMode="tel" placeholder="+41 79 123 45 67" value={form.telephone}
              autoComplete="off" enterKeyHint="done"
              onFocus={() => setChampActif('telephone')}
              onBlur={() => quitterChamp('telephone')}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              onChange={(e) => saisirContact('telephone', e.target.value)} style={inp} />
            {champActif === 'telephone' && <SuggestionsClients fiches={clientsProposes} onChoisir={choisirClient} />}
          </div>

          {/* Fiche reprise : ce qu'elle sait des allergies se lit avant de
              poser les tags. */}
          {clientChoisi && (
            <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, marginTop: -6 }}>
              <div>Fiche client : {detailsClient(clientChoisi)}</div>
              {clientChoisi.allergies && (
                <div style={{ color: 'var(--danger-text)', fontWeight: 600 }}>
                  Allergies notées sur la fiche : {clientChoisi.allergies}
                </div>
              )}
              {clientChoisi.preferences && <div>Préférences : {clientChoisi.preferences}</div>}
            </div>
          )}

          {isMobile ? (
            <>
              {/* Allergies et régimes avant les détails : c'est la question
                  qu'on pose au bout du fil. */}
              <div>
                <label style={lbl}>Allergies, régimes, occasions</label>
                <ReservationTagSelector compact value={form.tags} onChange={(v) => set('tags', v)} />
              </div>

              <button
                type="button"
                aria-expanded={detailsOuverts}
                onClick={() => setDetailsOuverts((o) => !o)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  width: '100%', minHeight: 52, padding: '10px 0', textAlign: 'left', cursor: 'pointer',
                  background: 'none', borderWidth: '1px 0 0', borderStyle: 'solid', borderColor: 'var(--border)',
                  fontFamily: 'var(--font)', color: 'var(--text)',
                }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>Plus de détails</span>
                  <span style={{ display: 'block', fontSize: 12, marginTop: 2, color: detailsRenseignes.length ? 'var(--accent)' : 'var(--text3)' }}>
                    {detailsRenseignes.length
                      ? `Renseigné : ${detailsRenseignes.join(', ')}`
                      : 'E-mail, notes, canal, groupe, passeport gourmand'}
                  </span>
                </span>
                <span aria-hidden="true" style={{
                  fontSize: 16, color: 'var(--text2)', flexShrink: 0,
                  transform: detailsOuverts ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s',
                }}>
                  ▾
                </span>
              </button>

              {detailsOuverts && (
                <>
                  {blocCanal}
                  {blocEmail}
                  {/* Groupe et passeport en boutons à bascule côte à côte.
                      L'interrupteur de l'ordinateur, étiré à 44 px de haut par
                      la règle tactile globale, ne se lisait plus. */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <button
                      type="button"
                      aria-pressed={form.groupe}
                      onClick={() => set('groupe', !form.groupe)}
                      style={{
                        minHeight: 44, padding: '8px 16px', borderRadius: 22,
                        borderWidth: 2, borderStyle: 'solid',
                        borderColor: form.groupe ? 'var(--accent)' : 'var(--border)',
                        background: form.groupe ? 'var(--accent)' : 'var(--surface)',
                        color: form.groupe ? 'var(--on-accent)' : 'var(--text2)',
                        fontSize: 13, fontWeight: 700, fontFamily: 'var(--font)', cursor: 'pointer',
                      }}>
                      {form.groupe ? '✓ Groupe' : 'Groupe'}
                    </button>
                    {boutonPasseport}
                  </div>
                  {blocNotes}
                </>
              )}
            </>
          ) : (
            <>
              {blocEmail}

              {/* Groupe toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button type="button" aria-label="Groupe" onClick={() => set('groupe', !form.groupe)}
                  style={{
                    width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                    transition: 'background 0.2s', flexShrink: 0, position: 'relative',
                    background: form.groupe ? 'var(--accent)' : 'var(--border)',
                  }}>
                  <span style={{
                    position: 'absolute', top: 2, left: form.groupe ? 20 : 2, width: 18, height: 18,
                    borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }} />
                </button>
                <span style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font)' }}>Groupe</span>
              </div>

              {boutonPasseport}

              {/* Tags */}
              <div>
                <label style={lbl}>
                  Tags{' '}
                  <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(allergènes, régimes, occasions)</span>
                </label>
                <ReservationTagSelector value={form.tags} onChange={(v) => set('tags', v)} />
              </div>

              {blocNotes}
            </>
          )}
        </div>

        {/* ── Footer fixe. Téléphone : le rappel de la saisie au-dessus de deux
               grands boutons ; × ferme (il reste actif pendant l'écriture). ── */}
        {isMobile ? (
          <div style={{
            padding: '10px 16px', paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
            borderTop: '1px solid var(--border)', background: 'var(--surface)',
          }}>
            <div style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600, marginBottom: 8 }}>
              {resume}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {initialResa ? (
                <button type="button" onClick={onClose}
                  style={{ flex: 1, minHeight: 48, borderRadius: 10, borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 15, fontWeight: 600 }}>
                  {loading ? 'Fermer' : 'Annuler'}
                </button>
              ) : (
                <button type="button" disabled={loading} onClick={() => submit(true)}
                  style={{ flex: 1, minHeight: 48, borderRadius: 10, borderWidth: 0, background: 'var(--surface2)', color: 'var(--accent)', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)', fontSize: 14, fontWeight: 700, opacity: loading ? 0.5 : 1, padding: '0 8px' }}>
                  + Saisir une autre
                </button>
              )}
              <button type="button" disabled={loading} onClick={() => submit(false)}
                style={{ flex: 1.2, minHeight: 48, borderRadius: 10, borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--accent)', background: 'var(--accent)', color: 'var(--on-accent)', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)', fontSize: 15, fontWeight: 700, opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        ) : (
        <div style={{
          padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--surface)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
        }}>
          {!initialResa && (
            <button type="button" disabled={loading} onClick={() => submit(true)}
              style={{ background: 'none', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 12, color: 'var(--accent)', fontFamily: 'var(--font)', fontWeight: 600, padding: 0, opacity: loading ? 0.5 : 1 }}>
              + Saisir une autre
            </button>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            {/* Jamais désactivé, même pendant l'enregistrement (voir ouvertRef).
                L'écriture partie ne s'arrête pas : le bouton dit alors
                « Fermer », « Annuler » ferait croire la résa abandonnée. */}
            <button type="button" onClick={onClose}
              style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600 }}>
              {loading ? 'Fermer' : 'Annuler'}
            </button>
            <button type="button" disabled={loading} onClick={() => submit(false)}
              style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid var(--accent)', background: 'var(--accent)', color: 'var(--on-accent)', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 700, opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
