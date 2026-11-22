import React from 'react';
import { notify } from '../../../components/toast/index.js';
import { Btn, Input } from '../../../components/ui/index.jsx';
import { getDemoData } from '../../../data/demoData.js';
import { ChoixPilules, Ligne, ui } from '../../compte/sections/reglagesUi.jsx';
import { equipeDuPlanning } from '../gardesPlanning.js';
import {
  borneDeCetAppareil, codesDeLEquipe, declarerBorne, listerBornes, oublierBorne, reinitialiserCode, retenirBorne, revenirALaBorne, revoquerBorne,
} from './borneService.js';

// ─────────────────────────────────────────────────────────────────────────────
// Réglages > Planning > Pointage : la borne (lot L6, 22.11.2026). Direction
// seule (consultant, patron), comme la RLS de bornes_pointage et les gardes
// des fonctions borne_declarer, borne_revoquer, pointage_codes_equipe et
// pointage_code_reinitialiser.
//   - pointer seulement à la borne (reglages_maison.pointage.borne_seulement) ;
//   - les bornes : déclarer cet appareil, ouvrir la borne, révoquer ;
//   - les codes personnels : qui en a un, réinitialiser.
// ─────────────────────────────────────────────────────────────────────────────

const jour = (iso) => (iso ? new Intl.DateTimeFormat('fr-CH', { timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso)) : '');
const jourHeure = (iso) => (iso ? new Intl.DateTimeFormat('fr-CH', { timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '');
const nomDe = (u) => [u?.prenom, u?.nom].filter(Boolean).join(' ') || u?.email || '';

function Repere({ libelle, valeur }) {
  if (!valeur) return null;
  return (
    <span style={st.repere}>
      <span>{libelle}</span>
      <span data-no-translate> {valeur}</span>
    </span>
  );
}

export default function ReglagesBornes({ etablissement, pointage, enregistrer }) {
  const etabId = etablissement?.id || null;
  const [bornes, setBornes] = React.useState(null);
  const [codes, setCodes] = React.useState(null);
  const [nom, setNom] = React.useState('');
  const [envoi, setEnvoi] = React.useState(false);
  const [aRevoquer, setARevoquer] = React.useState(null);
  const [aReinitialiser, setAReinitialiser] = React.useState(null);
  const [ici, setIci] = React.useState(() => borneDeCetAppareil());

  const charger = React.useCallback(async () => {
    if (!etabId) return;
    try {
      const [b, c] = await Promise.all([listerBornes(etabId), codesDeLEquipe(etabId)]);
      setBornes(b);
      setCodes(new Map(c.map((x) => [x.user_id, x.maj_le])));
    } catch (err) {
      console.error('[bornes] lecture', err);
      setBornes([]);
      setCodes(new Map());
    }
  }, [etabId]);

  React.useEffect(() => { charger(); }, [charger]);

  const actives = (bornes || []).filter((b) => !b.revoquee_le);
  const iciDansCetEtab = ici && ici.etablissementId === etabId && actives.some((b) => b.id === ici.id);
  const equipe = React.useMemo(() => equipeDuPlanning(getDemoData().utilisateurs, etabId).equipeEtab
    .slice().sort((a, b) => nomDe(a).localeCompare(nomDe(b))), [etabId]);

  const choisirBorneSeulement = (v) => {
    const oui = v === 'oui';
    if (oui && !actives.length) { notify("Déclarez d'abord une borne : sans elle, personne ne pourrait pointer.", 'warning'); return; }
    enregistrer({ ...pointage, borneSeulement: oui });
  };

  const declarer = async () => {
    const n = nom.trim();
    if (!n) { notify('Donnez un nom à la borne.', 'warning'); return; }
    setEnvoi(true);
    try {
      const b = await declarerBorne(etabId, n);
      retenirBorne({ ...b, etablissementNom: etablissement?.nom || '' });
      setIci(borneDeCetAppareil());
      setNom('');
      notify('Cet appareil est déclaré comme borne.', 'success');
      await charger();
    } catch (err) {
      notify(err?.message || 'La déclaration a échoué. Réessayez.', 'error');
    } finally {
      setEnvoi(false);
    }
  };

  const revoquer = async (b) => {
    try {
      await revoquerBorne(b.id);
      if (ici?.id === b.id) { oublierBorne(); setIci(null); }
      notify('Borne révoquée.', 'success');
      setARevoquer(null);
      await charger();
    } catch (err) {
      notify(err?.message || 'La révocation a échoué. Réessayez.', 'error');
    }
  };

  const reinitialiser = async (u) => {
    try {
      await reinitialiserCode(u.id, etabId);
      notify('Code réinitialisé. La personne en choisira un nouveau dans son compte.', 'success');
      setAReinitialiser(null);
      await charger();
    } catch (err) {
      notify(err?.message || 'La réinitialisation a échoué. Réessayez.', 'error');
    }
  };

  // La borne s'ouvre sans session : elle ferme celle de la direction à son
  // ouverture (Borne.jsx), quand l'app n'est plus montée.
  const ouvrirLaBorne = () => {
    revenirALaBorne();
    window.location.reload();
  };

  return (
    <>
      <Ligne colonne titre="Pointer seulement à la borne" aide="Le pointage depuis son compte est coupé : chacun pointe à la borne de l'établissement, avec son code personnel. On ne peut plus pointer à distance.">
        <ChoixPilules
          label="Pointer seulement à la borne"
          valeur={pointage.borneSeulement ? 'oui' : 'non'}
          options={[{ id: 'non', label: 'Non' }, { id: 'oui', label: 'Oui' }]}
          onChange={choisirBorneSeulement}
        />
      </Ligne>

      <Ligne colonne titre="Bornes de pointage" aide="Une tablette posée à l'entrée du personnel. Déclarez-la depuis la tablette elle-même : elle garde une clé secrète, la base n'en connaît que l'empreinte.">
        <div style={st.liste} data-bornes>
          {bornes === null ? <p style={st.vide}>Chargement…</p> : null}
          {bornes && !bornes.length ? <p style={st.vide}>Aucune borne déclarée.</p> : null}
          {(bornes || []).map((b) => (
            <div key={b.id} style={st.ligne}>
              <div style={st.texte}>
                <div style={st.nom}>
                  <span data-no-translate>{b.nom}</span>
                  {ici?.id === b.id && !b.revoquee_le ? <span style={st.etiquette}>Cet appareil</span> : null}
                </div>
                <div style={st.detail}>
                  {b.revoquee_le
                    ? <Repere libelle="Révoquée le" valeur={jour(b.revoquee_le)} />
                    : (
                      <>
                        <Repere libelle="Déclarée le" valeur={jour(b.creee_le)} />
                        <Repere libelle="Dernier pointage" valeur={jourHeure(b.dernier_usage_le)} />
                        {b.codesFaux24h ? (
                          <span style={st.alerte}>
                            <span>Codes faux sur 24 h :</span>
                            <span data-no-translate> {b.codesFaux24h}</span>
                          </span>
                        ) : null}
                      </>
                    )}
                </div>
              </div>
              {!b.revoquee_le ? (
                aRevoquer === b.id ? (
                  <div style={st.actions}>
                    <Btn variant="danger" onClick={() => revoquer(b)}>Confirmer la révocation</Btn>
                    <Btn onClick={() => setARevoquer(null)}>Annuler</Btn>
                  </div>
                ) : <Btn onClick={() => setARevoquer(b.id)}>Révoquer</Btn>
              ) : null}
            </div>
          ))}
        </div>
        {iciDansCetEtab ? (
          <div style={st.pied}>
            <p style={st.note}>Cet appareil est une borne. En ouvrant la borne, votre session se ferme sur cet appareil.</p>
            <Btn variant="primary" onClick={ouvrirLaBorne}>Ouvrir la borne</Btn>
          </div>
        ) : (
          <div style={st.pied}>
            <Input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom de la borne, par exemple Entrée du personnel" maxLength={60} aria-label="Nom de la borne" style={st.champ} />
            <Btn variant="primary" onClick={declarer} disabled={envoi}>Déclarer cet appareil comme borne</Btn>
          </div>
        )}
      </Ligne>

      <Ligne colonne derniere titre="Codes personnels" aide="Chacun choisit son code à 4 chiffres dans Réglages, Mon compte. Réinitialiser un code oblige la personne à en choisir un nouveau.">
        <div style={st.liste} data-codes>
          {codes === null ? <p style={st.vide}>Chargement…</p> : null}
          {codes && !equipe.length ? <p style={st.vide}>Personne dans l'équipe de cet établissement.</p> : null}
          {codes ? equipe.map((u) => {
            const maj = codes.get(u.id);
            return (
              <div key={u.id} style={st.ligne}>
                <div style={st.texte}>
                  <div style={st.nom}><span data-no-translate>{nomDe(u)}</span></div>
                  <div style={st.detail}>{maj ? <Repere libelle="Code choisi le" valeur={jour(maj)} /> : <span>Pas encore de code</span>}</div>
                </div>
                {maj ? (
                  aReinitialiser === u.id ? (
                    <div style={st.actions}>
                      <Btn variant="danger" onClick={() => reinitialiser(u)}>Confirmer</Btn>
                      <Btn onClick={() => setAReinitialiser(null)}>Annuler</Btn>
                    </div>
                  ) : <Btn onClick={() => setAReinitialiser(u.id)}>Réinitialiser</Btn>
                ) : null}
              </div>
            );
          }) : null}
        </div>
      </Ligne>
    </>
  );
}

const st = {
  liste: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  ligne: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', minHeight: 'var(--ligne)', padding: '8px 0', borderBottom: '1px solid var(--rule-soft)', minWidth: 0 },
  texte: { flex: '1 1 200px', minWidth: 0 },
  nom: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--text)', overflowWrap: 'anywhere' },
  detail: { display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 'var(--t1)', color: 'var(--text2)', marginTop: 2 },
  repere: { whiteSpace: 'nowrap' },
  etiquette: { fontSize: 'var(--t1)', fontWeight: 'var(--g2)', padding: '2px 10px', borderRadius: 'var(--r-full)', background: 'var(--piste)', color: 'var(--text)' },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  pied: { ...ui.pied, alignItems: 'center' },
  champ: { flex: '1 1 260px', minWidth: 0 },
  note: { margin: 0, flex: '1 1 260px', fontSize: 'var(--t2)', color: 'var(--text2)', lineHeight: 1.45 },
  vide: { margin: '4px 0', fontSize: 'var(--t2)', color: 'var(--text2)' },
  alerte: { whiteSpace: 'nowrap', color: 'var(--danger-text)', fontWeight: 'var(--g2)' },
};
