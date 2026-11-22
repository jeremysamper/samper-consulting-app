import React from 'react';
import { Btn } from '../../components/ui/index.jsx';
import { BoutonActions, Fenetre, st as fs } from '../../components/ui/Fenetres.jsx';
import { notify } from '../../components/toast/index.js';
import { confirmLegacy } from '../../legacy/legacyApi.js';
import { supabase } from '../../services/supabase.js';
import { dbService } from '../../services/dbService.js';
import { useReglagesModule } from '../../hooks/useReglagesModule.js';
import { Ligne, ui } from '../compte/sections/reglagesUi.jsx';
import { CaseReglage, EtatModule, ListeTextes } from '../compte/sections/reglagesModulesUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Section « Mise en place » de la page des réglages (plan 15, lot 2) :
//   - postes de la maison (reglages_modules, module 'mep', postes) ;
//   - modèles de liste (table mep_modeles) : un nom, un poste (ou tous), des
//     lignes { label, quantite, unite, congelable }. Le lot 4 les propose
//     quand on prépare une liste.
// Lecture : qui lit la mise en place ; écriture : direction de la maison
// (RLS des deux tables). Un poste renommé se renomme aussi dans les modèles.
// ─────────────────────────────────────────────────────────────────────────────

const VIDE = { nom: '', poste: '', lignes: [] };

function useModelesMep(etabId) {
  const [etat, setEtat] = React.useState({ modeles: [], status: 'loading' });
  const relire = React.useCallback(async () => {
    if (!etabId) return;
    const { data, error } = await supabase.from('mep_modeles').select('*')
      .eq('etablissement_id', etabId).order('ordre').order('nom');
    if (error) { console.error('[mep_modeles] lecture', error); setEtat((e) => ({ ...e, status: 'error' })); return; }
    setEtat({ modeles: data || [], status: 'ready' });
  }, [etabId]);
  React.useEffect(() => {
    relire();
    const realtime = dbService.getRealtime();
    const unsub = realtime?.subscribeReload ? realtime.subscribeReload(['mep_modeles'], relire) : null;
    return () => { if (unsub) unsub(); };
  }, [relire]);
  return { ...etat, relire };
}

export default function SectionReglagesMep({ etablissement }) {
  const etabId = etablissement?.id || null;
  const { reglages, status, enregistrer } = useReglagesModule(etabId, 'mep');
  const modeles = useModelesMep(etabId);
  const [enCours, setEnCours] = React.useState(false);
  const [edition, setEdition] = React.useState(null); // null | modèle (VIDE pour un nouveau)
  if (!etabId) return null;
  if (status !== 'ready') return <EtatModule status={status} />;

  const ecrirePostes = async (postes) => {
    if (enCours) return false;
    setEnCours(true);
    const { error } = await enregistrer({ postes });
    setEnCours(false);
    if (error) { notify(error, 'error'); return false; }
    return true;
  };

  const enregistrerModele = async (m) => {
    const ligne = {
      etablissement_id: etabId,
      nom: m.nom.trim().slice(0, 80),
      poste: m.poste || null,
      lignes: m.lignes
        .filter((l) => l.label.trim())
        .map((l) => ({
          label: l.label.trim().slice(0, 120),
          recette_id: l.recette_id || null,
          quantite: l.quantite === '' || l.quantite == null ? null : Math.max(0, Number(String(l.quantite).replace(',', '.')) || 0),
          unite: l.unite ? String(l.unite).trim().slice(0, 20) : null,
          congelable: Boolean(l.congelable),
        })),
      ordre: m.ordre ?? modeles.modeles.length,
      actif: m.actif !== false,
    };
    const req = m.id
      ? supabase.from('mep_modeles').update(ligne).eq('id', m.id)
      : supabase.from('mep_modeles').insert(ligne);
    const { error } = await req;
    if (error) {
      console.error('[mep_modeles] écriture', error);
      notify(String(error.code) === '42501' ? 'Les modèles se règlent par la direction de la maison.' : "Le modèle n'a pas pu être enregistré. Réessayez.", 'error');
      return false;
    }
    notify('Modèle enregistré.', 'success');
    modeles.relire();
    return true;
  };

  const supprimerModele = async (m) => {
    if (!confirmLegacy('Supprimer ce modèle ? Les listes déjà préparées ne changent pas.')) return;
    const { error } = await supabase.from('mep_modeles').delete().eq('id', m.id);
    if (error) { console.error('[mep_modeles] suppression', error); notify("Le modèle n'a pas pu être supprimé.", 'error'); return; }
    modeles.relire();
  };

  return (
    <div style={ui.liste} data-section-reglages="mep">
      <Ligne colonne titre="Postes" aide="Les postes de la cuisine, pour ranger les modèles et les listes de mise en place.">
        <ListeTextes label="Nouveau poste" valeurs={reglages.postes} max={30} maxLen={40} placeholder="Garde-manger"
          desactive={enCours} vide="Aucun poste pour le moment : les modèles valent pour toute la cuisine." onChange={ecrirePostes} />
      </Ligne>
      <Ligne colonne derniere titre="Modèles de liste" aide="Une liste type, à reprendre quand on prépare la mise en place.">
        {modeles.status === 'loading' && <EtatModule status="loading" />}
        {modeles.status === 'error' && <EtatModule status="error" />}
        {modeles.status === 'ready' && (
          <div style={st.modeles}>
            {modeles.modeles.length === 0 && <p style={st.note}>Aucun modèle pour le moment.</p>}
            {modeles.modeles.map((m) => (
              <div key={m.id} style={st.modele} data-modele-mep="">
                <button type="button" style={st.modeleBouton} onClick={() => setEdition(m)}>
                  <span style={st.modeleNom} data-no-translate="">{m.nom}</span>
                  <span style={st.modeleDetail}>
                    {m.poste ? <span data-no-translate="">{m.poste}</span> : <span>Tous les postes</span>}
                    <span>, </span>
                    <span data-no-translate="">{(m.lignes || []).length}</span>{' '}
                    <span>{(m.lignes || []).length > 1 ? 'lignes' : 'ligne'}</span>
                  </span>
                </button>
                <BoutonActions id={`mep-modele-${m.id}`} label="Gérer" titre="Gérer" sousTitre={<span data-no-translate="">{m.nom}</span>} sections={[{ items: [
                  { titre: 'Modifier', onClick: () => setEdition(m) },
                  { titre: 'Supprimer', danger: true, onClick: () => supprimerModele(m) },
                ] }]} />
              </div>
            ))}
            <div style={ui.pied}>
              <Btn variant="primary" style={ui.btn44} onClick={() => setEdition(VIDE)}>Nouveau modèle</Btn>
            </div>
          </div>
        )}
      </Ligne>
      {edition && (
        <FenetreModele
          modele={edition}
          postes={reglages.postes}
          onClose={() => setEdition(null)}
          onSave={async (m) => { if (await enregistrerModele(m)) setEdition(null); }}
        />
      )}
    </div>
  );
}

