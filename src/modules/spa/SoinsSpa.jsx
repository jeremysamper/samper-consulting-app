import { useState } from 'react';
import { Clock, Globe, Leaf, Pencil, Plus } from 'lucide-react';
import { notify } from '../../components/toast/index.js';
import { soinVersDB } from './spaData.js';
import { Champ, EtatVide, Modale, dureeLisible, formatPrix, st } from './spaUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// La carte des soins, présentée comme celle qu'on remet au client : par
// famille, le nom en grand, la durée et le prix. La durée est proposée à la
// prise de rendez-vous. Un soin retiré de la carte se désactive plutôt que de
// se supprimer : les rendez-vous passés gardent son nom (soin_libelle).
// ─────────────────────────────────────────────────────────────────────────────

export default function SoinsSpa({ soins, status, peutGerer, onInserer, onModifier, onSupprimer }) {
  const [edition, setEdition] = useState(null); // {} = nouveau

  const tries = [...soins].sort((a, b) => Number(b.actif) - Number(a.actif)
    || (a.categorie || '').localeCompare(b.categorie || '', 'fr') || a.nom.localeCompare(b.nom, 'fr'));
  const categories = [...new Set(tries.filter((x) => x.actif).map((x) => x.categorie || ''))];
  const retires = tries.filter((x) => !x.actif);

  async function basculer(soin) {
    const { error } = await onModifier(soin.id, { actif: !soin.actif });
    if (error) notify(error, 'error');
    else notify(soin.actif ? 'Soin retiré de la carte.' : 'Soin remis à la carte.', 'success');
  }

  return (
    <div>
      {peutGerer && soins.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button type="button" onClick={() => setEdition({})} style={st.secondaire}>
            <Plus size={17} strokeWidth={2} aria-hidden="true" /> Ajouter un soin
          </button>
        </div>
      )}
      {status === 'error' && <div style={{ ...st.encartDanger, marginBottom: 12 }}>Lecture des soins impossible (connexion ?).</div>}
      {status === 'ready' && !soins.length && (
        <EtatVide
          icone={Leaf}
          titre="La carte des soins est vide"
          texte={peutGerer
            ? 'Ajoute les soins proposés : leur durée sera proposée à chaque réservation.'
            : 'La direction ou la réception peut la composer.'}
          action={peutGerer && (
            <button type="button" onClick={() => setEdition({})} style={{ ...st.principal, marginTop: 6 }}>
              <Plus size={17} strokeWidth={2} aria-hidden="true" /> Premier soin
            </button>
          )}
        />
      )}

      {categories.map((cat) => (
        <section key={cat || 'sans'} style={{ marginBottom: 26 }}>
          <div style={s.categorie}>
            <span style={s.categorieNom}>{cat || (categories.length > 1 ? 'Autres soins' : 'Nos soins')}</span>
            <span aria-hidden="true" style={s.filet} />
          </div>
          <div style={s.grille}>
            {tries.filter((x) => x.actif && (x.categorie || '') === cat).map((x) => (
              <CarteSoin key={x.id} soin={x} peutGerer={peutGerer} onModifier={() => setEdition(x)} onBasculer={() => basculer(x)} />
            ))}
          </div>
        </section>
      ))}

      {retires.length > 0 && (
        <section style={{ marginTop: 8 }}>
          <div style={s.categorie}>
            <span style={{ ...s.categorieNom, fontSize: 16, color: 'var(--spa-ink2)' }}>Retirés de la carte</span>
            <span aria-hidden="true" style={s.filet} />
          </div>
          <div style={s.grille}>
            {retires.map((x) => (
              <CarteSoin key={x.id} soin={x} peutGerer={peutGerer} onModifier={() => setEdition(x)} onBasculer={() => basculer(x)} />
            ))}
          </div>
        </section>
      )}

      {edition && (
        <SoinForm
          soin={edition.id ? edition : null}
          categories={[...new Set(soins.map((x) => x.categorie).filter(Boolean))]}
          onSave={(v) => (edition.id ? onModifier(edition.id, soinVersDB(v)) : onInserer(soinVersDB(v)))}
          onSupprimer={edition.id ? () => onSupprimer(edition.id) : null}
          onClose={() => setEdition(null)}
        />
      )}
    </div>
  );
}

function CarteSoin({ soin, peutGerer, onModifier, onBasculer }) {
  return (
    <article style={{ ...s.carte, opacity: soin.actif ? 1 : 0.6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <h4 style={s.nom} data-no-translate>{soin.nom}</h4>
        {soin.prix !== null && <span style={s.prix}>{formatPrix(soin.prix)}</span>}
      </div>
      {soin.description && <p style={s.description} data-no-translate>{soin.description}</p>}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 'auto' }}>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <span style={{ ...st.puce, background: 'var(--spa-mizu-soft)', color: 'var(--spa-mizu)' }}>
            <Clock size={13} strokeWidth={2} aria-hidden="true" /> {dureeLisible(soin.dureeMin)}
          </span>
          {soin.actif && soin.enLigne && (
            <span style={{ ...st.puce, background: 'var(--spa-kin-soft)', color: 'var(--spa-kin)' }}>
              <Globe size={13} strokeWidth={2} aria-hidden="true" /> En ligne
            </span>
          )}
        </span>
        {peutGerer && (
          <span style={{ display: 'flex', gap: 2 }}>
            <button type="button" onClick={onBasculer} style={{ ...st.discret, minHeight: 38, padding: '6px 10px', fontSize: 13 }}>
              {soin.actif ? 'Retirer' : 'Remettre'}
            </button>
            <button type="button" onClick={onModifier} aria-label={`Modifier ${soin.nom}`} style={{ ...st.discret, minHeight: 38, padding: '6px 10px', fontSize: 13 }}>
              <Pencil size={15} strokeWidth={1.8} aria-hidden="true" /> Modifier
            </button>
          </span>
        )}
      </div>
    </article>
  );
}

