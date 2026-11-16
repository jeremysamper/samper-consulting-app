// ─────────────────────────────────────────────────────────────────────────────
// Modèle Excel d'import des fiches recettes (Cartes & Recettes > Gérer >
// Importer des fiches).
//
// Trois feuilles : « Fiches » à remplir (listes déroulantes, aide qui
// s'affiche sur chaque colonne, en-tête figé), « Mode d'emploi » et
// « Exemple ». L'importeur saute les deux dernières (FEUILLE_AIDE dans
// ExcelImporter.js) : l'exemple n'est jamais importé avec les vraies fiches.
//
// SheetJS communautaire n'écrit ni styles ni listes de validation : le
// classeur est écrit en OOXML et zippé avec fflate, comme l'export de
// l'inventaire. Catégories et unités viennent des listes de l'éditeur, le
// modèle ne peut donc pas proposer une valeur que l'app refuse.
// ─────────────────────────────────────────────────────────────────────────────

import { zipSync, strToU8 } from 'fflate';
import { CATEGORIES_REC } from '../../consultant-tools/ConsultantTools.constants.js';
import { ALLERGENES } from '../../../utils/allergenes.js';

export const NOM_FICHIER_MODELE = 'modele-import-fiches.xlsx';

// Unités proposées dans la liste, écrites comme en cuisine. L'importeur les
// ramène aux unités de l'éditeur (cl et dl en ml, pièce en pcs).
const UNITES_MODELE = ['g', 'kg', 'ml', 'cl', 'dl', 'L', 'pièce', 'cs', 'cc', 'pincée'];

const COLONNES = [
  { titre: 'Recette', largeur: 34 },
  { titre: 'Catégorie', largeur: 16 },
  { titre: 'Portions', largeur: 10 },
  { titre: 'Ingrédient', largeur: 30 },
  { titre: 'Quantité', largeur: 11 },
  { titre: 'Unité', largeur: 9 },
  { titre: 'Allergènes', largeur: 26 },
  { titre: 'Étape', largeur: 72 },
];

const DERNIERE_LIGNE = 2000;

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const lettre = (i) => String.fromCharCode(65 + i);
const plage = (i) => `${lettre(i)}2:${lettre(i)}${DERNIERE_LIGNE}`;

// Styles : 0 normal, 1 en-tête (gras, fond doux, filet bas), 2 texte à la
// ligne calé en haut, 3 titre gras du mode d'emploi.
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="13"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE6EDF1"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FF8FA3AE"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

// Une cellule : texte en ligne (inlineStr), nombre tel quel, vide omise.
function cellule(ref, valeur, style = 0) {
  const s = style ? ` s="${style}"` : '';
  if (valeur === '' || valeur == null) return style ? `<c r="${ref}"${s}/>` : '';
  if (typeof valeur === 'number') return `<c r="${ref}"${s}><v>${valeur}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(valeur)}</t></is></c>`;
}

function lignes(tableau, styleLigne) {
  return tableau.map((valeurs, i) => {
    const r = i + 1;
    const style = styleLigne(i);
    const cells = valeurs.map((v, j) => cellule(`${lettre(j)}${r}`, v, style)).join('');
    return `<row r="${r}">${cells}</row>`;
  }).join('');
}

