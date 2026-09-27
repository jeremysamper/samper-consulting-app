import { X } from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { addDays, isoDate, parseLocalDate } from '../../utils/dateHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Briques partagées du module Spa : fenêtres (modale et tiroir), puces,
// avatars, onglets, états vides, statuts des rendez-vous, calculs de dates.
//
// Toutes les couleurs passent par les jetons --spa-* de spa.css (clair et
// sombre) : aucune couleur en dur dans les composants.
// ─────────────────────────────────────────────────────────────────────────────

export const STATUTS_RDV = {
  // Demande venue du site du client, en attente de la réception.
  demande:   { label: 'À confirmer', fond: 'var(--spa-kin-soft)',   texte: 'var(--spa-kin)',     barre: 'var(--spa-kin)' },
  prevue:    { label: 'Prévu',    fond: 'var(--spa-mizu-soft)',    texte: 'var(--spa-mizu)',    barre: 'var(--spa-mizu)' },
  confirmee: { label: 'Confirmé', fond: 'var(--spa-matcha-soft)',  texte: 'var(--spa-matcha)',  barre: 'var(--spa-matcha)' },
  terminee:  { label: 'Terminé',  fond: 'var(--spa-sunken)',       texte: 'var(--spa-ink2)',    barre: 'var(--spa-line2)' },
  annulee:   { label: 'Annulé',   fond: 'var(--spa-sunken)',       texte: 'var(--spa-ink3)',    barre: 'var(--spa-line)' },
  absent:    { label: 'Absent',   fond: 'var(--spa-sakura-soft)',  texte: 'var(--spa-sakura)',  barre: 'var(--spa-sakura)' },
};
export const metaStatutRdv = (s) => STATUTS_RDV[s] || STATUTS_RDV.prevue;

export function nomClient(c) {
  if (!c) return 'Client supprimé';
  return [c.prenom, c.nom].filter(Boolean).join(' ') || 'Sans nom';
}

export function initiales(c) {
  const p = (c?.prenom || '').trim()[0] || '';
  const n = (c?.nom || '').trim()[0] || '';
  return (p + n).toUpperCase() || '?';
}

