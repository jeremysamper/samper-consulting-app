export const ZONE_TYPES = [
  { id:'froid',   label:'Froid positif',  icones:['❄','🧊','🏪'] },
  { id:'negatif', label:'Froid négatif',  icones:['🧊','❄','🔵'] },
  { id:'chaud',   label:'Chaud / cuisson',icones:['🔥','🍲','♨'] },
  { id:'hygiene', label:'Hygiène',        icones:['🧼','🚿','💧'] },
  { id:'friture', label:'Friture',        icones:['🍟','🫕','🔥'] },
  { id:'four',    label:'Four',           icones:['🟠','🔴','♨'] },
  { id:'custom',  label:'Personnalisé',   icones:['⬡','◎','◉'] },
];

export const CTRL_TYPES = [
  { id:'temperature', label:'Température' },
  { id:'hygiene',     label:'Hygiène / nettoyage' },
  { id:'reception',   label:'Réception marchandises' },
  { id:'dlc',         label:'DLC / DLUO' },
  { id:'personnel',   label:'Personnel' },
  { id:'equipement',  label:'Équipement' },
  { id:'custom',      label:'Autre' },
];

export const FREQ_OPTIONS = [
  'À chaque livraison','Avant chaque service','Après chaque service',
  '2× / jour','Quotidien','Hebdomadaire','Mensuel','Sur demande',
];

// ─── Écrans du module ───
// Une tâche par écran ; le libellé sert à la tuile de l'accueil et au titre
// de l'écran. L'identifiant est celui de l'ancien onglet ; le tableau du jour
// n'est pas un écran, il vit sur l'accueil, sous la carte « Maintenant » et
// les tuiles. « tournee » (le relevé guidé) n'a pas de tuile : la carte
// « Maintenant » y mène ; son titre devient « Relevé de HH:MM » quand
// l'établissement a des heures de relevé.
export const ECRANS_HACCP = {
  tournee: 'Relevé des températures',
  etiquettes: "J'imprime une étiquette",
  tracabilite: 'Je photographie une étiquette',
  controles: 'Je coche un contrôle',
  releves: 'Le registre',
  config: 'Réglages',
};

// ─── Aide « Première fois ici ? » ───
// Lue une fois par personne et par appareil : la clé porte l'id de la
// personne (une tablette partagée par la brigade la montre à chaque nouveau),
// valeur '1' une fois refermée. Hors de UI_STORAGE_KEYS pour ne pas toucher
// un fichier partagé par tous les modules.
export const AIDE_HACCP_CLE = 'sc_haccp_aide_vue_';

// ─── Ce qu'on fait quand un chiffre sort de la plage ───
// Proposé en puces sous la ligne hors plage, au choix, plusieurs possibles :
// rien n'est obligatoire, mais celui qui débute voit tout de suite quoi faire.
// Les libellés choisis partent dans le commentaire du relevé (même INSERT).
// « Autre chose » ouvre un champ libre et n'est jamais écrit lui-même.
export const ACTION_AUTRE = 'Autre chose';
export const ACTIONS_CORRECTIVES = {
  froid_haut: ['Porte fermée, je relève de nouveau dans 30 minutes', 'Produits déplacés dans un autre frigo', 'Chef prévenu', 'Produits jetés', ACTION_AUTRE],
  froid_bas: ['Réglage du frigo corrigé', 'Chef prévenu', ACTION_AUTRE],
  chaud_bas: ['Remis à chauffer, je relève de nouveau dans 30 minutes', 'Chef prévenu', 'Produits jetés', ACTION_AUTRE],
  chaud_haut: ['Température baissée', 'Chef prévenu', ACTION_AUTRE],
  hygiene: ['Cycle relancé', 'Chef prévenu', ACTION_AUTRE],
  autre: ['Chef prévenu', ACTION_AUTRE],
};

// ─── Créneaux de relevé ───
// Libellés proposés à la création d'un créneau : la brigade reconnaît sa
// tournée à son nom, pas à son heure. Liste indicative, la saisie reste libre.
export const CRENEAU_LABELS = [
  'Ouverture', 'Avant service midi', 'Après service midi',
  'Avant service soir', 'Après service soir', 'Fermeture',
];

// Modèles proposés quand aucun créneau n'est configuré. Ils reproduisent les
// deux organisations réelles du parc (un seul shift au Rucher d'Evolène,
// départ 6h, et double service à Woodland Village) et restent modifiables
// créneau par créneau une fois appliqués.
export const CRENEAUX_PRESETS = [
  {
    id: 'simple',
    label: 'Service unique',
    sub: 'Un seul shift : tournée d\'ouverture et tournée de fermeture',
    creneaux: [
      { label: 'Ouverture', heure: '06:30' },
      { label: 'Fermeture', heure: '15:00' },
    ],
  },
  {
    id: 'double',
    label: 'Double service',
    sub: 'Midi et soir : ouverture, avant chaque service, fermeture',
    creneaux: [
      { label: 'Ouverture',           heure: '07:00' },
      { label: 'Avant service midi',  heure: '11:30' },
      { label: 'Avant service soir',  heure: '18:00' },
      { label: 'Fermeture',           heure: '22:30' },
    ],
  },
];

