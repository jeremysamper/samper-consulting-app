import React from 'react';
import { Btn, Panneau, ligneStyle } from '../../components/ui/index.jsx';
import { useOnlineStatus } from '../../hooks/useOnlineStatus.js';
import { zurichDateHeure } from '../../utils/zurichTime.js';
import { messageRefus } from '../../services/caisseService.js';
import { ecarterEncaissement, syncPendingEncaissements } from '../../services/offline/caisseSync.js';

// ─────────────────────────────────────────────────────────────────────────────
// Ventes en attente d'envoi (lot 07 du panel, 25.11.2026) : les ventes en
// espèces gardées sur CET appareil pendant une coupure du réseau, pour
// l'établissement ouvert. La carte se nourrit de la file IndexedDB, pas de la
// base : elle s'affiche même si la lecture des tickets échoue.
//
// Trois états : en attente du réseau, refusée (avec le motif de la base, dit
// en clair), déjà encaissée (le ticket avait déjà son numéro au rejeu). Une
// vente refusée ou déjà encaissée ne part jamais seule : un responsable
// l'écarte, après avoir repris le ticket. « Écarter » retire l'élément de
// l'appareil et rien d'autre ; un serveur voit la vente, il ne l'écarte pas.
//
// Chaque nombre vit dans son propre nœud ; les libellés des produits et des
// tables sont des données (data-no-translate).
// ─────────────────────────────────────────────────────────────────────────────

const chf = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);

const CONFIRMATIONS = {
  attente: "Cette vente n'a pas reçu de numéro. Si vous l'écartez, le ticket redevient ouvert et l'argent reçu reste à encaisser.",
  refuse: "Reprenez d'abord le ticket et encaissez-le. Écarter cette vente de l'appareil ?",
  deja_encaisse: "Vérifiez d'abord que ce ticket n'a été payé qu'une fois. Écarter cette vente de l'appareil ?",
};

export default function VentesEnAttente({ file, peutEcarter = false, nomTable = null }) {
  const enLigne = useOnlineStatus();
  const [enCours, setEnCours] = React.useState(false);
  if (!file?.length) return null;
  const attentes = file.filter((e) => e.etat === 'attente').length;

  async function envoyer() {
    if (enCours) return;
    setEnCours(true);
    try { await syncPendingEncaissements(); } finally { setEnCours(false); }
  }
  async function ecarter(e) {
    if (!peutEcarter || !window.confirm(CONFIRMATIONS[e.etat] || CONFIRMATIONS.refuse)) return;
    await ecarterEncaissement(e.clientUuid);
  }

  return (
    <Panneau style={st.carte}>
      <div style={st.enTete}>
        <span style={st.titre}>Ventes en attente d'envoi</span>
        <Btn variant="ghost" disabled={enCours || !enLigne || attentes === 0} onClick={envoyer} style={st.btn44}>Envoyer maintenant</Btn>
      </div>
      <div data-caisse-ventes-attente="">
        {file.map((e, i) => {
          const table = e.apercu?.tableId ? nomTable?.(e.apercu.tableId) : null;
          return (
            <div key={e.clientUuid} style={{ ...st.ligne, ...(i === file.length - 1 ? st.derniere : null) }} data-caisse-vente-etat={e.etat}>
              <span style={st.infos}>
                <span style={st.nom}>
                  {table
                    ? <><span>Table</span> <span data-no-translate>{table}</span></>
                    : (e.apercu?.tableId ? <span>Table</span> : <span>{e.apercu?.titre || 'Vente directe'}</span>)}
                </span>
                {e.etat === 'attente' && <span style={st.etat}>En attente du réseau</span>}
                {e.etat === 'refuse' && (
                  <span style={{ ...st.etat, ...st.etatRefus }}>
                    <span style={st.point} aria-hidden="true" />
                    <span><span>Refusée :</span> <span>{messageRefus(e.motif)}</span></span>
                  </span>
                )}
                {e.etat === 'deja_encaisse' && (
                  <span style={{ ...st.etat, ...st.etatRefus }}>
                    <span style={st.point} aria-hidden="true" />
                    <span>
                      <span>Déjà encaissée, ticket n°</span> <span style={st.num} data-no-translate>{e.numero || ''}</span><span>.</span>{' '}
                      <span>Vérifiez qu'elle n'a été payée qu'une fois.</span>
                    </span>
                  </span>
                )}
              </span>
              <span style={st.heure}>{zurichDateHeure(e.gesteAt).heure}</span>
              <span style={st.total}><span>{chf(e.apercu?.total)}</span> <span>CHF</span></span>
              {peutEcarter && (
                <Btn variant="ghost" onClick={() => ecarter(e)} style={st.btn44}>Écarter</Btn>
              )}
            </div>
          );
        })}
      </div>
    </Panneau>
  );
}

const st = {
  carte: { marginTop: 12, marginBottom: 12, maxWidth: 640, minWidth: 0, boxSizing: 'border-box', padding: '12px 18px 4px' },
  enTete: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 4 },
  titre: { fontSize: 'var(--t3)', fontWeight: 'var(--g3)', color: 'var(--text)' },
  ligne: { ...ligneStyle(), display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '8px 0', minWidth: 0, color: 'var(--text)', fontSize: 'var(--t2)' },
  derniere: { borderBottomWidth: 0 },
  infos: { display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 200px', minWidth: 0 },
  nom: { fontWeight: 'var(--g3)', overflowWrap: 'anywhere' },
  etat: { fontSize: 'var(--t1)', color: 'var(--text2)', lineHeight: 1.35 },
  etatRefus: { display: 'inline-flex', alignItems: 'baseline', gap: 6, color: 'var(--danger-text)' },
  point: { width: 8, height: 8, borderRadius: '50%', background: 'var(--danger-text)', flexShrink: 0, alignSelf: 'center' },
  heure: { color: 'var(--text2)', fontSize: 'var(--t1)', fontFamily: 'var(--font-num)' },
  total: { fontFamily: 'var(--font-num)', fontWeight: 'var(--g-chiffre)', whiteSpace: 'nowrap' },
  num: { fontFamily: 'var(--font-num)' },
  btn44: { minHeight: 44, flexShrink: 0 },
};
