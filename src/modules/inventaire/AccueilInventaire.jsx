import React from 'react';
import { Banknote, ChartColumn, ClipboardList, Receipt, Settings2, Truck } from 'lucide-react';
import { Btn } from '../../components/ui/index.jsx';
import { Choix, Fenetre } from '../../components/ui/Fenetres.jsx';
import { zurichToday } from '../../utils/zurichTime.js';
import { estCompte } from './inventaireLignes.js';
import { estACompleter } from './achatsLogic.js';
import { estFacture, totauxFactures } from './facturesLogic.js';

// ─────────────────────────────────────────────────────────────────────────────
// Accueil du module Inventaire : une tuile par tâche, dans l'ordre où la
// brigade s'en sert. Même tuile que la page d'accueil tactile (bouton
// data-cadre, 72 px au moins, pictogramme au trait, libellé court), même
// grille (.accueil-grille : 2, 3 ou 4 colonnes par CSS), sur les trois coques.
// La ligne d'état vit dans la tuile, sous le libellé : une seule cible au
// doigt. Une tuile hors droit n'est pas rendue, jamais grisée.
//
// Nombres, dates et noms dans leurs propres nœuds : la phrase autour reste
// une entrée du glossaire au lieu de partir à l'IA à chaque valeur.
// ─────────────────────────────────────────────────────────────────────────────

const dateCH = (iso) => (iso ? String(iso).split('-').reverse().join('.') : '');
const plusRecent = (docs) => docs.slice().sort((a, b) => String(b.dateDocument || '').localeCompare(String(a.dateDocument || '')))[0];

