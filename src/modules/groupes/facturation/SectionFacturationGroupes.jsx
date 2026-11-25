import { useEffect, useState } from 'react';
import { st } from '../../../components/ui/Fenetres.jsx';
import { notify } from '../../../components/toast/index.js';
import { dbService } from '../../../services/dbService.js';
import { estQrIban, formaterIban, ibanValide, nettoyerIban } from '../../../services/qrFacture.js';
import { enregistrerReglagesFacturation, lireReglagesFacturation } from '../../../hooks/useFacturationGroupes.js';
import { CLES_MAILS, MAILS_DEFAUT, VARIABLES_MAIL } from './documents.js';
import { Champ, sf } from './ui.jsx';
import './facturation.css';

// ─────────────────────────────────────────────────────────────────────────────
// Section « Groupes : devis et factures » de la page des réglages.
//   Identité de facturation (facturation_reglages) : raison sociale, adresse
//   structurée de la QR-facture, IBAN, TVA, délais, acompte, conditions.
//   Écrite par le consultant et le patron seuls (RLS) ; les autres la lisent.
//   Messages types des brouillons Gmail : propres à chaque personne
//   (user_settings), variables {{...}}.
// ─────────────────────────────────────────────────────────────────────────────

const ROLES_IDENTITE = ['consultant', 'patron'];

export default function SectionFacturationGroupes({ user, etablissement }) {
  const etabId = etablissement?.id || null;
  const peutEcrire = ROLES_IDENTITE.includes(user?.role);
  const [etat, setEtat] = useState({ status: 'loading', valeurs: null });
  const [form, setForm] = useState(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    if (!etabId) return undefined;
    let monte = true;
    lireReglagesFacturation(etabId).then((r) => {
      if (!monte) return;
      if (r.error) { setEtat({ status: 'error', valeurs: null, message: r.error }); return; }
      setEtat({ status: 'ready', valeurs: r.data });
      setForm(r.data);
    });
    return () => { monte = false; };
  }, [etabId]);

  if (!etabId) return null;
  if (etat.status === 'loading') return <p style={sf.remarque}>Chargement…</p>;
  if (etat.status === 'error') return <p style={sf.remarque}>{etat.message || "Les réglages n'ont pas pu être lus."}</p>;

  const set = (cle, v) => setForm((p) => ({ ...p, [cle]: v }));
  const modifie = JSON.stringify(form) !== JSON.stringify(etat.valeurs);
  const iban = nettoyerIban(form.iban);
  const ibanMessage = !iban ? '' : (!ibanValide(iban) ? 'IBAN invalide (compte suisse ou liechtensteinois attendu).'
    : (estQrIban(iban) ? "C'est un QR-IBAN : la QR-facture exige alors une référence QR, non gérée ici. Indiquez l'IBAN ordinaire du compte." : ''));

  async function enregistrer() {
    if (ibanMessage) { notify(ibanMessage, 'warning'); return; }
    setEnCours(true);
    const r = await enregistrerReglagesFacturation(etabId, form);
    setEnCours(false);
    if (r.error) { notify(r.error, 'error'); return; }
    setEtat({ status: 'ready', valeurs: r.data });
    setForm(r.data);
    notify('Identité de facturation enregistrée.', 'success');
  }

  return (
    <div className="fac-fenetre" style={{ maxWidth: 720 }}>
      {!peutEcrire && <div style={sf.encart('info')}>Seuls le consultant et le patron modifient l'identité de facturation.</div>}

      <div style={sf.titreBloc}>Émetteur des devis et factures</div>
      <div className="fac-grille-2">
        <Champ label="Raison sociale ou nom de l'établissement">
          <input style={sf.champ} value={form.raisonSociale} disabled={!peutEcrire} onChange={(e) => set('raisonSociale', e.target.value)} />
        </Champ>
        <Champ label="E-mail">
          <input style={sf.champ} type="email" value={form.email} disabled={!peutEcrire} onChange={(e) => set('email', e.target.value)} />
        </Champ>
        <Champ label="Rue">
          <input style={sf.champ} value={form.rue} disabled={!peutEcrire} onChange={(e) => set('rue', e.target.value)} />
        </Champ>
        <Champ label="Numéro">
          <input style={sf.champ} value={form.numero} disabled={!peutEcrire} onChange={(e) => set('numero', e.target.value)} />
        </Champ>
        <Champ label="NPA">
          <input style={sf.champ} value={form.npa} disabled={!peutEcrire} onChange={(e) => set('npa', e.target.value)} />
        </Champ>
        <Champ label="Localité">
          <input style={sf.champ} value={form.localite} disabled={!peutEcrire} onChange={(e) => set('localite', e.target.value)} />
        </Champ>
        <Champ label="Pays (code à deux lettres)">
          <input style={sf.champ} value={form.pays} maxLength={2} disabled={!peutEcrire} onChange={(e) => set('pays', e.target.value.toUpperCase())} />
        </Champ>
        <Champ label="Téléphone">
          <input style={sf.champ} type="tel" value={form.telephone} disabled={!peutEcrire} onChange={(e) => set('telephone', e.target.value)} />
        </Champ>
      </div>

      <div style={sf.titreBloc}>Paiement et TVA</div>
      <Champ label="IBAN du compte qui reçoit les paiements (QR-facture)">
        <input
          style={{ ...sf.champ, borderColor: ibanMessage ? 'var(--danger-bd)' : 'var(--champ-bord)' }} data-no-translate
          value={form.iban} disabled={!peutEcrire} onChange={(e) => set('iban', e.target.value)}
          onBlur={(e) => { if (ibanValide(nettoyerIban(e.target.value))) set('iban', formaterIban(e.target.value)); }}
        />
      </Champ>
      {ibanMessage && <div style={sf.encart('danger')}>{ibanMessage}</div>}
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: peutEcrire ? 'pointer' : 'default' }}>
        <input type="checkbox" checked={form.assujettiTva} disabled={!peutEcrire} onChange={(e) => set('assujettiTva', e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--accent)' }} />
        <span style={{ fontSize: 'var(--t2)' }}>Assujetti à la TVA (la TVA incluse s'affiche par taux)</span>
      </label>
      <div className="fac-grille-2">
        {form.assujettiTva && (
          <Champ label="Numéro TVA (CHE-123.456.789 TVA)">
            <input style={sf.champ} data-no-translate value={form.numeroTva} disabled={!peutEcrire} onChange={(e) => set('numeroTva', e.target.value)} />
          </Champ>
        )}
        <Champ label="Délai de paiement, en jours">
          <input style={sf.nombre} inputMode="numeric" value={form.delaiPaiementJours} disabled={!peutEcrire} onChange={(e) => set('delaiPaiementJours', e.target.value.replace(/\D/g, ''))} />
        </Champ>
        <Champ label="Validité d'un devis, en jours">
          <input style={sf.nombre} inputMode="numeric" value={form.validiteDevisJours} disabled={!peutEcrire} onChange={(e) => set('validiteDevisJours', e.target.value.replace(/\D/g, ''))} />
        </Champ>
        <Champ label="Acompte proposé, en %">
          <input style={sf.nombre} inputMode="decimal" value={form.acomptePct} disabled={!peutEcrire} onChange={(e) => set('acomptePct', e.target.value)} />
        </Champ>
      </div>
      <Champ label="Conditions générales, reprises sur chaque devis">
        <textarea style={sf.zone} rows={4} value={form.conditions} disabled={!peutEcrire} onChange={(e) => set('conditions', e.target.value)}
          placeholder="Par exemple : acompte de 30 % à la confirmation ; nombre définitif de personnes 7 jours avant ; annulation gratuite jusqu'à 30 jours avant." />
      </Champ>
      <Champ label="Mention au bas des factures">
        <textarea style={sf.zone} rows={2} value={form.mentionFacture} disabled={!peutEcrire} onChange={(e) => set('mentionFacture', e.target.value)} />
      </Champ>
      {peutEcrire && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" style={st.primaire} onClick={enregistrer} disabled={enCours || !modifie}>Enregistrer</button>
        </div>
      )}

      <MessagesTypes />
    </div>
  );
}

