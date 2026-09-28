import { useMemo, useState } from 'react';
import { Gift, Search, Ticket } from 'lucide-react';
import { notify } from '../../components/toast/index.js';
import { makeSearchMatcher } from '../../utils/searchText.js';
import BonCarte, { etatBon } from './BonCarte.jsx';
import { EtatVide, dateLongue, nomClient, st } from './spaUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Tous les bons cadeaux émis. Le client arrive avec un code : on le tape (avec
// ou sans tirets), le bon apparaît, on le marque utilisé. Un bon expiré reste
// visible et peut être accepté quand même, après confirmation.
// ─────────────────────────────────────────────────────────────────────────────

const FILTRES = [
  { id: 'valable', label: 'Valables' },
  { id: 'utilise', label: 'Utilisés' },
  { id: 'expire', label: 'Expirés' },
  { id: 'tous', label: 'Tous' },
];

export default function BonsSpa({ bons, status, clientsParId, aujourdhui, onModifier, onOuvrirClient }) {
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState('valable');

  const compte = useMemo(() => {
    const c = { valable: 0, utilise: 0, expire: 0, tous: bons.length };
    for (const b of bons) c[etatBon(b, aujourdhui).id] += 1;
    return c;
  }, [bons, aujourdhui]);

  const visibles = useMemo(() => {
    const match = makeSearchMatcher(recherche.replace(/-/g, ' '));
    return bons
      .filter((b) => {
        const c = clientsParId.get(b.clientId);
        return match(b.code.replace(/-/g, ' '), b.code, c?.prenom, c?.nom, b.valeur);
      })
      // Une recherche (un code tapé au comptoir) cherche dans tous les bons.
      .filter((b) => recherche.trim() || filtre === 'tous' || etatBon(b, aujourdhui).id === filtre)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }, [bons, recherche, filtre, clientsParId, aujourdhui]);

  async function basculer(b) {
    const utilise = !b.utiliseAt;
    if (!utilise && !window.confirm(`Remettre le bon ${b.code} comme non utilisé ?`)) return;
    if (utilise && etatBon(b, aujourdhui).id === 'expire'
      && !window.confirm(`Ce bon a expiré le ${dateLongue(b.valableJusqu)}. Le marquer utilisé quand même ?`)) return;
    const { error } = await onModifier(b.id, { utilise_at: utilise ? new Date().toISOString() : null });
    if (error) { notify(error, 'error'); return; }
    notify(utilise ? `Bon ${b.code} marqué utilisé.` : 'Bon de nouveau disponible.', 'success');
  }

  return (
    <div>
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <Ticket size={20} strokeWidth={1.8} aria-hidden="true" style={s.icone} />
        <input
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Saisir un code ou un nom"
          aria-label="Rechercher un bon par code ou par nom"
          style={{ ...st.champ, paddingLeft: 48, minHeight: 54, fontSize: 17, borderRadius: 999, background: 'var(--spa-surface)', letterSpacing: recherche ? '0.06em' : 'normal' }}
          autoComplete="off"
          autoCapitalize="characters"
        />
      </div>

      {!recherche.trim() && (
        <div className="spa-defile" style={{ display: 'flex', gap: 8, paddingBottom: 4, marginBottom: 16 }}>
          {FILTRES.map((f) => (
            <button key={f.id} type="button" aria-pressed={filtre === f.id} onClick={() => setFiltre(f.id)} style={{ ...st.choix, flexShrink: 0, ...(filtre === f.id ? st.choixActif : null) }}>
              {f.label} <span style={{ opacity: 0.7, fontWeight: 500 }}>{compte[f.id]}</span>
            </button>
          ))}
        </div>
      )}

      {status === 'error' && <div style={{ ...st.encartDanger, marginBottom: 12 }}>Les bons ne se sont pas chargés. Vérifiez la connexion internet.</div>}
      {status === 'ready' && !bons.length && (
        <EtatVide
          icone={Gift}
          titre="Aucun bon pour l'instant"
          texte="Les bons d'anniversaire partent tout seuls une fois activés dans l'onglet E-mails. Pour offrir un bon, ouvrez la fiche du client."
        />
      )}
      {status === 'ready' && bons.length > 0 && !visibles.length && (
        <EtatVide icone={Search} texte={recherche.trim() ? 'Aucun bon ne correspond à ce code.' : 'Aucun bon dans cette catégorie.'} />
      )}

      <div style={s.grille}>
        {visibles.map((b) => {
          const c = clientsParId.get(b.clientId);
          return (
            <BonCarte
              key={b.id}
              bon={b}
              aujourdhui={aujourdhui}
              nomClient={c ? nomClient(c) : null}
              onClient={c ? () => onOuvrirClient(c) : null}
              onBasculer={() => basculer(b)}
            />
          );
        })}
      </div>
    </div>
  );
}

const s = {
  icone: { position: 'absolute', left: 18, top: '50%', marginTop: -10, color: 'var(--spa-kin)', pointerEvents: 'none' },
  grille: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 16 },
};
