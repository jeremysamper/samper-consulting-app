import { st } from '../../../components/ui/Fenetres.jsx';
import { NUMERO_COMPLEMENTS } from '../typesGroupe.js';
import {
  ETATS_FACTURE, STATUTS_DEVIS, chf, dateFr, etatDevis, etatFacture, lignesDepuisGroupe,
} from './calculs.js';
import { Pastille, TON_DEVIS, TON_FACTURE, sf } from './ui.jsx';
import './facturation.css';

// Onglet « Devis et factures » de la fiche d'un groupe : ce qui est relié à ce
// groupe, et un devis neuf prérempli (client, événement, lignes du menu et des
// choix du client).

export function devisDepuisGroupe(groupe, ctx) {
  const contact = String(groupe.contact || '');
  const email = (contact.match(/[^\s,;]+@[^\s,;]+/) || [''])[0];
  const telephone = email ? contact.replace(email, '').replace(/[,;]\s*$/, '').trim() : contact;
  const menu = groupe.menuNumero ? ctx.menuDe(groupe.typeGroupe, groupe.menuNumero) : null;
  return {
    groupeEvenementId: groupe.id,
    clientNom: groupe.nom,
    clientEmail: email,
    clientTelephone: telephone,
    typeGroupe: groupe.typeGroupe,
    dateEvenement: groupe.dateEvenement,
    heure: groupe.heure || '',
    nbPax: groupe.nbPax,
    menuNumero: groupe.menuNumero || null,
    lignes: lignesDepuisGroupe({ groupe, menu, complements: ctx.menuDe(groupe.typeGroupe, NUMERO_COMPLEMENTS), menus: ctx.menus }),
  };
}

export default function FacturationDuGroupe({ groupe, ctx, fenetres }) {
  const { facturation, aujourdhui } = ctx;
  if (facturation.status === 'loading') return <p style={sf.remarque}>Chargement…</p>;
  if (facturation.status !== 'ready') return <p style={sf.remarque}>Devis et factures indisponibles pour l'instant.</p>;
  const devis = facturation.devis.filter((d) => d.groupeEvenementId === groupe.id);
  const idsDevis = new Set(devis.map((d) => d.id));
  const factures = facturation.factures
    .filter((f) => f.groupeEvenementId === groupe.id || (f.devisId && idsDevis.has(f.devisId)))
    .sort((a, b) => a.ordre - b.ordre);
  const ligne = { ...sf.boutonLigne, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={sf.titreBloc}>Devis</div>
        {!groupe.annule && (
          <button type="button" style={st.secondaire} onClick={() => fenetres.ouvrirDevis(devisDepuisGroupe(groupe, ctx))}>Nouveau devis</button>
        )}
      </div>
      {devis.length === 0 && <p style={sf.remarque}>Aucun devis pour ce groupe. Le devis reprend le menu et les choix du client.</p>}
      {devis.map((d) => {
        const e = etatDevis(d, aujourdhui);
        return (
          <button key={d.id} type="button" style={ligne} onClick={() => fenetres.ouvrirDevis(d)}>
            <span style={{ flex: '1 1 auto', minWidth: 0, fontSize: 'var(--t2)' }}>
              <span data-no-translate>{d.numero}</span>, du <span data-no-translate>{dateFr(d.dateDevis)}</span>
            </span>
            <span style={{ ...sf.chiffre, fontSize: 'var(--t2)' }} data-no-translate>{chf(d.total)}</span>
            <Pastille ton={TON_DEVIS[e]}>{STATUTS_DEVIS[e]?.label}</Pastille>
          </button>
        );
      })}

      {factures.length > 0 && <div style={sf.titreBloc}>Factures</div>}
      {factures.map((f) => {
        const e = etatFacture(f, facturation.paiements, aujourdhui);
        return (
          <button key={f.id} type="button" style={ligne} onClick={() => fenetres.ouvrirFacture(f)}>
            <span style={{ flex: '1 1 auto', minWidth: 0, fontSize: 'var(--t2)' }}>
              {f.numero ? <span data-no-translate>{f.numero}, </span> : null}{f.libelle || 'Facture'}
            </span>
            <span style={{ ...sf.chiffre, fontSize: 'var(--t2)' }} data-no-translate>{chf(f.montant)}</span>
            <Pastille ton={TON_FACTURE[e.etat]}>{ETATS_FACTURE[e.etat].label}</Pastille>
          </button>
        );
      })}
    </div>
  );
}
