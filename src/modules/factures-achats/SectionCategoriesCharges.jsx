import React from 'react';
import { Btn } from '../../components/ui/index.jsx';
import { notify } from '../../components/toast/index.js';
import { supabase } from '../../services/supabase.js';
import { Ligne, ui } from '../compte/sections/reglagesUi.jsx';
import { CaseReglage, EtatModule } from '../compte/sections/reglagesModulesUi.jsx';
import { CATEGORIES_CHARGES } from '../comptabilite/chargesFixes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Section « Catégories de charges » (Factures & achats, plan 15, lot 2),
// compta_reglages.categories_charges : [{ id, label }], vide = les catégories
// de l'app. Une liste non vide est la liste complète de la maison. Les codes
// restent ceux de l'app : charges_fixes.categorie est fermée en base (CHECK),
// et une charge existante garde ainsi son libellé. La maison choisit donc les
// catégories proposées et leur nom. Écriture : qui règle les factures.
// ─────────────────────────────────────────────────────────────────────────────

export default function SectionCategoriesCharges({ user, etablissement, signaler }) {
  const etabId = etablissement?.id || null;
  const [etat, setEtat] = React.useState({ liste: [], status: 'loading' });
  const [brouillon, setBrouillon] = React.useState(null);
  const [enCours, setEnCours] = React.useState(false);

  React.useEffect(() => {
    if (!etabId) return undefined;
    let vivant = true;
    supabase.from('compta_reglages').select('categories_charges').eq('etablissement_id', etabId).maybeSingle()
      .then(({ data, error }) => {
        if (!vivant) return;
        if (error) { console.error('[catégories de charges]', error); setEtat({ liste: [], status: 'error' }); return; }
        const liste = Array.isArray(data?.categories_charges) ? data.categories_charges : [];
        setEtat({ liste, status: 'ready' });
      });
    return () => { vivant = false; };
  }, [etabId]);

  if (!etabId) return null;
  if (etat.status !== 'ready') return <EtatModule status={etat.status} />;

  // Lignes affichées : les catégories de l'app, cochées si la maison les
  // propose, avec son nom ; sans réglage, toutes, sous leur nom d'app.
  const propres = etat.liste.length > 0;
  const lignes = brouillon || CATEGORIES_CHARGES.map((c) => {
    const maison = etat.liste.find((x) => x.id === c.id);
    return { id: c.id, label: maison?.label || c.label, actif: propres ? Boolean(maison) : true };
  });
  const change = Boolean(brouillon);

  const enregistrer = async (liste) => {
    if (enCours) return;
    if (liste.length && !liste.some((c) => c.id === 'autre')) { notify('Gardez la catégorie « Autre ».', 'warning'); return; }
    setEnCours(true);
    const colonnes = { categories_charges: liste, updated_by: user?.id || null };
    const maj = () => supabase.from('compta_reglages').update(colonnes).eq('etablissement_id', etabId).select('etablissement_id');
    let { data, error } = await maj();
    if (!error && (!data || !data.length)) {
      const ins = await supabase.from('compta_reglages').insert({ etablissement_id: etabId, ...colonnes });
      if (ins.error && String(ins.error.code) === '23505') ({ error } = await maj());
      else error = ins.error;
    }
    setEnCours(false);
    if (error) { console.error('[catégories de charges]', error); notify("Les catégories n'ont pas pu être enregistrées. Réessayez.", 'error'); return; }
    setEtat({ liste, status: 'ready' });
    setBrouillon(null);
    notify('Catégories enregistrées.', 'success');
    signaler?.();
  };

  const maj = (id, champ, valeur) => setBrouillon(lignes.map((l) => (l.id === id ? { ...l, [champ]: valeur } : l)));

  return (
    <div style={ui.liste} data-section-reglages="achats_categories">
      <Ligne colonne derniere titre="Catégories de charges" aide="Les catégories proposées pour une charge fixe, et leur nom dans la maison. Une charge déjà saisie garde sa catégorie.">
        <div style={st.liste}>
          {lignes.map((l) => (
            <div key={l.id} style={st.ligne}>
              <CaseReglage libelle="Proposée" coche={l.actif} desactive={enCours || l.id === 'autre'} onChange={(v) => maj(l.id, 'actif', v)} />
              <input
                type="text" value={l.label} maxLength={60} disabled={enCours}
                aria-label={CATEGORIES_CHARGES.find((c) => c.id === l.id)?.label}
                onChange={(e) => maj(l.id, 'label', e.target.value)}
                style={st.champ}
              />
            </div>
          ))}
        </div>
        <div style={ui.pied}>
          <Btn variant="primary" disabled={!change || enCours} style={ui.btn44}
            onClick={() => enregistrer(lignes.filter((l) => l.actif).map((l) => ({ id: l.id, label: l.label.trim() || CATEGORIES_CHARGES.find((c) => c.id === l.id).label })))}>
            Enregistrer
          </Btn>
          {propres && <Btn variant="ghost" disabled={enCours} style={ui.btn44} onClick={() => enregistrer([])}>Reprendre les catégories de l'app</Btn>}
        </div>
      </Ligne>
    </div>
  );
}

const st = {
  liste: { display: 'flex', flexDirection: 'column', gap: 4 },
  ligne: { display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 },
  champ: {
    flex: '1 1 220px', maxWidth: 360, minWidth: 0, minHeight: 44, boxSizing: 'border-box', padding: '0 12px',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r)',
    background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 'var(--t2)',
  },
};
