import React from 'react';
import { QrCode } from 'lucide-react';
import { Btn } from '../../../components/ui/index.jsx';
import { Fenetre, st as stF } from '../../../components/ui/Fenetres.jsx';
import { notify } from '../../../components/toast/index.js';
import { accepterCommande, refuserCommande } from '../../../services/commandeQrService.js';
import { ageCommande, lieuCommande, MOTIFS_REFUS } from './bandeau.js';

// ─────────────────────────────────────────────────────────────────────────────
// Bandeau « Commande QR à valider » de la caisse (lot L3, 22.11.2026).
//
// Les commandes envoyées par les clients depuis /commande/<adresse> arrivent
// ici, en temps réel (useCommandesQr). Pour chacune : le prénom, la table ou
// « Au bar », l'âge, le détail et le total. Accepter ouvre ou reprend le
// ticket de la table (ou un ticket sans table pour le bar) et envoie le bon de
// ces seules lignes au KDS, par la RPC commande_qr_accepter. Refuser demande un
// motif (la pièce d'identité pour l'alcool, un produit épuisé...) ; une
// commande refusée ne compte nulle part. « Tout refuser » vide le bandeau d'un
// geste quand il déborde.
//
// Prénoms, tables et produits sont des données : data-no-translate. Chaque
// nombre vit dans son propre noeud (traduction du DOM).
// ─────────────────────────────────────────────────────────────────────────────

const chf = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);

export default function BandeauCommandesQr({ commandes, maintenant, onTraitee }) {
  const [occupe, setOccupe] = React.useState(null);
  const [refus, setRefus] = React.useState(null); // { ids: [], prenom }
  if (!commandes?.length) return null;

  async function accepter(c) {
    if (occupe) return;
    setOccupe(c.id);
    try {
      const { data, error } = await accepterCommande(c.id);
      if (error) { notify(error, 'error'); return; }
      if (data?.expiree) notify("Commande expirée : plus de 3 heures d'attente", 'warning');
      else if (data?.deja) notify('Cette commande a déjà été traitée', 'info');
      else notify('Commande acceptée, bon envoyé', 'success');
      await onTraitee?.();
    } finally {
      setOccupe(null);
    }
  }

  async function refuser(ids, motif) {
    setOccupe(ids[0]);
    try {
      let echecs = 0;
      for (const id of ids) {
        const { error } = await refuserCommande(id, motif);
        if (error) { echecs += 1; notify(error, 'error'); }
      }
      if (!echecs) notify(ids.length > 1 ? 'Commandes refusées' : 'Commande refusée', 'success');
      setRefus(null);
      await onTraitee?.();
    } finally {
      setOccupe(null);
    }
  }

  return (
    <section data-cadre="" data-commandes-qr="" style={s.carte} aria-labelledby="commandes-qr-titre">
      <div style={s.tete}>
        <span style={s.picto} aria-hidden="true"><QrCode size={20} /></span>
        <h2 id="commandes-qr-titre" style={s.titre}>Commande QR à valider</h2>
        <span style={s.compte}>{commandes.length}</span>
        {commandes.length > 1 && (
          <Btn
            onClick={() => setRefus({ ids: commandes.map((c) => c.id), prenom: null })}
            disabled={Boolean(occupe)}
            style={s.toutRefuser}
          >
            Tout refuser
          </Btn>
        )}
      </div>
      <div style={s.liste}>
        {commandes.map((c) => {
          const age = ageCommande(c.created_at, maintenant);
          const lieu = lieuCommande(c);
          return (
            <article key={c.id} className="commande-qr-ligne" style={s.ligne} data-commande-qr={c.id}>
              <div style={s.qui}>
                <span style={s.prenom} data-no-translate="">{c.prenom}</span>
                <span style={s.detail}>
                  {lieu.auBar ? <span>Au bar</span> : <><span>Table</span> <span data-no-translate="">{lieu.table}</span></>}
                  <span aria-hidden="true">, </span>
                  {age.unite === 'instant' ? <span>à l'instant</span> : (
                    <><span>il y a</span> <span style={s.num}>{age.valeur}</span> <span>{age.unite}</span></>
                  )}
                </span>
              </div>
              <ul style={s.articles}>
                {(c.lignes || []).map((l) => (
                  <li key={l.plat_id} style={s.article}>
                    <span style={s.num}>{l.quantite}</span>
                    <span aria-hidden="true"> × </span>
                    <span data-no-translate="">{l.libelle}</span>
                  </li>
                ))}
              </ul>
              <div style={s.pied}>
                <span style={s.total}><span style={s.num}>{chf(c.total)}</span> <span>CHF</span></span>
                <span style={s.actions}>
                  <Btn onClick={() => setRefus({ ids: [c.id], prenom: c.prenom })} disabled={Boolean(occupe)} style={s.btn}>Refuser</Btn>
                  <Btn variant="success" onClick={() => accepter(c)} disabled={Boolean(occupe)} style={s.btn}>
                    {occupe === c.id ? 'Envoi...' : 'Accepter'}
                  </Btn>
                </span>
              </div>
            </article>
          );
        })}
      </div>
      {refus && (
        <FenetreRefus
          nombre={refus.ids.length}
          prenom={refus.prenom}
          enCours={Boolean(occupe)}
          onFermer={() => setRefus(null)}
          onRefuser={(motif) => refuser(refus.ids, motif)}
        />
      )}
    </section>
  );
}