function FenetreModele({ modele, postes, onClose, onSave }) {
  const [m, setM] = React.useState(() => ({
    ...modele,
    poste: modele.poste || '',
    lignes: (modele.lignes || []).map((l) => ({ ...l, quantite: l.quantite ?? '' })),
  }));
  const [enCours, setEnCours] = React.useState(false);
  const majLigne = (i, champ, valeur) => setM((x) => ({ ...x, lignes: x.lignes.map((l, j) => (j === i ? { ...l, [champ]: valeur } : l)) }));
  const valider = async () => {
    if (!m.nom.trim()) { notify('Donnez un nom au modèle.', 'warning'); return; }
    setEnCours(true);
    await onSave(m);
    setEnCours(false);
  };
  return (
    <Fenetre
      id="mep-modele"
      titre={modele.id ? 'Modifier le modèle' : 'Nouveau modèle'}
      onClose={onClose}
      largeur={620}
      pied={(
        <>
          <button type="button" style={fs.secondaire} onClick={onClose}>Annuler</button>
          <button type="button" style={{ ...fs.primaire, opacity: enCours ? 0.6 : 1 }} disabled={enCours} onClick={valider}>Enregistrer</button>
        </>
      )}
    >
      <label style={fs.section}>
        <span style={fs.label}>Nom du modèle</span>
        <input style={fs.champ} value={m.nom} maxLength={80} placeholder="Service du soir" onChange={(e) => setM({ ...m, nom: e.target.value })} />
      </label>
      <label style={fs.section}>
        <span style={fs.label}>Poste</span>
        <select style={fs.champ} value={m.poste} onChange={(e) => setM({ ...m, poste: e.target.value })}>
          <option value="">Tous les postes</option>
          {postes.map((p) => <option key={p} value={p}>{p}</option>)}
          {m.poste && !postes.includes(m.poste) && <option value={m.poste}>{m.poste}</option>}
        </select>
      </label>
      <div style={fs.section}>
        <span style={fs.label}>Lignes</span>
        {m.lignes.length === 0 && <p style={st.note}>Aucune ligne pour le moment.</p>}
        {m.lignes.map((l, i) => (
          <div key={i} style={st.ligneModele}>
            <input style={{ ...fs.champ, flex: '2 1 200px' }} value={l.label} maxLength={120} aria-label="Préparation" placeholder="Préparation"
              onChange={(e) => majLigne(i, 'label', e.target.value)} />
            <input style={{ ...fs.champ, flex: '0 1 90px', width: 90 }} value={l.quantite} inputMode="decimal" aria-label="Quantité" placeholder="Quantité"
              onChange={(e) => majLigne(i, 'quantite', e.target.value)} />
            <input style={{ ...fs.champ, flex: '0 1 110px', width: 110 }} value={l.unite || ''} maxLength={20} aria-label="Unité" placeholder="Unité"
              onChange={(e) => majLigne(i, 'unite', e.target.value)} />
            <CaseReglage libelle="Congelable" coche={Boolean(l.congelable)} onChange={(v) => majLigne(i, 'congelable', v)} />
            <Btn variant="ghost" style={ui.btn44} onClick={() => setM((x) => ({ ...x, lignes: x.lignes.filter((_, j) => j !== i) }))}>Retirer</Btn>
          </div>
        ))}
        <div>
          <Btn variant="ghost" style={ui.btn44} onClick={() => setM((x) => ({ ...x, lignes: [...x.lignes, { label: '', quantite: '', unite: '', congelable: false }] }))}>Ajouter une ligne</Btn>
        </div>
      </div>
    </Fenetre>
  );
}

const st = {
  note: { margin: 0, fontSize: 'var(--t2)', color: 'var(--text2)' },
  modeles: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  modele: {
    display: 'flex', alignItems: 'center', gap: 12, minHeight: 'var(--ligne-aeree)',
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)',
  },
  modeleBouton: {
    flex: 1, minWidth: 0, minHeight: 44, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
    padding: '6px 0', background: 'transparent', borderWidth: 0, borderStyle: 'none', borderRadius: 0,
    textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font)', color: 'var(--text)',
  },
  modeleNom: { fontSize: 'var(--t2)', fontWeight: 'var(--g2)' },
  modeleDetail: { fontSize: 'var(--t1)', color: 'var(--text2)' },
  ligneModele: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)' },
};
