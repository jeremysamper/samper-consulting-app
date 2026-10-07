import { PLAN_W, PLAN_H, PLAN_GRID } from '../../hooks/usePlanSalle.js';

// ═══════════════════════════════════════════════════════════════════════════
// Décor du plan de salle : murs, baies vitrées, porte, bar, banque d'accueil,
// pilier, plante, zone nommée (cuisine, WC, vestiaire...).
// ───────────────────────────────────────────────────────────────────────────
// Le décor se dessine dans « Modifier le plan » et s'affiche partout ailleurs
// SOUS les tables, sans réagir au doigt : en service, seules les tables se
// touchent, et un mur ne doit jamais intercepter le geste qui place un client.
//
// Trois façons de se redimensionner, selon ce que l'élément représente :
//   • 'ligne' : un mur ou une baie a une épaisseur fixe, seule sa longueur
//     se règle (la poignée est au bout) ;
//   • 'carre' : une porte, un pilier, une plante gardent leurs proportions ;
//   • 'libre' : le bar, l'accueil, une zone prennent n'importe quelle forme.
// ═══════════════════════════════════════════════════════════════════════════

export const ELEMENTS = [
  { type: 'mur',     label: 'Mur',              largeur: 300, hauteur: 10,  forme: 'ligne' },
  { type: 'baie',    label: 'Baie vitrée',      largeur: 240, hauteur: 10,  forme: 'ligne' },
  { type: 'porte',   label: 'Porte',            largeur: 70,  hauteur: 70,  forme: 'carre' },
  { type: 'bar',     label: 'Bar',              largeur: 280, hauteur: 60,  forme: 'libre', nomme: true },
  // « Banque d'accueil » et non « Accueil » : en anglais, le mot seul est
  // déjà traduit « Home » (la page d'accueil de l'app), et le plan
  // afficherait une maison au lieu d'un comptoir.
  { type: 'accueil', label: 'Banque d’accueil', largeur: 120, hauteur: 60,  forme: 'libre', nomme: true },
  { type: 'pilier',  label: 'Pilier',           largeur: 30,  hauteur: 30,  forme: 'carre' },
  { type: 'plante',  label: 'Plante',           largeur: 40,  hauteur: 40,  forme: 'carre' },
  { type: 'zone',    label: 'Zone',             largeur: 220, hauteur: 150, forme: 'libre', nomme: true },
];

export const ELEMENT_PAR_TYPE = new Map(ELEMENTS.map((e) => [e.type, e]));

// Plus petite taille qu'on peut atteindre à la poignée : en dessous, l'élément
// devient un point qu'on ne retrouve plus au doigt.
const MIN = { ligne: 20, carre: 20, libre: 30 };

// Une zone n'est qu'un marquage au sol : une table peut s'y poser. Tout le
// reste occupe la place (rapprocher des tables ne doit pas les poser sur le
// bar).
export const estObstacle = (el) => el.type !== 'zone';

// Texte affiché dans l'élément : le nom donné, sinon le nom du type.
export function texteElement(el) {
  const def = ELEMENT_PAR_TYPE.get(el.type);
  if (!def?.nomme) return '';
  return (el.libelle || '').trim() || def.label;
}

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const snap  = (v) => Math.round(v / PLAN_GRID) * PLAN_GRID;

// Nouvelle géométrie quand on tire la poignée jusqu'au point (px, py) du
// canevas. Le coin haut-gauche ne bouge jamais.
export function redimensionner(el, px, py) {
  const def = ELEMENT_PAR_TYPE.get(el.type);
  const forme = def?.forme || 'libre';
  const x = Number(el.pos_x);
  const y = Number(el.pos_y);
  const w = Number(el.largeur);
  const h = Number(el.hauteur);
  const min = MIN[forme];
  if (forme === 'ligne') {
    if (w >= h) return { largeur: clamp(snap(px - x), min, PLAN_W - x), hauteur: h };
    return { largeur: w, hauteur: clamp(snap(py - y), min, PLAN_H - y) };
  }
  if (forme === 'carre') {
    const c = clamp(snap(Math.max(px - x, py - y)), min, Math.min(PLAN_W - x, PLAN_H - y));
    return { largeur: c, hauteur: c };
  }
  return {
    largeur: clamp(snap(px - x), min, PLAN_W - x),
    hauteur: clamp(snap(py - y), min, PLAN_H - y),
  };
}

