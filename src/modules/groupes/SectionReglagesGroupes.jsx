import React from 'react';
import { Btn } from '../../components/ui/index.jsx';
import { notify } from '../../components/toast/index.js';
import { useReglagesModule } from '../../hooks/useReglagesModule.js';
import { navigateToPage } from '../../services/navigationService.js';
import { Ligne, ui } from '../compte/sections/reglagesUi.jsx';
import { ChoixMultiple } from '../compte/sections/reglagesMaisonUi.jsx';
import { CaseReglage, ChampEntier, EtatModule } from '../compte/sections/reglagesModulesUi.jsx';
import { STATUT_META, TYPES_GROUPE } from './typesGroupe.js';

// ─────────────────────────────────────────────────────────────────────────────
// Section « Groupes » de la page des réglages (plan 15, lot 2),
// reglages_modules, module 'groupes' :
//   - délai d'alerte : un groupe pas encore prêt entre dans l'alerte tant de
//     jours avant (14 par défaut) ;
//   - libellés des trois états, et l'étape « lu » gardée ou non ;
//   - types de groupe proposés à la saisie.
// Les codes d'état et de type restent ceux des CHECK de groupe_evenements :
// on règle les mots et le parcours, pas des états neufs. Les menus types se
// composent dans le module (onglet « Menus ») : c'est du contenu, pas un
// réglage. Écriture : direction de la maison (RLS).
// ─────────────────────────────────────────────────────────────────────────────

export default function SectionReglagesGroupes({ etablissement }) {
  const etabId = etablissement?.id || null;
  const { reglages, config, status, enregistrer } = useReglagesModule(etabId, 'groupes');
  const [enCours, setEnCours] = React.useState(false);
  if (!etabId) return null;
  if (status !== 'ready') return <EtatModule status={status} />;

  const ecrire = async (changes) => {
    if (enCours) return false;
    setEnCours(true);
    const { error } = await enregistrer(changes);
    setEnCours(false);
    if (error) { notify(error, 'error'); return false; }
    return true;
  };
  const statutsConfig = (config && config.statuts) || {};
  const ecrireStatut = (id, champ, valeur) => ecrire({
    statuts: { ...statutsConfig, [id]: { ...(statutsConfig[id] || {}), [champ]: valeur } },
  });

  return (
    <div style={ui.liste} data-section-reglages="groupes">
      <Ligne titre="Délai d'alerte" aide="Un groupe qui n'est pas encore prêt apparaît dans l'alerte du menu et du tableau de bord ce nombre de jours avant la date.">
        <ChampEntier label="Délai d'alerte en jours" valeur={reglages.delai_alerte_jours} min={1} max={60} unite="jours" desactive={enCours}
          onValider={(n) => ecrire({ delai_alerte_jours: n })} />
      </Ligne>
      <Ligne colonne titre="États de préparation" aide="Le mot affiché pour chaque état. Sans étape « Lu », un groupe passe directement de « À lire » à « Prêt ».">
        <div style={st.statuts}>
          {['a_lire', 'lu', 'pret'].map((id) => (
            <div key={id} style={st.statut}>
              <label style={st.champBloc}>
                <span style={st.champLabel}>{STATUT_META[id].label}</span>
                <LibelleStatut
                  valeur={reglages.statuts[id].libelle || ''}
                  placeholder={STATUT_META[id].label}
                  desactive={enCours || (id === 'lu' && !reglages.statuts.lu.actif)}
                  onValider={(t) => ecrireStatut(id, 'libelle', t || undefined)}
                />
              </label>
              {id === 'lu' && (
                <CaseReglage libelle="Garder l'étape « Lu »" coche={reglages.statuts.lu.actif} desactive={enCours}
                  onChange={(actif) => ecrireStatut('lu', 'actif', actif)} />
              )}
            </div>
          ))}
        </div>
      </Ligne>
      <Ligne colonne titre="Types de groupe proposés" aide="Les types que l'on peut choisir pour un nouveau groupe. Un groupe déjà enregistré garde son type.">
        <ChoixMultiple
          label="Types de groupe proposés"
          options={TYPES_GROUPE.map((t) => ({ id: t.id, label: t.label }))}
          valeurs={reglages.types_actifs}
          desactive={enCours}
          onChange={(types) => {
            if (!types.length) { notify('Gardez au moins un type de groupe.', 'warning'); return; }
            ecrire({ types_actifs: types });
          }}
        />
      </Ligne>
      <Ligne derniere titre="Menus types" aide="Les menus proposés aux groupes se composent dans le module Groupes, onglet « Menus ».">
        <Btn variant="ghost" style={ui.btn44} onClick={() => navigateToPage('groupes')}>Aller aux Groupes</Btn>
      </Ligne>
    </div>
  );
}

// Libellé d'un état : enregistré à la sortie du champ ; vide = le mot d'origine.
function LibelleStatut({ valeur, placeholder, desactive, onValider }) {
  const [texte, setTexte] = React.useState(valeur);
  React.useEffect(() => { setTexte(valeur); }, [valeur]);
  const valider = () => {
    const t = texte.trim().slice(0, 40);
    if (t !== valeur) onValider(t);
  };
  return (
    <input
      type="text" value={texte} maxLength={40} placeholder={placeholder} disabled={desactive}
      onChange={(e) => setTexte(e.target.value)} onBlur={valider}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      style={st.champ}
    />
  );
}

const st = {
  statuts: { display: 'flex', flexDirection: 'column', gap: 12 },
  statut: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 16 },
  champBloc: { display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 220px', minWidth: 0, maxWidth: 360 },
  champLabel: { fontSize: 'var(--t1)', color: 'var(--text2)' },
  champ: {
    minHeight: 44, boxSizing: 'border-box', padding: '0 12px', width: '100%',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r)',
    background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 'var(--t2)',
  },
};
