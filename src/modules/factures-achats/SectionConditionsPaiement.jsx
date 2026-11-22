import React from 'react';
import { notify } from '../../components/toast/index.js';
import { supabase } from '../../services/supabase.js';
import { dbService } from '../../services/dbService.js';
import { estDirectionModules } from '../../utils/reglagesModules.js';
import { Ligne, ui } from '../compte/sections/reglagesUi.jsx';
import { ChampEntier, EtatModule, st as stm } from '../compte/sections/reglagesModulesUi.jsx';
import { DELAI_PAIEMENT_DEFAUT } from './delaisPaiement.js';

// ─────────────────────────────────────────────────────────────────────────────
// Section « Conditions de paiement » (Factures & achats, plan 15, lot 2) :
//   - délai de paiement par défaut de la maison (compta_reglages.
//     delai_paiement_jours, 30 jours) : écriture par qui règle les factures,
//     comme la garde et la RLS de compta_reglages ;
//   - délai propre à un fournisseur (fournisseurs.delai_paiement_jours, vide =
//     celui de la maison) : écriture par la direction de la maison
//     (déclencheur des colonnes de réglage de fournisseurs).
// L'échéance d'une facture qui n'en porte pas se calcule à la lecture
// (delaisPaiement.js) : l'Échéancier la montre « prévue ».
// ─────────────────────────────────────────────────────────────────────────────

export default function SectionConditionsPaiement({ user, etablissement, signaler }) {
  const etabId = etablissement?.id || null;
  const [etat, setEtat] = React.useState({ delai: null, fournisseurs: [], status: 'loading' });
  const [enCours, setEnCours] = React.useState(false);
  const direction = estDirectionModules(user?.role);

  const relire = React.useCallback(async () => {
    if (!etabId) return;
    const [r, f] = await Promise.all([
      supabase.from('compta_reglages').select('delai_paiement_jours').eq('etablissement_id', etabId).maybeSingle(),
      supabase.from('fournisseurs').select('id, nom, actif, delai_paiement_jours').eq('etablissement_id', etabId).order('nom'),
    ]);
    if (r.error || f.error) {
      console.error('[conditions de paiement]', r.error || f.error);
      setEtat((e) => ({ ...e, status: 'error' }));
      return;
    }
    setEtat({
      delai: Number.isInteger(r.data?.delai_paiement_jours) ? r.data.delai_paiement_jours : DELAI_PAIEMENT_DEFAUT,
      fournisseurs: (f.data || []).filter((x) => x.actif !== false),
      status: 'ready',
    });
  }, [etabId]);
  React.useEffect(() => {
    relire();
    const realtime = dbService.getRealtime();
    const unsub = realtime?.subscribeReload ? realtime.subscribeReload(['compta_reglages', 'fournisseurs'], relire) : null;
    return () => { if (unsub) unsub(); };
  }, [relire]);

  if (!etabId) return null;
  if (etat.status !== 'ready') return <EtatModule status={etat.status} />;

  const ecrireDelaiMaison = async (n) => {
    if (enCours) return;
    setEnCours(true);
    const colonnes = { delai_paiement_jours: n, updated_by: user?.id || null };
    const maj = () => supabase.from('compta_reglages').update(colonnes).eq('etablissement_id', etabId).select('etablissement_id');
    let { data, error } = await maj();
    if (!error && (!data || !data.length)) {
      const ins = await supabase.from('compta_reglages').insert({ etablissement_id: etabId, ...colonnes });
      if (ins.error && String(ins.error.code) === '23505') ({ error } = await maj());
      else error = ins.error;
    }
    setEnCours(false);
    if (error) { console.error('[conditions de paiement] maison', error); notify("Le délai n'a pas pu être enregistré. Réessayez.", 'error'); return; }
    notify('Délai enregistré.', 'success');
    signaler?.();
    relire();
  };

  const ecrireDelaiFournisseur = async (id, n) => {
    if (enCours) return;
    setEnCours(true);
    const { error } = await supabase.from('fournisseurs').update({ delai_paiement_jours: n }).eq('id', id);
    setEnCours(false);
    if (error) {
      console.error('[conditions de paiement] fournisseur', error);
      notify(String(error.code) === '42501' ? 'Le délai d\'un fournisseur se règle par la direction de la maison.' : "Le délai n'a pas pu être enregistré. Réessayez.", 'error');
      return;
    }
    relire();
  };

  return (
    <div style={ui.liste} data-section-reglages="achats_paiement">
      <Ligne titre="Délai de paiement par défaut" aide="Une facture sans échéance est due ce nombre de jours après sa date.">
        <ChampEntier label="Délai de paiement par défaut en jours" valeur={etat.delai} min={0} max={180} unite="jours" desactive={enCours}
          onValider={ecrireDelaiMaison} />
      </Ligne>
      <Ligne colonne derniere titre="Délai par fournisseur" aide="Laissez vide pour reprendre le délai de la maison.">
        {etat.fournisseurs.length === 0 && <p style={stm.vide}>Aucun fournisseur pour le moment.</p>}
        <div style={stm.liste}>
          {etat.fournisseurs.map((f) => (
            <div key={f.id} style={stm.ligne} data-fournisseur-delai="">
              <span style={stm.texte} data-no-translate="">{f.nom}</span>
              <DelaiFournisseur
                valeur={f.delai_paiement_jours}
                desactive={enCours || !direction}
                onValider={(n) => ecrireDelaiFournisseur(f.id, n)}
                placeholder={String(etat.delai)}
              />
            </div>
          ))}
        </div>
        {!direction && <p style={stm.note}>Le délai d'un fournisseur se règle par la direction de la maison.</p>}
      </Ligne>
    </div>
  );
}

// Champ vide = null (délai de la maison) ; sinon un entier de 0 à 180.
function DelaiFournisseur({ valeur, desactive, onValider, placeholder }) {
  const [texte, setTexte] = React.useState(valeur == null ? '' : String(valeur));
  React.useEffect(() => { setTexte(valeur == null ? '' : String(valeur)); }, [valeur]);
  const valider = () => {
    const t = texte.trim();
    if (!t) { if (valeur != null) onValider(null); return; }
    const n = Number(t);
    if (!Number.isInteger(n) || n < 0 || n > 180) { notify('Un nombre de jours entre 0 et 180.', 'warning'); setTexte(valeur == null ? '' : String(valeur)); return; }
    if (n !== valeur) onValider(n);
  };
  return (
    <span style={stm.nombre}>
      <input
        type="text" inputMode="numeric" value={texte} placeholder={placeholder} disabled={desactive} aria-label="Délai de paiement en jours"
        onChange={(e) => setTexte(e.target.value)} onBlur={valider}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        style={{ ...stm.champ, width: 90, flex: '0 0 auto', textAlign: 'right', fontFamily: 'var(--font-num)' }}
      />
      <span style={stm.unite}>jours</span>
    </span>
  );
}
