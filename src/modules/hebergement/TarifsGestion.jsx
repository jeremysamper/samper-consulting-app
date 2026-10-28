import React from 'react';
import { Plus } from 'lucide-react';
import { Btn } from '../../components/ui/index.jsx';
import { Fenetre, st } from '../../components/ui/Fenetres.jsx';
import { notify } from '../../components/toast/index.js';
import { Puce } from '../dashboard/tableauUi.jsx';
import { Champ, Liste, Vide, h } from './hotelUi.jsx';
import { PENSIONS, REGLAGES_DEFAUT, chf, dateCourte, libelleDe } from './hotelData.js';

// ─────────────────────────────────────────────────────────────────────────────
// Tarifs et taxes (lot H4), direction seulement : les tarifs par nuit, et les
// réglages de l'hôtel (commune, taxe de séjour, taxe d'hébergement, TVA,
// numéro HESTA, mention de pied de la note). La base refuse l'écriture aux
// autres rôles (policies consultant et patron).
// ─────────────────────────────────────────────────────────────────────────────

const tarifVide = () => ({ nom: '', categorie: '', pension: 'petit_dejeuner', prixNuit: '', personnesIncluses: 2, prixPersonneSup: 0, prixEnfant: 0, valableDu: '', valableAu: '', actif: true, ordre: 0 });

function TarifForm({ tarif, categories, tarifs, onClose }) {
  const [f, setF] = React.useState(() => (tarif ? { ...tarif } : tarifVide()));
  const [erreur, setErreur] = React.useState('');
  const [enCours, setEnCours] = React.useState(false);
  const champ = (k) => (ev) => setF((p) => ({ ...p, [k]: ev.target.value }));
  const nombre = (v) => Number(String(v).replace(',', '.'));
  const enregistrer = async () => {
    setErreur('');
    if (!f.nom.trim()) { setErreur('Le nom du tarif est obligatoire.'); return; }
    if (!(nombre(f.prixNuit) >= 0)) { setErreur('Le prix par nuit est obligatoire.'); return; }
    setEnCours(true);
    const valeurs = {
      nom: f.nom.trim(), categorie: f.categorie.trim() || null, pension: f.pension, prix_nuit: nombre(f.prixNuit),
      personnes_incluses: Math.max(1, parseInt(f.personnesIncluses, 10) || 1), prix_personne_sup: nombre(f.prixPersonneSup) || 0, prix_enfant: nombre(f.prixEnfant) || 0,
      valable_du: f.valableDu || null, valable_au: f.valableAu || null, actif: !!f.actif, ordre: parseInt(f.ordre, 10) || 0,
    };
    const res = tarif ? await tarifs.modifier(tarif.id, valeurs) : await tarifs.inserer(valeurs);
    setEnCours(false);
    if (res.error) { setErreur(res.error); return; }
    notify(tarif ? 'Tarif modifié.' : 'Tarif créé.', 'success');
    onClose();
  };
  return (
    <Fenetre
      id="tarif-form"
      titre={tarif ? 'Modifier le tarif' : 'Nouveau tarif'}
      onClose={onClose}
      largeur={600}
      pied={(
        <>
          <button type="button" style={st.secondaire} onClick={onClose}>Annuler</button>
          <button type="button" style={st.primaire} onClick={enregistrer} disabled={enCours}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</button>
        </>
      )}
    >
      <div style={h.grille}>
        <Champ label="Nom du tarif" large><input style={h.saisie} value={f.nom} onChange={champ('nom')} placeholder="Double petit-déjeuner, Suite demi-pension…" autoFocus /></Champ>
        <Champ label="Catégorie de chambre">
          <input style={h.saisie} value={f.categorie} onChange={champ('categorie')} list="tarif-categories" placeholder="Toutes" />
          <datalist id="tarif-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </Champ>
        <Champ label="Pension">
          <select style={h.saisie} value={f.pension} onChange={champ('pension')}>
            {PENSIONS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </Champ>
        <Champ label="Prix par nuit (CHF)"><input type="number" min="0" step="0.05" inputMode="decimal" style={h.saisie} value={f.prixNuit} onChange={champ('prixNuit')} /></Champ>
        <Champ label="Personnes incluses"><input type="number" min="1" max="20" inputMode="numeric" style={h.saisie} value={f.personnesIncluses} onChange={champ('personnesIncluses')} /></Champ>
        <Champ label="Personne supplémentaire (CHF par nuit)"><input type="number" min="0" step="0.05" inputMode="decimal" style={h.saisie} value={f.prixPersonneSup} onChange={champ('prixPersonneSup')} /></Champ>
        <Champ label="Enfant (CHF par nuit)"><input type="number" min="0" step="0.05" inputMode="decimal" style={h.saisie} value={f.prixEnfant} onChange={champ('prixEnfant')} /></Champ>
        <Champ label="Valable du"><input type="date" style={h.saisie} value={f.valableDu} onChange={champ('valableDu')} /></Champ>
        <Champ label="Valable jusqu'au"><input type="date" style={h.saisie} value={f.valableAu} onChange={champ('valableAu')} /></Champ>
        <Champ label="Ordre d'affichage"><input type="number" inputMode="numeric" style={h.saisie} value={f.ordre} onChange={champ('ordre')} /></Champ>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!f.actif} onChange={(ev) => setF((p) => ({ ...p, actif: ev.target.checked }))} style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
        <span style={{ fontSize: 14, color: 'var(--text)' }}>Tarif actif</span>
      </label>
      {erreur && <div style={h.erreur} role="alert">{erreur}</div>}
    </Fenetre>
  );
}

