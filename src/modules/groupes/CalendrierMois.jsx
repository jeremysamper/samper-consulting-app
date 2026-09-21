import { isoDate } from '../../utils/dateHelpers.js';
import { metaStatut, metaType, rangStatut } from './typesGroupe.js';

// ─────────────────────────────────────────────────────────────────────────────
// Calendrier d'un mois entier, lisible d'un coup d'œil sur l'iPad du passe
// comme sur un téléphone.
//
// Une case = un jour. Un jour qui porte un groupe prend la couleur de son
// état : rouge (pas encore lu), orange (lu, pas préparé), vert (prêt). Rien
// d'autre ne porte de couleur, c'est ce qui laisse le mois se lire tout seul,
// de loin, sur l'iPad du passe.
//
// Plusieurs groupes le même jour : la case prend la couleur du MOINS avancé
// (un jour n'est vert que si tout y est prêt), et chaque étiquette garde son
// propre liseré.
//
// TOUTE LA CASE est la cible tactile, pas l'aplat : à 50 px de large sur un
// téléphone, viser une étiquette de 14 px de haut est un tap raté sur deux.
// Le parent décide de ce qu'ouvre un tap selon le nombre de groupes du jour.
//
// Trois densités, choisies par le parent d'après la largeur réelle du
// calendrier : 'large' (iPad couché, bureau) « Apéro dînatoire n°1 · 120 pax ·
// 19:00 », 'moyenne' (iPad debout) « Apéro n°1 · 120 pax », 'compacte'
// (téléphone) « AD1 · 120p ». Dans les trois, le numéro du menu est un élément
// à part qui ne rétrécit pas : c'est le nom du type qui cède (ellipse), jamais
// le « n°4 » - « mariage n°4 » est le vocabulaire de la maison.
//
// Sept colonnes en minmax(0, 1fr) : sans le plancher à 0, une étiquette longue
// élargit sa colonne et le mois déborde de l'écran (la page ne doit jamais
// défiler horizontalement).
// ─────────────────────────────────────────────────────────────────────────────

const JOURS_LONGS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const JOURS_COURTS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const JOURS_ARIA = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

// Grille du mois : semaines complètes du lundi au dimanche. Les jours des mois
// voisins sont rendus (la grille reste rectangulaire) mais vides et éteints.
function grilleDuMois(annee, mois) {
  const premier = new Date(annee, mois, 1);
  const decalage = (premier.getDay() + 6) % 7; // lundi = 0
  const nbJours = new Date(annee, mois + 1, 0).getDate();
  const nbCases = Math.ceil((decalage + nbJours) / 7) * 7;
  return Array.from({ length: nbCases }, (_, i) => {
    const d = new Date(annee, mois, 1 - decalage + i);
    return { iso: isoDate(d), jour: d.getDate(), dansLeMois: d.getMonth() === mois, colonne: i % 7 };
  });
}

