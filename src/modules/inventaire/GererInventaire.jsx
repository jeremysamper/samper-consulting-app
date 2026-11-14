import { Choix } from '../../components/ui/Fenetres.jsx';
import { dateCH } from './inventaireLignes.js';

// ─────────────────────────────────────────────────────────────────────────────
// « Gérer l'inventaire » : les gestes de gestion d'un inventaire (renommer le
// périmètre, rouvrir, produits maison, import Excel, supprimer). Jusqu'au
// 14.11.2026 c'était une fenêtre ouverte par la tuile « Gérer » de l'accueil ;
// c'est maintenant l'écran que le module montre quand il est monté dans la
// page des réglages (section 'inventaire_gerer', ecranReglage = 'gerer').
//
// Mêmes gestes, mêmes gardes, mêmes fenêtres : chaque choix appelle la
// fonction du module (Inventaire.jsx), rien n'est recopié. « Sélectionner des
// lignes » n'est pas ici : il agit sur l'écran des écarts, où il a son bouton.
// ─────────────────────────────────────────────────────────────────────────────

const st = {
  page: { display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 },
  barre: { display: 'flex', flexWrap: 'wrap', gap: '10px 14px', alignItems: 'flex-end', minWidth: 0 },
  champ: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--t1)', color: 'var(--text2)', minWidth: 0 },
  select: {
    minHeight: 44, padding: '8px 10px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r)',
    background: 'var(--surface)', color: 'var(--text)', fontSize: 'var(--t2)', fontFamily: 'var(--font)', maxWidth: '100%', minWidth: 0,
  },
  section: { display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 560 },
  sectionTitre: { fontSize: 'var(--t1)', fontWeight: 'var(--g2)', color: 'var(--text2)', marginTop: 2 },
  vide: { margin: 0, fontSize: 'var(--t2)', color: 'var(--text2)' },
};

//   gerer : { aInventaire, estValide, aRecettes, peutSupprimer, onRenommer,
//             onRouvrir, onProduitsMaison, onImporterXlsx, onModeleXlsx,
//             onSupprimer }, tel que le module le passait à sa fenêtre.
export default function GererInventaire({
  perimetreActif, perimetres, onChoisirPerimetre, inv, inventaires, onChoisirInventaire, canImportXlsx, gerer,
}) {
  const sections = [
    {
      titre: 'Inventaires',
      items: [
        gerer.aInventaire && { titre: 'Renommer le périmètre', detail: `Change le nom « ${perimetreActif} » sur tous ses inventaires.`, onClick: gerer.onRenommer },
        gerer.aInventaire && gerer.estValide && { titre: 'Rouvrir cet inventaire', detail: 'Il repassera « en cours » et redeviendra modifiable.', onClick: gerer.onRouvrir },
      ],
    },
    {
      titre: 'Lignes',
      items: [
        gerer.aInventaire && gerer.aRecettes && { titre: 'Produits maison (fiches recettes)', detail: 'Relier les préparations maison à leur fiche, chiffrées au coût matière.', onClick: gerer.onProduitsMaison },
      ],
    },
    {
      titre: 'Import Excel',
      items: [
        canImportXlsx && { titre: 'Importer un classeur XLSX', detail: 'Met à jour les produits de cet inventaire, ou crée un inventaire complet depuis un classeur Sec / Positif / Négatif.', onClick: gerer.onImporterXlsx },
        canImportXlsx && { titre: 'Télécharger le modèle XLSX', detail: 'Le fichier à remplir avant un import.', onClick: gerer.onModeleXlsx },
      ],
    },
    {
      items: [
        gerer.aInventaire && gerer.peutSupprimer && { titre: 'Supprimer cet inventaire', onClick: gerer.onSupprimer, danger: true },
      ],
    },
  ].map((s) => ({ ...s, items: s.items.filter(Boolean) })).filter((s) => s.items.length);

  return (
    <div style={st.page} data-inventaire-gerer="">
      <div style={st.barre}>
        {perimetres.length > 1 ? (
          <label style={st.champ}>
            <span>Périmètre</span>
            <select style={st.select} value={perimetreActif} onChange={(e) => onChoisirPerimetre(e.target.value)}>
              {perimetres.map((p) => <option key={p} value={p} data-no-translate>{p}</option>)}
            </select>
          </label>
        ) : null}
        {inv && inventaires.length > 1 ? (
          <label style={st.champ}>
            <span>Inventaire</span>
            <select style={st.select} value={inv.id} onChange={(e) => onChoisirInventaire(e.target.value)}>
              {inventaires.map((i) => <option key={i.id} value={i.id}>{dateCH(i.date)}, {i.statut}</option>)}
            </select>
          </label>
        ) : null}
        {inv ? (
          <div style={{ ...st.champ, alignSelf: 'center' }}>
            <span><span data-no-translate>{perimetreActif}</span>, inventaire du <span data-no-translate>{dateCH(inv.date)}</span></span>
          </div>
        ) : null}
      </div>
      {sections.map((s, i) => (
        <div key={s.titre || i} style={st.section}>
          {s.titre ? <div style={st.sectionTitre}>{s.titre}</div> : null}
          {s.items.map((it) => <Choix key={it.titre} {...it} />)}
        </div>
      ))}
      {!sections.length ? <p style={st.vide}>Aucun inventaire à gérer pour le moment.</p> : null}
    </div>
  );
}