function ReglagesForm({ reglages, etabId }) {
  const existant = reglages.rows[0] || null;
  const [f, setF] = React.useState(() => ({ ...REGLAGES_DEFAUT, ...(existant || {}) }));
  const [erreur, setErreur] = React.useState('');
  const [enCours, setEnCours] = React.useState(false);
  const version = existant?.updatedAt || '';
  React.useEffect(() => { if (existant) setF((p) => ({ ...p, ...existant })); }, [version]);
  const champ = (k) => (ev) => setF((p) => ({ ...p, [k]: ev.target.value }));
  const nombre = (v) => Number(String(v).replace(',', '.')) || 0;
  const enregistrer = async () => {
    setErreur('');
    setEnCours(true);
    const valeurs = {
      commune: String(f.commune || '').trim() || null, taxe_sejour_adulte: nombre(f.taxeSejourAdulte), taxe_sejour_enfant: nombre(f.taxeSejourEnfant),
      age_enfant_exonere: parseInt(f.ageEnfantExonere, 10) || 0, age_enfant_reduit: parseInt(f.ageEnfantReduit, 10) || 0,
      taxe_hebergement: nombre(f.taxeHebergement), tva_taux: nombre(f.tvaTaux), numero_hesta: String(f.numeroHesta || '').trim() || null, mention_note: String(f.mentionNote || '').trim() || null,
    };
    const res = existant ? await reglages.modifier(etabId, valeurs) : await reglages.inserer(valeurs);
    setEnCours(false);
    if (res.error) { setErreur(res.error); return; }
    notify('Réglages enregistrés.', 'success');
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={h.sousTitre}>Taxes et réglages de l'hôtel</div>
      <div style={h.grille}>
        <Champ label="Commune"><input style={h.saisie} value={f.commune} onChange={champ('commune')} /></Champ>
        <Champ label="Numéro HESTA (OFS)"><input style={h.saisie} value={f.numeroHesta} onChange={champ('numeroHesta')} /></Champ>
        <Champ label="Taxe de séjour, adulte (CHF par nuit)"><input type="number" min="0" step="0.05" inputMode="decimal" style={h.saisie} value={f.taxeSejourAdulte} onChange={champ('taxeSejourAdulte')} /></Champ>
        <Champ label="Taxe de séjour, enfant (CHF par nuit)"><input type="number" min="0" step="0.05" inputMode="decimal" style={h.saisie} value={f.taxeSejourEnfant} onChange={champ('taxeSejourEnfant')} /></Champ>
        <Champ label="Exonéré avant (ans)"><input type="number" min="0" max="18" inputMode="numeric" style={h.saisie} value={f.ageEnfantExonere} onChange={champ('ageEnfantExonere')} /></Champ>
        <Champ label="Tarif enfant avant (ans)"><input type="number" min="0" max="18" inputMode="numeric" style={h.saisie} value={f.ageEnfantReduit} onChange={champ('ageEnfantReduit')} /></Champ>
        <Champ label="Taxe d'hébergement cantonale (CHF par nuit)"><input type="number" min="0" step="0.05" inputMode="decimal" style={h.saisie} value={f.taxeHebergement} onChange={champ('taxeHebergement')} /></Champ>
        <Champ label="TVA hébergement (%)"><input type="number" min="0" step="0.1" inputMode="decimal" style={h.saisie} value={f.tvaTaux} onChange={champ('tvaTaux')} /></Champ>
        <Champ label="Mention au pied de la note" large><textarea style={{ ...h.saisie, minHeight: 56 }} value={f.mentionNote} onChange={champ('mentionNote')} placeholder="Merci de votre séjour. Taxes communales et cantonales incluses." /></Champ>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" style={st.primaire} onClick={enregistrer} disabled={enCours}>{enCours ? 'Enregistrement…' : 'Enregistrer les réglages'}</button>
      </div>
      {erreur && <div style={h.erreur} role="alert">{erreur}</div>}
    </div>
  );
}