export function heureFin(debut, dureeMin) {
  if (!debut) return '';
  const [h, m] = debut.split(':').map(Number);
  const t = h * 60 + m + (Number(dureeMin) || 0);
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

export const minutes = (hhmm) => {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export function dureeLisible(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

export function age(dateNaissance, aujourdhui) {
  if (!dateNaissance) return null;
  const [a, m, j] = dateNaissance.split('-').map(Number);
  const [ta, tm, tj] = aujourdhui.split('-').map(Number);
  let n = ta - a;
  if (tm < m || (tm === m && tj < j)) n -= 1;
  return n >= 0 && n < 130 ? n : null;
}

const bissextile = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

// Prochain anniversaire (aujourd'hui compris) et nombre de jours d'ici là.
// Un 29 février est fêté le 28 les années non bissextiles, comme le mailer.
export function prochainAnniversaire(dateNaissance, aujourdhui) {
  if (!dateNaissance) return null;
  const [, m, j] = dateNaissance.split('-').map(Number);
  const [ta] = aujourdhui.split('-').map(Number);
  for (const annee of [ta, ta + 1]) {
    const jour = m === 2 && j === 29 && !bissextile(annee) ? 28 : j;
    const iso = `${annee}-${String(m).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
    if (iso >= aujourdhui) {
      const jours = Math.round((parseLocalDate(iso) - parseLocalDate(aujourdhui)) / 86400000);
      return { date: iso, jours };
    }
  }
  return null;
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
  'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
export function dateLongue(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MOIS[m - 1]} ${y}`;
}
export function jourMois(iso) {
  if (!iso) return '';
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MOIS[m - 1]}`;
}
export function jourComplet(iso) {
  if (!iso) return '';
  const d = parseLocalDate(iso);
  return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`;
}

export const decalerJour = (iso, n) => isoDate(addDays(parseLocalDate(iso), n));

export function formatPrix(prix) {
  if (prix === null || prix === undefined || prix === '') return '';
  return `CHF ${Number(prix).toFixed(2).replace(/\.00$/, '.-')}`;
}

// ── Avatar : initiales sur une teinte douce, stable pour un même client ──
const TEINTES = [
  ['var(--spa-mizu-soft)', 'var(--spa-mizu)'],
  ['var(--spa-matcha-soft)', 'var(--spa-matcha)'],
  ['var(--spa-kin-soft)', 'var(--spa-kin)'],
  ['var(--spa-sakura-soft)', 'var(--spa-sakura)'],
];
function teinte(cle) {
  let h = 0;
  for (const ch of String(cle || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TEINTES[h % TEINTES.length];
}

export function Avatar({ client, taille = 44 }) {
  const [fond, texte] = teinte(client?.id || nomClient(client));
  return (
    <span
      aria-hidden="true"
      style={{
        width: taille, height: taille, borderRadius: taille / 2, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: fond, color: texte, fontFamily: 'var(--font-serif)',
        fontSize: Math.round(taille * 0.38), letterSpacing: '0.02em',
      }}
      data-no-translate
    >
      {initiales(client)}
    </span>
  );
}

// ── Puce : petite étiquette arrondie, avec icône facultative ──
export function Puce({ icone: Icone, children, ton = 'neutre', style }) {
  const tons = {
    neutre: ['var(--spa-sunken)', 'var(--spa-ink2)'],
    mizu: ['var(--spa-mizu-soft)', 'var(--spa-mizu)'],
    matcha: ['var(--spa-matcha-soft)', 'var(--spa-matcha)'],
    sakura: ['var(--spa-sakura-soft)', 'var(--spa-sakura)'],
    kin: ['var(--spa-kin-soft)', 'var(--spa-kin)'],
  };
  const [fond, texte] = tons[ton] || tons.neutre;
  return (
    <span style={{ ...st.puce, background: fond, color: texte, ...style }}>
      {Icone && <Icone size={13} strokeWidth={2} aria-hidden="true" />}
      {children}
    </span>
  );
}

// ── Onglets du module : pilules avec icône, défilement horizontal au besoin ──
export function OngletsSpa({ onglets, actif, onChange }) {
  return (
    <div role="tablist" aria-label="Sections du spa" className="spa-defile" style={st.onglets}>
      {onglets.map(({ id, label, icone: Icone }) => {
        const sel = id === actif;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={sel}
            onClick={() => onChange(id)}
            style={{ ...st.onglet, ...(sel ? st.ongletActif : null) }}
          >
            {Icone && <Icone size={16} strokeWidth={1.8} aria-hidden="true" />}
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ── État vide : une icône, une phrase, éventuellement une action ──
export function EtatVide({ icone: Icone, titre, texte, action }) {
  return (
    <div style={st.vide}>
      {Icone && (
        <span style={st.videIcone} aria-hidden="true"><Icone size={22} strokeWidth={1.6} /></span>
      )}
      {titre && <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--spa-ink)' }}>{titre}</div>}
      {texte && <div style={{ fontSize: 14, color: 'var(--spa-ink2)', lineHeight: 1.55, maxWidth: 420 }}>{texte}</div>}
      {action}
    </div>
  );
}

export function TitreSection({ children, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '0 0 12px' }}>
      <h3 style={st.titreSection}>{children}</h3>
      {action}
    </div>
  );
}

// ── Fenêtres ──────────────────────────────────────────────────────────────
// Modale centrée, ou tiroir latéral (variante="tiroir") pour les fiches, qui
// laisse l'agenda visible derrière sur grand écran. Sur téléphone, les deux
// deviennent des feuilles plein écran. La fermeture n'est jamais désactivée,
// même pendant un enregistrement (règle « modales pendant une écriture »).
// titreBrut : le titre est une donnée (nom d'un client), jamais traduite.
// feuille : contenu court, en feuille remontant du bas sur téléphone (sinon
// plein écran).
export function Modale({
  titre, surTitre, sousTitre, onClose, children, pied, largeur = 560, titreBrut = false,
  variante = 'modale', entete = null, feuille = false,
}) {
  const mobile = useIsMobile();
  const tiroir = variante === 'tiroir' && !mobile;
  const plein = mobile && !feuille;
  return (
    <div
      className={`spa-voile ${plein ? 'modal-full-overlay' : 'modal-sheet-overlay'}`}
      style={{ ...st.voile, ...(tiroir ? st.voileTiroir : null), ...(plein ? st.voileMobile : null) }}
      onClick={onClose}
    >
      <div
        className={`${tiroir ? 'spa-tiroir' : 'spa-apparition'} ${plein ? 'modal-full' : 'modal-sheet'}`}
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        style={{
          ...st.fenetre,
          ...(tiroir ? { ...st.tiroir, width: largeur } : { width: largeur }),
          ...(plein ? st.fenetreMobile : null),
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {entete || (
          <div style={st.entete}>
            <div style={{ minWidth: 0 }}>
              {surTitre && <div style={st.surTitre}>{surTitre}</div>}
              <div style={st.titre} data-no-translate={titreBrut ? '' : undefined}>{titre}</div>
              {sousTitre && <div style={st.sousTitre}>{sousTitre}</div>}
            </div>
            <BoutonFermer onClose={onClose} />
          </div>
        )}
        <div style={st.corps}>
          <div style={st.colonne}>{children}</div>
        </div>
        {pied && <div style={st.pied}>{pied}</div>}
      </div>
    </div>
  );
}

export function BoutonFermer({ onClose, style }) {
  return (
    <button type="button" onClick={onClose} aria-label="Fermer" style={{ ...st.fermer, ...style }}>
      <X size={20} strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}

export function Champ({ label, htmlFor, aide, children }) {
  return (
    <div style={{ minWidth: 0 }}>
      {label && <label style={st.label} htmlFor={htmlFor}>{label}</label>}
      {children}
      {aide && <div style={st.aide}>{aide}</div>}
    </div>
  );
}

// Base des boutons en borderWidth / borderStyle / borderColor : les variantes
// actives surchargent borderColor (lint:borders).
const bouton = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  minHeight: 44, padding: '10px 18px', borderRadius: 999, cursor: 'pointer',
  fontSize: 14, fontWeight: 600, fontFamily: 'var(--font)', whiteSpace: 'nowrap',
  borderWidth: 1, borderStyle: 'solid', borderColor: 'transparent',
};

export const st = {
  page: {
    padding: '20px 24px 40px', position: 'relative', minHeight: '100%', minWidth: 0,
    background: 'var(--spa-bg)', color: 'var(--spa-ink)',
  },
  voile: {
    position: 'fixed', inset: 0, background: 'var(--spa-scrim)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
  },
  voileTiroir: { justifyContent: 'flex-end', alignItems: 'stretch', padding: 12 },
  voileMobile: { padding: 0, alignItems: 'stretch' },
  fenetre: {
    background: 'var(--spa-surface)', color: 'var(--spa-ink)', maxWidth: '100%', maxHeight: '92vh',
    borderRadius: 'var(--spa-r-lg)', display: 'flex', flexDirection: 'column',
    boxShadow: 'var(--spa-shadow-lift)', overflow: 'hidden',
  },
  tiroir: { maxHeight: 'none', height: '100%' },
  fenetreMobile: { width: '100%', maxHeight: 'none', height: '100%', borderRadius: 0 },
  entete: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
    padding: '20px 22px 16px', borderBottom: '1px solid var(--spa-line)', flexShrink: 0,
  },
  surTitre: {
    fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
    color: 'var(--spa-mizu)', marginBottom: 4,
  },
  titre: { fontSize: 22, lineHeight: 1.2, fontFamily: 'var(--font-serif)', color: 'var(--spa-ink)' },
  sousTitre: { fontSize: 13, color: 'var(--spa-ink2)', marginTop: 4 },
  fermer: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    width: 44, height: 44, borderRadius: 22, cursor: 'pointer',
    background: 'var(--spa-surface2)', color: 'var(--spa-ink2)', border: '1px solid var(--spa-line)',
  },
  corps: { flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '20px 22px' },
  colonne: { display: 'flex', flexDirection: 'column', gap: 18 },
  pied: {
    display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end', flexShrink: 0,
    padding: '14px 22px', borderTop: '1px solid var(--spa-line)', background: 'var(--spa-surface2)',
  },
  label: {
    display: 'block', fontSize: 12, fontWeight: 600, letterSpacing: '0.04em',
    color: 'var(--spa-ink2)', marginBottom: 6,
  },
  aide: { fontSize: 12, color: 'var(--spa-ink2)', marginTop: 6, lineHeight: 1.45 },
  champ: {
    width: '100%', padding: '10px 14px', boxSizing: 'border-box', minHeight: 46,
    border: '1px solid var(--spa-line)', borderRadius: 'var(--spa-r-sm)',
    background: 'var(--spa-surface2)', color: 'var(--spa-ink)', fontFamily: 'var(--font)', fontSize: 15,
    transition: 'border-color 200ms ease, box-shadow 200ms ease',
  },
  zone: {
    width: '100%', padding: '11px 14px', boxSizing: 'border-box', minHeight: 84, resize: 'vertical',
    border: '1px solid var(--spa-line)', borderRadius: 'var(--spa-r-sm)', lineHeight: 1.5,
    background: 'var(--spa-surface2)', color: 'var(--spa-ink)', fontFamily: 'var(--font)', fontSize: 15,
    transition: 'border-color 200ms ease, box-shadow 200ms ease',
  },
  grille2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 },
  principal: { ...bouton, background: 'var(--spa-mizu)', color: 'var(--spa-on-mizu)', borderColor: 'var(--spa-mizu)' },
  secondaire: { ...bouton, background: 'var(--spa-surface)', color: 'var(--spa-ink)', borderColor: 'var(--spa-line2)' },
  discret: { ...bouton, background: 'transparent', color: 'var(--spa-ink2)', padding: '10px 12px' },
  danger: { ...bouton, background: 'transparent', color: 'var(--spa-sakura)', borderColor: 'var(--spa-sakura-soft)' },
  lien: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: 'none', border: 'none', padding: '6px 0', minHeight: 36, cursor: 'pointer',
    color: 'var(--spa-mizu)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)',
  },
  encartAttention: {
    display: 'flex', gap: 10, alignItems: 'flex-start',
    padding: '12px 14px', borderRadius: 'var(--spa-r-sm)', fontSize: 14, lineHeight: 1.5,
    background: 'var(--spa-kin-soft)', color: 'var(--spa-ink)', border: '1px solid var(--spa-kin-line)',
  },
  encartSante: {
    display: 'flex', gap: 10, alignItems: 'flex-start',
    padding: '12px 14px', borderRadius: 'var(--spa-r-sm)', fontSize: 14, lineHeight: 1.5,
    background: 'var(--spa-sakura-soft)', color: 'var(--spa-ink)',
  },
  encartDanger: {
    padding: '12px 14px', borderRadius: 'var(--spa-r-sm)', fontSize: 14, lineHeight: 1.5,
    background: 'var(--spa-sakura-soft)', color: 'var(--spa-sakura)',
  },
  encartInfo: {
    display: 'flex', gap: 10, alignItems: 'flex-start',
    padding: '12px 14px', borderRadius: 'var(--spa-r-sm)', fontSize: 14, lineHeight: 1.5,
    background: 'var(--spa-mizu-soft)', color: 'var(--spa-ink)',
  },
  carte: {
    background: 'var(--spa-surface)', border: '1px solid var(--spa-line)', borderRadius: 'var(--spa-r)',
    padding: 18, minWidth: 0, boxShadow: 'var(--spa-shadow)',
  },
  titreSection: {
    margin: 0, fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
    color: 'var(--spa-ink2)',
  },
  liste: { display: 'flex', flexDirection: 'column', gap: 8 },
  ligne: {
    display: 'flex', alignItems: 'center', gap: 14, width: '100%', minWidth: 0,
    minHeight: 60, flexShrink: 0, boxSizing: 'border-box',
    padding: '10px 14px', borderRadius: 'var(--spa-r)', cursor: 'pointer', textAlign: 'left',
    background: 'var(--spa-surface)', border: '1px solid var(--spa-line)', overflow: 'hidden',
    fontFamily: 'var(--font)', color: 'var(--spa-ink)', boxShadow: 'var(--spa-shadow)',
  },
  puce: {
    display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
    padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', lineHeight: 1.3,
  },
  vide: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center',
    padding: '40px 20px', borderRadius: 'var(--spa-r-lg)',
    border: '1px dashed var(--spa-line2)', background: 'var(--spa-surface)',
  },
  videIcone: {
    width: 52, height: 52, borderRadius: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--spa-mizu-soft)', color: 'var(--spa-mizu)', marginBottom: 4,
  },
  onglets: {
    display: 'flex', gap: 4, padding: 4, borderRadius: 999, maxWidth: '100%', minWidth: 0,
    background: 'var(--spa-surface)', border: '1px solid var(--spa-line)', boxShadow: 'var(--spa-shadow)',
  },
  onglet: {
    display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0,
    minHeight: 42, padding: '8px 16px', borderRadius: 999, cursor: 'pointer',
    background: 'transparent', color: 'var(--spa-ink2)', border: 'none',
    fontSize: 14, fontWeight: 600, fontFamily: 'var(--font)', whiteSpace: 'nowrap',
  },
  ongletActif: { background: 'var(--spa-mizu)', color: 'var(--spa-on-mizu)' },
  // Choix (soins, durées, filtres) : base en longhands, l'état actif surcharge
  // borderColor.
  choix: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    minHeight: 42, padding: '8px 14px', borderRadius: 999, cursor: 'pointer',
    fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)', whiteSpace: 'nowrap',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spa-line)',
    background: 'var(--spa-surface)', color: 'var(--spa-ink2)',
  },
  choixActif: { borderColor: 'var(--spa-mizu)', background: 'var(--spa-mizu-soft)', color: 'var(--spa-mizu)' },
  caseLabel: {
    display: 'flex', alignItems: 'flex-start', gap: 12, minHeight: 44, cursor: 'pointer',
    fontSize: 14, lineHeight: 1.5, color: 'var(--spa-ink)', borderRadius: 'var(--spa-r-sm)',
  },
  case: { width: 20, height: 20, margin: '2px 0 0', flexShrink: 0, accentColor: 'var(--spa-mizu)' },
};
