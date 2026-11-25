import React from 'react';
import { supabase } from '../../services/supabase.js';
import { dbService } from '../../services/dbService.js';
import { notify } from '../../components/toast/index.js';
import { Btn, Panneau, ligneStyle } from '../../components/ui/index.jsx';
import { collectIngredientGroups, matchGroup } from '../consultant-tools/bulkLinkLogic.js';
import { applyProductToIngredient } from '../../services/prixResolution.js';

// ─────────────────────────────────────────────────────────────────────────────
// « Relier les ingrédients » (plan 15, lot 4) : les lignes de fiches sans
// produit du catalogue, regroupées par nom (« Échalote », « échalotes » et
// « Echalotes ciselées » ensemble) et triées par fréquence. Le produit proposé
// vient des suggestions déjà en base (import des fiches), sinon du
// rapprochement du catalogue. Un geste relie toutes les lignes du groupe, par
// recettes_relier_ingredients : la fonction ne réécrit que ces lignes (prix et
// unité calculés ici), le reste des fiches est gardé.
// ─────────────────────────────────────────────────────────────────────────────

function suggestionEnBase(recettes, group) {
  const ids = new Set(group.occurrences.map((o) => o.ingId));
  for (const r of recettes) {
    for (const ing of r.ingredients || []) {
      if (ids.has(ing.id) && Array.isArray(ing.matchSuggestions) && ing.matchSuggestions[0]?.produitId) return ing.matchSuggestions[0].produitId;
    }
  }
  return null;
}

export function useGroupesARelier(etabId, produits) {
  const [etat, setEtat] = React.useState({ status: 'loading', recettes: [] });
  const relire = React.useCallback(async () => {
    const db = dbService.getDb();
    if (!etabId || !db) return;
    try {
      const recettes = await db.listRecettes(etabId, { strict: true });
      setEtat({ status: 'ready', recettes: (recettes || []).filter((r) => r.statut !== 'archivée') });
    } catch (e) {
      console.error('[catalogue] fiches à relier', e);
      setEtat((x) => ({ ...x, status: 'error' }));
    }
  }, [etabId]);
  React.useEffect(() => { relire(); }, [relire]);
  const groupes = React.useMemo(() => {
    if (etat.status !== 'ready') return [];
    return collectIngredientGroups(etat.recettes).groups
      .map((g) => {
        const m = matchGroup(g, produits);
        const enBase = suggestionEnBase(etat.recettes, g);
        return { ...m, proposeId: enBase || m.product?.id || null, occurrences: g.occurrences.filter((o) => o.ingId) };
      })
      .filter((g) => g.statut !== 'exclu' && g.occurrences.length > 0);
  }, [etat, produits]);
  return { status: etat.status, groupes, relire };
}

export default function RelierIngredients({ etablissement, produits }) {
  const etabId = etablissement?.id || null;
  const { status, groupes, relire } = useGroupesARelier(etabId, produits);
  const [choix, setChoix] = React.useState({}); // clé du groupe -> produit choisi
  const [enCours, setEnCours] = React.useState(null);
  const produitsTries = React.useMemo(() => [...produits].sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr')), [produits]);

  const relier = async (g) => {
    const produitId = choix[g.key] ?? g.proposeId;
    const produit = produits.find((p) => p.id === produitId);
    if (!produit) { notify('Choisissez le produit du catalogue.', 'warning'); return; }
    setEnCours(g.key);
    const liens = g.occurrences.map((o) => {
      const relie = applyProductToIngredient({ unite: o.unite }, produit);
      return { recette_id: o.recetteId, ingredient_id: o.ingId, prix_unit: relie.prixUnit, unite: relie.unite };
    });
    const { data, error } = await supabase.rpc('recettes_relier_ingredients', { p_produit_id: produit.id, p_liens: liens });
    setEnCours(null);
    if (error) {
      console.error('[catalogue] relier', error);
      notify(String(error.code) === '42501' ? 'Votre rôle ne permet pas de modifier les fiches.' : "Les lignes n'ont pas pu être reliées. Réessayez.", 'error');
      return;
    }
    const r = Array.isArray(data) ? data[0] : data;
    const n = Number(r?.relies ?? liens.length);
    notify(`${n} ${n > 1 ? 'lignes reliées' : 'ligne reliée'} à ${produit.nom}.`, 'success');
    relire();
  };

  if (status === 'loading') return <Panneau><div style={st.vide}>Chargement…</div></Panneau>;
  if (status === 'error') return <Panneau style={st.carteVide}><div style={st.vide}>Les fiches n'ont pas pu être lues.</div><Btn variant="ghost" onClick={relire}>Réessayer</Btn></Panneau>;
  if (groupes.length === 0) return <Panneau><div style={st.vide}>Toutes les lignes des fiches sont reliées au catalogue.</div></Panneau>;

  return (
    <Panneau style={st.carte} data-relier-ingredients="">
      <div style={st.intro}>Les plus fréquents d'abord. Un geste relie toutes les lignes du même nom, dans toutes les fiches.</div>
      {groupes.map((g, i) => {
        const valeur = choix[g.key] ?? g.proposeId ?? '';
        const idNom = `relier-${i}`;
        return (
          <div key={g.key} style={{ ...ligneStyle({ derniere: i === groupes.length - 1 }), ...st.ligne }} data-groupe-a-relier="">
            <div style={st.colNom}>
              <div id={idNom} style={st.nom}><span data-no-translate="">{g.nom}</span></div>
              <div style={st.detail}>
                <span data-no-translate="">{g.occurrences.length}</span> {g.occurrences.length > 1 ? 'lignes' : 'ligne'} dans <span data-no-translate="">{g.nbRecettes}</span> {g.nbRecettes > 1 ? 'fiches' : 'fiche'}
              </div>
            </div>
            <select style={st.select} value={valeur} aria-labelledby={idNom} onChange={(e) => setChoix((c) => ({ ...c, [g.key]: e.target.value }))}>
              <option value="">Choisir un produit</option>
              {produitsTries.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select>
            <Btn variant={valeur ? 'primary' : 'ghost'} disabled={!valeur || enCours === g.key} onClick={() => relier(g)}>
              Relier <span data-no-translate="">{g.occurrences.length}</span> {g.occurrences.length > 1 ? 'lignes' : 'ligne'}
            </Btn>
          </div>
        );
      })}
    </Panneau>
  );
}

const st = {
  carte: { padding: 0, overflow: 'hidden' },
  carteVide: { padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  intro: { padding: '14px 16px', fontSize: 'var(--t2)', color: 'var(--text2)', boxShadow: 'inset 0 -1px 0 var(--rule-soft)' },
  ligne: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', flexWrap: 'wrap' },
  colNom: { flex: '1 1 180px', minWidth: 0 },
  nom: { fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--text)' },
  detail: { fontSize: 'var(--t1)', color: 'var(--text2)', marginTop: 2 },
  select: { flex: '1 1 200px', minWidth: 0, minHeight: 44, padding: '0 10px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r)', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 'var(--t2)' },
  vide: { padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 'var(--t2)' },
};
