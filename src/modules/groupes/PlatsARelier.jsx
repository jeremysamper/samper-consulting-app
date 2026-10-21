import { useMemo, useState } from 'react';
import { notify } from '../../components/toast/index.js';
import { makeSearchMatcher } from '../../utils/searchText.js';
import { SAISONS, cleLibelle, cleLiaison, ligneReliee, metaSaison, propagerLiaison } from './choixMenu.js';
import SelecteurFiche, { liaisonDeValeur, valeurLiaison } from './SelecteurFiche.jsx';
import { NUMERO_COMPLEMENTS, metaType, plurielSection } from './typesGroupe.js';

// ─────────────────────────────────────────────────────────────────────────────
// Plats à relier : chaque plat des menus de groupe, une seule fois par
// saison, avec le nombre de menus qui le servent. Le relier ici à son plat de
// la carte ou à sa fiche technique le relie dans TOUS les menus qui portent
// le même libellé à la même saison : « même plat qu'au mariage à 95 » se
// relie une fois. Un libellé servi en plusieurs saisons (« Mini tartelette de
// saison ») a une entrée par saison, saison affichée : chacune vise sa fiche
// (voir cleLiaison dans choixMenu.js).
//
// C'est la liaison qui fait la liste de courses : un plat non relié s'imprime
// sur le menu mais se commande à la main, et ses allergènes restent non
// vérifiés. La liste s'ouvre donc sur ce qui reste à relier, les plus servis
// en tête.
// ─────────────────────────────────────────────────────────────────────────────

// Été, hiver, puis toute l'année.
const rangSaison = (id) => {
  const i = SAISONS.findIndex((s) => s.id === id);
  return i < 0 ? SAISONS.length : i;
};

