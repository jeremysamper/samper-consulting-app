import { useState } from 'react';
import { getBrowserWindow } from '../../legacy/legacyApi.js';
import { notify } from '../../components/toast/index.js';
import { Btn, ligneStyle } from '../../components/ui/index.jsx';
import { Fenetre, st as fst } from '../../components/ui/Fenetres.jsx';
import {
  MAX_NOM_VUE, MAX_VUES, enregistrerVueNommee, renommerVueNommee, retirerVueNommee,
} from './vueStatistiques.js';

// ═════════════════════════════════════════════════════════════════════
// Vues enregistrées et nommées des Statistiques (Q4) : la vue affichée
// (cases, période, pas, comparaison, graphiques) se range sous un nom dans
// user_settings, se rouvre, se renomme, se supprime. Aucune table nouvelle.
// La liste et son écriture viennent de l'écran (useUserSettings).
// Les noms sont des données : jamais traduits.
// ═════════════════════════════════════════════════════════════════════

const st = {
  section: { display: 'flex', flexDirection: 'column', gap: 8 },
  enregistrer: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'stretch' },
  champ: { ...fst.champ, flex: '1 1 200px', width: 'auto', minWidth: 0 },
  nom: { flex: '1 1 auto', minWidth: 0, overflowWrap: 'anywhere', fontSize: 'var(--t2)', color: 'var(--text)', padding: '6px 0' },
  actions: { display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 },
  bouton: { minHeight: 44, flexShrink: 0 },
  vide: { fontSize: 'var(--t2)', color: 'var(--text2)', padding: '8px 0' },
  compte: { fontSize: 'var(--t1)', color: 'var(--text2)' },
};

const MESSAGES = {
  ajoutee: ['Vue enregistrée.', 'success'],
  remplacee: ['Vue mise à jour : ce nom existait déjà.', 'success'],
  pleine: ['Vingt vues au plus : supprimez-en une avant d\'en enregistrer une autre.', 'warning'],
  sans_nom: ['Donnez un nom à la vue.', 'warning'],
  pris: ['Ce nom est déjà pris par une autre vue.', 'warning'],
};

const nouvelId = () => `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

//   vues     : liste lue (vuesNommeesLues)
//   vue      : la vue affichée, à enregistrer
//   ecrire   : (liste) => Promise, écrit la liste dans user_settings
//   ouvrir   : (vue) => void, affiche une vue enregistrée
export default function VuesNommees({ vues, vue, ecrire, ouvrir, onClose }) {
  const [nom, setNom] = useState('');
  const [enCours, setEnCours] = useState(null);
  const [renomme, setRenomme] = useState(null);

  const ecrireListe = async (liste, resultat) => {
    try {
      await ecrire(liste);
      if (MESSAGES[resultat]) notify(...MESSAGES[resultat]);
      return true;
    } catch (e) {
      console.error('[statistiques] vues nommées', e);
      notify('La liste des vues n\'a pas pu être enregistrée. Réessayez.', 'error');
      return false;
    }
  };

  const enregistrer = async () => {
    const r = enregistrerVueNommee(vues, { id: nouvelId(), nom, vue });
    if (r.resultat === 'sans_nom' || r.resultat === 'pleine') { notify(...MESSAGES[r.resultat]); return; }
    setEnCours('enregistrer');
    if (await ecrireListe(r.liste, r.resultat)) setNom('');
    setEnCours(null);
  };

  const renommer = async () => {
    const r = renommerVueNommee(vues, renomme.id, renomme.nom);
    if (r.resultat !== 'renommee') { if (MESSAGES[r.resultat]) notify(...MESSAGES[r.resultat]); return; }
    setEnCours(renomme.id);
    if (await ecrireListe(r.liste, null)) setRenomme(null);
    setEnCours(null);
  };

  const supprimer = async (v) => {
    const w = getBrowserWindow();
    if (w && !w.confirm('Supprimer cette vue enregistrée ? Les chiffres ne sont pas touchés.')) return;
    setEnCours(v.id);
    await ecrireListe(retirerVueNommee(vues, v.id), null);
    setEnCours(null);
  };

  return (
    <Fenetre id="stat-vues" titre="Vues enregistrées" sousTitre="Rangez la vue affichée sous un nom pour la retrouver." onClose={onClose} largeur={520}>
      <div style={st.section}>
        <label htmlFor="stat-vue-nom" style={fst.label}>Nom de la vue affichée</label>
        <div style={st.enregistrer}>
          <input
            id="stat-vue-nom" style={st.champ} value={nom} maxLength={MAX_NOM_VUE} placeholder="Par exemple : ventes du mois"
            onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') enregistrer(); }} data-stat-vue-nom=""
          />
          <Btn variant="primary" onClick={enregistrer} disabled={enCours === 'enregistrer'} style={st.bouton}>Enregistrer</Btn>
        </div>
      </div>
      <div style={st.section} data-stat-vues="">
        <div style={st.compte}><span data-no-translate>{vues.length}</span> <span>sur</span> <span data-no-translate>{MAX_VUES}</span></div>
        {!vues.length ? <div style={st.vide}>Aucune vue enregistrée.</div> : vues.map((v, i) => (
          <div key={v.id} style={{ ...ligneStyle({ derniere: i === vues.length - 1 }), flexWrap: 'wrap' }} data-stat-vue={v.id}>
            {renomme?.id === v.id ? (
              <>
                <input
                  style={st.champ} value={renomme.nom} maxLength={MAX_NOM_VUE} aria-label="Nouveau nom" autoFocus
                  onChange={(e) => setRenomme({ ...renomme, nom: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') renommer(); if (e.key === 'Escape') setRenomme(null); }}
                />
                <div style={st.actions}>
                  <Btn variant="primary" onClick={renommer} disabled={enCours === v.id} style={st.bouton}>Valider</Btn>
                  <Btn variant="ghost" onClick={() => setRenomme(null)} style={st.bouton}>Annuler</Btn>
                </div>
              </>
            ) : (
              <>
                <span style={st.nom} data-no-translate>{v.nom}</span>
                <div style={st.actions}>
                  <Btn variant="ghost" onClick={() => { ouvrir(v.vue); onClose(); }} style={st.bouton}>Ouvrir</Btn>
                  <Btn variant="ghost" onClick={() => setRenomme({ id: v.id, nom: v.nom })} style={st.bouton}>Renommer</Btn>
                  <Btn variant="ghost" onClick={() => supprimer(v)} disabled={enCours === v.id} style={st.bouton}>Supprimer</Btn>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </Fenetre>
  );
}