export const INITIAL_ZONES = [
  { id:'z1', nom:'Chambre froide positive 1', type:'froid',   cible:4,   min:0,   max:6,   unite:'°C', icone:'❄', actif:true },
  { id:'z2', nom:'Chambre froide positive 2', type:'froid',   cible:3,   min:0,   max:6,   unite:'°C', icone:'❄', actif:true },
  { id:'z3', nom:'Chambre froide négative',   type:'negatif', cible:-18, min:-22, max:-15, unite:'°C', icone:'🧊', actif:true },
  { id:'z4', nom:'Zone de préparation chaude',type:'chaud',   cible:75,  min:63,  max:null,unite:'°C', icone:'🔥', actif:true },
  { id:'z5', nom:'Bain-marie service',        type:'chaud',   cible:65,  min:63,  max:null,unite:'°C', icone:'🍲', actif:true },
  { id:'z6', nom:'Lave-vaisselle (rinçage)', type:'hygiene',  cible:85,  min:82,  max:null,unite:'°C', icone:'🧼', actif:true },
];

export const INITIAL_CTRL_TPL = [
  { id:'c1', label:'Réception marchandises',              frequence:'À chaque livraison',   type:'reception',   actif:true },
  { id:'c2', label:'Contrôle température avant service',  frequence:'Avant chaque service', type:'temperature', actif:true },
  { id:'c3', label:'Nettoyage & désinfection surfaces',   frequence:'Quotidien',            type:'hygiene',     actif:true },
  { id:'c4', label:'Contrôle DLC / DLUO produits',        frequence:'Quotidien',            type:'dlc',         actif:true },
  { id:'c5', nom:'Vérification chaîne du froid',          frequence:'2× / jour',            type:'temperature', actif:true, label:'Vérification chaîne du froid' },
  { id:'c6', label:'Hygiène du personnel',                frequence:'Début de service',     type:'personnel',   actif:true },
];

export const INITIAL_RELEVES = [
  { id:'r1', zoneId:'z1', date:'2026-04-21', heure:'07:15', valeur:3.8,   operateur:'u6', conforme:true,  commentaire:'' },
  { id:'r2', zoneId:'z2', date:'2026-04-21', heure:'07:15', valeur:4.2,   operateur:'u6', conforme:true,  commentaire:'' },
  { id:'r3', zoneId:'z3', date:'2026-04-21', heure:'07:15', valeur:-19.1, operateur:'u6', conforme:true,  commentaire:'' },
  { id:'r4', zoneId:'z5', date:'2026-04-21', heure:'11:45', valeur:67.0,  operateur:'u3', conforme:true,  commentaire:'' },
  { id:'r5', zoneId:'z1', date:'2026-04-20', heure:'07:10', valeur:7.2,   operateur:'u6', conforme:false, commentaire:'Alerte - porte mal fermée, corrigé immédiatement' },
  { id:'r6', zoneId:'z2', date:'2026-04-20', heure:'07:10', valeur:5.1,   operateur:'u6', conforme:true,  commentaire:'' },
  { id:'r7', zoneId:'z3', date:'2026-04-20', heure:'07:10', valeur:-18.3, operateur:'u6', conforme:true,  commentaire:'' },
  { id:'r8', zoneId:'z5', date:'2026-04-20', heure:'18:30', valeur:64.0,  operateur:'u4', conforme:true,  commentaire:'' },
  { id:'r9', zoneId:'z6', date:'2026-04-20', heure:'09:00', valeur:83.5,  operateur:'u3', conforme:true,  commentaire:'' },
];

export const INITIAL_CONTROLS = [
  { id:'ct1', templateId:'c1', date:'2026-04-21', heure:'08:00', operateur:'u3', statut:'conforme',     notes:'Livraison Metro - températures OK à réception' },
  { id:'ct2', templateId:'c3', date:'2026-04-21', heure:'14:00', operateur:'u6', statut:'conforme',     notes:'' },
  { id:'ct3', templateId:'c4', date:'2026-04-21', heure:'07:30', operateur:'u3', statut:'conforme',     notes:'' },
  { id:'ct4', templateId:'c2', date:'2026-04-20', heure:'11:30', operateur:'u4', statut:'non-conforme', notes:'Bain-marie à 61°C - réglage effectué, refait le contrôle à 12h (OK)' },
  { id:'ct5', templateId:'c5', date:'2026-04-20', heure:'07:15', operateur:'u6', statut:'conforme',     notes:'' },
  { id:'ct6', templateId:'c6', date:'2026-04-21', heure:'09:00', operateur:'u3', statut:'conforme',     notes:'' },
];

// ─── Formulaire zone (add/edit) ───