export default function AccueilInventaire({
  perimetreActif, perimetres, pilesParPerimetre, inv, docs,
  canManage, canRegler, canImportXlsx,
  onJeCompte, onImport, onReglement, onEcarts, onChoisirPerimetre, onNouveauPerimetre, gerer,
}) {
  const [fenetre, setFenetre] = React.useState(null); // 'perimetre' | 'gerer' | null
  const fermer = React.useCallback(() => setFenetre(null), []);
  const aujourdhui = zurichToday();

  const dernier = (pilesParPerimetre.get(perimetreActif) || [])[0];
  const lignes = dernier?.lignes || [];
  const bons = docs.filter(d => !estFacture(d));
  const factures = docs.filter(estFacture);
  const bonsACompleter = bons.filter(estACompleter).length;
  const facturesACompleter = factures.filter(estACompleter).length;
  const aCompleter = bonsACompleter + facturesACompleter;
  const dernierBon = plusRecent(bons);
  const derniereFacture = plusRecent(factures);
  const totaux = canRegler ? totauxFactures(factures, aujourdhui) : null;

  const tuiles = [
    {
      id: 'compte', Icone: ClipboardList, label: 'Je compte', onClick: onJeCompte,
      etat: !dernier
        ? <>aucun inventaire</>
        : dernier.statut !== 'validé'
          ? <><span data-no-translate>{perimetreActif}</span> : <span>{lignes.filter(estCompte).length}</span> / <span>{lignes.length}</span> comptés</>
          : <>dernier inventaire validé le <span>{dateCH(dernier.date)}</span></>,
    },
    {
      id: 'livraison', Icone: Truck, label: 'Livraison reçue', onClick: () => onImport('bon_livraison'),
      etat: bonsACompleter
        ? <><span>{bonsACompleter}</span> {bonsACompleter > 1 ? 'bons à compléter' : 'bon à compléter'}</>
        : dernierBon?.dateDocument ? <>dernier bon le <span>{dateCH(dernierBon.dateDocument)}</span></> : <>aucun bon</>,
    },
    {
      id: 'facture', Icone: Receipt, label: 'Facture reçue', onClick: () => onImport('facture'),
      etat: facturesACompleter
        ? <><span>{facturesACompleter}</span> {facturesACompleter > 1 ? 'factures à compléter' : 'facture à compléter'}</>
        : derniereFacture?.dateDocument ? <>dernière facture le <span>{dateCH(derniereFacture.dateDocument)}</span></> : <>aucune facture</>,
    },
    canRegler && {
      id: 'reglement', Icone: Banknote, label: 'Je règle les factures', onClick: onReglement,
      etat: totaux.aRegler.n
        ? <>
          <span>{totaux.aRegler.n}</span> {totaux.aRegler.n > 1 ? 'factures à régler' : 'facture à régler'}
          {totaux.enRetard.n ? <>, <span>{totaux.enRetard.n}</span> en retard</> : null}
        </>
        : <>tout est réglé</>,
    },
    {
      id: 'ecarts', Icone: ChartColumn, label: 'Écarts et documents', onClick: onEcarts,
      etat: !inv
        ? <>aucun inventaire</>
        : inv.statut === 'validé'
          ? <>inventaire du <span>{dateCH(inv.date)}</span>, validé</>
          : <>inventaire du <span>{dateCH(inv.date)}</span>, en cours</>,
    },
    canManage && {
      id: 'gerer', Icone: Settings2, label: 'Gérer', onClick: () => setFenetre('gerer'),
      etat: <>périmètres, lignes, import Excel</>,
    },
  ].filter(Boolean);

  return (
    <div style={st.page}>
      <div style={st.enTete}>
        <div style={{ minWidth: 0 }}>
          <div style={st.surTitre}>Périmètre</div>
          <div style={st.perimetre} data-no-translate>{perimetreActif}</div>
        </div>
        {perimetres.length > 1 && <Btn variant="ghost" onClick={() => setFenetre('perimetre')} style={{ minHeight: 44 }}>Changer de périmètre</Btn>}
      </div>

      {aCompleter > 0 && (
        <div style={st.bandeau} data-bandeau-a-completer="">
          <span style={{ flex: '1 1 240px', minWidth: 0 }}>
            <span>{aCompleter}</span> {aCompleter > 1 ? 'documents à compléter' : 'document à compléter'} : la lecture n’a pas tout trouvé (fournisseur, date ou montant TTC).
          </span>
          <Btn small variant="ghost" onClick={() => onImport(facturesACompleter ? 'facture' : 'bon_livraison')}>Compléter</Btn>
        </div>
      )}

      <div className="accueil-grille">
        {tuiles.map(t => (
          <button key={t.id} type="button" className="accueil-tuile" data-cadre="" data-tuile-inventaire={t.id} style={st.tuile} onClick={t.onClick}>
            <t.Icone size={28} strokeWidth={1.75} aria-hidden="true" style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={st.libelle}>{t.label}</span>
              <span style={st.etat}>{t.etat}</span>
            </span>
          </button>
        ))}
      </div>

      {fenetre === 'perimetre' && (
        <Fenetre id="inventaire-perimetre" titre="Changer de périmètre" sousTitre="Chaque périmètre a sa propre pile d'inventaires et ses propres documents." onClose={fermer}>
          <div style={st.choix}>
            {perimetres.map((nom) => {
              const d = (pilesParPerimetre.get(nom) || [])[0];
              const detail = !d ? 'aucun inventaire'
                : d.statut !== 'validé' ? `en cours, ${(d.lignes || []).filter(estCompte).length} / ${(d.lignes || []).length} comptés`
                  : `dernier validé le ${dateCH(d.date)}`;
              return (
                <Choix
                  key={nom}
                  titre={<span data-no-translate>{nom}</span>}
                  detail={detail}
                  actif={nom === perimetreActif}
                  onClick={() => { fermer(); onChoisirPerimetre(nom); }}
                />
              );
            })}
            <Choix titre="Nouveau périmètre" detail="Une autre pile d'inventaires : cave, matériel, consommables…" onClick={() => { fermer(); onNouveauPerimetre(); }} />
          </div>
        </Fenetre>
      )}

      {fenetre === 'gerer' && (
        <Fenetre
          id="inventaire-gerer"
          titre="Gérer l'inventaire"
          sousTitre={gerer.aInventaire ? <><span data-no-translate>{perimetreActif}</span>, inventaire du <span>{dateCH(inv.date)}</span></> : null}
          onClose={fermer}
        >
          {[
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
                gerer.peutSelectionner && { titre: 'Sélectionner des lignes', detail: 'Pour en supprimer, les ranger par zone ou en exporter une partie en Excel.', onClick: gerer.onSelectionnerLignes },
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
          ]
            .map(s => ({ ...s, items: s.items.filter(Boolean) }))
            .filter(s => s.items.length)
            .map((s, i) => (
              <div key={s.titre || i} style={st.section}>
                {s.titre && <div style={st.sectionTitre}>{s.titre}</div>}
                {s.items.map(it => <Choix key={it.titre} {...it} onClick={() => { fermer(); it.onClick(); }} />)}
              </div>
            ))}
        </Fenetre>
      )}
    </div>
  );
}

const st = {
  page: { display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 },
  enTete: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  surTitre: { fontSize: 12, color: 'var(--text2)' },
  perimetre: { fontFamily: 'var(--font-serif)', fontSize: 22, lineHeight: 1.15, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  bandeau: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12, lineHeight: 1.5, padding: '10px 14px', borderRadius: 8, background: 'var(--warning-bg)', color: 'var(--warning-text)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--warning-bd)' },
  // Tuile de la page d'accueil tactile (AccueilTactile.jsx) : hauteur minimale
  // en inline, fond et rayon, aucune couleur en dur.
  tuile: {
    position: 'relative', display: 'flex', alignItems: 'center', gap: 12, minHeight: 72, width: '100%',
    padding: '22px 14px', borderRadius: 'var(--r-lg)', background: 'var(--surface2)', color: 'var(--accent)',
    border: 'none', fontFamily: 'var(--font)', fontSize: 15, fontWeight: 500, lineHeight: 1.2, textAlign: 'left', cursor: 'pointer',
  },
  libelle: { display: 'block' },
  etat: { display: 'block', marginTop: 4, fontSize: 12, fontWeight: 400, color: 'var(--text2)', lineHeight: 1.35 },
  choix: { display: 'flex', flexDirection: 'column', gap: 6 },
  section: { display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 },
  sectionTitre: { fontSize: 12, fontWeight: 500, color: 'var(--text2)', marginTop: 2 },
};
