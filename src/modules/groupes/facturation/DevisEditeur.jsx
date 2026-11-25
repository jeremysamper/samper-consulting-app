import { useMemo, useState } from 'react';
import { BoutonActions, Fenetre, Options, st } from '../../../components/ui/Fenetres.jsx';
import { notify } from '../../../components/toast/index.js';
import { NUMEROS_MENU, NUMERO_COMPLEMENTS, TYPES_GROUPE, libelleGroupe } from '../typesGroupe.js';
import {
  ETATS_FACTURE, STATUTS_DEVIS, ajouterJours, chf, dateFr, etatDevis, etatFacture, lignesDepuisGroupe, suiviDevis,
} from './calculs.js';
import { objetDocument } from './documents.js';
import { ouvrirBrouillon, pdfDevis } from './actions.js';
import LignesEditeur, { lignesCalcul } from './LignesEditeur.jsx';
import { Champ, Pastille, TON_DEVIS, TON_FACTURE, sf } from './ui.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Devis d'un groupe : client, événement, lignes, validité, conditions.
// Un devis accepté est figé (garde en base) : seules ses notes, son lien vers
// le groupe et son statut bougent. « Accepté » crée le groupe au calendrier,
// le relie à un groupe existant, ou laisse le devis seul pour l'instant.
// ─────────────────────────────────────────────────────────────────────────────

function brouillonDe(devis, reglages, aujourdhui) {
  const dateDevis = devis?.dateDevis || aujourdhui;
  return {
    clientNom: '', clientContact: '', clientEmail: '', clientTelephone: '', clientAdresse: '',
    titre: '', typeGroupe: 'mariage', dateEvenement: '', heure: '', nbPax: '', menuNumero: null,
    lignes: [], conditions: '', notes: '',
    ...devis,
    dateDevis,
    valideJusqu: devis?.valideJusqu || ajouterJours(dateDevis, reglages?.validiteDevisJours ?? 30),
    nbPax: devis?.nbPax ?? '',
  };
}

