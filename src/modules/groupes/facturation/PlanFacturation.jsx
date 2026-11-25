import { useMemo, useState } from 'react';
import { Fenetre, Options, st } from '../../../components/ui/Fenetres.jsx';
import { notify } from '../../../components/toast/index.js';
import {
  MODES_PREVUS, ajouterJours, centimes, chf, lignesAcompte, lignesSolde, nouvelId, planTranches, suiviDevis,
} from './calculs.js';
import { objetDocument } from './documents.js';
import { Champ, sf } from './ui.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Transformer un devis accepté en factures : en une fois, acompte puis solde,
// ou en plusieurs échéances (montant ou pourcentage, la dernière prend le
// reste). Chaque tranche a sa date, son échéance et son mode de paiement ; elle
// est émise tout de suite (numérotée) ou prévue (sans numéro, modifiable).
// Un devis qui a déjà des factures ne propose plus que la facture de solde ;
// si un solde est déjà prévu (un acompte a été annulé), il propose un acompte
// du reste, et le solde recalcule ses déductions à son émission.
// ─────────────────────────────────────────────────────────────────────────────

const MODES = [
  { v: 'une_fois', label: 'En une fois', detail: 'Une facture du montant du devis.' },
  { v: 'acompte_solde', label: 'Acompte puis solde', detail: "Un acompte maintenant, le solde après l'événement." },
  { v: 'echeances', label: 'En plusieurs échéances', detail: 'Montants ou pourcentages au choix, la dernière prend le reste.' },
];

const copieLignes = (lignes) => (lignes || []).map((l) => ({ ...l, id: nouvelId() }));

