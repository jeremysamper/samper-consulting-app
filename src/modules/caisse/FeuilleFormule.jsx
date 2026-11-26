import React from 'react';
import { TriangleAlert } from 'lucide-react';
import { Btn } from '../../components/ui/index.jsx';
import { useBackLayer } from '../../hooks/useBackLayer.js';
import { choixInitiaux } from './formules.js';

// ─────────────────────────────────────────────────────────────────────────────
// Feuille de choix d'une formule (lot 09 du panel, 25.11.2026), sur le modèle
// de FicheLigne : refermable par le geste retour et par Échap, cibles de 44 px.
//
// Le nom et le prix de la formule, puis ses étapes l'une sous l'autre, chaque
// produit en bouton. Une étape à un seul produit vendable est déjà choisie. Un
// produit en rupture est grisé et ne se choisit pas. Un produit en conflit
// avec les allergènes de la table porte l'alerte et reste choisissable :
// l'alerte est répétée au-dessus de « Ajouter au ticket ».
//
// L'identifiant du groupe est tiré une fois à l'ouverture : un double toucher
// rejoue le même groupe, et la base ne pose qu'une formule. L'écran n'envoie
// que des identifiants ; le prix est celui de la table, relu.
// ─────────────────────────────────────────────────────────────────────────────

const chf = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
const nouveauGroupe = () => (typeof crypto !== 'undefined' && crypto.randomUUID
  ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : ((r % 4) + 8)).toString(16);
  }));

