import React from 'react';
import { Fenetre, st as fs } from '../../components/ui/Fenetres.jsx';
import { notify } from '../../components/toast/index.js';
import { supabase } from '../../services/supabase.js';
import { dbService } from '../../services/dbService.js';
import { ui } from '../compte/sections/reglagesUi.jsx';
import { ChoixMultiple } from '../compte/sections/reglagesMaisonUi.jsx';
import { EtatModule } from '../compte/sections/reglagesModulesUi.jsx';
import { JOURS_SEMAINE } from '../haccp/JoursCreneau.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Section « Commande » de la page des réglages (plan 15, lot 2, décision D3 :
// une commande par fournisseur, un stock cible par jour de livraison) :
//   - par fournisseur : jours de livraison, heure limite, délai de commande
//     (colonnes de fournisseurs, écriture par la direction de la maison) ;
//   - par produit de ce fournisseur : le stock cible de chaque jour de
//     livraison (table commande_cibles, dans l'unité de référence du produit).
// Le lot 4 lit ces réglages pour préparer la commande. Pas de prévision des
// quantités : on dit « il en reste combien », la cible fait le reste.
// ─────────────────────────────────────────────────────────────────────────────

const libelleUnite = (u) => ({ g: 'g', ml: 'ml', pcs: 'pièces' }[u] || u || '');
const joursEnClair = (jours) => JOURS_SEMAINE.filter((j) => (jours || []).includes(j.id));

function useFournisseurs(etabId) {
  const [etat, setEtat] = React.useState({ fournisseurs: [], status: 'loading' });
  const relire = React.useCallback(async () => {
    if (!etabId) return;
    const { data, error } = await supabase.from('fournisseurs')
      .select('id, nom, actif, jours_livraison, heure_limite, delai_commande_jours')
      .eq('etablissement_id', etabId).order('nom');
    if (error) { console.error('[commande] fournisseurs', error); setEtat((e) => ({ ...e, status: 'error' })); return; }
    setEtat({ fournisseurs: (data || []).filter((f) => f.actif !== false), status: 'ready' });
  }, [etabId]);
  React.useEffect(() => {
    relire();
    const realtime = dbService.getRealtime();
    const unsub = realtime?.subscribeReload ? realtime.subscribeReload(['fournisseurs'], relire) : null;
    return () => { if (unsub) unsub(); };
  }, [relire]);
  return { ...etat, relire };
}