function FenetreRefus({ nombre, prenom, enCours, onFermer, onRefuser }) {
  const [choisi, setChoisi] = React.useState(null);
  const [autre, setAutre] = React.useState('');
  const motif = (choisi === 'autre' ? autre : choisi || '').trim();
  const valide = motif.length >= 3 && motif.length <= 200;
  return (
    <Fenetre
      id="commande-qr-refus"
      titre={nombre > 1 ? 'Refuser toutes les commandes' : 'Refuser la commande'}
      sousTitre={prenom ? <span data-no-translate="">{prenom}</span> : <><span style={s.num}>{nombre}</span> <span>commandes en attente</span></>}
      onClose={onFermer}
      pied={(
        <>
          <Btn onClick={onFermer} style={s.btn}>Annuler</Btn>
          <Btn variant="danger" onClick={() => onRefuser(motif)} disabled={!valide || enCours} style={s.btn}>
            {nombre > 1 ? 'Tout refuser' : 'Refuser'}
          </Btn>
        </>
      )}
    >
      <div style={stF.section}>
        <div style={stF.sectionTitre}>Motif</div>
        <div style={s.motifs} role="group" aria-label="Motif">
          {MOTIFS_REFUS.map((m) => (
            <Btn key={m} variant={choisi === m ? 'tabActive' : 'ghost'} onClick={() => setChoisi(m)} style={s.motif}>{m}</Btn>
          ))}
          <Btn variant={choisi === 'autre' ? 'tabActive' : 'ghost'} onClick={() => setChoisi('autre')} style={s.motif}>Autre motif</Btn>
        </div>
      </div>
      {choisi === 'autre' && (
        <label style={stF.section}>
          <span style={stF.sectionTitre}>Le motif, en quelques mots</span>
          <input
            value={autre}
            onChange={(e) => setAutre(e.target.value)}
            maxLength={200}
            style={s.champ}
            autoFocus
          />
        </label>
      )}
      <p style={s.aide}>Le client n'est pas prévenu par l'app : dites-le-lui à table ou au comptoir.</p>
    </Fenetre>
  );
}

const s = {
  carte: {
    background: 'var(--zone)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--sh)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)',
    padding: '16px 18px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0,
  },
  tete: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  picto: {
    width: 40, height: 40, borderRadius: 'var(--r-full)', background: 'var(--piste)', color: 'var(--text)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  titre: { margin: 0, fontSize: 'var(--t3)', fontWeight: 'var(--g3)', color: 'var(--text)', fontFamily: 'var(--font)' },
  compte: {
    minWidth: 28, height: 28, padding: '0 8px', borderRadius: 'var(--r-full)', background: 'var(--piste)', color: 'var(--text)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-num)', fontSize: 'var(--t2)',
  },
  toutRefuser: { marginLeft: 'auto', minHeight: 44 },
  liste: { display: 'flex', flexDirection: 'column' },
  ligne: {
    display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6, padding: '12px 0',
    borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--rule-soft)',
  },
  qui: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
  prenom: { fontSize: 'var(--t3)', fontWeight: 'var(--g2)', color: 'var(--text)', overflowWrap: 'anywhere' },
  detail: { fontSize: 'var(--t2)', color: 'var(--text2)' },
  articles: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: '4px 16px' },
  article: { fontSize: 'var(--t2)', color: 'var(--text)' },
  pied: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  total: { fontSize: 'var(--t3)', color: 'var(--text)' },
  actions: { display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' },
  btn: { minHeight: 44, flexShrink: 0 },
  num: { fontFamily: 'var(--font-num)', fontVariantNumeric: 'tabular-nums' },
  motifs: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  motif: { minHeight: 44 },
  champ: {
    width: '100%', minHeight: 44, padding: '0 12px', borderRadius: 'var(--r)', boxSizing: 'border-box',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', background: 'var(--surface)',
    color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 'var(--t2)',
  },
  aide: { margin: 0, fontSize: 'var(--t2)', color: 'var(--text2)' },
};