export default function DevisEditeur({ devis, ctx, onClose, onFacturer, onOuvrirFacture }) {
  const { facturation, reglages, aujourdhui } = ctx;
  const existant = !!devis?.id;
  const [form, setForm] = useState(() => brouillonDe(devis, reglages, aujourdhui));
  const [modifie, setModifie] = useState(!existant);
  const [enCours, setEnCours] = useState(false);
  const [accepter, setAccepter] = useState(false);
  const [notes, setNotes] = useState(devis?.notes || '');

  // La version enregistrée fait foi pour l'état et le suivi (relecture temps réel).
  const enBase = existant ? facturation.devis.find((d) => d.id === devis.id) || devis : null;
  const statut = enBase ? etatDevis(enBase, aujourdhui) : 'brouillon';
  const fige = enBase?.statut === 'accepte';
  const suivi = enBase ? suiviDevis(enBase, facturation.factures, facturation.paiements) : null;
  const idGroupe = enBase ? enBase.groupeEvenementId : form.groupeEvenementId;
  const groupeRelie = idGroupe ? ctx.groupes.find((g) => g.id === idGroupe) || null : null;

  const set = (cle, valeur) => { setForm((p) => ({ ...p, [cle]: valeur })); setModifie(true); };
  const champ = fige ? sf.champFige : sf.champ;
  const zone = fige ? { ...sf.champFige, minHeight: 72, resize: 'none', lineHeight: 1.45 } : sf.zone;
  const composes = ctx.menusDuType ? ctx.menusDuType(form.typeGroupe) : [];
  const numeros = composes.length ? composes.map((m) => m.numero) : NUMEROS_MENU;

  function reprendreMenu() {
    if (form.lignes.length && !window.confirm('Remplacer les lignes du devis par celles du menu ?')) return;
    const groupe = {
      typeGroupe: form.typeGroupe, menuNumero: form.menuNumero, nbPax: Number(form.nbPax) || 0,
      nbEnfants: groupeRelie?.nbEnfants ?? null, dateEvenement: form.dateEvenement, choix: groupeRelie?.choix || {},
    };
    const menu = form.menuNumero ? ctx.menuDe(form.typeGroupe, form.menuNumero) : null;
    set('lignes', lignesDepuisGroupe({ groupe, menu, complements: ctx.menuDe(form.typeGroupe, NUMERO_COMPLEMENTS), menus: ctx.menus }));
  }

  async function enregistrer() {
    if (!String(form.clientNom || '').trim()) { notify('Le nom du client est obligatoire.', 'warning'); return null; }
    setEnCours(true);
    const res = existant ? await facturation.modifierDevis(devis.id, form) : await facturation.creerDevis(form);
    setEnCours(false);
    if (res.error) { notify(res.error, 'error'); return null; }
    setForm(brouillonDe(res.data, reglages, aujourdhui));
    setModifie(false);
    if (!existant) {
      notify(`Devis ${res.data.numero} créé.`, 'success');
      onClose({ rouvrir: res.data });
    } else notify('Devis enregistré.', 'success');
    return res.data;
  }

  // PDF et envoi partent de la version enregistrée (numéro, total de la base).
  async function pdf() {
    if (modifie) { notify("Enregistrez d'abord le devis.", 'warning'); return; }
    setEnCours(true);
    try { await pdfDevis(enBase, ctx); } finally { setEnCours(false); }
  }
  async function envoyer() {
    if (modifie) { notify("Enregistrez d'abord le devis.", 'warning'); return; }
    if (!enBase.clientEmail) notify("Pas d'e-mail client : le brouillon s'ouvre sans destinataire.", 'info');
    ouvrirBrouillon('devis', enBase, ctx);
    setEnCours(true);
    try {
      await pdfDevis(enBase, ctx);
      if (enBase.statut === 'brouillon') {
        const r = await facturation.changerStatutDevis(enBase.id, 'envoye');
        if (r.error) notify(r.error, 'error');
      }
    } finally { setEnCours(false); }
  }
  async function statutVers(s) {
    setEnCours(true);
    const r = await facturation.changerStatutDevis(enBase.id, s);
    setEnCours(false);
    if (r.error) notify(r.error, 'error');
    else notify(`Devis ${STATUTS_DEVIS[s].label.toLowerCase()}.`, 'success');
  }
  async function supprimer() {
    if (!window.confirm(`Supprimer le devis ${enBase.numero} ?`)) return;
    const r = await facturation.supprimerDevis(enBase.id);
    if (r.error) { notify(r.error, 'error'); return; }
    notify('Devis supprimé.', 'success');
    onClose();
  }
  async function enregistrerNotes() {
    const r = await facturation.notesDevis(enBase.id, notes);
    if (r.error) notify(r.error, 'error'); else notify('Notes enregistrées.', 'success');
  }

  const titre = existant ? `Devis ${enBase?.numero || ''}` : 'Nouveau devis';
  const sousTitre = existant ? `${enBase.clientNom}, ${objetDocument(enBase)}` : 'Le numéro est donné à l\'enregistrement.';
  const fermer = () => {
    if (modifie && existant && !window.confirm('Fermer sans enregistrer les changements ?')) return;
    onClose();
  };

  const pied = fige ? (
    <>
      <BoutonActions
        id="devis-plus" label="Plus" style={st.secondaire} titre={titre}
        sections={[{ items: [
          groupeRelie ? { titre: 'Ouvrir le groupe', detail: libelleGroupe(groupeRelie.typeGroupe, groupeRelie.menuNumero), onClick: () => ctx.ouvrirGroupe(groupeRelie) } : null,
          !groupeRelie ? { titre: 'Relier à un groupe', detail: 'Créer le groupe au calendrier ou le relier à un groupe existant', onClick: () => setAccepter(true) } : null,
          !suivi?.factures.length ? { titre: 'Rouvrir le devis', detail: 'Il repasse en envoyé et redevient modifiable', onClick: () => statutVers('envoye') } : null,
        ] }]}
      />
      <button type="button" style={st.secondaire} onClick={pdf} disabled={enCours}>PDF</button>
      {suivi && suivi.resteAFacturer > 0.004 && (
        <button type="button" style={st.primaire} onClick={() => onFacturer(enBase)} disabled={enCours}>Facturer</button>
      )}
    </>
  ) : (
    <>
      {existant && (
        <BoutonActions
          id="devis-plus" label="Plus" style={st.secondaire} titre={titre}
          sections={[{ items: [
            !modifie ? { titre: 'Accepté par le client', detail: 'Crée ou relie le groupe, puis le devis se facture', onClick: () => setAccepter(true) } : null,
            !modifie && enBase.statut === 'brouillon' ? { titre: 'Marquer comme envoyé', onClick: () => statutVers('envoye') } : null,
            !modifie && enBase.statut !== 'refuse' ? { titre: 'Refusé par le client', onClick: () => statutVers('refuse') } : null,
            !modifie ? { titre: 'Envoyer par e-mail', detail: 'Brouillon Gmail préécrit, et le PDF à joindre', onClick: envoyer } : null,
            { titre: 'Supprimer le devis', danger: true, onClick: supprimer },
          ] }]}
        />
      )}
      {existant && !modifie && <button type="button" style={st.secondaire} onClick={pdf} disabled={enCours}>PDF</button>}
      {(modifie || !existant) && <button type="button" style={st.primaire} onClick={enregistrer} disabled={enCours}>Enregistrer</button>}
    </>
  );

  return (
    <Fenetre id="groupes-devis" titre={titre} sousTitre={sousTitre} onClose={fermer} largeur={820} pied={pied}>
      <div className="fac-fenetre">
        {existant && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <Pastille ton={TON_DEVIS[statut]}>{STATUTS_DEVIS[statut]?.label}</Pastille>
            <span style={sf.remarque}>
              Du <span data-no-translate>{dateFr(enBase.dateDevis)}</span>
              {enBase.valideJusqu ? <>, valable jusqu'au <span data-no-translate>{dateFr(enBase.valideJusqu)}</span></> : null}
            </span>
            {groupeRelie && <span style={sf.remarque}>Relié au groupe du <span data-no-translate>{dateFr(groupeRelie.dateEvenement)}</span></span>}
          </div>
        )}

        <div style={sf.titreBloc}>Client</div>
        <div className="fac-grille-2">
          <Champ label="Nom ou société">
            <input style={champ} value={form.clientNom} disabled={fige} onChange={(e) => set('clientNom', e.target.value)} />
          </Champ>
          <Champ label="Personne de contact">
            <input style={champ} value={form.clientContact} disabled={fige} onChange={(e) => set('clientContact', e.target.value)} />
          </Champ>
          <Champ label="E-mail">
            <input style={champ} type="email" value={form.clientEmail} disabled={fige} onChange={(e) => set('clientEmail', e.target.value)} />
          </Champ>
          <Champ label="Téléphone">
            <input style={champ} type="tel" value={form.clientTelephone} disabled={fige} onChange={(e) => set('clientTelephone', e.target.value)} />
          </Champ>
        </div>
        <Champ label="Adresse (rue et numéro, puis NPA et localité), reprise sur la facture et sa QR-facture">
          <textarea style={zone} rows={3} value={form.clientAdresse} disabled={fige} onChange={(e) => set('clientAdresse', e.target.value)} />
        </Champ>

        <div style={sf.titreBloc}>Événement</div>
        <div className="fac-grille-2">
          <Champ label="Type">
            <select style={champ} value={form.typeGroupe || ''} disabled={fige} onChange={(e) => set('typeGroupe', e.target.value)}>
              {TYPES_GROUPE.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </Champ>
          <Champ label="Menu">
            <select data-no-translate style={champ} value={form.menuNumero || ''} disabled={fige} onChange={(e) => set('menuNumero', e.target.value ? Number(e.target.value) : null)}>
              <option value="">À définir</option>
              {numeros.map((n) => {
                const m = ctx.menuDe(form.typeGroupe, n);
                return <option key={n} value={n}>{`n°${n}${m?.nom ? `, ${m.nom}` : ''}${m?.prixPax != null ? `, ${chf(m.prixPax)} par personne` : ''}`}</option>;
              })}
            </select>
          </Champ>
          <Champ label="Date">
            <input style={champ} type="date" value={form.dateEvenement || ''} disabled={fige} onChange={(e) => set('dateEvenement', e.target.value)} />
          </Champ>
          <Champ label="Heure">
            <input style={champ} type="time" value={form.heure || ''} disabled={fige} onChange={(e) => set('heure', e.target.value)} />
          </Champ>
          <Champ label="Personnes">
            <input style={champ} inputMode="numeric" value={form.nbPax} disabled={fige} onChange={(e) => set('nbPax', e.target.value.replace(/\D/g, ''))} />
          </Champ>
          <Champ label="Objet du devis">
            <input style={champ} value={form.titre} disabled={fige} placeholder={objetDocument(form)} onChange={(e) => set('titre', e.target.value)} />
          </Champ>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={sf.titreBloc}>Lignes</div>
          {!fige && (
            <button type="button" style={st.secondaire} onClick={reprendreMenu}>
              {form.lignes.length ? 'Reprendre les lignes du menu' : 'Remplir depuis le menu'}
            </button>
          )}
        </div>
        <LignesEditeur
          lignes={fige ? enBase.lignes : form.lignes}
          onChange={(l) => set('lignes', l)}
          lectureSeule={fige}
          assujettiTva={reglages.assujettiTva}
        />
        {!fige && lignesCalcul(form.lignes).some((l) => l.prixUnitaire === 0 && l.libelle) && (
          <div style={sf.encart('alerte')}>Une ligne a un prix à zéro : complétez-la ou retirez-la avant l'envoi.</div>
        )}

        <div className="fac-grille-2">
          <Champ label="Date du devis">
            <input style={champ} type="date" value={form.dateDevis || ''} disabled={fige} onChange={(e) => set('dateDevis', e.target.value)} />
          </Champ>
          <Champ label="Valable jusqu'au">
            <input style={champ} type="date" value={form.valideJusqu || ''} disabled={fige} onChange={(e) => set('valideJusqu', e.target.value)} />
          </Champ>
        </div>
        <Champ label="Conditions (acompte, annulation, nombre définitif de personnes)">
          <textarea
            style={zone} rows={3} value={form.conditions} disabled={fige}
            placeholder={reglages.conditions || 'Conditions générales de Réglages, Groupes : devis et factures'}
            onChange={(e) => set('conditions', e.target.value)}
          />
        </Champ>
        <Champ label="Notes internes (jamais sur le PDF)">
          {fige ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <textarea style={{ ...sf.zone, flex: '1 1 auto' }} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              {notes !== (enBase.notes || '') && <button type="button" style={st.secondaire} onClick={enregistrerNotes}>Enregistrer</button>}
            </div>
          ) : (
            <textarea style={sf.zone} rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          )}
        </Champ>

        {suivi && (suivi.factures.length > 0 || fige) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={sf.titreBloc}>Facturation</div>
            <div style={sf.ligneTotal}>
              <span>
                Facturé <span data-no-translate>CHF {chf(suivi.facture)}</span>, encaissé <span data-no-translate>CHF {chf(suivi.encaisse)}</span>
                {suivi.prevu > 0 ? <>, prévu <span data-no-translate>CHF {chf(suivi.prevu)}</span></> : null}
              </span>
              <span>Reste à facturer <span style={sf.chiffre} data-no-translate>CHF {chf(suivi.resteAFacturer)}</span></span>
            </div>
            {suivi.factures.slice().sort((a, b) => a.ordre - b.ordre).map((f) => {
              const e = etatFacture(f, facturation.paiements, aujourdhui);
              return (
                <button key={f.id} type="button" style={{ ...sf.boutonLigne, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)' }} onClick={() => onOuvrirFacture(f)}>
                  <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 'var(--t2)', fontWeight: 'var(--g2)' }}>
                      <span data-no-translate>{f.numero || ''}</span>{f.numero ? ', ' : ''}{f.libelle || 'Facture'}
                    </span>
                    {f.echeance && <span style={{ display: 'block', fontSize: 'var(--t1)', color: 'var(--text2)' }}>Échéance <span data-no-translate>{dateFr(f.echeance)}</span></span>}
                  </span>
                  <span style={{ ...sf.chiffre, fontSize: 'var(--t2)' }} data-no-translate>{chf(f.montant)}</span>
                  <Pastille ton={TON_FACTURE[e.etat]}>{ETATS_FACTURE[e.etat].label}</Pastille>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {accepter && (
        <AccepterDevis
          devis={enBase}
          ctx={ctx}
          dejaAccepte={fige}
          onClose={() => setAccepter(false)}
        />
      )}
    </Fenetre>
  );
}

// ── Accepté : créer le groupe, le relier, ou accepter seul ──────────────────
function AccepterDevis({ devis, ctx, dejaAccepte, onClose }) {
  const { facturation } = ctx;
  const peutCreer = ctx.canEditGroupes && devis.dateEvenement && devis.typeGroupe && Number(devis.nbPax) > 0;
  const proches = useMemo(() => ctx.groupes
    .filter((g) => !g.annule)
    .sort((a, b) => {
      const ref = devis.dateEvenement || ctx.aujourdhui;
      const d = (x) => Math.abs(new Date(x.dateEvenement) - new Date(ref));
      return d(a) - d(b);
    })
    .slice(0, 30), [ctx.groupes, ctx.aujourdhui, devis.dateEvenement]);
  const [choix, setChoix] = useState(peutCreer ? 'creer' : (proches.length ? 'relier' : 'sans'));
  const [groupeId, setGroupeId] = useState(proches[0]?.id || '');
  const [enCours, setEnCours] = useState(false);

  async function valider() {
    setEnCours(true);
    try {
      let gid = null;
      if (choix === 'creer') {
        const r = await ctx.creerGroupe({
          dateEvenement: devis.dateEvenement, heure: devis.heure || '', typeGroupe: devis.typeGroupe,
          menuNumero: devis.menuNumero || null, nom: devis.clientNom,
          contact: [devis.clientContact, devis.clientTelephone || devis.clientEmail].filter(Boolean).join(', '),
          nbPax: Number(devis.nbPax), allergenesIds: [], allergiesNote: '', modifications: '',
          commentaires: `Devis ${devis.numero}`,
        });
        if (r.error) { notify(r.error, 'error'); return; }
        gid = r.data.id;
      } else if (choix === 'relier') {
        gid = groupeId || null;
      }
      if (gid) {
        const r = await facturation.relierDevis(devis.id, gid);
        if (r.error) { notify(r.error, 'error'); return; }
      }
      if (!dejaAccepte) {
        const r = await facturation.changerStatutDevis(devis.id, 'accepte');
        if (r.error) { notify(r.error, 'error'); return; }
      }
      notify(choix === 'creer' ? 'Devis accepté, groupe ajouté au calendrier.' : 'Devis accepté.', 'success');
      onClose();
    } finally { setEnCours(false); }
  }

  const options = [
    peutCreer ? {
      v: 'creer', label: 'Créer le groupe au calendrier',
      detail: `${libelleGroupe(devis.typeGroupe, devis.menuNumero)}, ${dateFr(devis.dateEvenement)}, ${devis.nbPax} personnes. Il arrive en cuisine (à lire) et dans Réservations.`,
    } : null,
    proches.length ? { v: 'relier', label: 'Relier à un groupe déjà au calendrier' } : null,
    !dejaAccepte ? { v: 'sans', label: 'Accepter sans groupe pour l\'instant', detail: 'Le groupe se relie plus tard, depuis le devis.' } : null,
  ];

  return (
    <Fenetre
      id="groupes-devis-accepter" titre={dejaAccepte ? 'Relier le devis à un groupe' : 'Devis accepté'}
      sousTitre={devis.clientNom} onClose={onClose}
      pied={<button type="button" style={st.primaire} onClick={valider} disabled={enCours || (choix === 'relier' && !groupeId)}>Valider</button>}
    >
      {!peutCreer && ctx.canEditGroupes && (
        <div style={sf.encart('info')}>Pour créer le groupe, le devis doit porter le type, la date et le nombre de personnes.</div>
      )}
      <Options nom="accepter" valeur={choix} onChange={setChoix} options={options} />
      {choix === 'relier' && (
        <Champ label="Groupe">
          <select data-no-translate style={sf.champ} value={groupeId} onChange={(e) => setGroupeId(e.target.value)}>
            {proches.map((g) => (
              <option key={g.id} value={g.id}>{`${dateFr(g.dateEvenement)}, ${libelleGroupe(g.typeGroupe, g.menuNumero)}, ${g.nom}, ${g.nbPax} pax`}</option>
            ))}
          </select>
        </Champ>
      )}
    </Fenetre>
  );
}