function SoinForm({ soin, categories, onSave, onSupprimer, onClose }) {
  const [form, setForm] = useState(() => ({
    nom: soin?.nom || '', categorie: soin?.categorie || '', dureeMin: soin?.dureeMin || 60,
    prix: soin?.prix ?? '', description: soin?.description || '', actif: soin?.actif !== false,
    enLigne: soin?.enLigne !== false,
  }));
  const [enCours, setEnCours] = useState(false);
  const set = (cle, valeur) => setForm((p) => ({ ...p, [cle]: valeur }));

  async function enregistrer() {
    if (!form.nom.trim()) { notify('Le nom du soin est obligatoire.', 'error'); return; }
    const d = Number(form.dureeMin);
    if (!Number.isFinite(d) || d < 5 || d > 600) { notify('Durée invalide (5 à 600 minutes).', 'error'); return; }
    setEnCours(true);
    try {
      const { error } = await onSave(form);
      if (error) { notify(error, 'error'); return; }
      notify(soin ? 'Soin modifié.' : 'Soin ajouté à la carte.', 'success');
      onClose();
    } finally {
      setEnCours(false);
    }
  }

  async function supprimer() {
    if (!window.confirm(`Supprimer « ${soin.nom} » de la carte ? Les rendez-vous déjà pris gardent son nom.`)) return;
    const { error } = await onSupprimer();
    if (error) { notify(error, 'error'); return; }
    notify('Soin supprimé.', 'success');
    onClose();
  }

  return (
    <Modale
      surTitre="Carte des soins"
      titre={soin ? 'Modifier le soin' : 'Nouveau soin'}
      onClose={onClose}
      largeur={500}
      pied={(
        <>
          {onSupprimer && <button type="button" onClick={supprimer} style={{ ...st.danger, marginRight: 'auto' }}>Supprimer</button>}
          <button type="button" onClick={onClose} style={st.discret}>Fermer</button>
          <button type="button" onClick={enregistrer} disabled={enCours} style={{ ...st.principal, opacity: enCours ? 0.6 : 1 }}>Enregistrer</button>
        </>
      )}
    >
      <Champ label="Nom" htmlFor="soin-nom">
        <input id="soin-nom" style={st.champ} value={form.nom} onChange={(e) => set('nom', e.target.value)} placeholder="Ex. Massage aux pierres chaudes" autoComplete="off" />
      </Champ>
      <Champ label="Famille" htmlFor="soin-cat" aide="Massages, visage, rituels, en duo…">
        {categories.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {categories.map((c) => (
              <button key={c} type="button" aria-pressed={form.categorie === c} onClick={() => set('categorie', form.categorie === c ? '' : c)} style={{ ...st.choix, minHeight: 36, ...(form.categorie === c ? st.choixActif : null) }}>
                <span data-no-translate>{c}</span>
              </button>
            ))}
          </div>
        )}
        <input id="soin-cat" style={st.champ} value={form.categorie} onChange={(e) => set('categorie', e.target.value)} autoComplete="off" />
      </Champ>
      <div style={st.grille2}>
        <Champ label="Durée (minutes)" htmlFor="soin-duree">
          <input id="soin-duree" type="number" min={5} max={600} step={5} inputMode="numeric" style={st.champ} value={form.dureeMin} onChange={(e) => set('dureeMin', e.target.value)} />
        </Champ>
        <Champ label="Prix (CHF)" htmlFor="soin-prix">
          <input id="soin-prix" type="number" min={0} step="0.5" inputMode="decimal" style={st.champ} value={form.prix} onChange={(e) => set('prix', e.target.value)} />
        </Champ>
      </div>
      <Champ label="Description" htmlFor="soin-desc" aide="Quelques mots, comme sur la carte remise au client (affichés aussi en ligne).">
        <textarea id="soin-desc" style={st.zone} value={form.description} onChange={(e) => set('description', e.target.value)} />
      </Champ>
      <label style={st.caseLabel}>
        <input type="checkbox" checked={form.enLigne} onChange={(e) => set('enLigne', e.target.checked)} style={st.case} />
        <span>
          <strong>Réservable en ligne</strong>
          <span style={{ display: 'block', fontSize: 13, color: 'var(--spa-ink2)' }}>Proposé sur le site du spa, si la réservation en ligne est ouverte.</span>
        </span>
      </label>
    </Modale>
  );
}

const s = {
  categorie: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 },
  categorieNom: { fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--spa-ink)', whiteSpace: 'nowrap' },
  filet: { flex: '1 1 auto', height: 1, background: 'var(--spa-line)' },
  grille: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 14 },
  carte: {
    display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, minHeight: 130,
    padding: '18px 18px 14px', borderRadius: 'var(--spa-r)', background: 'var(--spa-surface)',
    border: '1px solid var(--spa-line)', boxShadow: 'var(--spa-shadow)',
  },
  nom: { margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 19, lineHeight: 1.25, color: 'var(--spa-ink)' },
  prix: { fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--spa-kin)', whiteSpace: 'nowrap' },
  description: { margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--spa-ink2)' },
};
