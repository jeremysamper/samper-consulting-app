import React from 'react';
import { supabase } from '../../services/supabase.js';
import { dbService } from '../../services/dbService.js';
import { notify } from '../../components/toast/index.js';
import { Panneau } from '../../components/ui/index.jsx';
import { Fenetre, st as fs } from '../../components/ui/Fenetres.jsx';
import { useReglagesModule } from '../../hooks/useReglagesModule.js';
import { zurichToday } from '../../utils/zurichTime.js';
import { messageErreur } from '../../utils/messageErreur.js';

// ─────────────────────────────────────────────────────────────────────────────
// Pertes en deux touches (plan 15, lot 4) : un toucher sur le produit (la
// déclaration se pré-remplit), un toucher pour valider. Deux entrées :
//   - les produits fréquents de la maison (RPC pertes_frequentes : les plus
//     déclarés sur 60 jours, avec la dernière quantité, unité et motif) ;
//   - « Jeté » sur une ligne de la Mise en place (une perte reliée à la
//     ligne, source « mep », une seule par ligne : la base refuse la seconde).
// Les motifs sont ceux du réglage Pertes de la maison.
// ─────────────────────────────────────────────────────────────────────────────

const nombre = (v) => String(v ?? '').replace('.', ',');

// Fenêtre de confirmation : quantité et motif modifiables, « Déclarer ».
export function FenetreDeclaration({ etablissement, user, depart, onClose, onDeclaree }) {
  const etabId = etablissement?.id || null;
  const { reglages } = useReglagesModule(etabId, 'pertes');
  const motifs = reglages?.motifs || [];
  const [quantite, setQuantite] = React.useState(() => nombre(depart.quantite ?? ''));
  const [motif, setMotif] = React.useState(() => (motifs.includes(depart.motif) ? depart.motif : (depart.motif || motifs[0] || 'Autre')));
  const [enCours, setEnCours] = React.useState(false);
  const declarer = async () => {
    const q = Number(String(quantite).replace(',', '.'));
    if (!(q > 0)) { notify('Indiquez une quantité.', 'warning'); return; }
    const db = dbService.getDb();
    setEnCours(true);
    try {
      await db.upsertPerte({
        etablissementId: etabId,
        date: zurichToday(),
        produit: depart.produit,
        categorie: depart.categorie || null,
        quantite: q,
        unite: depart.unite || 'pcs',
        valeurUnit: Number(depart.valeurUnit) || 0,
        motif,
        declarePar: user?.id || null,
        valide: false,
        commentaire: depart.commentaire || null,
        produitId: depart.produitId ?? null,
        recetteId: depart.recetteId ?? null,
        mepItemId: depart.mepItemId ?? null,
        source: depart.source,
      });
      notify('Perte déclarée.', 'success');
      onDeclaree?.();
      onClose();
    } catch (err) {
      console.error('[pertes] déclaration rapide', err);
      notify(String(err?.code) === '23505' ? 'Cette préparation est déjà déclarée jetée.' : messageErreur(err, 'pertes'), 'error');
    } finally {
      setEnCours(false);
    }
  };
  return (
    <Fenetre
      id="pertes-declaration-rapide"
      titre="Je jette"
      sousTitre={<span data-no-translate="">{depart.produit}</span>}
      onClose={onClose}
      pied={(
        <>
          <button type="button" style={fs.secondaire} onClick={onClose}>Annuler</button>
          <button type="button" style={{ ...fs.primaire, opacity: enCours ? 0.6 : 1 }} disabled={enCours} onClick={declarer}>Déclarer la perte</button>
        </>
      )}
    >
      <label style={fs.section}>
        <span style={fs.label}>Quantité{depart.unite ? <>, en <span data-no-translate="">{depart.unite}</span></> : null}</span>
        <input type="text" inputMode="decimal" style={fs.champ} value={quantite} onChange={(e) => setQuantite(e.target.value)} data-no-translate="" />
      </label>
      <div style={fs.section}>
        <span style={fs.label} id="pertes-rapide-motif">Motif</span>
        <div role="radiogroup" aria-labelledby="pertes-rapide-motif" style={st.motifs}>
          {[...new Set([...motifs, motif])].map((m) => (
            <button key={m} type="button" role="radio" aria-checked={m === motif} style={{ ...st.motif, ...(m === motif ? st.motifChoisi : null) }} onClick={() => setMotif(m)}>{m}</button>
          ))}
        </div>
      </div>
    </Fenetre>
  );
}

