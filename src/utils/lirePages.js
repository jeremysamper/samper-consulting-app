// Toutes les pages d'une lecture PostgREST : le serveur rend 1000 lignes au
// plus par réponse, une lecture d'un seul tenant serait tronquée sans le dire.
// `requete(de, a)` construit la requête d'une page, avec un ordre stable (une
// colonne unique en dernier). Rend { data, error } comme une requête simple.
// Seule version de cette boucle : services, hooks et modules l'importent.
export const TAILLE_PAGE = 1000;

export async function toutesLesPages(requete) {
  const lignes = [];
  for (let de = 0; ; de += TAILLE_PAGE) {
    const { data, error } = await requete(de, de + TAILLE_PAGE - 1);
    if (error) return { data: null, error };
    lignes.push(...(data || []));
    if (!data || data.length < TAILLE_PAGE) return { data: lignes, error: null };
  }
}
