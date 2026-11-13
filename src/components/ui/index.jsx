import React from 'react';
import SegmentedTabs from './SegmentedTabs.jsx';

export { SegmentedTabs };

// Primitives de la direction Galet (.claude/rules/direction-galet.md). Elles
// disent elles-mêmes leur fond, leur contour, leur rayon et leur graisse, par
// les jetons de src/styles/app.css : un écran qui passe par elles naît dans la
// direction, sans attendre qu'une règle globale le rattrape.

// Carte (Panneau) : la limite visible d'un groupe (une section parmi
// plusieurs, une colonne parmi plusieurs). Fond --zone, rayon --r-lg, ombre
// douce --sh, filet --rule-soft d'un pixel : c'est lui qui porte la carte en
// thème sombre, où l'ombre ne se voit pas. data-cadre la soustrait à la règle
// « Plus de carrés » d'app.css, qui aplatit les blocs encadrés posés en style
// inline. Exportée aussi sous le nom Panneau.
export function Card({ children, style = {}, onClick }) {
  return (
    <div
      onClick={onClick}
      data-cadre=""
      /* Les états hover/active vivent dans app.css (.ui-card--clickable) :
         impossible de les écrire en style inline. */
      className={onClick ? 'ui-card ui-card--clickable' : 'ui-card'}
      style={{
        background: 'var(--zone)',
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: 'var(--rule-soft)',
        borderRadius: 'var(--r-lg)',
        boxShadow: 'var(--sh)',
        padding: '16px 18px',
        cursor: onClick ? 'pointer' : 'default',
        ...style
      }}
    >
      {children}
    </div>
  );
}

export const Panneau = Card;

// Ligne de liste : le style partagé des éléments d'une liste (une fiche, un
// produit, une personne). Un filet doux en bas, pas de cadre. Hauteur : 48 px
// (--ligne-aeree) là où les gestes de l'écran tiennent aux trois postes,
// 44 px (--ligne) sinon, avec `serree`. `derniere` retire le filet de la
// dernière ligne d'un panneau.
export function ligneStyle({ serree = false, derniere = false } = {}) {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    minHeight: serree ? 'var(--ligne)' : 'var(--ligne-aeree)',
    minWidth: 0,
    borderBottomWidth: derniere ? 0 : 1,
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--rule-soft)',
    color: 'var(--text)',
    fontSize: 'var(--t2)',
  };
}

