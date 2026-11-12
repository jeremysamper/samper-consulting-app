import React from 'react';
import SegmentedTabs from './SegmentedTabs.jsx';

export { SegmentedTabs };

// Primitives de la direction Office (.claude/rules/direction-office.md). Elles
// disent elles-mêmes leur fond, leur contour, leur rayon et leur graisse, par
// les jetons de src/styles/app.css : un écran qui passe par elles naît dans la
// direction, sans attendre qu'une règle globale le rattrape.

// Panneau : la limite visible d'un groupe (une section parmi plusieurs, une
// colonne parmi plusieurs). Fond --zone, filet doux, rayon de la direction.
// data-cadre le soustrait à la règle « Plus de carrés » d'app.css, qui aplatit
// les blocs encadrés posés en style inline. Exporté aussi sous le nom Panneau.
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
        borderRadius: 'var(--r)',
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
    /* Action principale : le seul aplat d'accent (pétrole en clair, aqua en
       sombre), sans dégradé ni ombre, en graisse --g3. */
    primary: { background: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'var(--accent)', fontWeight: 'var(--g3)' },
    /* Secondaire : fond, texte et contour par les jetons --btn-*. */
    ghost: { background: 'var(--btn-fond)', color: 'var(--btn-texte)', borderColor: 'var(--btn-bord)' },
    /* Danger et succès : fond doux, sans contour (bordure transparente pour
       garder la hauteur des autres variantes). */
    danger: { background: 'var(--danger-bg-soft)', color: 'var(--danger-text)', borderColor: 'transparent' },
    success: { background: 'var(--success-bg-soft)', color: 'var(--success-text)', borderColor: 'transparent' },
    /* Onglet : un trait bas, à l'encre --onglet quand il est actif. */
    tab: { background: 'transparent', color: 'var(--text2)', borderWidth: '0 0 2px', borderColor: 'transparent', borderRadius: 0 },
    tabActive: { background: 'transparent', color: 'var(--onglet)', borderWidth: '0 0 2px', borderColor: 'var(--onglet)', borderRadius: 0 }
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
        borderRadius: 'var(--r-sm)',
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

// Champ : contour --champ-bord, fond --surface, rayon de la direction. La
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
        borderRadius: 'var(--r-sm)',
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

export function KpiCard({ label, value, sub, delta, color, chart, glow = false, style = {} }) {
  /* glow : liseré accent qui met la carte en avant, sans halo. Le panneau
     écrit son contour en borderColor : seule la couleur change. */
  const glowStyle = glow
    ? { borderColor: 'var(--accent-bd)', boxShadow: 'var(--glow-accent)' }
    : {};
  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 9, ...glowStyle, ...style }}>
      <div style={{ fontSize: 'var(--t1)', fontWeight: 'var(--g2)', color: 'var(--text2)' }}>
        {label}
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
      {sub ? <div style={{ fontSize: 'var(--t1)', color: 'var(--text2)' }}>{sub}</div> : null}
      {chart}
    </Card>
  );
}