export default function PlanFacturation({ devis, ctx, onClose, onCree }) {
  const { facturation, reglages, aujourdhui } = ctx;
  const suivi = suiviDevis(devis, facturation.factures, facturation.paiements);
  const soldeSeul = suivi.factures.length > 0;
  const soldePrevu = suivi.factures.some((f) => f.statut === 'prevue' && (f.type === 'solde' || f.type === 'totale'));
  const delai = reglages.delaiPaiementJours ?? 30;
  const apresEvenement = devis.dateEvenement && devis.dateEvenement > aujourdhui ? devis.dateEvenement : aujourdhui;

  const [mode, setMode] = useState(soldeSeul ? 'solde' : 'acompte_solde');
  const [pct, setPct] = useState(String(reglages.acomptePct ?? 30));
  const [parts, setParts] = useState([{ pct: '30', montant: '' }, { pct: '30', montant: '' }, {}]);
  const [reglagesTranches, setReglagesTranches] = useState({});
  const [enCours, setEnCours] = useState(false);

  const tranches = useMemo(() => {
    if (soldeSeul) {
      return [soldePrevu
        ? { type: 'acompte', libelle: 'Acompte', montant: suivi.resteAFacturer }
        : { type: 'solde', libelle: 'Solde', montant: suivi.resteAFacturer }];
    }
    if (mode === 'acompte_solde') return planTranches(mode, devis.total, { pct: Number(String(pct).replace(',', '.')) || 0 });
    if (mode === 'echeances') {
      return planTranches(mode, devis.total, {
        parts: parts.map((p) => (p.montant !== '' && p.montant != null ? { montant: p.montant } : { pct: Number(String(p.pct || 0).replace(',', '.')) })),
      });
    }
    return planTranches('une_fois', devis.total);
  }, [soldeSeul, soldePrevu, mode, pct, parts, devis.total, suivi.resteAFacturer]);

  // Réglages d'une tranche : date, échéance, mode, émise ou prévue.
  const reglageDe = (i, t) => {
    const r = reglagesTranches[`${mode}-${i}`] || {};
    const derniere = i === tranches.length - 1;
    const dateFacture = r.dateFacture ?? (derniere && t.type === 'solde' ? apresEvenement : aujourdhui);
    return {
      dateFacture,
      echeance: r.echeance ?? ajouterJours(dateFacture, delai),
      modePrevu: r.modePrevu ?? 'virement',
      emettre: r.emettre ?? (i === 0 && !(t.type === 'solde' && dateFacture > aujourdhui)),
    };
  };
  const majReglage = (i, champ, valeur) => setReglagesTranches((p) => ({ ...p, [`${mode}-${i}`]: { ...p[`${mode}-${i}`], [champ]: valeur } }));

  const negatif = tranches.some((t) => centimes(t.montant) <= 0);
  const echeanceAvant = tranches.some((t, i) => { const r = reglageDe(i, t); return r.echeance && r.echeance < r.dateFacture; });

  async function creer() {
    if (negatif) { notify('Chaque tranche doit avoir un montant positif.', 'warning'); return; }
    if (echeanceAvant) { notify("Une échéance tombe avant la date de sa facture.", 'warning'); return; }
    const base = {
      devisId: devis.id, groupeEvenementId: devis.groupeEvenementId || null, titre: objetDocument(devis),
      clientNom: devis.clientNom, clientContact: devis.clientContact, clientEmail: devis.clientEmail, clientAdresse: devis.clientAdresse,
    };
    const existants = suivi.factures.filter((f) => f.type === 'acompte');
    const prochainOrdre = suivi.factures.reduce((m, f) => Math.max(m, f.ordre || 0), 0) + 1;
    const aCreer = [];
    tranches.forEach((t, i) => {
      const r = reglageDe(i, t);
      let lignes;
      if (t.type === 'totale') lignes = copieLignes(devis.lignes);
      else if (t.type === 'acompte') lignes = lignesAcompte(devis.lignes, t.montant, t.libelle, `devis ${devis.numero}`);
      else lignes = lignesSolde(devis.lignes, [...existants, ...aCreer.filter((x) => x.type === 'acompte')]);
      aCreer.push({
        ...base, type: t.type, libelle: t.libelle, ordre: prochainOrdre + i, lignes,
        dateFacture: r.dateFacture, echeance: r.echeance, modePrevu: r.modePrevu,
        statut: r.emettre ? 'emise' : 'prevue',
      });
    });
    setEnCours(true);
    const res = await facturation.creerFactures(aCreer);
    setEnCours(false);
    if (res.error) {
      notify(`${res.error}${res.data.length ? ` (${res.data.length} tranche${res.data.length > 1 ? 's' : ''} créée${res.data.length > 1 ? 's' : ''})` : ''}`, 'error');
      if (res.data.length) onCree(res.data);
      return;
    }
    const emises = res.data.filter((f) => f.statut === 'emise');
    notify(emises.length
      ? `Factures créées : ${emises.map((f) => f.numero).join(', ')}${res.data.length > emises.length ? ', le reste prévu' : ''}.`
      : 'Tranches prévues créées, à émettre le moment venu.', 'success');
    onCree(res.data);
  }

  return (
    <Fenetre
      id="groupes-plan-facturation" titre={soldeSeul ? (soldePrevu ? 'Nouvel acompte' : 'Facture de solde') : 'Facturer le devis'}
      sousTitre={`Devis ${devis.numero}, CHF ${chf(devis.total)}`} onClose={onClose} largeur={680}
      pied={<button type="button" style={st.primaire} onClick={creer} disabled={enCours}>{tranches.length > 1 ? 'Créer les factures' : 'Créer la facture'}</button>}
    >
      <div className="fac-fenetre">
        {soldeSeul && soldePrevu ? (
          <div style={sf.encart('info')}>
            Le solde est déjà prévu. Cet acompte couvre le reste à facturer ; le solde déduira les acomptes du moment à son émission.
          </div>
        ) : soldeSeul ? (
          <div style={sf.encart('info')}>
            Déjà facturé <span data-no-translate>CHF {chf(suivi.facture + suivi.prevu)}</span>. La facture de solde reprend les lignes du devis moins les acomptes ;
            elle s'ajuste ensuite (nombre définitif de personnes, boissons du jour) avant d'être émise.
          </div>
        ) : (
          <Options nom="mode-facturation" valeur={mode} onChange={setMode} options={MODES} />
        )}

        {mode === 'acompte_solde' && (
          <Champ label="Acompte en pourcentage du devis" style={{ maxWidth: 220 }}>
            <input style={sf.nombre} inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} />
          </Champ>
        )}

        {mode === 'echeances' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {parts.map((p, i) => (i === parts.length - 1 ? (
              <div key={i} style={sf.remarque}>Échéance {i + 1} : le reste.</div>
            ) : (
              <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
                <Champ label={`Échéance ${i + 1}, en %`} style={{ width: 130 }}>
                  <input style={sf.nombre} inputMode="decimal" value={p.pct || ''} disabled={p.montant !== '' && p.montant != null}
                    onChange={(e) => setParts((l) => l.map((x, k) => (k === i ? { ...x, pct: e.target.value } : x)))} />
                </Champ>
                <Champ label="ou en CHF" style={{ width: 150 }}>
                  <input style={sf.nombre} inputMode="decimal" value={p.montant || ''}
                    onChange={(e) => setParts((l) => l.map((x, k) => (k === i ? { ...x, montant: e.target.value } : x)))} />
                </Champ>
                <button type="button" style={sf.suppr} aria-label={`Retirer l'échéance ${i + 1}`} onClick={() => setParts((l) => l.filter((_, k) => k !== i))}>×</button>
              </div>
            )))}
            <button type="button" style={{ ...st.secondaire, alignSelf: 'flex-start' }} onClick={() => setParts((l) => [...l.slice(0, -1), { pct: '', montant: '' }, l[l.length - 1]])}>
              Ajouter une échéance
            </button>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {tranches.map((t, i) => {
            const r = reglageDe(i, t);
            return (
              <div key={`${mode}-${i}`} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 0', borderBottomWidth: i === tranches.length - 1 ? 0 : 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)' }}>
                <div style={sf.total}>
                  <span>{t.libelle}</span>
                  <span style={sf.chiffre} data-no-translate>CHF {chf(t.montant)}</span>
                </div>
                <div className="fac-grille-2">
                  <Champ label="Date de la facture">
                    <input style={sf.champ} type="date" value={r.dateFacture} onChange={(e) => majReglage(i, 'dateFacture', e.target.value)} />
                  </Champ>
                  <Champ label="À payer jusqu'au">
                    <input style={sf.champ} type="date" value={r.echeance} onChange={(e) => majReglage(i, 'echeance', e.target.value)} />
                  </Champ>
                  <Champ label="Mode de paiement prévu">
                    <select style={sf.champ} value={r.modePrevu} onChange={(e) => majReglage(i, 'modePrevu', e.target.value)}>
                      {MODES_PREVUS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                  </Champ>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, alignSelf: 'end', cursor: 'pointer' }}>
                    <input type="checkbox" checked={r.emettre} onChange={(e) => majReglage(i, 'emettre', e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--accent)' }} />
                    <span style={{ fontSize: 'var(--t2)', color: 'var(--text)' }}>{r.emettre ? 'Émise maintenant (numérotée)' : 'Prévue, à émettre plus tard'}</span>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
        {negatif && <div style={sf.encart('danger')}>Une tranche est nulle ou négative : changez les montants.</div>}
        {echeanceAvant && <div style={sf.encart('alerte')}>Une échéance tombe avant la date de sa facture.</div>}
      </div>
    </Fenetre>
  );
}
