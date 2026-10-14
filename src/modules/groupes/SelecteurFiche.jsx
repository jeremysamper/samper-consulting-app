import { useMemo } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Sélecteur natif « plat de la carte ou fiche technique » d'une ligne de menu.
// Un plat de la carte apporte toute sa chaîne de fiches (plat_recettes) ; une
// fiche seule convient à un plat de banquet qui n'est pas à la carte. Valeur
// encodée « p:<id> » ou « r:<id> », vide sans liaison.
// Natif : c'est le plus rapide au doigt sur iPad, même avec trois cents fiches.
// ─────────────────────────────────────────────────────────────────────────────

export const valeurLiaison = (ligne) => (
  ligne?.platId ? `p:${ligne.platId}`
    : (Array.isArray(ligne?.recetteIds) && ligne.recetteIds.length ? `r:${ligne.recetteIds[0]}` : '')
);

export function liaisonDeValeur(valeur) {
  if (String(valeur).startsWith('p:')) return { platId: valeur.slice(2), recetteIds: [] };
  if (String(valeur).startsWith('r:')) return { platId: null, recetteIds: [valeur.slice(2)] };
  return { platId: null, recetteIds: [] };
}

export default function SelecteurFiche({ valeur, plats, recettes, onChange, style, disabled = false, libelleVide }) {
  const platsParCategorie = useMemo(() => {
    const map = new Map();
    (plats || []).filter((p) => p.actif !== false).forEach((p) => {
      const c = p.categorie || 'Plats';
      if (!map.has(c)) map.set(c, []);
      map.get(c).push(p);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'));
  }, [plats]);
  const fiches = useMemo(
    () => (recettes || []).slice().sort((a, b) => String(a.nom || '').localeCompare(String(b.nom || ''), 'fr')),
    [recettes]
  );

  return (
    <select
      value={valeur} disabled={disabled} aria-label="Plat de la carte ou fiche technique"
      onChange={(e) => onChange(e.target.value)} style={style}
    >
      <option value="">{libelleVide || 'Pas encore relié à une fiche'}</option>
      {platsParCategorie.map(([categorie, liste]) => (
        <optgroup key={categorie} label={`Carte, ${categorie}`}>
          {liste.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.nom}</option>)}
        </optgroup>
      ))}
      {fiches.length > 0 && (
        <optgroup label="Fiches techniques">
          {fiches.map((r) => <option key={r.id} value={`r:${r.id}`}>{r.nom}</option>)}
        </optgroup>
      )}
    </select>
  );
}