export default function CalendrierMois({
  annee, mois, groupes, aujourdhui, densite = 'large', peutCreer = false, onJour,
}) {
  const compact = densite === 'compacte';
  const cases = grilleDuMois(annee, mois);

  const parJour = new Map();
  (groupes || []).forEach((g) => {
    if (!parJour.has(g.dateEvenement)) parJour.set(g.dateEvenement, []);
    parJour.get(g.dateEvenement).push(g);
  });

  const maxEtiquettes = compact ? 2 : 3;

  return (
    <div style={s.cadre}>
      <div style={s.grille} aria-hidden="true">
        {(compact ? JOURS_COURTS : JOURS_LONGS).map((j, i) => (
          <div key={i} style={{ ...s.enTeteJour, ...(i >= 5 ? s.enTeteWeekend : null) }}>{j}</div>
        ))}
      </div>

      {/* Pas de role="grid" : ce motif promet une navigation aux flèches et
          remplacerait le rôle natif des boutons (VoiceOver n'annoncerait plus
          qu'un jour est activable). Des boutons étiquetés suffisent. */}
      <div style={s.grille} role="group" aria-label="Calendrier des groupes">
        {cases.map((c) => {
          const duJour = c.dansLeMois
            ? (parJour.get(c.iso) || []).slice().sort((a, b) =>
              rangStatut(a.statut) - rangStatut(b.statut) || (a.heure || '').localeCompare(b.heure || ''))
            : [];
          const estAujourdhui = c.iso === aujourdhui;
          const estPasse = c.iso < aujourdhui;
          const actif = c.dansLeMois && (duJour.length > 0 || peutCreer);
          const visibles = duJour.slice(0, maxEtiquettes);
          const reste = duJour.length - visibles.length;
          // Trié du moins avancé au plus avancé : le premier donne la couleur.
          const etatDuJour = duJour.length ? metaStatut(duJour[0].statut) : null;

          const contenu = (
            <>
              <span style={{
                ...s.numero,
                ...(estAujourdhui ? s.numeroAujourdhui : null),
                ...(!c.dansLeMois ? s.numeroHorsMois : null),
              }}>
                {c.jour}
              </span>
              {visibles.map((g) => {
                const m = metaStatut(g.statut);
                const type = metaType(g.typeGroupe);
                const nomType = compact ? type.court : densite === 'moyenne' ? type.moyen : type.label;
                return (
                  <span key={g.id} style={{
                    ...s.etiquette,
                    ...(compact ? s.etiquetteCompacte : null),
                    color: m.texte,
                    borderLeftColor: m.barre,
                  }}>
                    {/* Le sigle court (« AD1 ») est un code maison : pas de traduction. */}
                    <span
                      style={{ ...s.etiquetteTitre, ...(compact ? s.etiquetteTitreCompact : null) }}
                      data-no-translate={compact ? '' : undefined}
                    >
                      <span style={s.etiquetteType}>{nomType}</span>
                      {g.menuNumero
                        ? <span style={s.etiquetteNumero}>{compact ? g.menuNumero : ` n°${g.menuNumero}`}</span>
                        : null}
                    </span>
                    <span style={s.etiquettePax}>
                      {g.nbPax}{compact ? 'p' : ' pax'}{densite === 'large' && g.heure ? ` · ${g.heure}` : ''}
                    </span>
                  </span>
                );
              })}
              {reste > 0 && <span style={s.reste}>+{reste}</span>}
            </>
          );

          const styleCase = {
            ...s.case,
            minHeight: compact ? 66 : 88,
            ...(compact ? { padding: 3 } : null),
            ...(c.colonne >= 5 ? s.caseWeekend : null),
            ...(!c.dansLeMois ? s.caseHorsMois : null),
            ...(etatDuJour ? { background: etatDuJour.fond } : null),
            ...(etatDuJour && estPasse ? s.casePassee : null),
          };

          if (!actif) {
            return <div key={c.iso} style={styleCase}>{contenu}</div>;
          }

          const d = new Date(c.iso + 'T00:00:00');
          const etiquetteAria = `${JOURS_ARIA[(d.getDay() + 6) % 7]} ${c.jour}, `
            + (duJour.length ? `${duJour.length} groupe${duJour.length > 1 ? 's' : ''}` : 'aucun groupe, ajouter');

          return (
            <button
              key={c.iso}
              type="button"
              aria-label={etiquetteAria}
              onClick={() => onJour?.(c.iso, duJour)}
              style={{ ...styleCase, ...s.caseBouton }}
            >
              {contenu}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const s = {
  cadre: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r)',
    overflow: 'hidden',
    boxShadow: 'var(--sh-xs)',
  },
  grille: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
  },
  enTeteJour: {
    padding: '8px 2px',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: 'var(--text2)',
    background: 'var(--bg)',
    borderBottom: '1px solid var(--border)',
  },
  enTeteWeekend: { color: 'var(--text3)' },
  case: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    gap: 3,
    minWidth: 0,
    padding: 4,
    boxSizing: 'border-box',
    background: 'var(--surface)',
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderWidth: '0 1px 1px 0',
    borderRadius: 0,
    textAlign: 'left',
    fontFamily: 'var(--font)',
    color: 'var(--text)',
  },
  caseBouton: { cursor: 'pointer', margin: 0 },
  caseWeekend: { background: 'var(--bg)' },
  caseHorsMois: { background: 'var(--bg)', opacity: 0.55 },
  // Un groupe passé reste visible (on y revient pour le refaire l'an prochain)
  // mais ne doit plus attirer l'œil autant qu'un groupe à venir.
  casePassee: { opacity: 0.55 },
  numero: {
    alignSelf: 'flex-start',
    minWidth: 22,
    height: 22,
    padding: '0 4px',
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--text2)',
    flexShrink: 0,
  },
  numeroAujourdhui: { background: 'var(--accent)', color: '#fff' },
  numeroHorsMois: { color: 'var(--text3)', fontWeight: 500 },
  // Deux lignes : le groupe, puis ses couverts. Sur fond de surface, pour se
  // détacher de la case teintée ; le liseré porte l'état propre à CE groupe.
  etiquette: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    padding: '3px 5px',
    borderRadius: 5,
    borderLeftWidth: 3,
    borderLeftStyle: 'solid',
    background: 'var(--surface)',
    lineHeight: 1.25,
    flexShrink: 0,
  },
  etiquetteCompacte: { padding: '2px 1px 2px 3px' },
  etiquetteTitre: { display: 'flex', minWidth: 0, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' },
  etiquetteTitreCompact: { fontSize: 13 },
  etiquetteType: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' },
  etiquetteNumero: { flexShrink: 0, whiteSpace: 'pre' },
  etiquettePax: {
    fontSize: 10,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  reste: { fontSize: 10, fontWeight: 700, color: 'var(--text2)', paddingLeft: 4 },
};
