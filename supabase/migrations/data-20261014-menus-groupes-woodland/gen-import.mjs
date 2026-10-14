// Génère le DML d'import des menus Woodland (groupe_menus, établissement etab-2)
// depuis menus-woodland.json (sortie de parse.mjs).
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
const [sortie] = process.argv.slice(2);
const menus = JSON.parse(fs.readFileSync(path.join(DIR, 'menus-woodland.json'), 'utf8'));

// Seules liaisons sûres avec la carte Woodland : même plat, même recette de
// base. Les homonymes à garniture différente (poulpe, truite, carpaccio de
// betteraves, tomate et burrata, salade mêlée) restent à relier par le chef.
const LIAISONS = [
  { re: /^Fondue moitié-moitié/, platId: '2ba8817a-0097-43e7-a46c-a93d1542d41f' },
  { re: /^Paris-Brest au praliné noisette$/, platId: 'd5aef48a-cc7f-43ae-ac8d-3bc94e52a1a4' },
];

const propre = (l) => {
  const o = {
    id: l.id, section: l.section, platId: null, libelle: l.libelle, description: '', parPersonne: Number(l.parPersonne) > 0 ? Number(l.parPersonne) : 1,
  };
  const lien = LIAISONS.find((x) => x.re.test(l.libelle));
  if (lien) o.platId = lien.platId;
  if (l.rubrique) o.rubrique = l.rubrique;
  if (l.regime) o.regime = l.regime;
  if (l.saison) o.saison = l.saison;
  if (l.moisDebut && l.moisFin) { o.moisDebut = l.moisDebut; o.moisFin = l.moisFin; }
  if (l.premium) o.premium = true;
  if (l.chaud) o.chaud = true;
  if (l.note) o.note = l.note;
  if (l.prix) o.prix = l.prix;
  if (l.unite) o.unite = l.unite;
  if (l.portionsParUnite) o.portionsParUnite = l.portionsParUnite;
  if (l.minimum) o.minimum = l.minimum;
  return o;
};

const lit = (s) => (s == null || s === '' ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const json = (v) => {
  const t = JSON.stringify(v);
  if (t.includes('$menu$')) throw new Error('marqueur $menu$ dans les données');
  return `$menu$${t}$menu$::jsonb`;
};

let liees = 0;
const valeurs = menus.map((m) => {
  const lignes = m.lignes.map(propre);
  liees += lignes.filter((l) => l.platId).length;
  return `  (${lit(`woodland-${m.type}-${m.numero}`)}, 'etab-2', ${lit(m.type)}, ${m.numero}, ${lit(m.nom)}, ${m.prixPax == null ? 'null' : m.prixPax}, ${lit(m.description)},\n   ${json(lignes)},\n   ${json(m.regles)})`;
});

const total = menus.reduce((s, m) => s + m.lignes.length, 0);
const sql = `-- Import des menus de groupe Woodland Village (etab-2), généré par gen-import.mjs
-- depuis les 7 PDF (mariage, groupes, séminaires, deux saisons, fiche de choix).
-- ${menus.length} menus, ${total} lignes, ${liees} lignes reliées à un plat de la carte.
-- Idempotent : ON CONFLICT DO NOTHING sur (établissement, type, numéro), un menu
-- composé entre-temps dans l'app n'est jamais écrasé.
begin;

insert into public.groupe_menus (id, etablissement_id, type_groupe, numero, nom, prix_pax, description, lignes, regles)
values
${valeurs.join(',\n')}
on conflict (etablissement_id, type_groupe, numero) do nothing;

commit;
`;
fs.writeFileSync(sortie, sql);
console.log('menus', menus.length, 'lignes', total, 'liées', liees, 'octets', Buffer.byteLength(sql));
