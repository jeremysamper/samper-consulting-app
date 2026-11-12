// Toutes les pages d'une lecture de ventes : PostgREST rend 1000 lignes au
// plus par réponse, une requête d'un seul tenant était tronquée sans le dire.
// `requete(de, a)` construit une page avec un ordre stable. Rend { data,
// error } comme une requête simple.
export async function toutesLesPages(requete) {
  const PAGE = 1000;
  const lignes = [];
  for (let de = 0; ; de += PAGE) {
    const { data, error } = await requete(de, de + PAGE - 1);
    if (error) return { data: null, error };
    lignes.push(...(data || []));
    if (!data || data.length < PAGE) return { data: lignes, error: null };
  }
}
