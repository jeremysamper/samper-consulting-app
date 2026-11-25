import React from 'react';
import { Btn } from '../../components/ui/index.jsx';
import { notify } from '../../components/toast/index.js';
import { supabase } from '../../services/supabase.js';
import { canManageModule } from '../../data/demoData.js';
import { useReglagesModule } from '../../hooks/useReglagesModule.js';
import { MOTIFS_PERTE_DEFAUT, ROLES_VALIDEURS } from '../../utils/reglagesModules.js';
import { Ligne, ui } from '../compte/sections/reglagesUi.jsx';
import { ChoixMultiple } from '../compte/sections/reglagesMaisonUi.jsx';
import { ChampEntier, EtatModule, ListeTextes } from '../compte/sections/reglagesModulesUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Section « Pertes » de la page des réglages (plan 15, lot 2) :
//   - motifs de la maison (reglages_modules, module 'pertes', motifs) ;
//   - qui valide une perte (valideurs ; sans réglage : le droit « Modifier »
//     des Pertes, comme avant) ;
//   - seuil d'alerte : la règle d'alerte « pertes_elevees » de la maison
//     (alert_rules, lue par l'évaluateur d'alertes). Écriture : consultant et
//     patron, comme la policy alert_rules_write.
// Écriture des motifs et des valideurs : direction de la maison (RLS).
// ─────────────────────────────────────────────────────────────────────────────

const ROLES_ALERTES = ['consultant', 'patron'];

function useRegleAlertePertes(etabId) {
  const [etat, setEtat] = React.useState({ regle: null, status: 'loading' });
  const relire = React.useCallback(async () => {
    if (!etabId) return;
    const { data, error } = await supabase.from('alert_rules').select('*')
      .eq('etablissement_id', etabId).eq('rule_type', 'pertes_elevees')
      .order('created_at', { ascending: true }).limit(1);
    if (error) { console.error('[pertes] règle d\'alerte', error); setEtat({ regle: null, status: 'error' }); return; }
    setEtat({ regle: (data || [])[0] || null, status: 'ready' });
  }, [etabId]);
  React.useEffect(() => { relire(); }, [relire]);
  return { ...etat, relire };
}

export default function SectionReglagesPertes({ user, etablissement }) {
  const etabId = etablissement?.id || null;
  const { reglages, status, enregistrer } = useReglagesModule(etabId, 'pertes');
  const alerte = useRegleAlertePertes(etabId);
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

  // Sans réglage, les valideurs sont ceux qui ont le droit « Modifier » des
  // Pertes : on les montre choisis, pour partir de la règle d'aujourd'hui.
  const valideursAffiches = reglages.valideurs
    || ROLES_VALIDEURS.filter((r) => canManageModule(r.id, 'pertes')).map((r) => r.id);
  const peutAlerte = ROLES_ALERTES.includes(user?.role);
  const regle = alerte.regle;
  const seuil = Number(regle?.rule_config?.threshold_chf) || null;
  const periode = Number(regle?.rule_config?.period_days) || 7;

  const ecrireAlerte = async (config, actif) => {
    if (!peutAlerte || enCours) return;
    setEnCours(true);
    let error;
    if (regle) {
      ({ error } = await supabase.from('alert_rules').update({
        rule_config: { ...(regle.rule_config || {}), ...config },
        ...(actif == null ? {} : { is_active: actif }),
        updated_at: new Date().toISOString(),
      }).eq('id', regle.id));
    } else {
      ({ error } = await supabase.from('alert_rules').insert({
        etablissement_id: etabId,
        created_by: user?.id || null,
        name: 'Pertes élevées',
        severity: 'warning',
        rule_type: 'pertes_elevees',
        rule_config: { threshold_chf: 200, period_days: 7, ...config },
        schedule_type: 'daily',
        schedule_time: '08:00:00',
        target_roles: ['consultant', 'patron'],
        is_active: actif ?? true,
      }));
    }
    setEnCours(false);
    if (error) {
      console.error('[pertes] règle d\'alerte', error);
      notify("Le seuil n'a pas pu être enregistré. Réessayez.", 'error');
      return;
    }
    notify('Seuil enregistré.', 'success');
    alerte.relire();
  };

  return (
    <div style={ui.liste} data-section-reglages="pertes">
      <Ligne colonne titre="Motifs de perte" aide="Les motifs proposés à l'équipe quand elle déclare une perte. Une perte déjà déclarée garde son motif.">
        <ListeTextes
          label="Nouveau motif"
          valeurs={reglages.motifs}
          max={30}
          maxLen={60}
          placeholder="Erreur de cuisson"
          desactive={enCours}
          onChange={(motifs) => ecrire({ motifs })}
        />
        {reglages.motifsRegles && (
          <div style={ui.pied}>
            <Btn variant="ghost" disabled={enCours} style={ui.btn44} onClick={() => ecrire({ motifs: MOTIFS_PERTE_DEFAUT })}>Reprendre les motifs d'origine</Btn>
          </div>
        )}
      </Ligne>
      <Ligne colonne titre="Qui valide une perte" aide="Ces rôles voient le bouton « Valider » sur les pertes déclarées.">
        <ChoixMultiple
          label="Qui valide une perte"
          options={ROLES_VALIDEURS}
          valeurs={valideursAffiches}
          desactive={enCours}
          onChange={(valideurs) => {
            if (!valideurs.length) { notify('Choisissez au moins un rôle.', 'warning'); return; }
            ecrire({ valideurs });
          }}
        />
      </Ligne>
      <Ligne colonne derniere titre="Seuil d'alerte" aide="La direction est prévenue quand le total des pertes dépasse ce montant sur la période.">
        {alerte.status === 'loading' && <EtatModule status="loading" />}
        {alerte.status === 'error' && <EtatModule status="error" />}
        {alerte.status === 'ready' && (
          <div style={st.alerte}>
            <label style={st.champBloc}>
              <span style={st.champLabel}>Montant (CHF)</span>
              <ChampEntier label="Seuil d'alerte en CHF" valeur={seuil ?? 200} min={1} max={100000} desactive={!peutAlerte || enCours} largeur={120}
                onValider={(n) => ecrireAlerte({ threshold_chf: n })} />
            </label>
            <label style={st.champBloc}>
              <span style={st.champLabel}>Période (jours)</span>
              <ChampEntier label="Période d'analyse en jours" valeur={periode} min={1} max={90} desactive={!peutAlerte || enCours}
                onValider={(n) => ecrireAlerte({ period_days: n })} />
            </label>
            {regle && !regle.is_active && <p style={st.note}>Cette alerte est éteinte.</p>}
            {!regle && <p style={st.note}>Aucune alerte de pertes pour le moment. Le premier montant enregistré l'allume.</p>}
            {regle && peutAlerte && (
              <Btn variant="ghost" disabled={enCours} style={ui.btn44} onClick={() => ecrireAlerte({}, !regle.is_active)}>
                {regle.is_active ? "Éteindre l'alerte" : "Rallumer l'alerte"}
              </Btn>
            )}
            {!peutAlerte && <p style={st.note}>Le seuil se règle par le patron ou le consultant.</p>}
          </div>
        )}
      </Ligne>
    </div>
  );
}

const st = {
  alerte: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 16 },
  champBloc: { display: 'flex', flexDirection: 'column', gap: 6 },
  champLabel: { fontSize: 'var(--t1)', color: 'var(--text2)' },
  note: { margin: 0, flexBasis: '100%', fontSize: 'var(--t2)', color: 'var(--text2)' },
};
