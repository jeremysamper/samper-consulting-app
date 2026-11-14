import { Marqueur, Valeur } from './Graphique.jsx';
import { Ecart } from './ChiffresDenses.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Tuiles de chiffres sous le graphique principal : les mesures tracées, puis
// leurs voisines de la même famille, quatre au plus. Chaque tuile dit la valeur
// de la période (celle de la fonction d'origine, comme la légende), son écart
// quand une comparaison est choisie, et l'allure de la série en petites barres
// muettes. Un toucher trace cette mesure seule.
// Aucun calcul ici : chaque série vient de composer() (composition.js).
// Une valeur absente n'est jamais tracée à zéro : sa barre manque (D9).
// ─────────────────────────────────────────────────────────────────────────────

const estNombre = (v) => typeof v === 'number' && Number.isFinite(v);

// Au-delà, les barres seraient plus fines qu'un trait : la tuile reste sans.
const MAX_BARRES = 62;

const st = {
  rangee: { display: 'grid', gap: 16, minWidth: 0 },
  tuile: {
    display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'stretch', textAlign: 'left', padding: '16px 18px', minWidth: 0, minHeight: 44,
    background: 'var(--zone)', color: 'var(--text)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--sh)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)', fontFamily: 'var(--font)', cursor: 'pointer',
  },
  libelle: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--t1)', color: 'var(--text3)', minWidth: 0 },
  chiffre: { fontFamily: 'var(--font-num)', fontWeight: 'var(--g-chiffre)', fontSize: 'var(--t5)', lineHeight: 1.15, minWidth: 0, overflowWrap: 'anywhere' },
  ecart: { fontSize: 'var(--t1)', color: 'var(--text2)', minHeight: 16 },
  barres: { display: 'flex', alignItems: 'stretch', gap: 2, height: 40, marginTop: 8 },
  colonne: { flex: '1 1 0', minWidth: 0, position: 'relative' },
};

function PetitesBarres({ valeurs }) {
  const nombres = valeurs.filter(estNombre);
  if (!nombres.length || valeurs.length > MAX_BARRES) return null;
  const haut = Math.max(0, ...nombres);
  const bas = Math.min(0, ...nombres);
  const etendue = haut - bas;
  if (!(etendue > 0)) return null;
  let dernier = -1;
  valeurs.forEach((v, i) => { if (estNombre(v)) dernier = i; });
  return (
    <span style={st.barres} aria-hidden="true" data-stat-tuile-barres="">
      {valeurs.map((v, i) => {
        if (!estNombre(v)) return <span key={i} style={st.colonne} />;
        const de = Math.min(v, 0);
        const a = Math.max(v, 0);
        return (
          <span key={i} style={st.colonne}>
            <span style={{
              position: 'absolute', left: 0, right: 0, bottom: `${((de - bas) / etendue) * 100}%`, height: `${Math.max(((a - de) / etendue) * 100, 2)}%`,
              background: i === dernier ? 'var(--accent)' : 'var(--selection)', borderRadius: 2,
            }} />
          </span>
        );
      })}
    </span>
  );
}

//   tuiles : [{ id, libelle, unite, total, totalComparaison, ecart, valeurs,
//              tracee, rang }], rendues par Statistiques.jsx
//   colonnes : 2 ou 4, selon la largeur du module
export default function TuilesMesures({ tuiles, colonnes = 4, libelleComparaison = '', onChoisir }) {
  if (!tuiles || !tuiles.length) return null;
  return (
    <section className="no-print" style={{ ...st.rangee, gridTemplateColumns: `repeat(${colonnes}, minmax(0, 1fr))` }} data-stat-tuiles="">
      {tuiles.map((t) => (
        <button
          key={t.id}
          type="button"
          data-cadre=""
          data-stat-tuile={t.id}
          aria-pressed={t.tracee}
          onClick={() => onChoisir(t.id)}
          style={{ ...st.tuile, borderColor: t.tracee ? 'var(--accent)' : 'var(--rule-soft)' }}
        >
          <span style={st.libelle}>
            {t.tracee && t.rang != null ? <Marqueur rang={t.rang} /> : null}
            <span style={{ minWidth: 0 }}>{t.libelle}</span>
          </span>
          <span style={st.chiffre}><Valeur v={t.total} unite={t.unite} /></span>
          <span style={st.ecart}>
            {libelleComparaison && estNombre(t.totalComparaison) ? <span data-no-translate><Ecart e={t.ecart} unite={t.unite} /></span> : null}
          </span>
          <PetitesBarres valeurs={t.valeurs} />
        </button>
      ))}
    </section>
  );
}
