import React from 'react';
import { Pencil, Plus } from 'lucide-react';
import { Btn } from '../../components/ui/index.jsx';
import { Fenetre, st } from '../../components/ui/Fenetres.jsx';
import { Puce } from '../dashboard/tableauUi.jsx';
import { Champ, Liste, Vide, h } from './hotelUi.jsx';
import { STATUTS_MENAGE, libelleDe, tonDe, trierChambres } from './hotelData.js';

// ─────────────────────────────────────────────────────────────────────────────
// Les chambres de l'hôtel (consultant et patron) : liste par étage, création
// et modification de la fiche (numéro, étage, catégorie, capacité, ordre,
// active). Le statut de ménage se change dans Étages, pas ici.
// ─────────────────────────────────────────────────────────────────────────────

const vide = () => ({ numero: '', etage: '', categorie: '', capacite: 2, ordre: 0, actif: true, notes: '' });

function ChambreForm({ chambre, onEnregistrer, onClose }) {
  const [f, setF] = React.useState(() => (chambre ? { ...chambre } : vide()));
  const [erreur, setErreur] = React.useState('');
  const [enCours, setEnCours] = React.useState(false);
  const champ = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const nombre = (k, min) => (e) => setF((p) => ({ ...p, [k]: Math.max(min, parseInt(e.target.value, 10) || 0) }));

  const enregistrer = async () => {
    setErreur('');
    if (!String(f.numero).trim()) { setErreur('Le numéro est obligatoire.'); return; }
    setEnCours(true);
    const res = await onEnregistrer({
      numero: String(f.numero).trim(),
      etage: f.etage.trim() || null,
      categorie: f.categorie.trim() || null,
      capacite: Math.max(1, f.capacite),
      ordre: f.ordre,
      actif: f.actif !== false,
      notes: f.notes.trim() || null,
    });
    setEnCours(false);
    if (res?.error) { setErreur(res.error); return; }
    onClose();
  };

  return (
    <Fenetre
      id="chambre-form"
      titre={chambre ? 'Modifier la chambre' : 'Nouvelle chambre'}
      onClose={onClose}
      largeur={520}
      pied={(
        <>
          <button type="button" style={st.secondaire} onClick={onClose}>Annuler</button>
          <button type="button" style={st.primaire} onClick={enregistrer} disabled={enCours}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</button>
        </>
      )}
    >
      <div style={h.grille}>
        <Champ label="Numéro">
          <input style={h.saisie} value={f.numero} onChange={champ('numero')} autoFocus />
        </Champ>
        <Champ label="Étage">
          <input style={h.saisie} value={f.etage} onChange={champ('etage')} placeholder="1, 2, Rez…" />
        </Champ>
        <Champ label="Catégorie">
          <input style={h.saisie} value={f.categorie} onChange={champ('categorie')} placeholder="Double, Suite, Familiale…" />
        </Champ>
        <Champ label="Capacité">
          <input type="number" min="1" inputMode="numeric" style={h.saisie} value={f.capacite} onChange={nombre('capacite', 1)} />
        </Champ>
        <Champ label="Ordre d'affichage">
          <input type="number" min="0" inputMode="numeric" style={h.saisie} value={f.ordre} onChange={nombre('ordre', 0)} />
        </Champ>
        <Champ label="Notes" large>
          <textarea style={{ ...h.saisie, minHeight: 64 }} value={f.notes} onChange={champ('notes')} />
        </Champ>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer' }}>
        <input type="checkbox" checked={f.actif !== false} onChange={(e) => setF((p) => ({ ...p, actif: e.target.checked }))} style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
        <span style={{ fontSize: 14, color: 'var(--text)' }}>Chambre active (proposée pour les séjours)</span>
      </label>
      {erreur && <div style={h.erreur} role="alert">{erreur}</div>}
    </Fenetre>
  );
}

export default function ChambresGestion({ chambres, peutGerer, onCreer, onModifier }) {
  const [form, setForm] = React.useState(null); // { chambre: null | chambre }
  const triees = trierChambres(chambres.rows);
  const etages = [...new Set(triees.map((c) => c.etage || ''))];
  const enregistrer = (valeurs) => (form?.chambre ? onModifier(form.chambre.id, valeurs) : onCreer(valeurs));

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
      {peutGerer && (
        <div className="module-actions">
          <Btn variant="primary" onClick={() => setForm({ chambre: null })} style={{ minHeight: 48, padding: '10px 16px', fontSize: 14 }}>
            <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
            <span>Nouvelle chambre</span>
          </Btn>
        </div>
      )}
      {chambres.status === 'ready' && !triees.length && <Vide>Aucune chambre pour l'instant. Crée la première avec le bouton ci-dessus.</Vide>}
      {chambres.status === 'loading' && <Vide>Chargement…</Vide>}
      {chambres.status === 'error' && <Vide>Les chambres n'ont pas pu être lues. Nouvel essai en cours…</Vide>}
      {etages.map((etage) => (
        <div key={etage || 'sans'} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={h.sousTitre}>
            {etage ? <><span>Étage</span> <span data-no-translate>{etage}</span></> : <span>Sans étage</span>}
          </div>
          <Liste>
            {triees.filter((c) => (c.etage || '') === etage).map((c) => (
              <div key={c.id} style={{ ...h.ligne, cursor: 'default', opacity: c.actif ? 1 : 0.6 }} data-chambre={c.numero}>
                <span style={h.ligneGauche}>
                  <span style={h.nomHote} data-no-translate>{c.numero}</span>
                  <span style={h.detail}>
                    {c.categorie && <><span data-no-translate>{c.categorie}</span><span aria-hidden="true"> </span></>}
                    <span>{c.capacite}</span>
                    <span aria-hidden="true"> </span>
                    <span>{c.capacite > 1 ? 'personnes' : 'personne'}</span>
                    {!c.actif && <><span aria-hidden="true"> </span><span>(inactive)</span></>}
                  </span>
                </span>
                <span style={h.ligneDroite}>
                  <Puce ton={tonDe(STATUTS_MENAGE, c.statutMenage)}>{libelleDe(STATUTS_MENAGE, c.statutMenage)}</Puce>
                  {peutGerer && (
                    <Btn onClick={() => setForm({ chambre: c })} style={{ minHeight: 44 }} ariaLabel={`Modifier la chambre ${c.numero}`}>
                      <Pencil size={16} strokeWidth={1.75} aria-hidden="true" />
                      <span>Modifier</span>
                    </Btn>
                  )}
                </span>
              </div>
            ))}
          </Liste>
        </div>
      ))}
      {form && <ChambreForm chambre={form.chambre} onEnregistrer={enregistrer} onClose={() => setForm(null)} />}
    </section>
  );
}