// Carte « Produits fréquents » du module Pertes.
export function PertesFrequentes({ etablissement, user, onDeclaree }) {
  const etabId = etablissement?.id || null;
  const [etat, setEtat] = React.useState({ status: 'loading', lignes: [] });
  const [choisi, setChoisi] = React.useState(null);
  const relire = React.useCallback(async () => {
    if (!etabId) return;
    const { data, error } = await supabase.rpc('pertes_frequentes', { p_etablissement_id: etabId, p_jours: 60, p_limite: 8 });
    if (error) { console.error('[pertes] fréquents', error); setEtat((e) => ({ ...e, status: 'error' })); return; }
    setEtat({ status: 'ready', lignes: Array.isArray(data) ? data : [] });
  }, [etabId]);
  React.useEffect(() => {
    relire();
    const realtime = dbService.getRealtime();
    const unsub = realtime?.subscribeReload ? realtime.subscribeReload(['pertes'], relire) : null;
    return () => { if (unsub) unsub(); };
  }, [relire]);

  // Sans donnée (aucune perte reliée au catalogue) ou en échec : la carte
  // n'est pas rendue, le formulaire « Je jette » reste l'entrée.
  if (etat.status !== 'ready' || etat.lignes.length === 0) return null;
  return (
    <Panneau style={st.carte} data-pertes-frequentes="">
      <div style={st.titre}>Produits fréquents</div>
      <div style={st.grille}>
        {etat.lignes.map((l) => (
          <button key={l.cle || l.produit_id || l.produit} type="button" style={st.tuile} onClick={() => setChoisi(l)} data-perte-frequente="">
            <span style={st.nom} data-no-translate="">{l.produit}</span>
            <span style={st.detail}>
              <span data-no-translate="">{nombre(l.quantite)} {l.unite}</span>{l.motif ? <>, <span>{l.motif}</span></> : null}
            </span>
          </button>
        ))}
      </div>
      {choisi && (
        <FenetreDeclaration
          etablissement={etablissement}
          user={user}
          depart={{
            produit: choisi.produit, categorie: choisi.categorie, quantite: choisi.quantite, unite: choisi.unite,
            valeurUnit: choisi.valeur_unit, motif: choisi.motif, produitId: choisi.produit_id, recetteId: choisi.recette_id, source: 'frequent',
          }}
          onClose={() => setChoisi(null)}
          onDeclaree={() => { relire(); onDeclaree?.(); }}
        />
      )}
    </Panneau>
  );
}

const st = {
  carte: { padding: 16, display: 'flex', flexDirection: 'column', gap: 10 },
  titre: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)' },
  grille: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 160px), 1fr))', gap: 8 },
  tuile: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, minHeight: 56, padding: '8px 12px', textAlign: 'left',
    background: 'var(--piste)', borderWidth: 0, borderStyle: 'none', borderRadius: 'var(--r)', cursor: 'pointer', fontFamily: 'var(--font)', color: 'var(--text)',
  },
  nom: { fontSize: 'var(--t2)', fontWeight: 'var(--g2)', overflowWrap: 'anywhere' },
  detail: { fontSize: 'var(--t1)', color: 'var(--text2)' },
  motifs: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  motif: { minHeight: 44, padding: '0 14px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)', background: 'var(--btn-fond)', color: 'var(--btn-texte)', borderRadius: 'var(--r-full)', fontSize: 'var(--t2)', fontWeight: 'var(--g2)', fontFamily: 'var(--font)', cursor: 'pointer' },
  motifChoisi: { background: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'var(--accent)' },
};
