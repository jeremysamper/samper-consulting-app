import React from 'react';
import { Fenetre, st as fs } from '../../components/ui/Fenetres.jsx';
import { notify } from '../../components/toast/index.js';
import { enregistrerCharge } from './comptaService.js';
import { CATEGORIES_CHARGES, PERIODICITES, TAUX_CHARGES, TVA_PAR_CATEGORIE, libelleCategorie } from './chargesFixes.js';
import { lireMontant, tauxTexte } from './comptaUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Fenêtre « Nouvelle charge » / « Modifier la charge ». La catégorie préremplit
// le libellé et le taux de TVA (loyer et assurances sans TVA, le reste à
// 8,1 %) tant qu'on ne les a pas changés à la main. Montant TVA comprise, à
// chaque échéance.
// ─────────────────────────────────────────────────────────────────────────────

const vide = (aujourdhui) => ({
  categorie: 'loyer', libelle: 'Loyer', montant: '', periodicite: 'mensuelle', tvaTaux: 0,
  jourEcheance: '', debut: `${aujourdhui.slice(0, 7)}-01`, fin: '', fournisseur: '', note: '',
});

function Puces({ nom, valeur, options, onChange }) {
  return (
    <div role="radiogroup" aria-label={nom} style={st.puces}>
      {options.map(o => {
        const actif = valeur === o.v;
        return (
          <button
            key={String(o.v)}
            type="button"
            role="radio"
            aria-checked={actif}
            data-cadre=""
            onClick={() => onChange(o.v)}
            style={{ ...st.puce, ...(actif ? st.puceActive : null) }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Champ({ id, label, aide, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <label htmlFor={id} style={fs.label}>{label}</label>
      {children}
      {aide && <span style={fs.remarque}>{aide}</span>}
    </div>
  );
}

export default function FenetreCharge({ etabId, charge, aujourdhui, onClose, onEnregistre }) {
  const [f, setF] = React.useState(() => (charge
    ? { ...charge, montant: String(charge.montant), jourEcheance: charge.jourEcheance ? String(charge.jourEcheance) : '', fin: charge.fin || '', tvaTaux: charge.tvaTaux ?? 0 }
    : vide(aujourdhui)));
  const [enCours, setEnCours] = React.useState(false);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));

  const choisirCategorie = (id) => setF((x) => {
    const libelleAuto = !x.libelle.trim() || x.libelle === libelleCategorie(x.categorie);
    const tvaAuto = x.tvaTaux === TVA_PAR_CATEGORIE[x.categorie];
    return {
      ...x,
      categorie: id,
      libelle: libelleAuto ? libelleCategorie(id) : x.libelle,
      tvaTaux: tvaAuto ? TVA_PAR_CATEGORIE[id] : x.tvaTaux,
    };
  });

  const montant = lireMontant(f.montant);
  const jour = f.jourEcheance === '' ? null : Number(f.jourEcheance);
  const valide = f.libelle.trim().length >= 1 && f.libelle.trim().length <= 120
    && Number.isFinite(montant) && montant > 0
    && /^\d{4}-\d{2}-\d{2}$/.test(f.debut || '')
    && (!f.fin || f.fin >= f.debut)
    && (jour === null || (Number.isInteger(jour) && jour >= 1 && jour <= 31));

  async function enregistrer() {
    if (!valide || enCours) return;
    setEnCours(true);
    try {
      const { error } = await enregistrerCharge(etabId, { ...f, montant, jourEcheance: jour, fin: f.fin || null });
      if (error) { notify(error, 'error'); return; }
      notify(charge ? 'Charge modifiée.' : 'Charge ajoutée.', 'success');
      onEnregistre?.();
      onClose();
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Fenetre
      id="compta-charge"
      titre={charge ? 'Modifier la charge' : 'Nouvelle charge'}
      onClose={onClose}
      largeur={520}
      pied={(
        <>
          <button type="button" style={fs.secondaire} onClick={onClose} disabled={enCours}>Annuler</button>
          <button type="button" style={{ ...fs.primaire, opacity: valide && !enCours ? 1 : 0.5 }} onClick={enregistrer} disabled={!valide || enCours}>
            {enCours ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </>
      )}
    >
      <Champ id="compta-charge-categorie" label="Catégorie">
        <Puces nom="Catégorie" valeur={f.categorie} onChange={choisirCategorie} options={CATEGORIES_CHARGES.map(c => ({ v: c.id, label: c.label }))} />
      </Champ>
      <Champ id="compta-charge-libelle" label="Libellé">
        <input id="compta-charge-libelle" style={fs.champ} value={f.libelle} maxLength={120} onChange={e => set('libelle', e.target.value)} />
      </Champ>
      <Champ id="compta-charge-montant" label="Montant à chaque échéance, TVA comprise (CHF)">
        <input id="compta-charge-montant" style={{ ...fs.champ, fontFamily: 'var(--font-num)' }} inputMode="decimal" autoComplete="off" value={f.montant} onChange={e => set('montant', e.target.value)} />
      </Champ>
      <Champ id="compta-charge-periodicite" label="Périodicité">
        <Puces nom="Périodicité" valeur={f.periodicite} onChange={v => set('periodicite', v)} options={PERIODICITES.map(p => ({ v: p.id, label: p.label }))} />
      </Champ>
      <Champ id="compta-charge-tva" label="TVA">
        <Puces nom="TVA" valeur={f.tvaTaux} onChange={v => set('tvaTaux', v)} options={TAUX_CHARGES.map(t => ({ v: t, label: tauxTexte(t) }))} />
      </Champ>
      <div style={st.grille}>
        <Champ id="compta-charge-jour" label="Jour d'échéance (facultatif)">
          <input id="compta-charge-jour" style={fs.champ} type="number" inputMode="numeric" min="1" max="31" step="1" value={f.jourEcheance} onChange={e => set('jourEcheance', e.target.value)} />
        </Champ>
        <Champ id="compta-charge-debut" label="Depuis le">
          <input id="compta-charge-debut" style={fs.champ} type="date" value={f.debut || ''} onChange={e => set('debut', e.target.value)} />
        </Champ>
        <Champ id="compta-charge-fin" label="Jusqu'au (facultatif)">
          <input id="compta-charge-fin" style={fs.champ} type="date" value={f.fin || ''} min={f.debut || undefined} onChange={e => set('fin', e.target.value)} />
        </Champ>
      </div>
      <Champ id="compta-charge-fournisseur" label="Fournisseur (facultatif, pour repérer une facture déjà importée)">
        <input id="compta-charge-fournisseur" style={fs.champ} value={f.fournisseur || ''} onChange={e => set('fournisseur', e.target.value)} />
      </Champ>
      <Champ id="compta-charge-note" label="Note">
        <input id="compta-charge-note" style={fs.champ} value={f.note || ''} onChange={e => set('note', e.target.value)} />
      </Champ>
      {!valide && (f.montant !== '' || !f.libelle.trim()) && (
        <div style={{ ...fs.remarque, color: 'var(--danger-text)' }}>
          Un libellé, un montant positif et une date de début ; la fin après le début ; un jour d'échéance entre 1 et 31.
        </div>
      )}
    </Fenetre>
  );
}

const st = {
  puces: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  puce: {
    minHeight: 44, padding: '8px 12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13,
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)',
  },
  puceActive: { borderColor: 'var(--accent)', background: 'var(--accent-light)', color: 'var(--accent)', fontWeight: 500 },
  // Plancher de 200 px : un champ date natif iOS ne se rétrécit pas.
  grille: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 },
};
