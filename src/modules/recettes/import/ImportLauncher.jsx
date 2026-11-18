import React from 'react';
import { Btn } from '../../../components/ui/index.jsx';
import { Fenetre, st as fst } from '../../../components/ui/Fenetres.jsx';
import { notify } from '../../../components/toast/index.js';
import { parseWorkbook, buildFromMapping, FIELD_LABELS } from './ExcelImporter.js';
import ImportPreview, { isRecipeValid } from './ImportPreview.jsx';
import { getUnrecognizedUnits, resetUnrecognizedUnits } from './UnitParser.js';
import { messageErreur } from '../../../utils/messageErreur.js';
import { CATEGORIES_PLAT, categorieDuPlat } from '../../../utils/categoriesPlat.js';
import { inscrireGeste } from '../../../services/tempsGagne.js';

const BATCH_SIZE = 5;

// Nettoie une recette importée -> payload accepté par upsertRecette.
function toRecettePayload(recipe, etabId, userId) {
  return {
    id: 'rec-' + Date.now() + '-' + Math.floor(Math.random() * 100000),
    etablissementId: etabId,
    nom: String(recipe.nom || '').trim() || 'Recette importée',
    categorie: recipe.categorie || 'Plats',
    portions: Number(recipe.portions) || 4,
    prixVente: Number(recipe.prixVente) || 0,
    tempsPreparation: Number(recipe.tempsPreparation) || 0,
    tempsCuisson: Number(recipe.tempsCuisson) || 0,
    tempsTotal: (Number(recipe.tempsPreparation) || 0) + (Number(recipe.tempsCuisson) || 0),
    statut: 'brouillon',
    version: 1,
    allergenesIds: recipe.allergenesIds || [],
    notesConsultant: recipe.notesConsultant || '',
    dressage: recipe.dressage || '',
    conservation: recipe.conservation || '',
    modifie: new Date().toISOString().slice(0, 10),
    modifiePar: userId || null,
    ingredients: (recipe.ingredients || []).map((ing, i) => ({
      id: 'i' + Date.now() + '_' + i + '_' + Math.floor(Math.random() * 1000),
      nom: String(ing.nom || '').trim(),
      quantite: Number(ing.quantite) || 0,
      unite: ing.unite || 'g',
      prixUnit: Number(ing.prixUnit) || 0,
      categorie: ing.categorie || 'Autres',
      ...(ing.produitId ? { produitId: ing.produitId } : {}),
    })),
    etapes: (recipe.etapes || []).map(e => String(e || '').trim()).filter(Boolean),
  };
}

const cleNom = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

// Rubrique unique d'une carte : quand tous ses plats sont dans la même
// rubrique (une carte de petit-déjeuner toute en « Plats »), les fiches
// importées s'y rangent aussi. Carte vide ou à plusieurs rubriques : ''
// (la rubrique suit la catégorie de chaque fiche).
function rubriqueDominante(plats, carteId) {
  if (!carteId) return '';
  const rubriques = new Set((plats || [])
    .filter(p => (p.carteIds || []).includes(carteId))
    .map(categorieDuPlat));
  const [seule] = rubriques;
  return rubriques.size === 1 && CATEGORIES_PLAT.includes(seule) ? seule : '';
}