export default function PlatsARelier({ menus, plats, recettes, enregistrerPlusieurs }) {
  const [recherche, setRecherche] = useState('');
  const [tous, setTous] = useState(false);
  const [enCours, setEnCours] = useState(null); // clé en cours d'enregistrement

  const platById = useMemo(() => new Map((plats || []).map((p) => [p.id, p])), [plats]);
  const recetteById = useMemo(() => new Map((recettes || []).map((r) => [r.id, r])), [recettes]);

  const entrees = useMemo(() => {
    const map = new Map();
    const saisonsDuLibelle = new Map(); // libellé : saisons où il est servi
    (menus || []).forEach((m) => {
      (m.lignes || []).forEach((l) => {
        const cle = cleLiaison(l);
        if (!cle) return;
        const libelle = cleLibelle(l.libelle);
        if (!saisonsDuLibelle.has(libelle)) saisonsDuLibelle.set(libelle, new Set());
        saisonsDuLibelle.get(libelle).add(l.saison || '');
        if (!map.has(cle)) {
          map.set(cle, {
            cle, libelle: l.libelle, cleDuLibelle: libelle, saison: l.saison || '',
            sections: new Set(), menus: new Set(), ligne: l, reliee: false,
          });
        }
        const e = map.get(cle);
        e.sections.add(l.section);
        e.menus.add(m.numero === NUMERO_COMPLEMENTS
          ? `${metaType(m.typeGroupe).label} compléments`
          : `${metaType(m.typeGroupe).label} n°${m.numero}`);
        if (ligneReliee(l)) { e.reliee = true; e.ligne = l; }
      });
    });
    // La saison ne s'affiche que là où elle distingue deux entrées.
    return [...map.values()]
      .map((e) => ({ ...e, saisonAffichee: saisonsDuLibelle.get(e.cleDuLibelle).size > 1 }))
      .sort((a, b) => (a.reliee - b.reliee) || (b.menus.size - a.menus.size)
        || a.libelle.localeCompare(b.libelle, 'fr') || rangSaison(a.saison) - rangSaison(b.saison));
  }, [menus]);

  const match = makeSearchMatcher(recherche);
  const visibles = entrees.filter((e) => (tous || !e.reliee) && match(e.libelle));
  const restants = entrees.filter((e) => !e.reliee).length;

  async function relier(entree, valeur) {
    const modifies = propagerLiaison(menus, entree.cle, liaisonDeValeur(valeur));
    if (!modifies.length) return;
    setEnCours(entree.cle);
    try {
      const { faits, error } = await enregistrerPlusieurs(modifies);
      if (error) { notify(error, 'error'); return; }
      notify(valeur
        ? `Relié dans ${faits} menu${faits > 1 ? 's' : ''}.`
        : `Liaison retirée dans ${faits} menu${faits > 1 ? 's' : ''}.`, 'success');
    } finally {
      setEnCours(null);
    }
  }

  const nomLiaison = (l) => {
    if (l.platId) return platById.get(l.platId) ? `Carte : ${platById.get(l.platId).nom}` : 'Plat supprimé de la carte';
    const r = (l.recetteIds || []).map((id) => recetteById.get(id)).filter(Boolean);
    return r.length ? `Fiche : ${r.map((x) => x.nom).join(', ')}` : '';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={st.intro}>
        {restants
          ? `${restants} plat${restants > 1 ? 's' : ''} sur ${entrees.length} pas encore relié${restants > 1 ? 's' : ''} à une fiche : ils ne comptent pas dans les listes de courses et leurs allergènes ne sont pas vérifiés. Relier un plat ici le relie dans tous les menus qui le servent à la même saison.`
          : `Les ${entrees.length} plats des menus sont reliés à une fiche.`}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <input
          type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)}
          placeholder="Chercher un plat" aria-label="Chercher un plat"
          style={{ ...st.champ, flex: '1 1 240px', minHeight: 44 }}
        />
        <label style={st.bascule}>
          <input type="checkbox" checked={tous} onChange={(e) => setTous(e.target.checked)} style={st.case} />
          <span>Voir aussi les plats déjà reliés</span>
        </label>
      </div>

      {!visibles.length && <div style={st.vide}>Rien à afficher.</div>}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {visibles.map((e) => (
          <div key={e.cle} style={st.ligne}>
            <div style={{ minWidth: 0, flex: '1 1 260px' }}>
              <div style={st.libelle}>{e.libelle}</div>
              {e.saisonAffichee && <div style={st.saison}>{metaSaison(e.saison).label}</div>}
              <div style={st.detail}>
                {[...e.sections].map(plurielSection).join(', ')}, {e.menus.size} menu{e.menus.size > 1 ? 's' : ''} : {[...e.menus].join(', ')}
              </div>
              {e.reliee && <div style={{ ...st.detail, color: 'var(--success-text)' }}>{nomLiaison(e.ligne)}</div>}
            </div>
            <SelecteurFiche
              valeur={valeurLiaison(e.ligne)}
              plats={plats}
              recettes={recettes}
              disabled={enCours != null}
              onChange={(v) => relier(e, v)}
              style={{ ...st.champ, flex: '1 1 240px', minHeight: 44 }}
            />
            {enCours === e.cle && <span style={st.detail}>Enregistrement…</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

const st = {
  intro: { fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 },
  champ: {
    width: '100%', padding: '9px 12px', boxSizing: 'border-box',
    border: '1px solid var(--border)', borderRadius: 8,
    background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 14,
  },
  bascule: { display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, fontSize: 13, color: 'var(--text)', cursor: 'pointer' },
  case: { width: 20, height: 20, flexShrink: 0, accentColor: 'var(--accent)' },
  ligne: {
    display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 14px',
    padding: '10px 0', borderBottom: '1px solid var(--border)',
  },
  libelle: { fontSize: 14, fontFamily: 'var(--font-serif)', color: 'var(--text)', lineHeight: 1.35, overflowWrap: 'anywhere' },
  saison: { fontSize: 12, fontWeight: 600, color: 'var(--accent)', marginTop: 2 },
  detail: { fontSize: 12, color: 'var(--text2)', marginTop: 2, lineHeight: 1.4 },
  vide: { fontSize: 13, color: 'var(--text2)', fontStyle: 'italic' },
};
