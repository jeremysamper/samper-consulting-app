// Contrôles d'entrée de create-user. Aucun import : le module se teste sous
// Node tel quel (transpilé par esbuild) et s'importe depuis index.ts.

// Rôles de l'app (src/modules/moduleConfig.js). Liste fermée : un rôle
// inconnu ne crée pas de compte.
export const ROLES = [
  'consultant', 'patron', 'resp_cuisine', 'cuisinier', 'serveur', 'hote', 'praticien_spa',
];

export type Creation = {
  email: string;
  password: string;
  prenom: string;
  nom: string;
  role: string;
  poste: string | null;
  etablissement_ids: string[];
};

export type Verdict =
  | { ok: true; valeurs: Creation }
  | { ok: false; statut: 400 | 403; erreur: string };

const texte = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

// corps : le JSON reçu ; etabsAppelant : profiles.etablissement_ids de
// l'appelant, relus en base (jamais pris dans la requête).
export function validerCreation(corps: unknown, etabsAppelant: string[]): Verdict {
  const b = corps && typeof corps === 'object' ? (corps as Record<string, unknown>) : {};

  const email = texte(b.email).toLowerCase();
  const password = typeof b.password === 'string' ? b.password : '';
  const prenom = texte(b.prenom);
  const nom = texte(b.nom);
  if (!email || !password || !prenom || !nom) {
    return { ok: false, statut: 400, erreur: 'E-mail, mot de passe, prénom et nom sont requis.' };
  }

  // Sans rôle, le compte est cuisinier, comme avant.
  const role = b.role === undefined || b.role === null || b.role === '' ? 'cuisinier' : b.role;
  if (typeof role !== 'string' || !ROLES.includes(role)) {
    return { ok: false, statut: 400, erreur: 'Rôle inconnu.' };
  }

  const ids = b.etablissement_ids === undefined || b.etablissement_ids === null ? [] : b.etablissement_ids;
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || id === '')) {
    return { ok: false, statut: 400, erreur: 'Liste d\'établissements invalide.' };
  }
  const hors = ids.filter((id) => !etabsAppelant.includes(id));
  if (hors.length) {
    return { ok: false, statut: 403, erreur: 'Établissement hors de votre périmètre : ' + hors.join(', ') + '.' };
  }

  return {
    ok: true,
    valeurs: {
      email, password, prenom, nom, role,
      poste: texte(b.poste) || null,
      etablissement_ids: [...new Set(ids as string[])],
    },
  };
}
