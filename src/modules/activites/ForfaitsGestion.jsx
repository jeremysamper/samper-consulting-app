import React from 'react';
import { Plus } from 'lucide-react';
import { Btn } from '../../components/ui/index.jsx';
import { Fenetre, st } from '../../components/ui/Fenetres.jsx';
import { notify } from '../../components/toast/index.js';
import { Puce } from '../dashboard/tableauUi.jsx';
import { Champ, Liste, Vide, h } from '../hebergement/hotelUi.jsx';
import { CATEGORIES_DROIT, chf, libelleDe } from '../hebergement/hotelData.js';

// ─────────────────────────────────────────────────────────────────────────────
// Forfaits (lot H5), direction seulement : une formule (all inclusive, spa,
// famille…), son prix par nuit facultatif, et ses droits (ce qu'elle donne,
// avec une quantité par séjour ou par jour). La base refuse l'écriture aux
// autres rôles (policies consultant et patron).
// ─────────────────────────────────────────────────────────────────────────────

const forfaitVide = () => ({ nom: '', description: '', prixParNuit: '', actif: true, ordre: 0 });
const droitVide = () => ({ libelle: '', categorie: 'boissons', quantiteParSejour: '', quantiteParJour: '' });

function ForfaitForm({ forfait, forfaits, droits, onClose }) {
  const [f, setF] = React.useState(() => (forfait ? { ...forfait, prixParNuit: forfait.prixParNuit ? String(forfait.prixParNuit) : '' } : forfaitVide()));
  const [d, setD] = React.useState(droitVide);
  const [erreur, setErreur] = React.useState('');
  const [enCours, setEnCours] = React.useState(false);
  const champ = (k) => (ev) => setF((p) => ({ ...p, [k]: ev.target.value }));
  const champD = (k) => (ev) => setD((p) => ({ ...p, [k]: ev.target.value }));
  const mesDroits = forfait ? droits.rows.filter((x) => x.forfaitId === forfait.id) : [];

  const enregistrer = async () => {
    setErreur('');
    if (!f.nom.trim()) { setErreur('Le nom du forfait est obligatoire.'); return; }
    setEnCours(true);
    const valeurs = { nom: f.nom.trim(), description: f.description.trim() || null, prix_par_nuit: Number(String(f.prixParNuit).replace(',', '.')) || 0, actif: !!f.actif, ordre: parseInt(f.ordre, 10) || 0 };
    const res = forfait ? await forfaits.modifier(forfait.id, valeurs) : await forfaits.inserer(valeurs);
    setEnCours(false);
    if (res.error) { setErreur(res.error); return; }
    notify(forfait ? 'Forfait modifié.' : 'Forfait créé. Ajoute maintenant ses droits.', 'success');
    onClose(res.data);
  };
  const ajouterDroit = async () => {
    setErreur('');
    if (!d.libelle.trim()) { setErreur('Le libellé du droit est obligatoire.'); return; }
    setEnCours(true);
    const r = await droits.inserer({
      forfait_id: forfait.id, libelle: d.libelle.trim(), categorie: d.categorie,
      quantite_par_sejour: String(d.quantiteParSejour).trim() === '' ? null : Math.max(1, parseInt(d.quantiteParSejour, 10) || 1),
      quantite_par_jour: String(d.quantiteParJour).trim() === '' ? null : Math.max(1, parseInt(d.quantiteParJour, 10) || 1),
      ordre: mesDroits.length + 1,
    });
    setEnCours(false);
    if (r.error) { setErreur(r.error); return; }
    notify('Droit ajouté.', 'success');
    setD(droitVide());
  };

  return (
    <Fenetre
      id="forfait-form"
      titre={forfait ? 'Modifier le forfait' : 'Nouveau forfait'}
      onClose={() => onClose(null)}
      largeur={620}
      pied={(
        <>
          <button type="button" style={st.secondaire} onClick={() => onClose(null)}>Fermer</button>
          <button type="button" style={st.primaire} onClick={enregistrer} disabled={enCours}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</button>
        </>
      )}
    >
      <div style={h.grille}>
        <Champ label="Nom du forfait" large><input style={h.saisie} value={f.nom} onChange={champ('nom')} placeholder="All inclusive, Spa et bien-être, Famille…" autoFocus /></Champ>
        <Champ label="Prix par nuit (CHF, 0 = compris dans le tarif)"><input type="number" min="0" step="0.05" inputMode="decimal" style={h.saisie} value={f.prixParNuit} onChange={champ('prixParNuit')} /></Champ>
        <Champ label="Ordre d'affichage"><input type="number" inputMode="numeric" style={h.saisie} value={f.ordre} onChange={champ('ordre')} /></Champ>
        <Champ label="Description" large><textarea style={{ ...h.saisie, minHeight: 56 }} value={f.description} onChange={champ('description')} placeholder="Ce que l'hôte reçoit, en une phrase." /></Champ>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!f.actif} onChange={(ev) => setF((p) => ({ ...p, actif: ev.target.checked }))} style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
        <span style={{ fontSize: 14, color: 'var(--text)' }}>Forfait actif</span>
      </label>

      {forfait && (
        <div>
          <div style={h.sousTitre}>Droits du forfait</div>
          {!mesDroits.length && <div style={h.detail}>Aucun droit pour l'instant : ajoute ce que la formule donne.</div>}
          {mesDroits.map((x) => (
            <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '6px 0', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)' }}>
              <span style={{ flex: '1 1 160px', minWidth: 0, fontSize: 14, color: 'var(--text)' }} data-no-translate>{x.libelle}</span>
              <Puce ton="neutre">{libelleDe(CATEGORIES_DROIT, x.categorie)}</Puce>
              <span style={h.detail}>
                {x.quantiteParSejour != null && <><span data-no-translate>{x.quantiteParSejour}</span> <span>par séjour</span></>}
                {x.quantiteParSejour != null && x.quantiteParJour != null && ', '}
                {x.quantiteParJour != null && <><span data-no-translate>{x.quantiteParJour}</span> <span>par jour</span></>}
                {x.quantiteParSejour == null && x.quantiteParJour == null && <span>sans limite</span>}
              </span>
              <button type="button" className="ui-btn ui-btn--ghost" style={{ minHeight: 32, padding: '4px 8px', fontSize: 12 }} onClick={async () => { const r = await droits.supprimer(x.id); if (r.error) setErreur(r.error); else notify('Droit retiré.', 'success'); }}>Retirer</button>
            </div>
          ))}
          <div style={{ ...h.grille, marginTop: 10 }}>
            <Champ label="Nouveau droit" large><input style={h.saisie} value={d.libelle} onChange={champD('libelle')} placeholder="Boissons au bar, massage de 50 minutes, vélo…" /></Champ>
            <Champ label="Catégorie">
              <select style={h.saisie} value={d.categorie} onChange={champD('categorie')}>
                {CATEGORIES_DROIT.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </Champ>
            <Champ label="Quantité par séjour (vide = sans limite)"><input type="number" min="1" inputMode="numeric" style={h.saisie} value={d.quantiteParSejour} onChange={champD('quantiteParSejour')} /></Champ>
            <Champ label="Quantité par jour (vide = sans limite)"><input type="number" min="1" inputMode="numeric" style={h.saisie} value={d.quantiteParJour} onChange={champD('quantiteParJour')} /></Champ>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" style={st.secondaire} onClick={ajouterDroit} disabled={enCours}>Ajouter le droit</button>
          </div>
        </div>
      )}
      {erreur && <div style={h.erreur} role="alert">{erreur}</div>}
    </Fenetre>
  );
}