export default function TarifsGestion({ tarifs, reglages, chambres, etabId }) {
  const [form, setForm] = React.useState(null); // { tarif }
  const categories = [...new Set(chambres.map((c) => c.categorie).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
      <div className="module-actions">
        <Btn variant="primary" onClick={() => setForm({ tarif: null })} style={{ minHeight: 48, padding: '10px 16px', fontSize: 14 }}>
          <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
          <span>Nouveau tarif</span>
        </Btn>
      </div>
      {tarifs.status === 'absent' && <Vide>Les tarifs ne sont pas encore activés sur la base de données.</Vide>}
      {tarifs.status === 'ready' && !tarifs.rows.length && <Vide>Aucun tarif pour l'instant. Un tarif donne le prix par nuit d'une catégorie de chambre.</Vide>}
      {tarifs.rows.length > 0 && (
        <Liste>
          {tarifs.rows.map((t) => (
            <button key={t.id} type="button" className="tdb-lien" style={h.ligne} onClick={() => setForm({ tarif: t })} data-tarif={t.id}>
              <span style={h.ligneGauche}>
                <span style={h.nomHote} data-no-translate>{t.nom}</span>
                <span style={h.detail}>
                  {t.categorie ? <span data-no-translate>{t.categorie}</span> : <span>Toutes catégories</span>}
                  <span aria-hidden="true"> </span><span>{libelleDe(PENSIONS, t.pension)}</span>
                  <span aria-hidden="true"> </span><span>{t.personnesIncluses}</span> <span>{t.personnesIncluses > 1 ? 'personnes incluses' : 'personne incluse'}</span>
                  {(t.valableDu || t.valableAu) && <> <span data-no-translate>({t.valableDu ? dateCourte(t.valableDu) : '…'} - {t.valableAu ? dateCourte(t.valableAu) : '…'})</span></>}
                </span>
              </span>
              <span style={h.ligneDroite}>
                <span style={{ ...h.chambre, fontFamily: 'var(--font-num)' }} data-no-translate>CHF {chf(t.prixNuit)}</span>
                {!t.actif && <Puce ton="neutre">Inactif</Puce>}
              </span>
            </button>
          ))}
        </Liste>
      )}
      {reglages.status !== 'absent' && <ReglagesForm reglages={reglages} etabId={etabId} />}
      {form && <TarifForm tarif={form.tarif} categories={categories} tarifs={tarifs} onClose={() => setForm(null)} />}
    </section>
  );
}
