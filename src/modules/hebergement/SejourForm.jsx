import React from 'react';
import { Fenetre, st } from '../../components/ui/Fenetres.jsx';
import { zurichAjouterJours } from '../../utils/zurichTime.js';
import { Champ, h } from './hotelUi.jsx';
import { PENSIONS, chf, dateCourte, sejourEnConflit, tarifsApplicables, trierChambres } from './hotelData.js';

// ─────────────────────────────────────────────────────────────────────────────
// Créer ou modifier un séjour. La chambre est facultative (elle s'affecte aussi
// depuis la fiche) ; une chambre déjà prise sur ces nuitées est refusée avant
// l'envoi, avec le séjour qui gêne, et la base refuse de même (déclencheur).
// ─────────────────────────────────────────────────────────────────────────────

const vide = (aujourdhui) => ({
  nomHote: '', arrivee: aujourdhui, depart: zurichAjouterJours(aujourdhui, 1), nbAdultes: 2, nbEnfants: 0,
  pension: 'petit_dejeuner', chambreId: '', origine: '', demandesSpeciales: '', notes: '', tarifId: '', prixNuit: '', forfaitId: '', identifiant: '',
});

export default function SejourForm({ sejour, chambres, sejours, tarifs = [], forfaits = [], aujourdhui, onEnregistrer, onClose }) {
  const [f, setF] = React.useState(() => (sejour
    ? { ...sejour, chambreId: sejour.chambreId || '', tarifId: sejour.tarifId || '', prixNuit: sejour.prixNuit == null ? '' : String(sejour.prixNuit), forfaitId: sejour.forfaitId || '', identifiant: sejour.identifiant || '' }
    : vide(aujourdhui)));
  const [erreur, setErreur] = React.useState('');
  const [enCours, setEnCours] = React.useState(false);
  const champ = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const nombre = (k) => (e) => setF((p) => ({ ...p, [k]: Math.max(0, parseInt(e.target.value, 10) || 0) }));

  const candidat = { ...f, id: sejour?.id, chambreId: f.chambreId || null, statut: sejour?.statut || 'prevu' };
  const conflit = sejourEnConflit(sejours, candidat);
  const chambresTriees = trierChambres(chambres.filter((c) => c.actif || c.id === f.chambreId));
  const libre = (c) => !sejourEnConflit(sejours, { ...candidat, chambreId: c.id });
  // Lot H4 : tarifs de la catégorie de la chambre choisie, valables à l'arrivée.
  const chambreChoisie = chambres.find((c) => c.id === f.chambreId) || null;
  const tarifsPossibles = tarifsApplicables(tarifs, { ...f, tarifId: f.tarifId || null }, chambreChoisie);
  const choisirTarif = (e) => {
    const t = tarifs.find((x) => x.id === e.target.value) || null;
    setF((p) => ({ ...p, tarifId: e.target.value, pension: t ? t.pension : p.pension }));
  };

  const enregistrer = async () => {
    setErreur('');
    if (!f.nomHote.trim()) { setErreur('Le nom de l\'hôte est obligatoire.'); return; }
    if (!f.arrivee || !f.depart || f.depart <= f.arrivee) { setErreur('Le départ doit suivre l\'arrivée d\'au moins une nuit.'); return; }
    if (conflit) {
      setErreur(`Chambre déjà prise du ${dateCourte(conflit.arrivee)} au ${dateCourte(conflit.depart)} (${conflit.nomHote}).`);
      return;
    }
    const prixNuit = String(f.prixNuit ?? '').trim() === '' ? null : Number(String(f.prixNuit).replace(',', '.'));
    if (prixNuit != null && !(prixNuit >= 0)) { setErreur('Le prix par nuit convenu doit être un montant positif.'); return; }
    setEnCours(true);
    const res = await onEnregistrer({
      nom_hote: f.nomHote.trim(),
      arrivee: f.arrivee,
      depart: f.depart,
      nb_adultes: f.nbAdultes,
      nb_enfants: f.nbEnfants,
      pension: f.pension,
      chambre_id: f.chambreId || null,
      tarif_id: f.tarifId || null,
      prix_nuit: prixNuit,
      forfait_id: f.forfaitId || null,
      identifiant: f.identifiant.trim() || null,
      origine: f.origine.trim() || null,
      demandes_speciales: f.demandesSpeciales.trim() || null,
      notes: f.notes.trim() || null,
    });
    setEnCours(false);
    if (res?.error) { setErreur(res.error); return; }
    onClose();
  };

  return (
    <Fenetre
      id="sejour-form"
      titre={sejour ? 'Modifier le séjour' : 'Nouveau séjour'}
      onClose={onClose}
      largeur={560}
      pied={(
        <>
          <button type="button" style={st.secondaire} onClick={onClose}>Annuler</button>
          <button type="button" style={st.primaire} onClick={enregistrer} disabled={enCours}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</button>
        </>
      )}
    >
      <div style={h.grille}>
        <Champ label="Nom de l'hôte" large>
          <input style={h.saisie} value={f.nomHote} onChange={champ('nomHote')} autoFocus />
        </Champ>
        <Champ label="Arrivée">
          <input type="date" style={h.saisie} value={f.arrivee} onChange={champ('arrivee')} />
        </Champ>
        <Champ label="Départ">
          <input type="date" style={h.saisie} value={f.depart} min={zurichAjouterJours(f.arrivee || aujourdhui, 1)} onChange={champ('depart')} />
        </Champ>
        <Champ label="Adultes">
          <input type="number" min="0" inputMode="numeric" style={h.saisie} value={f.nbAdultes} onChange={nombre('nbAdultes')} />
        </Champ>
        <Champ label="Enfants">
          <input type="number" min="0" inputMode="numeric" style={h.saisie} value={f.nbEnfants} onChange={nombre('nbEnfants')} />
        </Champ>
        <Champ label="Pension">
          <select style={h.saisie} value={f.pension} onChange={champ('pension')}>
            {PENSIONS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </Champ>
        <Champ label="Chambre">
          <select style={h.saisie} value={f.chambreId} onChange={champ('chambreId')}>
            <option value="">Pas encore affectée</option>
            {chambresTriees.map((c) => (
              <option key={c.id} value={c.id} disabled={!libre(c) && c.id !== f.chambreId}>
                {c.numero}{c.categorie ? ` (${c.categorie})` : ''}{libre(c) ? '' : ' : prise'}
              </option>
            ))}
          </select>
        </Champ>
        <Champ label="Tarif">
          <select style={h.saisie} value={f.tarifId} onChange={choisirTarif} data-no-translate>
            <option value="">{tarifs.length ? 'Aucun tarif' : 'Aucun tarif défini'}</option>
            {tarifsPossibles.map((t) => <option key={t.id} value={t.id}>{t.nom} (CHF {chf(t.prixNuit)})</option>)}
          </select>
        </Champ>
        <Champ label="Prix par nuit convenu (CHF)">
          <input type="number" min="0" step="0.05" inputMode="decimal" style={h.saisie} value={f.prixNuit} onChange={champ('prixNuit')} placeholder={f.tarifId ? 'Prix du tarif' : ''} />
        </Champ>
        {forfaits.length > 0 && (
          <Champ label="Forfait">
            <select style={h.saisie} value={f.forfaitId} onChange={champ('forfaitId')} data-no-translate>
              <option value="">{'Aucun forfait'}</option>
              {forfaits.filter((x) => x.actif || x.id === f.forfaitId).map((x) => <option key={x.id} value={x.id}>{x.nom}{x.prixParNuit ? ` (CHF ${chf(x.prixParNuit)} par nuit)` : ''}</option>)}
            </select>
          </Champ>
        )}
        <Champ label="Bracelet ou carte">
          <input style={h.saisie} value={f.identifiant} onChange={champ('identifiant')} placeholder="Numéro du bracelet ou de la carte" />
        </Champ>
        <Champ label="Origine">
          <input style={h.saisie} value={f.origine} onChange={champ('origine')} placeholder="Site, téléphone, agence…" />
        </Champ>
        <Champ label="Demandes spéciales" large>
          <textarea style={{ ...h.saisie, minHeight: 64 }} value={f.demandesSpeciales} onChange={champ('demandesSpeciales')} />
        </Champ>
        <Champ label="Notes" large>
          <textarea style={{ ...h.saisie, minHeight: 64 }} value={f.notes} onChange={champ('notes')} />
        </Champ>
      </div>
      {conflit && !erreur && (
        <div style={h.erreur} role="alert">
          <span>Chambre déjà prise du</span> <span>{dateCourte(conflit.arrivee)}</span> <span>au</span> <span>{dateCourte(conflit.depart)}</span> <span>par</span> <span data-no-translate>{conflit.nomHote}</span>.
        </div>
      )}
      {erreur && <div style={h.erreur} role="alert">{erreur}</div>}
    </Fenetre>
  );
}