export default function ForfaitsGestion({ forfaits, droits }) {
  const [form, setForm] = React.useState(null); // { forfait }
  const nbDroits = (f) => droits.rows.filter((x) => x.forfaitId === f.id).length;
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
      <div className="module-actions">
        <Btn variant="primary" onClick={() => setForm({ forfait: null })} style={{ minHeight: 48, padding: '10px 16px', fontSize: 14 }}>
          <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
          <span>Nouveau forfait</span>
        </Btn>
      </div>
      {forfaits.status === 'absent' && <Vide>Les forfaits ne sont pas encore activés sur la base de données.</Vide>}
      {forfaits.status === 'ready' && !forfaits.rows.length && <Vide>Aucun forfait pour l'instant. Un forfait dit ce qu'un séjour reçoit : boissons, repas, spa, activités.</Vide>}
      {forfaits.rows.length > 0 && (
        <Liste>
          {forfaits.rows.map((f) => (
            <button key={f.id} type="button" className="tdb-lien" style={h.ligne} onClick={() => setForm({ forfait: f })} data-forfait={f.id}>
              <span style={h.ligneGauche}>
                <span style={h.nomHote} data-no-translate>{f.nom}</span>
                <span style={h.detail}>{f.description && <><span data-no-translate>{f.description}</span><span aria-hidden="true"> </span></>}<span>{nbDroits(f)}</span> <span>{nbDroits(f) > 1 ? 'droits' : 'droit'}</span></span>
              </span>
              <span style={h.ligneDroite}>
                {f.prixParNuit > 0 && <span style={{ ...h.chambre, fontFamily: 'var(--font-num)' }} data-no-translate>CHF {chf(f.prixParNuit)}</span>}
                {!f.actif && <Puce ton="neutre">Inactif</Puce>}
              </span>
            </button>
          ))}
        </Liste>
      )}
      {form && <ForfaitForm forfait={form.forfait} forfaits={forfaits} droits={droits} onClose={(cree) => setForm(cree && !form.forfait ? { forfait: cree } : null)} />}
    </section>
  );
}