// Quart de tour autour du centre, borné au canevas. La porte tourne aussi son
// dessin (côté des gonds), les autres n'ont que largeur et hauteur à échanger.
export function apresQuartDeTour(el) {
  const w = Number(el.largeur);
  const h = Number(el.hauteur);
  return {
    largeur: h,
    hauteur: w,
    pos_x: clamp(Number(el.pos_x) + (w - h) / 2, 0, PLAN_W - h),
    pos_y: clamp(Number(el.pos_y) + (h - w) / 2, 0, PLAN_H - w),
    rotation: ((Number(el.rotation) || 0) + 90) % 360,
  };
}

// ── Dessin de chaque type ─────────────────────────────────────────────────
function Dessin({ el }) {
  const horizontal = Number(el.largeur) >= Number(el.hauteur);
  const plein = { position: 'absolute', inset: 0, boxSizing: 'border-box' };

  switch (el.type) {
    case 'mur':
      return <div style={{ ...plein, background: 'var(--text2)', borderRadius: 2 }} />;

    case 'baie':
      // Deux traits et le verre entre eux, comme sur un plan d'architecte.
      return (
        <div style={{
          ...plein, background: 'var(--info-bg-soft)', borderRadius: 1,
          borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--info-bd)',
        }}>
          <div style={horizontal
            ? { position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: 'var(--info-bd)' }
            : { position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, background: 'var(--info-bd)' }}
          />
        </div>
      );

    case 'porte':
      // Battant et arc d'ouverture. Gonds en bas à gauche à 0°, puis quart
      // de tour par quart de tour.
      return (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ ...plein, width: '100%', height: '100%', overflow: 'visible' }}>
          <g transform={`rotate(${Number(el.rotation) || 0} 50 50)`}>
            <path d="M0,100 L0,0 A100,100 0 0 1 100,100 Z" fill="var(--surface2)" opacity="0.7" />
            <path d="M0,0 A100,100 0 0 1 100,100" fill="none" stroke="var(--text3)"
              strokeWidth="1.2" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
            <line x1="0" y1="100" x2="0" y2="0" stroke="var(--text2)" strokeWidth="3"
              vectorEffect="non-scaling-stroke" />
          </g>
        </svg>
      );

    case 'bar':
    case 'accueil':
      return (
        <div style={{
          ...plein, background: 'var(--surface2)', borderRadius: el.type === 'bar' ? 8 : 6,
          borderWidth: 2, borderStyle: 'solid', borderColor: 'var(--text3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 3,
        }}>
          <Libelle el={el} />
        </div>
      );

    case 'pilier':
      return <div style={{ ...plein, background: 'var(--text3)', borderRadius: 3 }} />;

    case 'plante':
      return (
        <div style={{
          ...plein, borderRadius: '50%', background: 'var(--success-bg-soft)',
          borderWidth: 2, borderStyle: 'solid', borderColor: 'var(--success-bd)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: '38%', height: '38%', borderRadius: '50%', background: 'var(--success-bd)' }} />
        </div>
      );

    case 'zone':
      return (
        <div style={{
          ...plein, borderRadius: 10,
          borderWidth: 2, borderStyle: 'dashed', borderColor: 'var(--border2)',
          background: 'color-mix(in srgb, var(--surface2) 55%, transparent)',
          padding: '4px 7px',
        }}>
          <Libelle el={el} coin />
        </div>
      );

    default:
      return <div style={{ ...plein, background: 'var(--surface2)' }} />;
  }
}

function Libelle({ el, coin = false }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, lineHeight: 1.15, color: 'var(--text2)',
      fontFamily: 'var(--font-serif)', textAlign: coin ? 'left' : 'center',
      overflow: 'hidden', display: 'block', maxWidth: '100%', maxHeight: '100%',
      wordBreak: 'break-word',
    }}>
      {texteElement(el)}
    </span>
  );
}

