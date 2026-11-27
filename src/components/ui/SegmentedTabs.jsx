import React from 'react';
import useOngletEnVue from '../../hooks/useOngletEnVue.js';
import usePiluleGlissante from '../../hooks/usePiluleGlissante.js';
import PiluleDeroulante from './PiluleDeroulante.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// SegmentedTabs - barre d'onglets compacte, une seule ligne, défilement
// horizontal si les onglets débordent. Remplace les anciennes rangées de
// pilules en flex-wrap qui empilaient les onglets sur plusieurs lignes en
// mobile (et mangeaient toute la hauteur).
//
// Direction Galet : une rangée de pilules. L'onglet choisi est un aplat
// sombre (--accent, texte --on-accent), les autres sont en texte --text2,
// sans contour. La barre de modes de la caisse (.caisse-modes) a ses propres
// règles. Aucune couleur en dur - tokens CSS uniquement. Le style, le
// défilement, le focus et le masquage de la scrollbar sont en CSS
// (.segmented-tabs dans app.css).
//
// Rangée à rallonge : quand les pilules ne tiennent pas sur une ligne dans
// la place donnée, la rangée se replie en une pilule déroulante
// (PiluleDeroulante) qui montre le choix en cours et ouvre la liste. Elle se
// déplie dès que la place revient. La largeur d'une ligne de pilules est
// relevée avant l'affichage : la rangée trop longue ne se montre jamais.
//
// Props :
//   tabs     : [{ id, label|l, icon? }]  - icon = noeud React optionnel
//              ou { divider: true }      - séparateur vertical entre groupes
//   active   : id de l'onglet actif
//   onChange : (id) => void
//   size     : 'sm' | undefined         - 'sm' → pilules plus compactes
//   retourLigne : true                  - au-delà de 768 px, les onglets
//              passent à la ligne au lieu de défiler (longues séries) ; une
//              rangée repliable se replie avant
//   deroulant : 'auto' (défaut)         - repliée quand elle ne tient pas
//              true                     - toujours repliée (choix parmi des
//                                         données : cartes, salles, listes)
//              false                    - jamais repliée (modes de la caisse)
//   titre    : en-tête de la liste repliée, et nom du menu
//   intitule : texte posé devant la valeur, dans la pilule repliée
// ─────────────────────────────────────────────────────────────────────────────

// Largeur d'une ligne de pilules : les boutons gardent leur largeur
// naturelle (flex: 0 0 auto), qu'ils défilent ou passent à la ligne.
function largeurUneLigne(bande) {
  const cs = getComputedStyle(bande);
  const px = (v) => parseFloat(v) || 0;
  let total = px(cs.paddingLeft) + px(cs.paddingRight) + px(cs.borderLeftWidth) + px(cs.borderRightWidth);
  let n = 0;
  for (const el of bande.children) {
    if (el.classList.contains('mvt-pilule')) continue;
    const m = getComputedStyle(el);
    total += el.offsetWidth + px(m.marginLeft) + px(m.marginRight);
    n += 1;
  }
  return total + px(cs.columnGap) * Math.max(0, n - 1);
}

export default function SegmentedTabs({ tabs, active, onChange, size, retourLigne = false, deroulant = 'auto', titre, intitule, style = {}, className = '' }) {
  const list = Array.isArray(tabs) ? tabs : [];
  const auto = deroulant === 'auto';
  const [replieAuto, setReplieAuto] = React.useState(false);
  const replie = deroulant === true || (auto && replieAuto);
  // Largeur qu'il faut à la rangée pour tenir sur une ligne, relevée au
  // moment où elle s'est repliée.
  const besoinRef = React.useRef(0);
  const enveloppeRef = React.useRef(null);
  const signature = `${list.map((t) => (t.divider ? '|' : t.id)).join(',')}#${size || ''}`;

  // Quand la rangée défile, l'onglet choisi reste en vue.
  const bandeRef = React.useRef(null);
  useOngletEnVue(bandeRef, `${active}|${list.length}|${replie}`);
  // La pilule sombre glisse vers l'onglet choisi (.mvt-pilule, app.css).
  const piluleRef = React.useRef(null);
  usePiluleGlissante(bandeRef, piluleRef, { selecteur: '.segmented-tab.is-active', cle: active, forme: `${list.length}|${size || ''}|${replie}` });

  // Les onglets changent : la rangée repliée se déplie le temps d'une mesure,
  // avant l'affichage.
  const signatureRef = React.useRef(signature);
  React.useLayoutEffect(() => {
    if (signatureRef.current === signature) return;
    signatureRef.current = signature;
    if (auto && replieAuto) setReplieAuto(false);
  }, [signature, auto, replieAuto]);

  // Rangée dépliée : elle se replie si une ligne ne tient pas, au premier
  // rendu comme quand la place ou un libellé change (traduction, compteur).
  React.useLayoutEffect(() => {
    if (!auto || replie) return undefined;
    const bande = bandeRef.current;
    if (!bande) return undefined;
    const mesurer = () => {
      if (!bande.offsetWidth) return;
      const besoin = largeurUneLigne(bande);
      if (besoin > bande.offsetWidth + 1) {
        besoinRef.current = besoin;
        setReplieAuto(true);
      }
    };
    mesurer();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(bande);
    bande.querySelectorAll('button').forEach((b) => observateur.observe(b));
    return () => observateur.disconnect();
  }, [auto, replie, signature]);

  // Rangée repliée : elle se déplie quand sa place suffit de nouveau.
  React.useEffect(() => {
    if (!auto || !replie) return undefined;
    const enveloppe = enveloppeRef.current;
    if (!enveloppe || typeof ResizeObserver === 'undefined') return undefined;
    const observateur = new ResizeObserver(() => {
      if (enveloppe.clientWidth && enveloppe.clientWidth >= besoinRef.current) setReplieAuto(false);
    });
    observateur.observe(enveloppe);
    return () => observateur.disconnect();
  }, [auto, replie]);

  if (replie) {
    const options = list.map((t) => (t.divider ? { divider: true } : { id: t.id, label: t.label ?? t.l }));
    return (
      <div ref={enveloppeRef} className={`segmented-tabs-replie no-print${auto ? '' : ' segmented-tabs-replie--fixe'}${className ? ' ' + className : ''}`} style={style}>
        <PiluleDeroulante options={options} valeur={active} onChange={onChange} titre={titre} intitule={intitule} size={size} />
      </div>
    );
  }

  return (
    <div
      ref={bandeRef}
      className={`segmented-tabs no-print${size === 'sm' ? ' segmented-tabs--sm' : ''}${retourLigne ? ' segmented-tabs--retour' : ''}${className ? ' ' + className : ''}`}
      role="tablist"
      style={style}
    >
      <span ref={piluleRef} className="mvt-pilule" aria-hidden="true" />
      {list.map((tab, i) => {
        if (tab.divider) {
          return <span key={'divider-' + i} className="segmented-tabs-divider" aria-hidden="true" />;
        }
        const isActive = active === tab.id;
        const label = tab.label ?? tab.l;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`segmented-tab${isActive ? ' is-active' : ''}`}
            onClick={() => onChange?.(tab.id)}
          >
            {tab.icon ? <span className="segmented-tab-icon">{tab.icon}</span> : null}
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
