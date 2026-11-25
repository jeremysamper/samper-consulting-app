import { useState } from 'react';
import { BoutonActions, Fenetre, st } from '../../../components/ui/Fenetres.jsx';
import { notify } from '../../../components/toast/index.js';
import {
  ETATS_FACTURE, MODES_PAIEMENT, MODES_PREVUS, TYPES_FACTURE, ajouterJours, centimes, chf, dateFr, etatFacture, joursEntre, labelMode,
  normaliserPrix, paiementsDe, rafraichirDeductions, totaux,
} from './calculs.js';
import { ouvrirBrouillon, pdfFacture } from './actions.js';
import LignesEditeur, { lignesCalcul } from './LignesEditeur.jsx';
import { Champ, Pastille, TON_FACTURE, sf } from './ui.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Une facture de groupe.
//   prévue  : tout se modifie ; « Émettre » lui donne son numéro et la fige.
//             Une facture de solde recalcule ses acomptes déduits à l'émission.
//   émise   : figée ; on encaisse (en une ou plusieurs fois), on envoie, on
//             relance, on change l'échéance ; on l'annule tant qu'aucun
//             paiement n'est saisi.
//   annulée : gardée, barrée sur le PDF.
// ─────────────────────────────────────────────────────────────────────────────

export default function FactureFenetre({ facture, ctx, onClose }) {
  const { facturation, reglages, aujourdhui } = ctx;
  const f = facturation.factures.find((x) => x.id === facture.id) || facture;
  const prevue = f.statut === 'prevue';
  const e = etatFacture(f, facturation.paiements, aujourdhui);
  const siens = paiementsDe(f.id, facturation.paiements).slice().sort((a, b) => String(a.datePaiement).localeCompare(String(b.datePaiement)));

  const [form, setForm] = useState(() => ({ ...f }));
  const [modifie, setModifie] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [paiement, setPaiement] = useState(() => ({ montant: e.reste > 0 ? String(e.reste) : '', datePaiement: aujourdhui, mode: f.modePrevu === 'autre' ? 'virement' : f.modePrevu, reference: '' }));
  const [echeance, setEcheance] = useState(f.echeance || '');

  const set = (cle, valeur) => { setForm((p) => ({ ...p, [cle]: valeur })); setModifie(true); };

  // Acomptes du même devis à déduire d'un solde (émis ou prévus, pas annulés).
  const acomptesDuDevis = () => facturation.factures.filter((x) => x.devisId && x.devisId === f.devisId
    && x.id !== f.id && x.type === 'acompte' && x.statut !== 'annulee');

  async function enregistrer() {
    setEnCours(true);
    const r = await facturation.modifierFacturePrevue(f.id, form);
    setEnCours(false);
    if (r.error) { notify(r.error, 'error'); return false; }
    setForm({ ...r.data });
    setModifie(false);
    notify('Facture enregistrée.', 'success');
    return true;
  }

  async function emettre() {
    let contenu = form;
    // Émise avant sa date prévue (ou sans date) : elle prend la date du jour,
    // et garde son délai de paiement. La date fixe aussi l'année du numéro.
    if (!form.dateFacture || form.dateFacture > aujourdhui) {
      const delai = joursEntre(form.dateFacture, form.echeance) ?? reglages.delaiPaiementJours ?? 30;
      contenu = { ...contenu, dateFacture: aujourdhui, echeance: ajouterJours(aujourdhui, Math.max(0, delai)) };
    }
    if (f.type === 'solde') {
      const lignes = rafraichirDeductions(contenu.lignes, acomptesDuDevis());
      if (JSON.stringify(lignes.filter((l) => l.deduction).map((l) => [l.libelle, l.prixUnitaire]))
        !== JSON.stringify(form.lignes.filter((l) => l.deduction).map((l) => [l.libelle, l.prixUnitaire]))) {
        notify('Acomptes déduits mis à jour avec leurs numéros.', 'info');
      }
      contenu = { ...contenu, lignes };
    }
    const montant = totaux(lignesCalcul(contenu.lignes)).total;
    if (montant <= 0 && !window.confirm(`Le montant de cette facture est de CHF ${chf(montant)}. L'émettre quand même ?`)) return;
    if (!window.confirm(`Émettre la facture de CHF ${chf(montant)}, datée du ${dateFr(contenu.dateFacture)} ? Elle reçoit son numéro et ne se modifie plus.`)) return;
    setEnCours(true);
    const r = await facturation.emettreFacture(f.id, contenu);
    setEnCours(false);
    if (r.error) { notify(r.error, 'error'); return; }
    setModifie(false);
    notify(`Facture ${r.data.numero} émise.`, 'success');
  }

  async function supprimer() {
    if (!window.confirm(prevue ? 'Supprimer cette tranche prévue ?' : `Supprimer la facture ${f.numero} ? Elle disparaît du suivi.`)) return;
    const r = await facturation.supprimerFacture(f.id);
    if (r.error) { notify(r.error, 'error'); return; }
    notify('Facture supprimée.', 'success');
    onClose();
  }

  async function annuler() {
    if (siens.length) { notify('Cette facture a des paiements : supprimez-les ou saisissez un remboursement avant de l\'annuler.', 'warning'); return; }
    const motif = window.prompt(`Annuler la facture ${f.numero} ? Elle reste dans le suivi, barrée. Motif :`, '');
    if (motif === null) return;
    const r = await facturation.annulerFacture(f.id, motif);
    if (r.error) notify(r.error, 'error'); else notify('Facture annulée.', 'success');
  }

  async function encaisser() {
    const montant = normaliserPrix(paiement.montant);
    if (!montant) { notify('Saisissez le montant reçu.', 'warning'); return; }
    if (centimes(montant) > centimes(e.reste) && montant > 0
      && !window.confirm(`Le montant dépasse le reste à payer (CHF ${chf(e.reste)}). L'enregistrer quand même ?`)) return;
    setEnCours(true);
    const r = await facturation.encaisser({ ...paiement, montant, factureId: f.id });
    setEnCours(false);
    if (r.error) { notify(r.error, 'error'); return; }
    const reste = Math.max(0, (centimes(e.reste) - centimes(montant)) / 100);
    notify(reste > 0 ? `Paiement enregistré, reste CHF ${chf(reste)}.` : 'Paiement enregistré, facture réglée.', 'success');
    setPaiement((p) => ({ ...p, montant: reste > 0 ? String(reste) : '', reference: '' }));
  }

  async function retirerPaiement(p) {
    if (!window.confirm(`Supprimer le paiement de CHF ${chf(p.montant)} du ${dateFr(p.datePaiement)} ?`)) return;
    const r = await facturation.supprimerPaiement(p.id);
    if (r.error) notify(r.error, 'error'); else notify('Paiement supprimé.', 'success');
  }

  async function pdf() {
    if (modifie) { notify("Enregistrez d'abord la facture.", 'warning'); return; }
    setEnCours(true);
    try { await pdfFacture(f, ctx); } finally { setEnCours(false); }
  }

  async function envoyer(type) {
    if (!f.clientEmail) notify("Pas d'e-mail client : le brouillon s'ouvre sans destinataire.", 'info');
    ouvrirBrouillon(type, f, ctx);
    setEnCours(true);
    try {
      await pdfFacture(f, ctx);
      const champs = type === 'relance'
        ? { relances: [...(f.relances || []), aujourdhui] }
        : { envoyeeLe: new Date().toISOString() };
      const r = await facturation.majFacture(f.id, champs);
      if (r.error) notify(r.error, 'error');
    } finally { setEnCours(false); }
  }

  async function changerEcheance() {
    const r = await facturation.majFacture(f.id, { echeance });
    if (r.error) notify(r.error, 'error'); else notify('Échéance changée.', 'success');
  }

  const titre = f.numero ? `${TYPES_FACTURE[f.type]} ${f.numero}` : `${f.libelle || TYPES_FACTURE[f.type]}, prévue`;
  const fermer = () => {
    if (modifie && !window.confirm('Fermer sans enregistrer les changements ?')) return;
    onClose();
  };

  const pied = prevue ? (
    <>
      <BoutonActions id="facture-plus" label="Plus" style={st.secondaire} titre={titre}
        sections={[{ items: [{ titre: 'Supprimer la tranche', danger: true, onClick: supprimer }] }]} />
      {modifie && <button type="button" style={st.secondaire} onClick={enregistrer} disabled={enCours}>Enregistrer</button>}
      <button type="button" style={st.primaire} onClick={emettre} disabled={enCours}>Émettre</button>
    </>
  ) : (
    <>
      <BoutonActions id="facture-plus" label="Plus" style={st.secondaire} titre={titre}
        sections={[{ items: [
          f.statut === 'emise' ? { titre: 'Envoyer par e-mail', detail: 'Brouillon Gmail préécrit, et le PDF à joindre', onClick: () => envoyer('facture') } : null,
          f.statut === 'emise' && e.reste > 0 ? { titre: 'Relancer le client', detail: f.relances?.length ? `${f.relances.length} relance${f.relances.length > 1 ? 's' : ''} déjà envoyée${f.relances.length > 1 ? 's' : ''}` : 'Rappel préécrit, avec le reste à payer', onClick: () => envoyer('relance') } : null,
          f.statut === 'emise' ? { titre: 'Annuler la facture', detail: 'Elle reste dans le suivi, barrée', danger: true, onClick: annuler } : null,
          ctx.user?.role === 'consultant' && !siens.length ? { titre: 'Supprimer la facture', detail: 'Réservé au consultant, pour un essai', danger: true, onClick: supprimer } : null,
        ] }]} />
      <button type="button" style={st.primaire} onClick={pdf} disabled={enCours}>PDF</button>
    </>
  );

  return (
    <Fenetre id="groupes-facture" titre={titre} sousTitre={`${f.clientNom}${f.titre ? `, ${f.titre}` : ''}`} onClose={fermer} largeur={760} pied={pied}>
      <div className="fac-fenetre">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <Pastille ton={TON_FACTURE[e.etat]}>{ETATS_FACTURE[e.etat].label}</Pastille>
          {f.dateFacture && !prevue && <span style={sf.remarque}>Du <span data-no-translate>{dateFr(f.dateFacture)}</span></span>}
          {f.envoyeeLe && <span style={sf.remarque}>Envoyée le <span data-no-translate>{dateFr(String(f.envoyeeLe).slice(0, 10))}</span></span>}
          {f.relances?.length > 0 && <span style={sf.remarque}>Relancée le <span data-no-translate>{dateFr(f.relances[f.relances.length - 1])}</span></span>}
          {f.statut === 'annulee' && f.motifAnnulation && <span style={sf.remarque}>Motif : {f.motifAnnulation}</span>}
        </div>

        {prevue ? (
          <>
            <div className="fac-grille-2">
              <Champ label="Libellé">
                <input style={sf.champ} value={form.libelle || ''} onChange={(ev) => set('libelle', ev.target.value)} />
              </Champ>
              <Champ label="Mode de paiement prévu">
                <select style={sf.champ} value={form.modePrevu} onChange={(ev) => set('modePrevu', ev.target.value)}>
                  {MODES_PREVUS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </Champ>
              <Champ label="Date de la facture">
                <input style={sf.champ} type="date" value={form.dateFacture || ''} onChange={(ev) => set('dateFacture', ev.target.value)} />
              </Champ>
              <Champ label="À payer jusqu'au">
                <input style={sf.champ} type="date" value={form.echeance || ''} onChange={(ev) => set('echeance', ev.target.value)} />
              </Champ>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={sf.titreBloc}>Lignes</div>
              {f.type === 'solde' && (
                <button type="button" style={st.secondaire} onClick={() => set('lignes', rafraichirDeductions(form.lignes, acomptesDuDevis()))}>
                  Recalculer les acomptes déduits
                </button>
              )}
            </div>
            <LignesEditeur lignes={form.lignes} onChange={(l) => set('lignes', l)} assujettiTva={reglages.assujettiTva} />
          </>
        ) : (
          <>
            <LignesEditeur lignes={f.lignes} lectureSeule assujettiTva={reglages.assujettiTva} />
            {f.statut === 'emise' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 8 }}>
                <Champ label="À payer jusqu'au" style={{ width: 200 }}>
                  <input style={sf.champ} type="date" value={echeance} onChange={(ev) => setEcheance(ev.target.value)} />
                </Champ>
                {echeance !== (f.echeance || '') && <button type="button" style={st.secondaire} onClick={changerEcheance}>Changer l'échéance</button>}
                <span style={{ ...sf.remarque, alignSelf: 'center' }}>Paiement prévu : {labelMode(f.modePrevu).toLowerCase()}</span>
              </div>
            )}

            <div style={sf.titreBloc}>Paiements</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 420, marginLeft: 'auto', width: '100%' }}>
              <div style={sf.ligneTotal}><span>Montant</span><span style={sf.chiffre} data-no-translate>CHF {chf(f.montant)}</span></div>
              <div style={sf.ligneTotal}><span>Payé</span><span style={sf.chiffre} data-no-translate>CHF {chf(e.paye)}</span></div>
              <div style={sf.total}><span>Reste à payer</span><span style={sf.chiffre} data-no-translate>CHF {chf(e.reste)}</span></div>
              {e.tropPercu > 0 && <div style={sf.encart('alerte')}>Trop perçu : <span data-no-translate>CHF {chf(e.tropPercu)}</span>, à rembourser (paiement négatif).</div>}
            </div>
            {siens.length === 0 && <div style={sf.remarque}>Aucun paiement saisi.</div>}
            {siens.map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 48, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)' }}>
                <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 'var(--t2)' }}>
                    <span data-no-translate>{dateFr(p.datePaiement)}</span>, {labelMode(p.mode)}
                  </span>
                  {(p.reference || p.note) && <span style={{ display: 'block', fontSize: 'var(--t1)', color: 'var(--text2)' }}>{[p.reference, p.note].filter(Boolean).join(', ')}</span>}
                </span>
                <span style={{ ...sf.chiffre, fontSize: 'var(--t2)' }} data-no-translate>{chf(p.montant)}</span>
                <button type="button" style={sf.suppr} onClick={() => retirerPaiement(p)} aria-label="Supprimer le paiement" title="Supprimer le paiement">×</button>
              </div>
            ))}

            {f.statut === 'emise' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
                <div style={sf.titreBloc}>Encaisser</div>
                <div className="fac-grille-2">
                  <Champ label="Montant reçu (négatif pour un remboursement)">
                    <input style={sf.nombre} inputMode="decimal" value={paiement.montant} onChange={(ev) => setPaiement((p) => ({ ...p, montant: ev.target.value }))} />
                  </Champ>
                  <Champ label="Date">
                    <input style={sf.champ} type="date" value={paiement.datePaiement} onChange={(ev) => setPaiement((p) => ({ ...p, datePaiement: ev.target.value }))} />
                  </Champ>
                  <Champ label="Mode">
                    <select style={sf.champ} value={paiement.mode} onChange={(ev) => setPaiement((p) => ({ ...p, mode: ev.target.value }))}>
                      {MODES_PAIEMENT.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                  </Champ>
                  <Champ label="Référence (relevé bancaire, ticket)">
                    <input style={sf.champ} value={paiement.reference} onChange={(ev) => setPaiement((p) => ({ ...p, reference: ev.target.value }))} />
                  </Champ>
                </div>
                <button type="button" style={{ ...st.secondaire, alignSelf: 'flex-start' }} onClick={encaisser} disabled={enCours}>Enregistrer le paiement</button>
              </div>
            )}
          </>
        )}
      </div>
    </Fenetre>
  );
}