// Messages types des brouillons Gmail, enregistrés à chaque changement
// (comme le message type des factures du consultant).
function MessagesTypes() {
  const db = dbService.getDb();
  const lire = (type) => {
    const v = db?.getUserSettingSync?.(CLES_MAILS[type], null);
    return { ...MAILS_DEFAUT[type], ...(v && typeof v === 'object' ? v : {}) };
  };
  const [mails, setMails] = useState(() => ({ devis: lire('devis'), facture: lire('facture'), relance: lire('relance') }));

  const regler = (type, champ, valeur) => {
    const suivant = { ...mails[type], [champ]: valeur };
    setMails((p) => ({ ...p, [type]: suivant }));
    Promise.resolve(db?.setUserSetting?.(CLES_MAILS[type], suivant)).catch((err) => {
      console.warn('[Groupes] message type', err);
      notify("Le message type n'a pas pu être enregistré.", 'error');
    });
  };
  const remettre = (type) => {
    setMails((p) => ({ ...p, [type]: { ...MAILS_DEFAUT[type] } }));
    Promise.resolve(db?.setUserSetting?.(CLES_MAILS[type], null)).catch(() => {});
  };

  const blocs = [
    { type: 'devis', titre: 'Envoi d\'un devis' },
    { type: 'facture', titre: 'Envoi d\'une facture' },
    { type: 'relance', titre: 'Relance d\'une facture' },
  ];
  return (
    <>
      <div style={sf.titreBloc}>Messages types des e-mails</div>
      <div style={sf.remarque}>
        Ils remplissent le brouillon Gmail ouvert par « Envoyer » et « Relancer ». Variables :{' '}
        <span data-no-translate>{VARIABLES_MAIL.map((v) => `{{${v}}}`).join(' ')}</span>
      </div>
      {blocs.map((b) => (
        <div key={b.type} style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 'var(--t2)', fontWeight: 'var(--g2)' }}>{b.titre}</span>
            <button type="button" style={sf.pilule(false)} onClick={() => remettre(b.type)}>Texte d'origine</button>
          </div>
          <Champ label="Objet">
            <input style={sf.champ} value={mails[b.type].sujet} onChange={(e) => regler(b.type, 'sujet', e.target.value)} />
          </Champ>
          <Champ label="Message">
            <textarea style={{ ...sf.zone, minHeight: 160 }} rows={8} value={mails[b.type].corps} onChange={(e) => regler(b.type, 'corps', e.target.value)} />
          </Champ>
        </div>
      ))}
    </>
  );
}