export default function SectionReglagesCommande({ etablissement }) {
  const etabId = etablissement?.id || null;
  const { fournisseurs, status, relire } = useFournisseurs(etabId);
  const [edition, setEdition] = React.useState(null);
  if (!etabId) return null;
  if (status !== 'ready') return <EtatModule status={status} />;

  return (
    <div style={ui.liste} data-section-reglages="commande">
      <p style={st.intro}>Une commande par fournisseur. Réglez ses jours de livraison et, pour chaque produit, le stock à avoir le jour de la livraison.</p>
      {fournisseurs.length === 0 && <p style={st.intro}>Aucun fournisseur pour le moment. Ils s'ajoutent dans le Catalogue.</p>}
      <div style={st.liste}>
        {fournisseurs.map((f) => (
          <button key={f.id} type="button" style={st.ligne} onClick={() => setEdition(f)} data-fournisseur-commande="">
            <span style={st.titre} data-no-translate="">{f.nom}</span>
            <span style={st.detail}>
              {f.jours_livraison?.length
                ? <>
                  <span>Livraison le</span>{' '}
                  {joursEnClair(f.jours_livraison).map((j, i) => <React.Fragment key={j.id}>{i > 0 && ', '}<span>{j.label}</span></React.Fragment>)}
                  {f.heure_limite && <><span>, </span><span>commande avant</span> <span data-no-translate="">{String(f.heure_limite).slice(0, 5)}</span></>}
                </>
                : <span>Jours de livraison à régler</span>}
            </span>
          </button>
        ))}
      </div>
      {edition && (
        <FenetreFournisseur etabId={etabId} fournisseur={edition} onClose={() => setEdition(null)} onSaved={() => { setEdition(null); relire(); }} />
      )}
    </div>
  );
}

function FenetreFournisseur({ etabId, fournisseur, onClose, onSaved }) {
  const [f, setF] = React.useState(() => ({
    jours: fournisseur.jours_livraison || [],
    heure: fournisseur.heure_limite ? String(fournisseur.heure_limite).slice(0, 5) : '',
    delai: fournisseur.delai_commande_jours ?? 1,
  }));
  const [produits, setProduits] = React.useState(null);
  const [cibles, setCibles] = React.useState({}); // `${produit}:${jour}` -> texte
  // Produits habituels (commande_habituels, lot 4) : repris dans chaque commande neuve.
  const [habituels, setHabituels] = React.useState(null); // produits habituels lus en base
  const [habituelsChoisis, setHabituelsChoisis] = React.useState(new Set());
  const [enCours, setEnCours] = React.useState(false);

  React.useEffect(() => {
    let vivant = true;
    (async () => {
      const { data: prods, error } = await supabase.from('produits').select('id, nom, unite_ref')
        .eq('etablissement_id', etabId).eq('fournisseur_id', fournisseur.id).order('nom');
      if (!vivant) return;
      if (error) { console.error('[commande] produits', error); setProduits([]); return; }
      setProduits(prods || []);
      const ids = (prods || []).map((p) => p.id);
      const { data: hs, error: eh } = await supabase.from('commande_habituels').select('produit_id')
        .eq('etablissement_id', etabId).eq('fournisseur_id', fournisseur.id);
      if (!vivant) return;
      if (eh) { console.error('[commande] habituels', eh); } else {
        const lus = new Set((hs || []).map((h) => h.produit_id));
        setHabituels(lus); setHabituelsChoisis(new Set(lus));
      }
      if (!ids.length) return;
      const { data: cs, error: e2 } = await supabase.from('commande_cibles').select('produit_id, jour_livraison, quantite')
        .eq('etablissement_id', etabId).in('produit_id', ids);
      if (!vivant) return;
      if (e2) { console.error('[commande] cibles', e2); return; }
      setCibles(Object.fromEntries((cs || []).map((c) => [`${c.produit_id}:${c.jour_livraison}`, String(c.quantite)])));
    })();
    return () => { vivant = false; };
  }, [etabId, fournisseur.id]);

  const enregistrer = async () => {
    if (f.heure && !/^\d{2}:\d{2}$/.test(f.heure)) { notify("L'heure limite n'est pas lisible.", 'warning'); return; }
    const delai = Number(f.delai);
    if (!Number.isInteger(delai) || delai < 0 || delai > 14) { notify('Un délai de commande entre 0 et 14 jours.', 'warning'); return; }
    setEnCours(true);
    const { error } = await supabase.from('fournisseurs').update({
      jours_livraison: f.jours.length ? f.jours : null,
      heure_limite: f.heure ? `${f.heure}:00` : null,
      delai_commande_jours: delai,
    }).eq('id', fournisseur.id);
    if (error) {
      setEnCours(false);
      console.error('[commande] fournisseur', error);
      notify(String(error.code) === '42501' ? 'Ces réglages sont réservés à la direction de la maison.' : "Le fournisseur n'a pas pu être enregistré. Réessayez.", 'error');
      return;
    }
    // Stocks cibles : une ligne par produit et par jour de livraison réglé ;
    // un champ vidé ou un jour retiré efface la cible.
    const aGarder = [];
    const aEffacer = [];
    (produits || []).forEach((p) => JOURS_SEMAINE.forEach((j) => {
      const texte = cibles[`${p.id}:${j.id}`];
      const q = texte == null || texte.trim() === '' ? null : Number(String(texte).replace(',', '.'));
      if (f.jours.includes(j.id) && q != null && Number.isFinite(q) && q >= 0) {
        aGarder.push({ etablissement_id: etabId, produit_id: p.id, jour_livraison: j.id, quantite: q });
      } else if (texte != null) {
        aEffacer.push({ produit: p.id, jour: j.id });
      }
    }));
    let erreur = null;
    if (aGarder.length) {
      const r = await supabase.from('commande_cibles').upsert(aGarder, { onConflict: 'produit_id,jour_livraison' });
      erreur = r.error;
    }
    for (const x of aEffacer) {
      if (erreur) break;
      const r = await supabase.from('commande_cibles').delete().eq('produit_id', x.produit).eq('jour_livraison', x.jour);
      erreur = r.error;
    }
    // Produits habituels : ajoutés ou retirés selon les cases cochées.
    if (!erreur && habituels) {
      const ajouts = [...habituelsChoisis].filter((id) => !habituels.has(id));
      const retraits = [...habituels].filter((id) => !habituelsChoisis.has(id));
      if (ajouts.length) {
        const r = await supabase.from('commande_habituels').insert(ajouts.map((id, i) => ({ etablissement_id: etabId, fournisseur_id: fournisseur.id, produit_id: id, ordre: habituels.size + i })));
        erreur = r.error;
      }
      if (!erreur && retraits.length) {
        const r = await supabase.from('commande_habituels').delete().eq('fournisseur_id', fournisseur.id).in('produit_id', retraits);
        erreur = r.error;
      }
    }
    setEnCours(false);
    if (erreur) { console.error('[commande] cibles', erreur); notify("Les stocks cibles n'ont pas pu être enregistrés. Réessayez.", 'error'); return; }
    notify('Fournisseur réglé.', 'success');
    onSaved();
  };

  const joursChoisis = joursEnClair(f.jours);
  return (
    <Fenetre
      id="commande-fournisseur"
      titre="Régler le fournisseur"
      sousTitre={<span data-no-translate="">{fournisseur.nom}</span>}
      onClose={onClose}
      largeur={680}
      pied={(
        <>
          <button type="button" style={fs.secondaire} onClick={onClose}>Annuler</button>
          <button type="button" style={{ ...fs.primaire, opacity: enCours ? 0.6 : 1 }} disabled={enCours} onClick={enregistrer}>Enregistrer</button>
        </>
      )}
    >
      <div style={fs.section}>
        <span style={fs.label}>Jours de livraison</span>
        <ChoixMultiple label="Jours de livraison" options={JOURS_SEMAINE} valeurs={f.jours} onChange={(jours) => setF({ ...f, jours })} />
      </div>
      <div style={st.rangee}>
        <label style={{ ...fs.section, flex: '1 1 160px' }}>
          <span style={fs.label}>Heure limite de commande</span>
          <input type="time" style={fs.champ} value={f.heure} onChange={(e) => setF({ ...f, heure: e.target.value })} />
        </label>
        <label style={{ ...fs.section, flex: '1 1 160px' }}>
          <span style={fs.label}>Commander combien de jours avant</span>
          <input type="text" inputMode="numeric" style={fs.champ} value={f.delai} onChange={(e) => setF({ ...f, delai: e.target.value })} />
          <span style={fs.remarque}>0 : le jour même, avant l'heure limite.</span>
        </label>
      </div>
      {produits && produits.length > 0 && habituels && (
        <div style={fs.section}>
          <span style={fs.label}>Produits habituels</span>
          <span style={fs.remarque}>Ils entrent dans chaque nouvelle commande de ce fournisseur, même sans stock cible.</span>
          <div style={st.habituels}>
            {produits.map((p) => (
              <label key={p.id} style={st.habituel}>
                <input
                  type="checkbox" style={st.case}
                  checked={habituelsChoisis.has(p.id)}
                  onChange={() => setHabituelsChoisis((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}
                />
                <span data-no-translate="">{p.nom}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      <div style={fs.section}>
        <span style={fs.label}>Stock cible le jour de la livraison</span>
        {produits === null && <EtatModule status="loading" />}
        {produits && produits.length === 0 && <p style={st.intro}>Aucun produit de ce fournisseur dans le Catalogue.</p>}
        {produits && produits.length > 0 && joursChoisis.length === 0 && <p style={st.intro}>Choisissez d'abord les jours de livraison.</p>}
        {produits && produits.length > 0 && joursChoisis.length > 0 && (
          <div style={st.tableau} role="table" aria-label="Stock cible le jour de la livraison">
            <div style={st.ligneTableau} role="row">
              <span style={st.celluleNom} role="columnheader">Produit</span>
              {joursChoisis.map((j) => <span key={j.id} style={st.celluleJour} role="columnheader">{j.label}</span>)}
            </div>
            {produits.map((p) => (
              <div key={p.id} style={st.ligneTableau} role="row">
                <span style={st.celluleNom} role="rowheader">
                  <span data-no-translate="">{p.nom}</span>{' '}
                  <span style={st.unite}>{libelleUnite(p.unite_ref)}</span>
                </span>
                {joursChoisis.map((j) => (
                  <span key={j.id} style={st.celluleJour} role="cell">
                    <input
                      type="text" inputMode="decimal" style={st.champCible}
                      aria-label={`${p.nom}, ${j.label}`}
                      data-no-translate=""
                      value={cibles[`${p.id}:${j.id}`] ?? ''}
                      onChange={(e) => setCibles((c) => ({ ...c, [`${p.id}:${j.id}`]: e.target.value }))}
                    />
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </Fenetre>
  );
}

const st = {
  intro: { margin: '0 0 8px', fontSize: 'var(--t2)', color: 'var(--text2)', lineHeight: 1.45 },
  liste: { display: 'flex', flexDirection: 'column' },
  ligne: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, width: '100%', minHeight: 'var(--ligne-aeree)',
    padding: '8px 0', background: 'transparent', borderWidth: 0, borderStyle: 'none', borderRadius: 0,
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)',
    textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font)', color: 'var(--text)',
  },
  titre: { fontSize: 'var(--t2)', fontWeight: 'var(--g2)' },
  detail: { fontSize: 'var(--t1)', color: 'var(--text2)' },
  rangee: { display: 'flex', flexWrap: 'wrap', gap: 12 },
  tableau: { display: 'flex', flexDirection: 'column', overflowX: 'auto', maxWidth: '100%' },
  ligneTableau: {
    display: 'flex', alignItems: 'center', gap: 8, minHeight: 48,
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)',
  },
  celluleNom: { flex: '1 1 180px', minWidth: 140, fontSize: 'var(--t2)', color: 'var(--text)' },
  celluleJour: { flex: '0 0 92px', width: 92, fontSize: 'var(--t1)', color: 'var(--text2)', textAlign: 'center' },
  unite: { fontSize: 'var(--t1)', color: 'var(--text3)' },
  habituels: { display: 'flex', flexWrap: 'wrap', gap: '4px 16px' },
  // Case dans un label de 44 px de haut (cible tactile) ; la case fait 24 px.
  habituel: { display: 'inline-flex', alignItems: 'center', gap: 10, minHeight: 44, minWidth: 44, fontSize: 'var(--t2)', color: 'var(--text)', cursor: 'pointer' },
  case: { width: 24, height: 24, margin: 0, accentColor: 'var(--accent)', flexShrink: 0 },
  champCible: {
    width: '100%', minHeight: 44, boxSizing: 'border-box', padding: '0 8px', textAlign: 'right',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r)',
    background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font-num)', fontSize: 'var(--t2)',
  },
};
