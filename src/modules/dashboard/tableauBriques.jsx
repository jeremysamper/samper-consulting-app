import React from 'react';
import { ChevronRight, CircleCheck } from 'lucide-react';
import PhoneLink from '../../components/PhoneLink.jsx';
import { userDisplay } from '../../utils/userDisplay.js';
import { metaMotif } from '../../utils/absences.js';
import { metaStatut } from '../groupes/typesGroupe.js';
import { Avatar } from './tableauUi.jsx';
import { pictoCercleStyle } from '../../components/ui/index.jsx';
import { duree } from './tableauLogique.js';

// ─────────────────────────────────────────────────────────────────────────────
// Briques du tableau de bord v3 : section titrée, sous-section, lien vers un
// module, repère de l'en-tête, ligne d'action, personne, état d'un équipier,
// chiffre de gestion. Aucune boîte : les blocs se posent sur la page,
// séparés par l'espace et leur titre, les lignes par un filet (.tdb-filet).
// Les tailles qui suivent la largeur (titres, chiffres) sont dans tableau.css.
//
// Traduction : chaque nombre, heure et nom dans son propre nœud (en
// data-no-translate), chaque texte fixe dans le sien, pour que le glossaire
// les trouve au lieu d'envoyer au traducteur une phrase qui change à la minute.
// tableauUi.jsx (Carte, Puce) reste celui des modules Hôtel.
// ─────────────────────────────────────────────────────────────────────────────