export default function FeuilleFormule({ formule, conflitsDe, onPoser, onClose }) {
  const [choix, setChoix] = React.useState(() => choixInitiaux(formule));
  const [enCours, setEnCours] = React.useState(false);
  const groupe = React.useRef(nouveauGroupe());
  const verrou = React.useRef(false);

  useBackLayer(true, onClose, 'caisse-feuille-formule');
  React.useEffect(() => {
    const echap = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', echap, true);
    return () => document.removeEventListener('keydown', echap, true);
  }, [onClose]);

  const complet = choix.length === formule.etapes.length && choix.every(Boolean);
  // Alertes des produits choisis, répétées au-dessus du bouton.
  const alertes = formule.etapes.flatMap((e, i) => {
    const p = e.produits.find((x) => x.article.id === choix[i]);
    const conflits = p ? (conflitsDe?.(p.article) || []) : [];
    return conflits.length ? [{ nom: p.article.nom, conflits }] : [];
  });

  async function ajouter() {
    if (!complet || verrou.current) return;
    verrou.current = true;
    setEnCours(true);
    try {
      const ok = await onPoser(choix, groupe.current);
      if (ok) onClose();
    } finally {
      verrou.current = false;
      setEnCours(false);
    }
  }

  return (
    <div className="modal-sheet-overlay" data-fenetre="" style={st.overlay} onClick={onClose}>
      <div className="modal-sheet" role="dialog" aria-modal="true" aria-label="Choisir la formule" style={st.feuille} onClick={(e) => e.stopPropagation()} data-feuille-formule="">
        <div style={st.enTete}>
          <div style={{ minWidth: 0 }}>
            <div style={st.titre} data-no-translate>{formule.nom}</div>
            <div style={st.sousTitre}><span style={st.num}>{chf(formule.prix)}</span> <span>CHF</span></div>
          </div>
          <Btn variant="ghost" onClick={onClose} style={st.btn44}>Fermer</Btn>
        </div>

        {formule.etapes.map((e, i) => (
          <section key={`${i}-${e.nom}`} style={st.etape} data-etape={i + 1}>
            <div style={st.rangTitre} data-no-translate>{e.nom}</div>
            <div style={st.rang}>
              {e.produits.map(({ article, rupture }) => {
                const conflits = conflitsDe?.(article) || [];
                const choisi = choix[i] === article.id;
                return (
                  <button
                    key={article.id}
                    type="button"
                    aria-pressed={choisi}
                    aria-disabled={rupture || undefined}
                    data-produit-formule={article.id}
                    data-rupture={rupture ? '' : undefined}
                    data-allergene={conflits.length ? '' : undefined}
                    onClick={() => {
                      if (rupture) return;
                      setChoix((c) => { const n = [...c]; n[i] = article.id; return n; });
                    }}
                    style={{ ...st.produit, ...(choisi ? st.produitChoisi : null), ...(rupture ? st.produitRupture : null) }}
                  >
                    <span style={st.produitNom} data-no-translate>{article.nom}</span>
                    {rupture && <span style={st.produitNote}>Rupture</span>}
                    {!rupture && conflits.length > 0 && (
                      <span style={{ ...st.alerte, ...(choisi ? st.alerteChoisi : null) }}>
                        <TriangleAlert size={13} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0 }} />
                        <span>{conflits.join(', ')}</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        {alertes.length > 0 && (
          <div style={st.alerteBloc} data-feuille-formule-alerte="">
            <TriangleAlert size={16} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              <span>Attention aux allergènes de la table :</span>{' '}
              {alertes.map((a, k) => (
                <React.Fragment key={a.nom}>
                  {k > 0 && ' ; '}
                  <span data-no-translate>{a.nom}</span> <span>({a.conflits.join(', ')})</span>
                </React.Fragment>
              ))}
            </span>
          </div>
        )}

        <div style={st.pied}>
          {!complet && <span style={st.aide}>Choisissez un produit par étape.</span>}
          <Btn variant="primary" onClick={ajouter} disabled={!complet || enCours} style={st.btn44}>Ajouter au ticket</Btn>
        </div>
      </div>
    </div>
  );
}

const st = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1200, padding: 16,
  },
  feuille: {
    background: 'var(--surface)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
    borderRadius: 'var(--r-lg)', padding: '20px 22px', width: 560, maxWidth: '100%',
    maxHeight: '90vh', overflowY: 'auto', overflowX: 'hidden',
    boxShadow: 'var(--sh-lg)', boxSizing: 'border-box',
  },
  enTete: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 6 },
  titre: { fontSize: 'var(--t3)', fontWeight: 'var(--g3)', color: 'var(--text)', lineHeight: 1.2, overflowWrap: 'anywhere' },
  sousTitre: { fontSize: 'var(--t2)', color: 'var(--text2)', marginTop: 2 },
  num: { fontFamily: 'var(--font-num)' },
  etape: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  rangTitre: { fontSize: 'var(--t1)', fontWeight: 'var(--g3)', color: 'var(--text2)', margin: '14px 0 6px' },
  rang: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'stretch', minWidth: 0 },
  produit: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 2,
    minHeight: 44, padding: '8px 16px', maxWidth: '100%', boxSizing: 'border-box',
    background: 'var(--btn-fond)', color: 'var(--btn-texte)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)', borderRadius: 'var(--r)',
    fontFamily: 'var(--font)', fontSize: 'var(--t2)', textAlign: 'left', cursor: 'pointer',
  },
  produitChoisi: { background: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'var(--accent)' },
  produitRupture: { opacity: 0.65, cursor: 'not-allowed', textDecoration: 'line-through' },
  produitNom: { overflowWrap: 'anywhere' },
  produitNote: { fontSize: 'var(--t1)' },
  alerte: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--t1)', color: 'var(--warning-text)' },
  alerteChoisi: { color: 'var(--on-accent)' },
  alerteBloc: {
    display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 16, padding: '10px 12px',
    background: 'var(--warning-bg)', color: 'var(--warning-text)', borderRadius: 'var(--r)', fontSize: 'var(--t2)', lineHeight: 1.4,
  },
  aide: { fontSize: 'var(--t1)', color: 'var(--text2)' },
  pied: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 18 },
  btn44: { minHeight: 44, flexShrink: 0 },
};
