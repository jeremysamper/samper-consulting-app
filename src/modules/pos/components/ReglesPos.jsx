import React from 'react';
import { supabase } from '../../../services/supabase.js';
import { notify } from '../../../components/toast/index.js';
import { Btn, Panneau, ligneStyle } from '../../../components/ui/index.jsx';
import { Fenetre, st as fs } from '../../../components/ui/Fenetres.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Règles de correspondance de la maison (plan 15, lot 4) : « relier » les
// articles dont le nom suit un motif à une fiche, ou les « ignorer »
// (boissons, suppléments : ils sortent de la liste à relier et du calcul de
// la mise en place). Lecture cuisine et direction ; écriture consultant,
// patron, resp_cuisine (la base refuse les autres).
// ─────────────────────────────────────────────────────────────────────────────

const MODES = [
  { id: 'commence', label: 'Commence par' },
  { id: 'contient', label: 'Contient' },
  { id: 'exact', label: 'Est exactement' },
];
const libelleMode = (id) => MODES.find((m) => m.id === id)?.label || id;

export function useReglesPos(etabId) {
  const [etat, setEtat] = React.useState({ status: 'loading', regles: [] });
  const relire = React.useCallback(async () => {
    if (!etabId) return;
    const { data, error } = await supabase.from('pos_regles_correspondance').select('*')
      .eq('etablissement_id', etabId).order('priorite', { ascending: false });
    if (error) { console.error('[pos] règles', error); setEtat((e) => ({ ...e, status: 'error' })); return; }
    setEtat({ status: 'ready', regles: data || [] });
  }, [etabId]);
  React.useEffect(() => { relire(); }, [relire]);
  return { ...etat, relire };
}

export default function ReglesPos({ etabId, regles, recettes, canEdit, onChange }) {
  const [ouverte, setOuverte] = React.useState(false);
  const nomFiche = (id) => recettes.find((r) => r.id === id)?.nom || 'Fiche';
  const retirer = async (r) => {
    const { error } = await supabase.from('pos_regles_correspondance').delete().eq('id', r.id);
    if (error) { console.error('[pos] règle', error); notify("La règle n'a pas pu être retirée.", 'error'); return; }
    onChange();
  };
  if (!canEdit && regles.length === 0) return null;
  return (
    <Panneau style={st.carte} data-regles-pos="">
      <div style={st.entete}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={st.titre}>Règles de la maison</div>
          <div style={st.sousTitre}>Elles relient ou écartent les articles d'un coup, à chaque nouvelle synchronisation.</div>
        </div>
        {canEdit && <Btn variant="ghost" onClick={() => setOuverte(true)}>Ajouter une règle</Btn>}
      </div>
      {regles.length === 0 ? (
        <div style={st.vide}>Aucune règle pour le moment.</div>
      ) : regles.map((r, i) => (
        <div key={r.id} style={{ ...ligneStyle({ derniere: i === regles.length - 1 }), ...st.ligne }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={st.nom}><span>{libelleMode(r.mode)}</span> « <span data-no-translate="">{r.motif}</span> »</div>
            <div style={st.detail}>
              {r.action === 'ignorer' ? 'Ignoré : ni à relier, ni compté dans la mise en place' : <>Relié à <span data-no-translate="">{nomFiche(r.recette_id)}</span></>}
              {r.actif === false && <>, éteinte</>}
            </div>
          </div>
          {canEdit && <Btn variant="ghost" onClick={() => retirer(r)}>Retirer</Btn>}
        </div>
      ))}
      {ouverte && <FenetreRegle etabId={etabId} recettes={recettes} onClose={() => setOuverte(false)} onSaved={() => { setOuverte(false); onChange(); }} />}
    </Panneau>
  );
}

function FenetreRegle({ etabId, recettes, onClose, onSaved }) {
  const [f, setF] = React.useState({ motif: '', mode: 'commence', action: 'relier', recette_id: '', priorite: '0' });
  const [enCours, setEnCours] = React.useState(false);
  const enregistrer = async () => {
    const motif = f.motif.trim();
    if (!motif) { notify('Indiquez le motif.', 'warning'); return; }
    if (f.action === 'relier' && !f.recette_id) { notify('Choisissez la fiche à relier.', 'warning'); return; }
    const priorite = Math.max(-100, Math.min(100, Math.round(Number(f.priorite) || 0)));
    setEnCours(true);
    const { error } = await supabase.from('pos_regles_correspondance').insert({
      etablissement_id: etabId, motif, mode: f.mode, action: f.action, recette_id: f.action === 'relier' ? f.recette_id : null, priorite, actif: true,
    });
    setEnCours(false);
    if (error) {
      console.error('[pos] règle', error);
      notify(String(error.code) === '23505' ? 'Une règle existe déjà pour ce motif.' : String(error.code) === '42501' ? 'Les règles sont réservées à la direction de la maison.' : "La règle n'a pas pu être enregistrée.", 'error');
      return;
    }
    notify('Règle ajoutée.', 'success');
    onSaved();
  };
  return (
    <Fenetre
      id="pos-regle"
      titre="Ajouter une règle"
      onClose={onClose}
      pied={(
        <>
          <button type="button" style={fs.secondaire} onClick={onClose}>Annuler</button>
          <button type="button" style={{ ...fs.primaire, opacity: enCours ? 0.6 : 1 }} disabled={enCours} onClick={enregistrer}>Enregistrer</button>
        </>
      )}
    >
      <label style={fs.section}>
        <span style={fs.label}>Le nom de l'article</span>
        <select style={fs.champ} value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>
          {MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </label>
      <label style={fs.section}>
        <span style={fs.label}>Motif</span>
        <input style={fs.champ} value={f.motif} onChange={(e) => setF({ ...f, motif: e.target.value })} placeholder="Ex : Supplément" data-no-translate="" />
        <span style={fs.remarque}>Majuscules et accents ne comptent pas.</span>
      </label>
      <label style={fs.section}>
        <span style={fs.label}>Action</span>
        <select style={fs.champ} value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })}>
          <option value="relier">Relier à une fiche</option>
          <option value="ignorer">Ignorer (boisson, supplément)</option>
        </select>
      </label>
      {f.action === 'relier' && (
        <label style={fs.section}>
          <span style={fs.label}>Fiche</span>
          <select style={fs.champ} value={f.recette_id} onChange={(e) => setF({ ...f, recette_id: e.target.value })}>
            <option value="">Choisir une fiche</option>
            {recettes.map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}
          </select>
        </label>
      )}
      <label style={fs.section}>
        <span style={fs.label}>Priorité</span>
        <input type="text" inputMode="numeric" style={fs.champ} value={f.priorite} onChange={(e) => setF({ ...f, priorite: e.target.value })} data-no-translate="" />
        <span style={fs.remarque}>Quand deux règles conviennent, la plus haute l'emporte.</span>
      </label>
    </Fenetre>
  );
}

const st = {
  carte: { padding: 0, overflow: 'hidden' },
  entete: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', flexWrap: 'wrap', boxShadow: 'inset 0 -1px 0 var(--rule-soft)' },
  titre: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)' },
  sousTitre: { fontSize: 'var(--t1)', color: 'var(--text2)', marginTop: 2 },
  ligne: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', flexWrap: 'wrap' },
  nom: { fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--text)' },
  detail: { fontSize: 'var(--t1)', color: 'var(--text2)', marginTop: 2 },
  vide: { padding: 16, fontSize: 'var(--t2)', color: 'var(--text3)' },
};
