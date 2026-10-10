// ─────────────────────────────────────────────────────────────────────────────
// Modèles d'horaires du Planning : ce qu'on pose en un geste sur une case.
//
// Un modèle porte un ou plusieurs segments. « Coupure » en porte deux (midi et
// soir) : il crée deux horaires le même jour, qui ne se chevauchent pas, comme
// un service coupé saisi à la main. Le type d'un segment (`typeShift`) est la
// valeur écrite dans shifts.type_shift (colonne texte libre, sans contrainte).
//
// Les modèles réglés par établissement viennent de usePlanningModeles ; ceux-ci
// servent tant que l'établissement n'a rien réglé.
// ─────────────────────────────────────────────────────────────────────────────

// Libellé et teinte de chaque type d'horaire, partout dans le module.
export const TYPES_HORAIRE = {
  midi: { label: 'Midi', fond: 'var(--warning-bg)', texte: 'var(--warning-text)' },
  soir: { label: 'Soir', fond: 'var(--info-bg)', texte: 'var(--info-text)' },
  longue: { label: 'Longue', fond: 'var(--success-bg)', texte: 'var(--success-text)' },
  simple: { label: 'Continue', fond: 'var(--surface2)', texte: 'var(--text)' },
};

export const typeHoraire = (typeShift) => TYPES_HORAIRE[typeShift] || TYPES_HORAIRE.simple;

export const MODELES_DEFAUT = [
  { id: 'midi', nom: 'Midi', segments: [{ typeShift: 'midi', debut: '10:00', fin: '15:00', pause: 0 }] },
  { id: 'soir', nom: 'Soir', segments: [{ typeShift: 'soir', debut: '17:00', fin: '23:00', pause: 0 }] },
  {
    id: 'coupure',
    nom: 'Coupure',
    segments: [
      { typeShift: 'midi', debut: '10:00', fin: '15:00', pause: 0 },
      { typeShift: 'soir', debut: '17:00', fin: '23:00', pause: 0 },
    ],
  },
  { id: 'longue-matin', nom: 'Longue matin', segments: [{ typeShift: 'longue', debut: '08:00', fin: '16:00', pause: 45 }] },
  { id: 'longue-soir', nom: 'Longue soir', segments: [{ typeShift: 'longue', debut: '16:00', fin: '23:00', pause: 45 }] },
];

// Date ISO décalée de n jours (midi local : jamais de saut à la journée voisine).
export const ajouterJours = (iso, n) => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export const minutes = (t) => {
  const [h, m] = String(t || '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

// Durée travaillée d'un segment, en heures (pause déduite).
export const heuresSegment = (s) => {
  if (!s?.debut || !s?.fin) return 0;
  return Math.max(0, minutes(s.fin) - minutes(s.debut) - (Number(s.pause) || 0)) / 60;
};

export const heuresModele = (m) => (m?.segments || []).reduce((t, s) => t + heuresSegment(s), 0);

// « 5 h », « 7 h 15 » : la durée se lit comme on la dit.
export const formatDuree = (h) => {
  const totalMin = Math.round((Number(h) || 0) * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return mm ? `${hh} h ${String(mm).padStart(2, '0')}` : `${hh} h`;
};

export const libelleSegment = (s) => `${s.debut} à ${s.fin}`;

// « 10:00 à 15:00 et 17:00 à 23:00, pause 45 min »
export const libelleModele = (m) => {
  const segs = m?.segments || [];
  const heures = segs.map(libelleSegment).join(' et ');
  const pause = segs.reduce((t, s) => t + (Number(s.pause) || 0), 0);
  return pause ? `${heures}, pause ${pause} min` : heures;
};

// Deux créneaux se chevauchent-ils ? Bornes adjacentes (fin = début) : non.
// Un midi et un soir coexistent, le service coupé reste possible.
export const chevauche = (aDebut, aFin, bDebut, bFin) =>
  minutes(aDebut) < minutes(bFin) && minutes(bDebut) < minutes(aFin);

// Horaires à créer pour poser `modele` chez `userId` le `date`, en laissant de
// côté les segments qui chevauchent un horaire existant. Retourne
// { aCreer: [shift…], ignores: n }.
export const horairesDuModele = (modele, { userId, date, etablissementId, existants = [], poste = '' }) => {
  const aCreer = [];
  let ignores = 0;
  (modele?.segments || []).forEach((s) => {
    const occupe = existants.some(e => e.userId === userId && e.date === date && chevauche(e.debut, e.fin, s.debut, s.fin));
    if (occupe) { ignores += 1; return; }
    aCreer.push({
      etablissementId,
      userId,
      date,
      debut: s.debut,
      fin: s.fin,
      pause: Number(s.pause) || 0,
      poste: poste || '',
      typeShift: s.typeShift || 'simple',
      statut: 'confirmé',
      pointageDebut: null,
      pointageFin: null,
    });
  });
  return { aCreer, ignores };
};