// ── Un élément sur le canevas ─────────────────────────────────────────────
// `editable` : mode « Modifier le plan ». Ailleurs l'élément est un simple
// dessin (pointerEvents none) : le toucher passe aux tables et au canevas.
export function ElementDecor({
  el, editable = false, selectionne = false,
  onPointerDown, onPoignee, onClick, onDoubleClick,
}) {
  const def = ELEMENT_PAR_TYPE.get(el.type);
  const ligne = def?.forme === 'ligne';
  const horizontal = Number(el.largeur) >= Number(el.hauteur);

  // Poignée au bout d'un mur, dans le coin bas-droit pour le reste.
  const poignee = ligne
    ? (horizontal ? { left: '100%', top: '50%', cursor: 'ew-resize' } : { left: '50%', top: '100%', cursor: 'ns-resize' })
    : { left: '100%', top: '100%', cursor: 'nwse-resize' };

  return (
    <div
      data-plan-element={el.id}
      onPointerDown={editable ? (e) => onPointerDown?.(e, el) : undefined}
      onClick={editable ? (e) => { e.stopPropagation(); onClick?.(el); } : undefined}
      onDoubleClick={editable ? (e) => { e.stopPropagation(); onDoubleClick?.(el); } : undefined}
      title={editable ? `${def?.label ?? ''} · glisser pour déplacer, toucher pour régler` : undefined}
      style={{
        position: 'absolute',
        left:   `${(Number(el.pos_x)   / PLAN_W) * 100}%`,
        top:    `${(Number(el.pos_y)   / PLAN_H) * 100}%`,
        width:  `${(Number(el.largeur) / PLAN_W) * 100}%`,
        height: `${(Number(el.hauteur) / PLAN_H) * 100}%`,
        boxSizing: 'border-box',
        pointerEvents: editable ? 'auto' : 'none',
        cursor: editable ? 'grab' : 'default',
        touchAction: editable ? 'none' : 'auto',
        outlineWidth: selectionne ? 2 : 0,
        outlineStyle: 'solid',
        outlineColor: 'var(--accent)',
        outlineOffset: 3,
        borderRadius: 3,
        userSelect: 'none', WebkitUserSelect: 'none',
      }}
    >
      <Dessin el={el} />

      {/* Mur ou baie : une dizaine de pixels d'épaisseur, trop peu pour le
          doigt. Une zone de prise invisible élargit la cible sans changer le
          dessin. */}
      {editable && ligne && (
        <div aria-hidden="true" style={{ position: 'absolute', inset: -12 }} />
      )}

      {editable && selectionne && (
        <div
          aria-label="Agrandir"
          title={ligne ? 'Tirer pour allonger' : 'Tirer pour agrandir'}
          onPointerDown={(e) => { e.stopPropagation(); onPoignee?.(e, el); }}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', ...poignee,
            width: 40, height: 40, transform: 'translate(-50%, -50%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            touchAction: 'none', zIndex: 3,
          }}
        >
          <div style={{
            width: 16, height: 16, borderRadius: '50%', boxSizing: 'border-box',
            background: 'var(--surface)',
            borderWidth: 3, borderStyle: 'solid', borderColor: 'var(--accent)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
          }} />
        </div>
      )}
    </div>
  );
}

// ── Quadrillage du mode « Modifier le plan » ──────────────────────────────
// Une ligne fine à chaque pas d'aimantation (10) : une table ou un mur posé
// tombe toujours sur une ligne visible. Une ligne marquée tous les 50 pour
// se repérer. `fine` est faux quand le plan est trop petit à l'écran pour
// que des lignes tous les 10 restent lisibles (téléphone).
const FINES_V  = [];
const FINES_H  = [];
const FORTES_V = [];
const FORTES_H = [];
for (let x = PLAN_GRID; x < PLAN_W; x += PLAN_GRID) (x % 50 ? FINES_V : FORTES_V).push(x);
for (let y = PLAN_GRID; y < PLAN_H; y += PLAN_GRID) (y % 50 ? FINES_H : FORTES_H).push(y);

export function GrillePlan({ fine = true }) {
  const trait = (k, x1, y1, x2, y2) => (
    <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} vectorEffect="non-scaling-stroke" />
  );
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${PLAN_W} ${PLAN_H}`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      {fine && (
        <g stroke="var(--border)" strokeWidth="1" opacity="0.55">
          {FINES_V.map((x) => trait(`v${x}`, x, 0, x, PLAN_H))}
          {FINES_H.map((y) => trait(`h${y}`, 0, y, PLAN_W, y))}
        </g>
      )}
      <g stroke="var(--border2)" strokeWidth="1">
        {FORTES_V.map((x) => trait(`V${x}`, x, 0, x, PLAN_H))}
        {FORTES_H.map((y) => trait(`H${y}`, 0, y, PLAN_W, y))}
      </g>
    </svg>
  );
}