// Fenêtre d'import de fiches recettes (Cartes & Recettes > Gérer).
// Props : etabId, legacySB, user, cartes, plats, recettes (fiches de
// l'établissement, pour signaler les doublons), carteIdDefaut, iaPermise
// (lecture des photos par l'IA, consultant seulement), onClose, onImported.
export default function ImportLauncher({
  etabId, legacySB, user, cartes = [], plats = [], recettes = [],
  carteIdDefaut = '', iaPermise = false, onClose, onImported,
}) {
  const [step, setStep] = React.useState('choose'); // choose | mapping | preview | importing | done
  const [parsing, setParsing] = React.useState(false);
  const [parsingMsg, setParsingMsg] = React.useState('Lecture du fichier…');
  const [parseError, setParseError] = React.useState('');
  const [recipes, setRecipes] = React.useState([]);
  const [mappingData, setMappingData] = React.useState(null);
  const [mapping, setMapping] = React.useState({});
  const [progress, setProgress] = React.useState({ done: 0, total: 0, imported: 0, ranges: 0 });
  const [echecs, setEchecs] = React.useState([]); // [{ nom, raison }]
  const [fileNotes, setFileNotes] = React.useState([]);
  const [dragOver, setDragOver] = React.useState(false);
  const [carteId, setCarteId] = React.useState(() => (cartes.some(c => c.id === carteIdDefaut) ? carteIdDefaut : ''));
  const [rubrique, setRubrique] = React.useState(() => rubriqueDominante(plats, carteIdDefaut));
  const fileInputRef = React.useRef(null);
  const cancelRef = React.useRef(false);
  const carte = cartes.find(c => c.id === carteId) || null;

  const choisirCarte = (id) => { setCarteId(id); setRubrique(rubriqueDominante(plats, id)); };
  const rubriqueDe = (r) => rubrique || (CATEGORIES_PLAT.includes(r.categorie) ? r.categorie : 'Plats');

  const reset = () => {
    setStep('choose'); setParseError('');
    setRecipes([]); setMappingData(null); setMapping({});
    setFileNotes([]); setEchecs([]);
  };

  // Une fiche qui porte le nom d'une fiche de l'établissement (ou d'une autre
  // fiche du même import) arrive décochée : un second import du même fichier
  // ne double rien sans qu'on le demande.
  const marquerDoublons = (list) => {
    const vus = new Set((recettes || []).map(r => cleNom(r.nom)));
    return list.map(r => {
      const cle = cleNom(r.nom);
      const doublon = vus.has(cle);
      vus.add(cle);
      if (!doublon) return r;
      return { ...r, _selected: false, _warnings: [...(r._warnings || []), 'Ce nom existe déjà dans l\'établissement : décochée'] };
    });
  };

  const detectKind = (file) => {
    const name = String(file.name || '').toLowerCase();
    const type = String(file.type || '').toLowerCase();
    if (type.startsWith('image/') || /\.(png|jpe?g|webp|heic|heif|gif|bmp|tiff?)$/.test(name)) return 'photo';
    if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
    if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')
        || type.includes('spreadsheet') || type.includes('excel') || type === 'text/csv') return 'excel';
    return 'unknown';
  };

  // Plusieurs fichiers d'un coup : chacun est lu selon son type, les fiches
  // sont réunies dans un seul aperçu, un fichier en échec ne bloque pas les autres.
  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setParsing(true); setParseError('');
    resetUnrecognizedUnits();

    const aggregated = [];
    const notes = [];
    let needsMappingResult = null;
    const many = files.length > 1;

    for (let idx = 0; idx < files.length; idx += 1) {
      const file = files[idx];
      const kind = detectKind(file);
      setParsingMsg(many ? `Lecture ${idx + 1}/${files.length} : ${file.name}…` : 'Lecture du fichier…');
      try {
        if (kind === 'excel') {
          const result = await parseWorkbook(await file.arrayBuffer());
          if (result.needsMapping) {
            if (!many) needsMappingResult = result;
            else notes.push(`${file.name} : colonnes non reconnues. Importez-le seul pour choisir les colonnes.`);
          } else if (result.recipes && result.recipes.length) {
            aggregated.push(...result.recipes);
          } else {
            notes.push(`${file.name} : aucune fiche trouvée.`);
          }
        } else if (kind === 'pdf') {
          const { parsePdf } = await import('./PdfImporter.js');
          const result = await parsePdf(await file.arrayBuffer());
          if (result.scanned) notes.push(`${file.name} : PDF scanné, sans texte à lire.`);
          else if (result.recipes && result.recipes.length) aggregated.push(...result.recipes);
          else notes.push(`${file.name} : aucune fiche trouvée.`);
        } else if (kind === 'photo' && iaPermise) {
          setParsingMsg('Lecture de la photo, quelques secondes…');
          const { ocrRecipe } = await import('../../../services/aiService.js');
          const result = await ocrRecipe(file);
          if (result.recipes && result.recipes.length) aggregated.push(...result.recipes);
          else notes.push(`${file.name} : aucune fiche trouvée sur la photo.`);
        } else if (kind === 'photo') {
          notes.push(`${file.name} : les photos ne sont pas lues ici. Remplissez le modèle Excel.`);
        } else {
          notes.push(`${file.name} : format non pris en charge. Utilisez le modèle Excel.`);
        }
      } catch (err) {
        notes.push(`${file.name} : ${messageErreur(err, 'import des recettes', 'fichier illisible.')}`);
      }
    }

    setParsing(false);
    setParsingMsg('Lecture du fichier…');

    if (needsMappingResult && !aggregated.length) {
      setMappingData(needsMappingResult);
      setMapping(needsMappingResult.detected || {});
      setStep('mapping');
      return;
    }
    if (aggregated.length) {
      setFileNotes(notes);
      setRecipes(marquerDoublons(aggregated));
      setStep('preview');
    } else {
      setParseError(notes.length ? notes.join('\n') : 'Aucune fiche trouvée.');
    }
  };

  const onInputChange = (e) => {
    // Copie avant de vider le champ : remettre la valeur à vide peut vider la
    // liste elle-même, et l'import ne recevait alors aucun fichier.
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length) handleFiles(files);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length) handleFiles(files);
  };

  const applyMapping = () => {
    if (mapping.titre == null) {
      notify('Choisissez au moins la colonne du nom de la recette.', 'warning');
      return;
    }
    try {
      const built = buildFromMapping(mappingData.rows, mappingData.headerRowIndex, mapping);
      if (!built.length) { setParseError('Aucune fiche construite avec ces colonnes.'); return; }
      setRecipes(marquerDoublons(built));
      setStep('preview');
    } catch (err) {
      setParseError('Colonnes invalides. ' + messageErreur(err, 'import des recettes'));
    }
  };

  // Une fiche, puis son plat sur la carte choisie (au nom de la fiche, la
  // fiche rattachée en composant). Une fiche créée dont le rangement échoue
  // reste dans la bibliothèque, et l'échec est dit à la fin.
  const importerUne = async (r) => {
    const payload = toRecettePayload(r, etabId, user && user.id);
    await legacySB.db.upsertRecette(payload);
    if (!carteId) return { range: false };
    try {
      const plat = await legacySB.db.upsertPlat({ etablissementId: etabId, nom: payload.nom, categorie: rubriqueDe(r), ordre: 0 });
      await legacySB.db.linkRecetteToPlat(plat.id, payload.id, 'composant', 0);
      await legacySB.db.addPlatToCarte(carteId, plat.id);
      return { range: true };
    } catch (err) {
      console.error('[import recette : rangement carte]', err);
      return { range: false, raison: 'fiche créée, mais pas rangée dans la carte' };
    }
  };

  const runImport = async (list) => {
    if (!legacySB) { notify('Base non connectée.', 'error'); return; }
    cancelRef.current = false;
    setStep('importing');
    setEchecs([]);
    let imported = 0, ranges = 0, done = 0;
    const aReprendre = [];
    setProgress({ done: 0, total: list.length, imported: 0, ranges: 0 });
    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      if (cancelRef.current) break;
      const batch = list.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(importerUne));
      results.forEach((res, k) => {
        done += 1;
        const nom = String(batch[k].nom || '').trim();
        if (res.status === 'fulfilled') {
          imported += 1;
          if (res.value.range) ranges += 1;
          if (res.value.raison) aReprendre.push({ nom, raison: res.value.raison });
        } else {
          console.error('[import recette]', res.reason);
          aReprendre.push({ nom, raison: messageErreur(res.reason, 'import des recettes', 'fiche non créée.') });
        }
      });
      setProgress({ done, total: list.length, imported, ranges });
    }
    setEchecs(aReprendre);
    setStep('done');
    if (imported > 0) {
      inscrireGeste(etabId, 'fiche_importee', imported);
      notify(`${imported} fiche(s) importée(s).`, aReprendre.length ? 'warning' : 'success');
      if (onImported) onImported();
    } else {
      notify('Aucune fiche importée.', 'error');
    }
  };

  const aImporter = recipes.filter(r => r._selected !== false && isRecipeValid(r));
  const importAllValid = () => {
    if (!aImporter.length) { notify('Aucune fiche valide cochée.', 'warning'); return; }
    runImport(aImporter);
  };

  const telechargerModele = async () => {
    try {
      const { telechargerModeleFiches } = await import('./modeleFiches.js');
      await telechargerModeleFiches();
    } catch (err) {
      notify('Téléchargement impossible. ' + messageErreur(err, 'import des recettes'), 'error');
    }
  };

  const formats = iaPermise ? 'Excel, CSV, PDF ou photos' : 'Excel, CSV ou PDF';

  return (
    <Fenetre id="import-fiches" titre="Importer des fiches" onClose={onClose} largeur={860}>
      {step === 'choose' && (
        <>
          <div style={fst.remarque}>
            Remplissez le modèle : le nom de la fiche une seule fois, puis une ligne par ingrédient
            et une étape par ligne. Déposez ensuite le fichier ici, ou plusieurs à la fois.
          </div>
          <div>
            <Btn variant="ghost" onClick={telechargerModele}>Télécharger le modèle Excel</Btn>
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current && fileInputRef.current.click(); } }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            style={{ ...dropZone, ...(dragOver ? dropZoneActive : {}) }}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={iaPermise ? '.xlsx,.xls,.csv,.pdf,image/*' : '.xlsx,.xls,.csv,.pdf'}
              style={{ display: 'none' }}
              onChange={onInputChange}
            />
            <div style={{ fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)' }}>
              Déposez vos fichiers ici, ou touchez pour les choisir
            </div>
            <div style={{ fontSize: 'var(--t1)', color: 'var(--text2)' }}>{formats}</div>
          </div>
          {parsing && <div style={{ fontSize: 'var(--t2)', color: 'var(--lien)' }}>{parsingMsg}</div>}
          {parseError && <div style={errBox}>{parseError}</div>}
        </>
      )}

      {step === 'mapping' && mappingData && (
        <>
          <div style={fst.remarque}>
            Les colonnes de ce fichier n'ont pas été reconnues. Indiquez la colonne de chaque information.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {Object.entries(FIELD_LABELS).map(([field, label]) => (
              <label key={field} style={fst.section}>
                <span style={fst.label}>{label}{field === 'titre' ? ' (obligatoire)' : ''}</span>
                <select
                  value={mapping[field] == null ? '' : mapping[field]}
                  onChange={e => setMapping(m => ({ ...m, [field]: e.target.value === '' ? null : Number(e.target.value) }))}
                  style={fst.champ}
                >
                  <option value="">Ignorer</option>
                  {mappingData.headers.map(h => <option key={h.index} value={h.index}>{h.label}</option>)}
                </select>
              </label>
            ))}
          </div>
          {parseError && <div style={errBox}>{parseError}</div>}
          <div style={fst.pied}>
            <Btn variant="ghost" onClick={reset}>Retour</Btn>
            <Btn variant="primary" onClick={applyMapping}>Continuer</Btn>
          </div>
        </>
      )}

      {step === 'preview' && (
        <>
          <div style={destination}>
            <label style={{ ...fst.section, flex: '1 1 240px' }}>
              <span style={fst.label}>Ranger les fiches dans</span>
              <select value={carteId} onChange={e => choisirCarte(e.target.value)} style={fst.champ}>
                <option value="">La bibliothèque seulement</option>
                {cartes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </label>
            {carte && (
              <label style={{ ...fst.section, flex: '1 1 200px' }}>
                <span style={fst.label}>Rubrique sur la carte</span>
                <select value={rubrique} onChange={e => setRubrique(e.target.value)} style={fst.champ}>
                  <option value="">Celle de chaque fiche</option>
                  {CATEGORIES_PLAT.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            )}
            <div style={{ ...fst.remarque, flexBasis: '100%' }}>
              {carte
                ? <>Chaque fiche devient un plat de la carte <strong data-no-translate="">{carte.nom}</strong>, à son nom. Les fiches arrivent en brouillon.</>
                : 'Les fiches arrivent en brouillon dans la bibliothèque. Vous pourrez les rattacher à des plats ensuite.'}
            </div>
          </div>
          {fileNotes.length > 0 && (
            <div style={warnBox}>
              <strong>{fileNotes.length} fichier(s) non lu(s) :</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {fileNotes.map((n, i) => <li key={i} style={{ marginBottom: 2 }}>{n}</li>)}
              </ul>
            </div>
          )}
          <ImportPreview recipes={recipes} onChange={setRecipes} unrecognizedUnits={getUnrecognizedUnits()} />
          <div style={fst.pied}>
            <Btn variant="ghost" onClick={reset}>Autre fichier</Btn>
            <div style={{ flex: 1 }} />
            <Btn variant="primary" onClick={importAllValid} disabled={!aImporter.length}>
              Importer <span data-no-translate="">{aImporter.length}</span> {aImporter.length > 1 ? 'fiches' : 'fiche'}
            </Btn>
          </div>
        </>
      )}

      {step === 'importing' && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)' }}>
            Import en cours : {progress.done} sur {progress.total}
          </div>
          <div style={{ height: 10, background: 'var(--piste)', borderRadius: 'var(--r-full)', margin: '14px 0', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`, background: 'var(--accent)', transition: 'width 0.2s' }} />
          </div>
          <Btn variant="ghost" onClick={() => { cancelRef.current = true; }}>Arrêter après ce lot</Btn>
        </div>
      )}

      {step === 'done' && (
        <div style={{ padding: '8px 0' }}>
          <div style={{ fontSize: 'var(--t3)', fontWeight: 'var(--g3)', color: 'var(--text)' }}>Import terminé</div>
          <div style={{ fontSize: 'var(--t2)', color: 'var(--text2)', marginTop: 6, lineHeight: 1.5 }}>
            {progress.imported} fiche(s) importée(s)
            {carte && progress.ranges > 0 ? <>, {progress.ranges} rangée(s) dans <span data-no-translate="">{carte.nom}</span></> : ''}
            {cancelRef.current ? ', import arrêté' : ''}.
          </div>
          {echecs.length > 0 && (
            <div style={{ ...errBox, marginTop: 12 }}>
              <strong>À reprendre :</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {echecs.map((e, i) => <li key={i}><span data-no-translate="">{e.nom}</span> : {e.raison}</li>)}
              </ul>
            </div>
          )}
          <div style={fst.pied}>
            <Btn variant="ghost" onClick={reset}>Importer d'autres fiches</Btn>
            <Btn variant="primary" onClick={onClose}>Fermer</Btn>
          </div>
        </div>
      )}
    </Fenetre>
  );
}

const destination = {
  display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end',
  padding: 14, borderRadius: 'var(--r)', background: 'var(--piste)',
};
// Zone de dépôt : une tuile intérieure (pas de cadre en pointillés, Galet).
const dropZone = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
  cursor: 'pointer', textAlign: 'center', padding: '34px 18px',
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)', borderRadius: 'var(--r-lg)', background: 'var(--piste)',
  transition: 'border-color 0.15s, background 0.15s',
};
const dropZoneActive = {
  borderColor: 'var(--onglet)', background: 'var(--selection)',
};
const errBox = {
  padding: '8px 0 8px 12px', fontSize: 'var(--t1)', borderLeft: '2px solid var(--danger-bd)', color: 'var(--danger-text)', whiteSpace: 'pre-line',
};
const warnBox = {
  padding: '8px 0 8px 12px', fontSize: 'var(--t1)', borderLeft: '2px solid var(--warning-bd)', color: 'var(--warning-text)',
};