// Section de premier niveau : `id` sur le <section>, `${id}-titre` sur son h2.
// Avec un sous-titre, le lien se range au bout de la ligne du sous-titre :
// le titre garde sa ligne, sans pousser le lien sur une ligne de plus.
// `panneau` (par défaut) : la section se pose sur un fond à elle, ses limites
// se voient d'un coup d'œil (tableau.css, .tdb-panneau). Sans panneau, seul
// le titre la porte : « Ce qui vous attend », dont chaque colonne est un
// panneau.
// `ton` : la section est une carte de mise en avant (nuit, ciel, soleil ;
// tableau.css), au plus une sombre et deux pastel sur l'écran.
export function Section({ id, titre, sousTitre, action, panneau = true, ton, children, style }) {
  const h2 = <h2 id={`${id}-titre`} className="tdb-titre" style={b.titre}>{titre}</h2>;
  const classe = panneau ? `tdb-panneau${ton ? ` tdb-${ton}` : ''}` : undefined;
  return (
    <section id={id} aria-labelledby={`${id}-titre`} className={classe} style={{ ...b.section, ...style }}>
      {sousTitre ? (
        <div className="tdb-tete" style={b.tete}>
          {h2}
          <div style={b.teteLigne}>
            <p style={b.sousTitre}>{sousTitre}</p>
            {action}
          </div>
        </div>
      ) : (
        <div className="tdb-tete" style={{ ...b.tete, ...b.teteLigne }}>
          {h2}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

// Sous-section : titre court (« Midi », « Réservations »), son compte, un lien.
// Le titre se pose sur un bandeau teinté (tableau.css, .tdb-sous-tete) pour
// que Midi et Soir, ou Réservations et Groupes, se distinguent d'un regard.
// `bandeau={false}` : un titre de niveau au-dessus, sans bandeau (« Qui
// travaille aujourd'hui » dans l'onglet du téléphone, au-dessus de Midi).
export function SousSection({ titre, icone: Icone, compte, sousTitre, action, niveau = 3, bandeau = true, children, style, className }) {
  const Titre = `h${niveau}`;
  return (
    <div className={className} style={{ minWidth: 0, ...style }}>
      <div className={bandeau ? 'tdb-sous-tete' : undefined} style={b.sousTete}>
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <Titre style={bandeau ? b.sousTitreTexte : { ...b.sousTitreTexte, ...b.sousTitreFort }}>
            {Icone && <Icone size={16} strokeWidth={2} aria-hidden="true" style={{ color: 'var(--lien)', alignSelf: 'center', flexShrink: 0 }} />}
            <span>{titre}</span>
            {compte != null && <span style={b.compte} data-no-translate>{compte}</span>}
          </Titre>
          {sousTitre && <p style={b.sousDetail}>{sousTitre}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// « Ouvrir le planning › » : lien texte vers un module, cible de 44 px.
export function LienModule({ children, onClick }) {
  if (!onClick) return null;
  return (
    <button type="button" className="tdb-lien" onClick={onClick} style={b.lien}>
      <span>{children}</span>
      <ChevronRight size={16} strokeWidth={1.8} aria-hidden="true" style={{ flexShrink: 0 }} />
    </button>
  );
}

// Détail en parties { n } (valeur, sans traduction) et { t } (texte fixe).
// Une espace entre deux parties, sauf devant une virgule ou un point.
export function Parties({ parties }) {
  return (parties || []).map((p, i) => {
    const espace = i > 0 && !(p.t && /^[,.]/.test(p.t)) ? ' ' : '';
    return (
      <React.Fragment key={i}>
        {espace}
        {p.n != null ? <span data-no-translate>{p.n}</span> : <span>{p.t}</span>}
      </React.Fragment>
    );
  });
}

// Une phrase mot à mot (« Vendredi 30 octobre ») : chaque mot dans son nœud,
// donc trouvé au glossaire, au lieu d'une date entière envoyée au traducteur.
export function Mots({ texte }) {
  return String(texte || '').split(' ').map((mot, i) => (
    <React.Fragment key={i}>{i ? ' ' : ''}<span>{mot}</span></React.Fragment>
  ));
}

// « 1 h 50 », « 9 min » : une durée ne se traduit pas.
export function Duree({ minutes, style }) {
  return <span data-no-translate style={style}>{duree(minutes)}</span>;
}

// Repère de l'en-tête : une petite carte blanche, le picto dans un cercle,
// un chiffre en grand, sa phrase, son détail. Mène au
// module quand le rôle peut l'ouvrir. Vide ou en échec, la phrase prend la
// place du chiffre (jamais un gros zéro). Pas d'aria-label : il remplacerait,
// pour un lecteur d'écran, le texte visible (« 110 couverts aujourd'hui, 42 à
// midi, 68 le soir ») par la seule destination.
export function Repere({ repere, icone: Icone, onClick }) {
  const { id, valeur, libelle, detail, vide, echec, texte } = repere;
  const contenu = (
    <>
      {Icone && <span className="tdb-repere-icone" style={pictoCercleStyle(36)} aria-hidden="true"><Icone size={18} strokeWidth={1.8} /></span>}
      {vide || echec ? (
        <span style={b.repereTexte}>{texte}</span>
      ) : (
        <>
          <span className="tdb-repere-valeur" data-valeur="" style={b.repereValeur} data-no-translate>{valeur.toLocaleString('fr-CH')}</span>
          <span style={b.repereLibelle}>{libelle}</span>
          {detail && <span style={b.repereDetail}><Parties parties={detail} /></span>}
        </>
      )}
    </>
  );
  if (!onClick) return <div data-repere={id} className="tdb-repere-carte" style={b.repere}>{contenu}</div>;
  return (
    <button type="button" data-repere={id} className="tdb-lien tdb-repere tdb-repere-carte" onClick={onClick} style={{ ...b.repere, ...b.bouton }}>
      {contenu}
    </button>
  );
}

// Ligne d'action (« À faire maintenant ») : pictogramme du module, titre,
// détail, et à droite ce qui presse. Bouton vers le module quand c'est permis.
// titreBrut : le titre porte un nom de personne ou de groupe, jamais traduit.
export function LigneAction({ icone: Icone, couleur = 'var(--lien)', titre, titreBrut, detail, droite, onClick }) {
  const contenu = (
    <>
      {Icone && <span style={{ ...pictoCercleStyle(36), color: couleur }} aria-hidden="true"><Icone size={18} strokeWidth={1.8} /></span>}
      <span style={{ flex: '1 1 auto', minWidth: 0 }}>
        <span style={b.ligneTitre} data-no-translate={titreBrut ? '' : undefined}>{titre}</span>
        {detail && <span style={b.ligneDetail}>{detail}</span>}
      </span>
      {droite}
      {onClick && <ChevronRight size={18} strokeWidth={1.8} aria-hidden="true" style={{ color: 'var(--text2)', flexShrink: 0 }} />}
    </>
  );
  if (!onClick) return <div className="tdb-filet" style={b.ligne}>{contenu}</div>;
  return (
    <button type="button" className="tdb-filet tdb-ligne tdb-lien" onClick={onClick} style={{ ...b.ligne, ...b.bouton }}>
      {contenu}
    </button>
  );
}

// Une personne : initiales, puis le nom et son état sur la première ligne,
// le détail (heures, poste) sur toute la largeur de la seconde, le téléphone
// pour la direction. `compact` (l'équipe de demain) : une ligne, sans
// initiales, le nom (et le téléphone dessous) à gauche, les heures à droite.
export function Personne({ userId, detail, tel, droite, compact = false, className = '' }) {
  const u = userDisplay(userId);
  if (compact) {
    return (
      <div className={`tdb-filet ${className}`} style={b.personneCompacte}>
        {tel ? (
          <span style={b.nomEtTel}>
            <span style={b.nomCompact} data-no-translate>{u.name}</span>
            <PhoneLink tel={tel} style={b.tel} />
          </span>
        ) : <span style={b.nomCompact} data-no-translate>{u.name}</span>}
        <span style={b.compacteDroite}>
          {detail && <span style={b.detailCompact}>{detail}</span>}
          {droite}
        </span>
      </div>
    );
  }
  return (
    <div className={`tdb-filet ${className}`} style={b.personne}>
      <Avatar userId={userId} taille={32} />
      <span style={{ flex: '1 1 auto', minWidth: 0 }}>
        <span style={b.personneTete}>
          <span style={b.nom} data-no-translate>{u.name}</span>
          {droite}
        </span>
        {detail && <span style={b.detail}>{detail}</span>}
        {tel && <PhoneLink tel={tel} style={b.tel} />}
      </span>
    </div>
  );
}

// État d'un équipier : texte 13 px, graisse 600, sans pastille. Les verts
// (« En poste », « Vacances ») s'écrivent en couleur de texte, précédés d'un
// repère vert : le vert de texte rate le contraste AA sur le fond de page.
const ETATS = {
  en_poste: { label: 'En poste', couleur: 'var(--text)', point: true },
  en_retard: { label: 'Pas pointé', couleur: 'var(--warning-text)' },
  attendu: { label: 'Attendu', couleur: 'var(--info-text)' },
  termine: { label: 'Terminé', couleur: 'var(--text2)' },
};

export function EtatEquipier({ etat, motif }) {
  if (motif) {
    const m = metaMotif(motif);
    const vert = m.id === 'vacances';
    return (
      <span style={{ ...b.etat, color: vert ? 'var(--text)' : m.texte }}>
        {vert && <CircleCheck size={14} strokeWidth={2} aria-hidden="true" style={{ color: 'var(--success-strong)' }} />}
        <span>{m.label}</span>
      </span>
    );
  }
  const e = ETATS[etat];
  if (!e) return null;
  return (
    <span style={{ ...b.etat, color: e.couleur }}>
      {e.point && <span className="tdb-live" aria-hidden="true" />}
      <span>{e.label}</span>
    </span>
  );
}

// Statut d'un groupe (« À lire », « Lu, à préparer », « Prêt ») : même règle.
export function StatutGroupe({ statut }) {
  const m = metaStatut(statut);
  const vert = statut === 'pret';
  return (
    <span style={{ ...b.etat, color: vert ? 'var(--text)' : m.texte }}>
      {vert && <CircleCheck size={14} strokeWidth={2} aria-hidden="true" style={{ color: 'var(--success-strong)' }} />}
      <span>{m.label}</span>
    </span>
  );
}

// Chiffre de gestion : une petite carte blanche, le picto dans un cercle à
// côté du libellé, la valeur en grand, le détail. Une phrase remplace la
// valeur quand il n'y a rien à compter ou que la lecture a échoué.
export function Chiffre({ id, label, valeur, texte, detail, couleurDetail = 'var(--text2)', icone: Icone, onClick }) {
  const contenu = (
    <>
      <span style={b.chiffreTete}>
        {Icone && <span style={pictoCercleStyle(36)} aria-hidden="true"><Icone size={18} strokeWidth={1.8} /></span>}
        <span style={b.chiffreLabel}>{label}</span>
      </span>
      {texte
        ? <span style={b.chiffreTexte}>{texte}</span>
        : <span className="tdb-chiffre-valeur" data-valeur="" style={b.chiffreValeur}>{valeur}</span>}
      {detail && <span style={{ ...b.chiffreDetail, color: couleurDetail }}>{detail}</span>}
    </>
  );
  if (!onClick) return <div data-chiffre={id} className="tdb-chiffre" style={b.chiffre}>{contenu}</div>;
  return (
    <button type="button" data-chiffre={id} className="tdb-chiffre tdb-lien" onClick={onClick} style={{ ...b.chiffre, ...b.bouton }}>
      {contenu}
    </button>
  );
}

// Phrase d'état vide ou d'échec, dans le corps d'une section.
export function Vide({ children, style }) {
  return <p style={{ ...b.vide, ...style }}>{children}</p>;
}

export const b = {
  section: { minWidth: 0, display: 'flex', flexDirection: 'column' },
  tete: { marginBottom: 8, minWidth: 0 },
  teteLigne: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0 16px', flexWrap: 'wrap', minWidth: 0 },
  titre: { margin: 0, fontFamily: 'var(--font)', fontWeight: 'var(--g3)', lineHeight: 1.2, color: 'var(--text)', flex: '1 1 auto', minWidth: 0 },
  sousTitre: { margin: '2px 0 0', fontSize: 'var(--t2)', lineHeight: 1.45, color: 'var(--text2)', flex: '1 1 auto', minWidth: 0 },
  sousTete: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0 12px', flexWrap: 'wrap', minWidth: 0, minHeight: 28 },
  sousTitreTexte: { margin: 0, display: 'flex', alignItems: 'baseline', gap: 8, fontFamily: 'var(--font)', fontSize: 'var(--t2)', fontWeight: 'var(--g3)', lineHeight: 1.3, color: 'var(--text)' },
  sousTitreFort: { fontFamily: 'var(--font)', fontSize: 'var(--t3)', fontWeight: 'var(--g3)', marginBottom: 6 },
  sousDetail: { margin: '2px 0 0', fontSize: 'var(--t2)', lineHeight: 1.4, color: 'var(--text2)' },
  compte: { fontFamily: 'var(--font-num)', fontWeight: 'var(--g-chiffre)', color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' },
  lien: {
    display: 'inline-flex', alignItems: 'center', gap: 2, minHeight: 44, padding: '0 4px 0 6px', flexShrink: 0,
    borderRadius: 'var(--r-sm)', cursor: 'pointer',
    fontFamily: 'var(--font)', fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--lien)', whiteSpace: 'nowrap',
  },
  // Fond et bordure des boutons .tdb-lien : tableau.css (.tdb button.tdb-lien),
  // pour que le survol de la classe s'applique (un fond inline l'emporterait).
  bouton: {
    cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)', color: 'var(--text)', width: '100%',
  },
  // Carte blanche : le retrait suit la largeur (.tdb-repere-carte, tableau.css).
  repere: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, minWidth: 0, boxSizing: 'border-box',
    borderRadius: 'var(--r-lg)', background: 'var(--zone)', boxShadow: 'inset 0 0 0 1px var(--rule-soft), var(--sh)',
  },
  repereValeur: { fontFamily: 'var(--font-num)', lineHeight: 1, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', marginTop: 6 },
  repereLibelle: { fontSize: 'var(--t2)', fontWeight: 'var(--g2)', lineHeight: 1.3, color: 'var(--text)', overflowWrap: 'anywhere' },
  repereDetail: { fontSize: 'var(--t1)', lineHeight: 1.4, color: 'var(--text3)', overflowWrap: 'anywhere' },
  repereTexte: { fontSize: 'var(--t2)', fontWeight: 'var(--g2)', lineHeight: 1.35, color: 'var(--text2)', overflowWrap: 'anywhere', marginTop: 4 },
  ligne: {
    display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, minHeight: 56, boxSizing: 'border-box', padding: '8px 2px',
  },
  ligneTitre: { display: 'block', fontSize: 'var(--t2)', fontWeight: 'var(--g3)', lineHeight: 1.35, color: 'var(--text)', overflowWrap: 'anywhere' },
  ligneDetail: { display: 'block', fontSize: 'var(--t2)', lineHeight: 1.45, color: 'var(--text2)', marginTop: 1, overflowWrap: 'anywhere' },
  personne: { display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, minHeight: 44, boxSizing: 'border-box', padding: '4px 0' },
  personneTete: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, minWidth: 0 },
  personneCompacte: {
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0 12px', flexWrap: 'wrap',
    minWidth: 0, minHeight: 36, boxSizing: 'border-box', padding: '7px 0',
  },
  compacteDroite: { display: 'inline-flex', alignItems: 'baseline', gap: 10, flexShrink: 0 },
  nom: { display: 'block', flex: '0 1 auto', minWidth: 0, fontSize: 'var(--t2)', fontWeight: 'var(--g2)', lineHeight: 1.35, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  nomEtTel: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 },
  nomCompact: { fontSize: 'var(--t2)', fontWeight: 'var(--g2)', lineHeight: 1.35, color: 'var(--text)', minWidth: 0, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  detail: { display: 'block', fontSize: 'var(--t2)', lineHeight: 1.35, color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' },
  detailCompact: { fontSize: 'var(--t2)', lineHeight: 1.4, color: 'var(--text2)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  tel: { display: 'inline-flex', alignItems: 'center', minHeight: 28, fontSize: 'var(--t2)' },
  etat: { display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap', fontSize: 'var(--t2)', fontWeight: 'var(--g3)', lineHeight: 1.3 },
  chiffre: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, minWidth: 0, boxSizing: 'border-box',
    padding: '14px 16px', borderRadius: 'var(--r-lg)',
  },
  chiffreTete: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 },
  chiffreLabel: { fontSize: 'var(--t2)', fontWeight: 'var(--g2)', lineHeight: 1.3, color: 'var(--text2)' },
  chiffreValeur: { fontFamily: 'var(--font-num)', lineHeight: 1.05, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' },
  chiffreTexte: { fontSize: 'var(--t3)', fontWeight: 'var(--g2)', lineHeight: 1.35, color: 'var(--text2)' },
  chiffreDetail: { fontSize: 'var(--t2)', lineHeight: 1.45 },
  vide: { margin: 0, padding: '8px 0', fontSize: 'var(--t2)', lineHeight: 1.5, color: 'var(--text2)' },
};