export function Btn({
  children,
  variant = 'ghost',
  small = false,
  onClick,
  disabled = false,
  style = {},
  type = 'button',
  title,
  ariaLabel
}) {
  /* Contour toujours écrit en borderWidth, borderStyle et borderColor, jamais
     par le raccourci border : un appelant peut changer la seule couleur sans
     que React avertisse (npm run lint:borders). */
  const variants = {
    /* Action principale : l'aplat sombre (pétrole en clair, aqua en sombre),
       sans dégradé ni ombre, en graisse --g3. */
    primary: { background: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'var(--accent)', fontWeight: 'var(--g3)' },
    /* Secondaire : fond, texte et contour par les jetons --btn-*. */
    ghost: { background: 'var(--btn-fond)', color: 'var(--btn-texte)', borderColor: 'var(--btn-bord)' },
    /* Danger et succès : fond doux, sans contour (bordure transparente pour
       garder la hauteur des autres variantes). */
    danger: { background: 'var(--danger-bg-soft)', color: 'var(--danger-text)', borderColor: 'transparent' },
    success: { background: 'var(--success-bg-soft)', color: 'var(--success-text)', borderColor: 'transparent' },
    /* Onglet : une pilule en texte, en aplat sombre quand il est choisi. */
    tab: { background: 'transparent', color: 'var(--text2)', borderColor: 'transparent' },
    tabActive: { background: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'var(--accent)' }
  };

  return (
    <button
      type={type}
      title={title}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      /* La hauteur est posée en inline juste dessous, donc aucune feuille de
         style ne peut la relever sur mobile sans !important. Cette classe donne
         un point d'accroche à la règle tactile de app.css (pointer: coarse),
         qui remonte les 32/38px à 44px sur tablette et téléphone. Les états
         que le style inline ne sait pas dire (survol, focus, éteint) vivent
         aussi dans app.css, accrochés à ces classes. */
      className={`ui-btn ui-btn--${variants[variant] ? variant : 'ghost'}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        minHeight: small ? 32 : 38,
        padding: small ? '5px 10px' : '8px 14px',
        borderWidth: 1,
        borderStyle: 'solid',
        /* Tous les boutons sont des pilules ; les hauteurs ne changent pas. */
        borderRadius: 'var(--r-full)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--font)',
        fontSize: small ? 12 : 13,
        fontWeight: 'var(--g2)',
        opacity: disabled ? 0.6 : 1,
        whiteSpace: 'nowrap',
        ...(variants[variant] || variants.ghost),
        ...style
      }}
    >
      {children}
    </button>
  );
}

// Champ : contour --champ-bord, fond --surface, rayon --r. La
// hauteur n'est pas posée ici : elle vient de la règle des contrôles d'app.css
// (--controle, et 44 px au doigt), qu'un min-height en ligne empêcherait de
// relever sur tablette et téléphone.
export function Input({ value, onChange, placeholder, type = 'text', style = {}, ...props }) {
  return (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      type={type}
      className="ui-input"
      style={{
        width: '100%',
        padding: '8px 12px',
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: 'var(--champ-bord)',
        borderRadius: 'var(--r)',
        background: 'var(--surface)',
        color: 'var(--text)',
        fontFamily: 'var(--font)',
        fontSize: 13,
        ...style
      }}
      {...props}
    />
  );
}

// TabBar délègue désormais au SegmentedTabs (bande compacte 1 ligne scrollable)
// pour que tous les usages existants profitent du rendu mobile compact.
export function TabBar({ tabs, active, onChange, style = {} }) {
  return <SegmentedTabs tabs={tabs} active={active} onChange={onChange} style={style} />;
}

// Encadré de statut : posé sur la page, sans fond ni coins arrondis. Un filet
// gauche de 2 px dans la couleur du ton porte l'état, avec le titre éventuel
// (graisse 500) ; le texte reste en --text. La couleur n'est jamais retirée :
// elle passe du fond au filet et au titre.
//   ton : 'info' | 'succes' | 'alerte' | 'erreur'
const TONS_ENCADRE = { info: 'info', succes: 'success', alerte: 'warning', erreur: 'danger' };

export function encadreStyle(ton = 'info') {
  const t = TONS_ENCADRE[ton] || 'info';
  return { borderLeft: `2px solid var(--${t}-bd)`, paddingLeft: 12, color: 'var(--text)' };
}

export function encadreTitreStyle(ton = 'info') {
  const t = TONS_ENCADRE[ton] || 'info';
  return { color: `var(--${t}-text)`, fontWeight: 500 };
}

export function Encadre({ ton = 'info', titre, children, style = {}, role, className }) {
  return (
    <div role={role} className={className} style={{ ...encadreStyle(ton), ...style }}>
      {titre ? <div style={{ ...encadreTitreStyle(ton), marginBottom: children ? 4 : 0 }}>{titre}</div> : null}
      {children}
    </div>
  );
}

export function SectionHeader({ title, sub, action, style = {} }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, ...style }}>
      <div>
        {/* Sans titre : le nom du module est déjà le titre de la barre du haut,
            seule la phrase d'explication reste. */}
        {title ? <div style={{ fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)', fontFamily: 'var(--font)' }}>{title}</div> : null}
        {sub ? <div style={{ fontSize: 'var(--t1)', color: 'var(--text2)', marginTop: title ? 2 : 0 }}>{sub}</div> : null}
      </div>
      {action}
    </div>
  );
}

// Cercle d'un picto : fond --piste, encre --icone. 36 px par défaut (carte de
// chiffre), 44 px pour une tuile.
export function pictoCercleStyle(taille = 36) {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    width: taille, height: taille, borderRadius: '50%', background: 'var(--piste)', color: 'var(--icone)',
  };
}

// Carte de chiffre : une carte blanche, le picto dans son cercle, le libellé
// en petit et en --text3, puis le chiffre en grand, en graisse normale.
//   Icone : composant de picto au trait (lucide), facultatif
//   glow  : la carte se distingue par son filet, sans halo
export function KpiCard({ label, value, sub, delta, color, chart, Icone, glow = false, style = {} }) {
  /* Le panneau écrit son contour en borderColor : seule la couleur change. */
  const glowStyle = glow ? { borderColor: 'var(--accent-bd)' } : {};
  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 10, ...glowStyle, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        {Icone ? <span style={pictoCercleStyle()}><Icone size={18} strokeWidth={1.75} aria-hidden="true" /></span> : null}
        <div style={{ fontSize: 'var(--t1)', fontWeight: 'var(--g2)', color: 'var(--text3)', minWidth: 0 }}>
          {label}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <div style={{ fontSize: 'var(--t6)', fontWeight: 'var(--g-chiffre)', color: color || 'var(--text)', fontFamily: 'var(--font-num)', lineHeight: 1 }}>
          {value}
        </div>
        {delta !== undefined ? (
          <div style={{ fontSize: 'var(--t1)', fontWeight: 'var(--g3)', color: Number(delta) >= 0 ? 'var(--success-text)' : 'var(--danger-text)', marginBottom: 2 }}>
            {Number(delta) >= 0 ? '+' : ''}{delta}
          </div>
        ) : null}
      </div>
      {sub ? <div style={{ fontSize: 'var(--t1)', color: 'var(--text3)' }}>{sub}</div> : null}
      {chart}
    </Card>
  );
}

// Carte de mise en avant : un résumé ou des chiffres, jamais un état (un état
// garde ses jetons de statut). Trois tons : nuit (sombre), soleil (jaune
// pastel), ciel (bleu pastel). Par écran : au plus une carte nuit et deux
// cartes pastel. Rayon --r-xl, pas d'ombre, pas de filet. Elle ne porte pas
// data-cadre (la règle des blocs lui donnerait le rayon des cartes) et son
// fond n'est pas de ceux que « Plus de carrés » aplatit.
//   carteAvantStyles(ton) rend les styles de ses pièces : carte, titre,
//   libelle (petit texte doux), chiffre (grand, graisse normale), tuile
//   (tuile intérieure : fond --carte-nuit-tuile sur la carte nuit).
const TONS_AVANT = {
  nuit: { fond: 'var(--carte-nuit)', texte: 'var(--carte-nuit-texte)', doux: 'var(--carte-nuit-doux)', tuile: 'var(--carte-nuit-tuile)' },
  soleil: { fond: 'var(--carte-soleil)', texte: 'var(--carte-soleil-texte)', doux: 'var(--carte-soleil-texte)', tuile: 'transparent' },
  ciel: { fond: 'var(--carte-ciel)', texte: 'var(--carte-ciel-texte)', doux: 'var(--carte-ciel-texte)', tuile: 'transparent' },
};

export function carteAvantStyles(ton = 'nuit') {
  const t = TONS_AVANT[ton] || TONS_AVANT.nuit;
  return {
    carte: { display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0, padding: '18px 20px', borderRadius: 'var(--r-xl)', background: t.fond, color: t.texte },
    titre: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: t.texte, fontFamily: 'var(--font)' },
    libelle: { fontSize: 'var(--t1)', fontWeight: 'var(--g1)', color: t.doux },
    chiffre: { fontFamily: 'var(--font-num)', fontSize: 'var(--t6)', fontWeight: 'var(--g-chiffre)', lineHeight: 1, color: t.texte },
    tuile: { minWidth: 0, padding: '12px 14px', borderRadius: 'var(--r)', background: t.tuile, color: t.texte },
  };
}

export function CarteAvant({ ton = 'nuit', titre, action, children, style = {}, ...props }) {
  const st = carteAvantStyles(ton);
  return (
    <div data-carte-avant={TONS_AVANT[ton] ? ton : 'nuit'} style={{ ...st.carte, ...style }} {...props}>
      {titre || action ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minWidth: 0 }}>
          {titre ? <div style={st.titre}>{titre}</div> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </div>
  );
}