function feuille({ tableau, largeurs, styleLigne, figee = false, validations = '' }) {
  const vue = figee
    ? '<sheetViews><sheetView workbookViewId="0" tabSelected="1"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>'
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  const cols = largeurs.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${vue}<sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${lignes(tableau, styleLigne)}</sheetData>${validations}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/></worksheet>`;
}

// Aide affichée par Excel quand une cellule de la colonne est choisie
// (titre de 32 caractères, texte de 255 au plus), et contrôle de saisie.
function validation(col, { titre, aide, type, operateur, formule, erreur, style = 'stop' }) {
  const attrs = [
    type ? `type="${type}"` : '',
    operateur ? `operator="${operateur}"` : '',
    type ? `errorStyle="${style}"` : '',
    'allowBlank="1"',
    'showInputMessage="1"',
    type ? 'showErrorMessage="1"' : '',
    type ? `errorTitle="${esc(COLONNES[col].titre)}"` : '',
    erreur ? `error="${esc(erreur)}"` : '',
    `promptTitle="${esc(titre.slice(0, 32))}"`,
    `prompt="${esc(aide.slice(0, 255))}"`,
    `sqref="${plage(col)}"`,
  ].filter(Boolean).join(' ');
  return formule != null
    ? `<dataValidation ${attrs}><formula1>${esc(formule)}</formula1></dataValidation>`
    : `<dataValidation ${attrs}/>`;
}

const MOTS_ALLERGENES = ALLERGENES.map(a => a.label.toLocaleLowerCase('fr')).join(', ');

function validationsFiches() {
  const v = [
    validation(0, { titre: 'Nom de la fiche', aide: 'Une seule fois, sur la première ligne de la fiche. Les lignes suivantes sans nom appartiennent à cette fiche.' }),
    validation(1, {
      titre: 'Catégorie', aide: 'Sur la première ligne de la fiche. Choisissez dans la liste.',
      type: 'list', formule: `"${CATEGORIES_REC.join(',')}"`, erreur: 'Choisissez une catégorie de la liste.',
    }),
    validation(2, {
      titre: 'Portions', aide: 'Sur la première ligne de la fiche. Nombre de portions que donne la recette entière.',
      type: 'whole', operateur: 'greaterThanOrEqual', formule: '1', erreur: 'Un nombre entier, 1 ou plus.',
    }),
    validation(3, { titre: 'Ingrédient', aide: 'Un ingrédient par ligne, avec son nom simple : Beurre, Farine, Œufs.' }),
    validation(4, {
      titre: 'Quantité', aide: 'En chiffres seulement, pour la recette entière. Virgule ou point pour les décimales.',
      type: 'decimal', operateur: 'greaterThanOrEqual', formule: '0', erreur: 'Un nombre, sans unité : l\'unité va dans la colonne suivante.',
    }),
    validation(5, {
      titre: 'Unité', aide: 'Choisissez dans la liste : g, kg, ml, cl, dl, L, pièce, cs, cc, pincée.',
      type: 'list', formule: `"${UNITES_MODELE.join(',')}"`, erreur: 'Unité hors liste. Elle sera signalée à vérifier dans l\'aperçu.', style: 'warning',
    }),
    validation(6, { titre: 'Allergènes de l\'ingrédient', aide: `Sur la ligne de l'ingrédient, séparés par une virgule. L'app les réunit pour la fiche. Mots : ${MOTS_ALLERGENES}.` }),
    validation(7, { titre: 'Étape', aide: 'Une étape par ligne, dans l\'ordre. Elles peuvent partager les lignes des ingrédients.' }),
  ];
  return `<dataValidations count="${v.length}">${v.join('')}</dataValidations>`;
}

const EN_TETE = COLONNES.map(c => c.titre);

// Deux fiches courtes qui montrent la mise en forme : le nom écrit une fois,
// les étapes à côté des ingrédients, une ligne vide entre deux fiches.
const EXEMPLE = [
  EN_TETE,
  ['Crème anglaise vanille', 'Sauces', 10, 'Lait entier', 500, 'ml', 'lactose', 'Porter le lait à frémissement avec la vanille fendue et grattée. Infuser 10 min.'],
  ['', '', '', 'Jaunes d\'œufs', 120, 'g', 'oeufs', 'Blanchir les jaunes avec le sucre.'],
  ['', '', '', 'Sucre', 100, 'g', '', 'Verser le lait chaud sur les jaunes, remettre en casserole et cuire à 83 °C en remuant.'],
  ['', '', '', 'Gousse de vanille', 1, 'pièce', '', 'Chinoiser, refroidir rapidement et réserver au froid.'],
  [],
  ['Tarte fine aux pommes', 'Desserts', 8, 'Pâte feuilletée', 250, 'g', 'gluten, lactose', 'Abaisser la pâte à 2 mm, détailler 8 disques de 12 cm et les piquer.'],
  ['', '', '', 'Pommes', 600, 'g', '', 'Éplucher et émincer finement les pommes, les disposer en rosace.'],
  ['', '', '', 'Beurre', 30, 'g', 'lactose', 'Badigeonner de beurre fondu et saupoudrer de sucre.'],
  ['', '', '', 'Sucre', 40, 'g', '', 'Cuire à 190 °C pendant 20 min.'],
];

const MODE_EMPLOI = [
  ['Importer des fiches recettes'],
  [''],
  ['1. Remplissez la feuille « Fiches ». La feuille « Exemple » montre deux fiches remplies.'],
  ['2. Écrivez le nom de la fiche dans la colonne Recette, une seule fois. Chaque ligne sans nom appartient à la fiche du dessus.'],
  ['3. Sur cette première ligne, choisissez aussi la catégorie et le nombre de portions.'],
  ['4. Une ligne par ingrédient : son nom, la quantité en chiffres, l\'unité de la liste.'],
  ['5. Les quantités sont celles de la recette entière, pour le nombre de portions indiqué.'],
  ['6. Allergènes : ceux de l\'ingrédient, sur sa ligne, séparés par une virgule. L\'app les réunit pour toute la fiche.'],
  ['7. Étape : une étape par ligne, dans l\'ordre. Elles peuvent partager les lignes des ingrédients.'],
  ['8. Pour une autre fiche, écrivez son nom sur une nouvelle ligne. Une ligne vide entre deux fiches est permise.'],
  ['9. Dans l\'app : Cartes & Recettes, Gérer, Importer des fiches. Choisissez la carte où ranger les fiches, relisez l\'aperçu, puis importez.'],
  [''],
  ['Catégories'],
  [CATEGORIES_REC.join(', ')],
  [''],
  ['Unités'],
  [UNITES_MODELE.join(', ')],
  [''],
  ['Allergènes'],
  [MOTS_ALLERGENES],
  [''],
  ['Les fiches arrivent en brouillon. Une fiche qui porte déjà le nom d\'une fiche de l\'établissement est signalée et décochée dans l\'aperçu.'],
];
const TITRES_MODE_EMPLOI = new Set([0, 12, 15, 18]);

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="Fiches" sheetId="1" r:id="rId1"/><sheet name="Mode d&apos;emploi" sheetId="2" r:id="rId2"/><sheet name="Exemple" sheetId="3" r:id="rId3"/></sheets></workbook>`;
const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

// Octets du classeur (Uint8Array). Pur : testable hors navigateur.
export function construireModeleFiches() {
  const largeurs = COLONNES.map(c => c.largeur);
  const fichiers = {
    '[Content_Types].xml': CONTENT_TYPES,
    '_rels/.rels': RELS,
    'xl/workbook.xml': WORKBOOK,
    'xl/_rels/workbook.xml.rels': WORKBOOK_RELS,
    'xl/styles.xml': STYLES,
    'xl/worksheets/sheet1.xml': feuille({ tableau: [EN_TETE], largeurs, styleLigne: () => 1, figee: true, validations: validationsFiches() }),
    'xl/worksheets/sheet2.xml': feuille({ tableau: MODE_EMPLOI, largeurs: [120], styleLigne: (i) => (TITRES_MODE_EMPLOI.has(i) ? 3 : 2) }),
    'xl/worksheets/sheet3.xml': feuille({ tableau: EXEMPLE, largeurs, styleLigne: (i) => (i === 0 ? 1 : 2), figee: false }),
  };
  const entrees = {};
  Object.entries(fichiers).forEach(([chemin, xml]) => { entrees[chemin] = strToU8(xml); });
  return zipSync(entrees, { level: 6 });
}

export async function telechargerModeleFiches() {
  const { telechargerFichier } = await import('../../inventaire/exportXlsxInventaire.js');
  telechargerFichier(construireModeleFiches(), NOM_FICHIER_MODELE,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
