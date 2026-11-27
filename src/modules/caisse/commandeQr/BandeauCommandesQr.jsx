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
// Replié par défaut (lot 1, chiffres justes) : une ligne qui dit le nombre de
// commandes et l'âge de la plus ancienne, et « Voir » qui déplie la liste. Le
// plan de salle reste en haut de l'écran pendant le service.
//
// Prénoms, tables et produits sont des données : data-no-translate. Chaque
// nombre vit dans son propre noeud (traduction du DOM).
// ─────────────────────────────────────────────────────────────────────────────

const chf = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);

export default function BandeauCommandesQr({ commandes, maintenant, onTraitee }) {
  const [ouvert, setOuvert] = React.useState(false);
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

  // Flottant en bas à droite (27.11.2026) : replié, une pilule (le nombre et
  // l'âge de la plus ancienne, « Voir ») ; déplié, un panneau au même endroit
  // qui défile. Le plan garde toute la largeur et le haut de l'écran. Pas de
  // portail : le module caché (autre page) cache aussi le bandeau.
  return (
    <section data-cadre="" data-commandes-qr="" className="mvt-naissance no-print" style={ouvert ? s.panneau : s.pilule} aria-labelledby="commandes-qr-titre">
      <div style={s.tete}>
        <span style={s.picto} aria-hidden="true"><QrCode size={18} /></span>
        <span style={s.textes}>
          <h2 id="commandes-qr-titre" style={s.titre}>Commande QR à valider</h2>
          {!ouvert && <AgePlusAncienne commandes={commandes} maintenant={maintenant} />}
        </span>
        <span style={s.compte}>{commandes.length}</span>
        <button
          type="button"
          onClick={() => setOuvert((o) => !o)}
          aria-expanded={ouvert}
          aria-controls="commandes-qr-liste"
          style={s.bascule}
        >
          {ouvert ? 'Replier' : 'Voir'}
        </button>
      </div>
      {ouvert && (
      <div style={s.liste} id="commandes-qr-liste">
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
        {commandes.length > 1 && (
          <div style={s.piedPanneau}>
            <Btn
              onClick={() => setRefus({ ids: commandes.map((c) => c.id), prenom: null })}
              disabled={Boolean(occupe)}
              style={s.toutRefuser}
            >
              Tout refuser
            </Btn>
          </div>
        )}
      </div>
      )}
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

// Âge de la commande la plus ancienne, sur la ligne repliée.
function AgePlusAncienne({ commandes, maintenant }) {
  const plusAncienne = [...commandes].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];
  const age = ageCommande(plusAncienne?.created_at, maintenant);
  return (
    <span style={s.age}>
      <span>la plus ancienne</span>{' '}
      {age.unite === 'instant' ? <span>à l'instant</span> : (
        <><span>il y a</span> <span style={s.num}>{age.valeur}</span> <span>{age.unite}</span></>
      )}
    </span>
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

// Ce qui flotte prend l'ombre --sh-lg (direction Galet). En bas à droite, au
// pied de l'encoche du téléphone ; sous les fenêtres (1000) et la barre de la
// démo (900).
const flottant = {
  position: 'fixed', zIndex: 60,
  right: 'calc(env(safe-area-inset-right, 0px) + 16px)',
  // --demo-bas : hauteur du bandeau de la démo au téléphone (0 dans l'app).
  bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px + var(--demo-bas, 0px))',
  boxSizing: 'border-box', maxWidth: 'calc(100vw - 32px)',
  display: 'flex', flexDirection: 'column', gap: 8,
  background: 'var(--zone)', boxShadow: 'var(--sh-lg)',
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)',
};

const s = {
  // Replié : une carte d'une rangée (le titre et l'âge en deux lignes, donc
  // le rayon d'une carte flottante, pas celui d'une pilule).
  pilule: { ...flottant, padding: '6px 6px 6px 8px', borderRadius: 'var(--r-xl)' },
  // Déplié : un panneau qui défile, à la place de la pilule.
  panneau: {
    ...flottant, width: 420, padding: '12px 16px', borderRadius: 'var(--r-lg)',
    maxHeight: 'calc(100dvh - 140px)', overflowY: 'auto', overscrollBehavior: 'contain',
  },
  tete: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 },
  picto: {
    width: 36, height: 36, borderRadius: 'var(--r-full)', background: 'var(--piste)', color: 'var(--text)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  textes: { display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flex: '1 1 auto' },
  titre: {
    margin: 0, fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)', fontFamily: 'var(--font)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  age: { fontSize: 'var(--t1)', color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  piedPanneau: { display: 'flex', justifyContent: 'flex-end', paddingTop: 12, borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--rule-soft)' },
  compte: {
    minWidth: 28, height: 28, padding: '0 8px', borderRadius: 'var(--r-full)', background: 'var(--piste)', color: 'var(--text)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-num)', fontSize: 'var(--t2)',
  },
  toutRefuser: { minHeight: 44 },
  bascule: {
    flexShrink: 0, minHeight: 44, padding: '0 18px', borderRadius: 'var(--r-full)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)',
    background: 'var(--btn-fond)', color: 'var(--btn-texte)', fontFamily: 'var(--font)', fontSize: 'var(--t2)', fontWeight: 'var(--g2)', cursor: 'pointer',
  },
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
