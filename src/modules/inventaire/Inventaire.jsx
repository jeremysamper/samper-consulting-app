import React from 'react';
import { getDemoData } from '../../data/demoData.js';
import { pdfUtils } from '../../services/pdf.js';
import { alertLegacy, confirmLegacy, notifyLegacy, readLegacyStorage, writeLegacyStorage } from '../../legacy/legacyApi.js';
import { dbService } from '../../services/dbService.js';
import { useSelection } from '../../hooks/useSelection.js';
import { SelectionToolbar } from '../../components/ui/SelectionToolbar.jsx';
import { exportRowsToXlsx } from '../../utils/exportXlsx.js';
import BottomActionBar from '../../components/mobile/BottomActionBar.jsx';
import { FileSpreadsheet, FileDown, Plus } from 'lucide-react';

// INVENTAIRE MENSUEL
const Inventaire = ({ user, etablissement }) => {
  const etabId = etablissement?.id || 'etab-1';
  const legacySB = dbService.getBridge();
  const demoData = getDemoData();
  const [inventairesAll, setInventairesAll] = React.useState(() => legacySB ? [] : readLegacyStorage('sc_inventaires', demoData.inventaires));
  // Filtrer par établissement courant
  const inventaires = inventairesAll.filter(i => (i.etablissementId || 'etab-1') === etabId);
  const [selectedId, setSelectedId] = React.useState(() => readLegacyStorage('sc_inventaire_selected', inventaires[0]?.id));
  const [catFilter, setCatFilter] = React.useState('Tous');
  const [typeFilter, setTypeFilter] = React.useState('Tous');
  const [search, setSearch] = React.useState('');
  const [showNew, setShowNew] = React.useState(false);
  const [showAddLine, setShowAddLine] = React.useState(false);
  const [newLine, setNewLine] = React.useState({ produit: '', categorie: 'Autres', unite: 'pcs', stockTheo: 0, stockReel: 0, prixUnit: 0 });
  // Autocomplétion catalogue : index de la suggestion en cours de focus (-1 = aucune)
  const [autocompleteFocus, setAutocompleteFocus] = React.useState(-1);
  const [autocompleteOpen, setAutocompleteOpen] = React.useState(false);
  const perms = demoData.permissions[user.role] || {};
  const canManage = !!perms.inventaire;
  // Actions d'import/export/impression réservées à consultant + patron
  const canExport = ['consultant', 'patron'].includes(user.role);
  const sel = useSelection();
  const [bulkBusy, setBulkBusy] = React.useState(false);

  // ═══ Load Supabase + Realtime ═══
  React.useEffect(() => {
    if (!legacySB) return;
    let unsub = null, mounted = true;
    (async () => {
      try {
        const invs = await legacySB.db.listInventaires(etabId);
        if (mounted) {
          setInventairesAll(invs);
          if (!selectedId && invs[0]) setSelectedId(invs[0].id);
        }
      } catch (err) { console.error('[Inventaire load]', err); }
    })();
    unsub = legacySB.realtime.subscribeReload('inventaires', async () => {
      try { const invs = await legacySB.db.listInventaires(etabId); if (mounted) setInventairesAll(invs); } catch(e) {}
    });
    return () => { mounted = false; unsub && unsub(); };
  }, [etabId]);

  // ─── Catalogue produits (pour autocomplétion à l'ajout de ligne) ───
  const [catalogue, setCatalogue] = React.useState([]);
  React.useEffect(() => {
    if (!legacySB) return;
    let mounted = true;
    legacySB.db.listProduits(etabId)
      .then(ps => { if (mounted) setCatalogue(ps || []); })
      .catch(err => console.warn('[Inventaire] catalogue load failed', err));
    const unsub = legacySB.realtime.subscribeReload('produits', async () => {
      try {
        const ps = await legacySB.db.listProduits(etabId);
        if (mounted) setCatalogue(ps || []);
      } catch(e) {}
    });
    return () => { mounted = false; unsub && unsub(); };
  }, [etabId]);

  // Si l'inventaire sélectionné n'existe pas dans l'établissement courant, basculer sur le premier
  React.useEffect(() => {
    if (!inventaires.find(i => i.id === selectedId) && inventaires[0]) {
      setSelectedId(inventaires[0].id);
    }
  }, [etabId, inventairesAll.length]);

  // Persistance : localStorage en fallback uniquement
  React.useEffect(() => { demoData.inventaires = inventairesAll; if (!legacySB) writeLegacyStorage('sc_inventaires', inventairesAll); }, [inventairesAll]);
  React.useEffect(() => { writeLegacyStorage('sc_inventaire_selected', selectedId); }, [selectedId]);

  // Helper pour push un inventaire modifié vers Supabase
  const saveInv = async (inv) => {
    if (!legacySB) return;
    try { await legacySB.db.upsertInventaire(inv); }
    catch (err) { console.error('[upsertInventaire]', err); notifyLegacy('Erreur sync : ' + err.message, 'error'); }
  };

  const inv = inventaires.find(i => i.id === selectedId) || inventaires[0];

  // Créer un inventaire vide (utilisé par le bouton "premier inventaire" et la modale showNew)
  const createEmptyInventory = async () => {
    const clone = {
      id: 'inv-' + Date.now(),
      etablissementId: etabId,
      date: new Date().toISOString().slice(0, 10),
      statut: 'en cours',
      validePar: null,
      valeurTotale: 0,
      lignes: [],
    };
    setInventairesAll(prev => [clone, ...prev]);
    setSelectedId(clone.id);
    setShowNew(false);
    if (legacySB) {
      try { await legacySB.db.upsertInventaire(clone); }
      catch (err) { notifyLegacy('Erreur création inventaire : ' + err.message, 'error'); }
    }
  };

  // ─── Comparaison vs inventaire précédent ───
  // ATTENTION : ce useMemo DOIT être déclaré AVANT le early return `if (!inv)`,
  // sinon React voit "1 hook de moins au premier render" et crash (error #310).
  // Tous les hooks doivent être appelés dans le même ordre à chaque render.
  // On cherche l'inventaire de l'établissement avec la date juste antérieure à
  // celle de l'inventaire courant. Sert à voir l'évolution de la valeur du stock.
  const previousInv = React.useMemo(() => {
    if (!inv?.date) return null;
    const candidates = (inventaires || [])
      .filter(i => i.id !== inv.id && i.date && i.date < inv.date)
      .sort((a, b) => b.date.localeCompare(a.date));
    return candidates[0] || null;
  }, [inv?.id, inv?.date, inventaires.length]);

  if (!inv) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 40, opacity: 0.4 }}>📦</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginTop: 10, fontFamily: 'var(--font-serif)' }}>Aucun inventaire pour cet établissement</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 6, marginBottom: 16 }}>Créez votre premier inventaire pour commencer.</div>
        {canManage && <button style={invs.addBtn} onClick={createEmptyInventory} type="button">+ Créer le premier inventaire</button>}
      </div>
    );
  }

  const cats = ['Tous', ...Array.from(new Set((inv.lignes || []).map(l => l.categorie)))];
  const filtered = (inv.lignes || []).filter(l =>
    (catFilter === 'Tous' || l.categorie === catFilter) &&
    (typeFilter === 'Tous' || (l.type || '') === typeFilter) &&
    (search === '' || l.produit.toLowerCase().includes(search.toLowerCase()))
  );
  // Liste des types présents dans l'inventaire (pour afficher le filtre si au moins 1 ligne a un type)
  const hasTypes = inv.lignes.some(l => l.type);

  const recalcInventaire = (inventory) => {
    inventory.lignes.forEach(l => {
      l.ecart = +(l.stockReel - l.stockTheo).toFixed(2);
      l.valeur = +(l.stockReel * l.prixUnit).toFixed(2);
      l.ecartValeur = +(l.ecart * l.prixUnit).toFixed(2);
    });
    inventory.valeurTotale = +inventory.lignes.reduce((s,l) => s + l.valeur, 0).toFixed(2);
    return inventory;
  };

  const deleteLine = async (lineId) => {
    if (!canManage || !confirmLegacy('Supprimer cette ligne d\'inventaire ?')) return;
    const updated = recalcInventaire({ ...inv, lignes: (inv.lignes || []).filter(l => l.id !== lineId) });
    setInventairesAll(prev => prev.map(i => i.id !== inv.id ? i : updated));
    await saveInv(updated);
  };

  // ─── Mode sélection : suppression et export Excel en lot ───
  const supprimerLignesSelection = async () => {
    if (!canManage || sel.count === 0) return;
    if (!confirmLegacy(`Supprimer ${sel.count} ligne(s) d'inventaire ?`)) return;
    setBulkBusy(true);
    const updated = recalcInventaire({ ...inv, lignes: (inv.lignes || []).filter(l => !sel.ids.has(l.id)) });
    setInventairesAll(prev => prev.map(i => i.id !== inv.id ? i : updated));
    await saveInv(updated);
    setBulkBusy(false);
    sel.exit();
    notifyLegacy('Lignes supprimées.', 'success');
  };

  const exporterLignesSelection = async () => {
    const rows = (inv.lignes || []).filter(l => sel.ids.has(l.id));
    if (!rows.length) return;
    setBulkBusy(true);
    const headers = ['Produit', 'Catégorie', 'Unité', 'Stock théorique', 'Stock réel', 'Écart', 'Prix unitaire (CHF)', 'Valeur (CHF)', 'Écart valeur (CHF)'];
    const data = rows.map(l => [l.produit, l.categorie, l.unite, l.stockTheo, l.stockReel, l.ecart, l.prixUnit, l.valeur, l.ecartValeur]);
    try {
      await exportRowsToXlsx(`inventaire-${inv.date}.xlsx`, 'Inventaire', headers, data, [28, 18, 8, 14, 12, 10, 16, 14, 16]);
      notifyLegacy(`${rows.length} ligne(s) exportée(s) en Excel.`, 'success');
    } catch (err) {
      notifyLegacy('Erreur export : ' + err.message, 'error');
    }
    setBulkBusy(false);
  };

  const deleteInventory = async () => {
    if (!canManage || inventaires.length <= 1 || !confirmLegacy('Supprimer cet inventaire ?')) return;
    const idToDelete = inv.id;
    if (legacySB) {
      try { await legacySB.db.deleteInventaire(idToDelete); }
      catch (err) { notifyLegacy('Erreur : ' + err.message, 'error'); return; }
    }
    setInventairesAll(prev => prev.filter(i => i.id !== idToDelete));
    const remaining = inventaires.filter(i => i.id !== idToDelete);
    if (remaining[0]) setSelectedId(remaining[0].id);
  };

  const createInventory = async () => {
    const base = inventaires[0];
    const clone = base ? JSON.parse(JSON.stringify(base)) : { lignes: [] };
    clone.id = 'inv-' + Date.now();
    clone.etablissementId = etabId;
    clone.date = new Date().toISOString().slice(0, 10);
    clone.statut = 'en cours';
    clone.validePar = null;
    clone.lignes = (clone.lignes || []).map((l, idx) => ({ ...l, id: 'l' + Date.now() + idx, stockTheo: l.stockReel || 0, stockReel: l.stockReel || 0 }));
    recalcInventaire(clone);
    setInventairesAll(prev => [clone, ...prev]);
    setSelectedId(clone.id);
    setShowNew(false);
    await saveInv(clone);
  };

  // ═══ Ajout manuel d'un produit ═══
  // (les states showAddLine/newLine sont déclarés en haut du composant pour respecter les règles des hooks)

  const openAddLine = () => {
    setNewLine({ produit: '', categorie: cats.find(c => c !== 'Tous') || 'Autres', unite: 'pcs', stockTheo: 0, stockReel: 0, prixUnit: 0 });
    setShowAddLine(true);
  };

  const addLine = async () => {
    if (!newLine.produit.trim()) { alertLegacy('Le nom du produit est requis.'); return; }
    const line = {
      id: 'l' + Date.now(),
      produit: newLine.produit.trim(),
      categorie: newLine.categorie || 'Autres',
      unite: newLine.unite || 'pcs',
      stockTheo: parseFloat(newLine.stockTheo) || 0,
      stockReel: parseFloat(newLine.stockReel) || 0,
      prixUnit: parseFloat(newLine.prixUnit) || 0,
    };
    const updated = recalcInventaire({ ...inv, lignes: [...(inv.lignes || []), line] });
    setInventairesAll(prev => prev.map(i => i.id !== inv.id ? i : updated));
    setShowAddLine(false);
    await saveInv(updated);
  };

  // ═══ Import / Template XLSX ═══
  const downloadInventoryTemplate = async () => {
    const XLSX = await import('xlsx'); // chargé à la demande (hors bundle du module)
    const wb = XLSX.utils.book_new();
    const rows = [
      ['Produit', 'Catégorie', 'Stock théorique', 'Stock réel', 'Unité', 'Prix unitaire (CHF)'],
      ['Filet de bœuf CH', 'Viandes', 15, 14.2, 'kg', 48.00],
      ['Tomates cerises bio', 'Légumes', 8, 7.5, 'kg', 6.80],
      ['Beurre doux 250g', 'Produits laitiers', 12, 12, 'pcs', 3.20],
      ['Riz Arborio', 'Féculents', 10, 9.8, 'kg', 4.50],
      ['Vin blanc Chasselas', 'Boissons', 24, 22, 'btl', 12.00],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 32 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 8 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Inventaire');

    const instr = XLSX.utils.aoa_to_sheet([
      ['Instructions d\'utilisation du template inventaire'],
      [''],
      ['1. Remplissez une ligne par produit dans la feuille "Inventaire"'],
      ['2. Colonnes requises : Produit, Catégorie, Stock théorique, Stock réel, Unité, Prix unitaire'],
      ['3. Catégories suggérées : Viandes, Poissons, Légumes, Fruits, Produits laitiers, Féculents, Épicerie, Boissons, Autres'],
      ['4. Unités acceptées : g, kg, ml, L, pcs, btl, cs, cc'],
      ['5. Importez le fichier via le bouton "Importer XLSX" dans le module Inventaire'],
      [''],
      ['L\'import ajoute les produits à l\'inventaire actuellement sélectionné.'],
      ['Les produits dont le nom existe déjà dans l\'inventaire seront mis à jour (stock réel, prix).'],
    ]);
    instr['!cols'] = [{ wch: 90 }];
    XLSX.utils.book_append_sheet(wb, instr, 'Instructions');

    XLSX.writeFile(wb, 'template-inventaire-samper.xlsx');
  };

  // Parser pour format "Samper inventaire" (feuilles Sec/Positif/Négatif)
  // Colonnes attendues : Catégorie | Produit | Prix unitaire | Prix Carton | Prix au Kg | Nbre unitaire | Nbre carton | Kg | Total
  // offset = décalage de colonnes (0 si le tableau commence colonne A, 1 si colonne B, etc.)
  const parseSamperInventorySheet = (rows, typeFeuille, offset = 0) => {
    if (!rows || rows.length < 2) return [];
    // Trouver la ligne d'en-tête (contient "Catégorie" ou "Catégories" + "Produit")
    let headerIdx = -1;
    for (let i = 0; i < Math.min(5, rows.length); i++) {
      const joined = (rows[i] || []).map(c => String(c || '').toLowerCase()).join('|');
      if (/cat[ée]gorie/.test(joined) && /produit/.test(joined)) { headerIdx = i; break; }
    }
    if (headerIdx === -1) headerIdx = 0;

    const lignes = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const col = (n) => row[offset + n];
      const categorie = String(col(0) || '').trim();
      const produit = String(col(1) || '').trim();
      if (!produit) continue;
      // Ignorer sous-entêtes répétés (ex: "Produit" en cellule produit)
      if (produit.toLowerCase() === 'produit') continue;

      const prixUnitaire = parseFloat(col(2)) || 0;
      const prixCarton   = parseFloat(col(3)) || 0;
      const prixAuKg     = parseFloat(col(4)) || 0;
      const nbreUnit     = parseFloat(col(5)) || 0;
      const nbreCarton   = parseFloat(col(6)) || 0;
      const kg           = parseFloat(col(7)) || 0;
      const total        = parseFloat(col(8)) || 0;

      // ─── Consolidation : 1 ligne par produit, unité principale selon ce qui est rempli
      // Priorité : Kg > Nbre unitaire > Nbre carton
      // Prix unit calculé depuis Total si dispo (plus précis que px_kg/px_unit isolés)
      let stockReel = 0, unite = 'pcs', prixUnit = 0;

      if (kg > 0) {
        stockReel = kg * 1000;
        unite = 'g';
        prixUnit = (total > 0 && stockReel > 0)
          ? total / stockReel
          : (prixAuKg > 0 ? prixAuKg / 1000 : 0);
      } else if (nbreUnit > 0) {
        stockReel = nbreUnit;
        unite = 'pcs';
        prixUnit = (total > 0 && nbreUnit > 0) ? total / nbreUnit : (prixUnitaire || 0);
      } else if (nbreCarton > 0) {
        stockReel = nbreCarton;
        unite = 'cs';
        prixUnit = (total > 0 && nbreCarton > 0) ? total / nbreCarton : (prixCarton || 0);
      } else {
        stockReel = 0;
        unite = 'pcs';
        prixUnit = prixUnitaire || (prixAuKg / 1000) || prixCarton || 0;
      }

      lignes.push({
        id: 'l-' + typeFeuille + '-' + Date.now() + '-' + i,
        produit,
        categorie: categorie || 'Autres',
        unite,
        stockTheo: +stockReel.toFixed(3),
        stockReel: +stockReel.toFixed(3),
        prixUnit: +prixUnit.toFixed(4),
        type: typeFeuille, // 'sec' | 'positif' | 'negatif'
      });
    }
    return lignes;
  };

  const handleImportInventoryXLSX = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const XLSX = await import('xlsx'); // chargé à la demande (hors bundle du module)
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: 'array' });

        // ─── DÉTECTION AUTO DU FORMAT ───
        const sheetNames = wb.SheetNames.map(n => n.toLowerCase());
        const hasSamperFormat = sheetNames.some(n => n === 'sec' || n === 'positif' || n === 'négatif' || n === 'negatif');

        if (hasSamperFormat) {
          // ═══ FORMAT SAMPER INVENTAIRE (feuilles Sec / Positif / Négatif) ═══
          const allLignes = [];
          const stats = { sec: 0, positif: 0, negatif: 0 };

          // Parser chaque feuille si présente
          const sheetMap = [
            { names: ['Sec', 'sec', 'SEC'], type: 'sec' },
            { names: ['Positif', 'positif', 'POSITIF'], type: 'positif' },
            { names: ['Négatif', 'Negatif', 'négatif', 'negatif', 'NÉGATIF', 'NEGATIF'], type: 'negatif' },
          ];

          for (const sm of sheetMap) {
            const sheetName = sm.names.find(n => wb.Sheets[n]);
            if (!sheetName) continue;
            const sh = wb.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: null });

            // Détecter l'offset : certaines feuilles commencent colonne A, d'autres colonne B
            // On cherche sur les 2 premières lignes la position de "Catégorie" ou "Produit"
            let offset = 0;
            for (let i = 0; i < Math.min(3, rows.length); i++) {
              const r = rows[i] || [];
              for (let j = 0; j < Math.min(3, r.length); j++) {
                if (/cat[ée]gorie/i.test(String(r[j] || ''))) { offset = j; break; }
              }
              if (offset > 0) break;
            }

            const lignes = parseSamperInventorySheet(rows, sm.type, offset);
            allLignes.push(...lignes);
            stats[sm.type] = lignes.length;
          }

          if (allLignes.length === 0) {
            alertLegacy('Aucun produit trouvé dans les feuilles Sec / Positif / Négatif.');
            return;
          }

          // Créer un nouvel inventaire (ne pas fusionner — c'est un import complet)
          const newInv = {
            id: 'inv-' + Date.now(),
            etablissementId: etabId,
            date: new Date().toISOString().slice(0, 10),
            statut: 'en cours',
            validePar: null,
            valeurTotale: 0,
            lignes: allLignes,
          };
          const updated = recalcInventaire(newInv);
          setInventairesAll(prev => [updated, ...prev]);
          setSelectedId(updated.id);
          await saveInv(updated);

          notifyLegacy(
            `✓ Inventaire importé avec succès\n\n` +
            `• ${stats.sec} produit${stats.sec > 1 ? 's' : ''} Sec\n` +
            `• ${stats.positif} produit${stats.positif > 1 ? 's' : ''} Positif\n` +
            `• ${stats.negatif} produit${stats.negatif > 1 ? 's' : ''} Négatif\n\n` +
            `Total : ${allLignes.length} lignes`,
            'success', { duration: 6000 }
          );
          return;
        }

        // ═══ FORMAT TEMPLATE SIMPLE (feuille "Inventaire") ═══
        const sh = wb.Sheets['Inventaire'] || wb.Sheets[wb.SheetNames[0]];
        if (!sh) { alertLegacy('Feuille "Inventaire" introuvable.'); return; }
        const rows = XLSX.utils.sheet_to_json(sh, { header: 1 });

        const imported = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || !row[0]) continue;
          const produit = String(row[0]).trim();
          if (!produit) continue;
          imported.push({
            id: 'l' + Date.now() + '-' + i,
            produit,
            categorie: String(row[1] || 'Autres').trim(),
            stockTheo: parseFloat(row[2]) || 0,
            stockReel: parseFloat(row[3]) || 0,
            unite: String(row[4] || 'pcs').trim(),
            prixUnit: parseFloat(row[5]) || 0,
          });
        }

        if (imported.length === 0) { alertLegacy('Aucun produit valide trouvé dans le fichier.'); return; }

        // Fusionner : mise à jour par nom si existe déjà, ajout sinon
        const existingByName = new Map((inv.lignes || []).map(l => [l.produit.toLowerCase(), l]));
        let nouveaux = 0, misAJour = 0;
        const newLignes = [...(inv.lignes || [])];
        imported.forEach(impLine => {
          const existing = existingByName.get(impLine.produit.toLowerCase());
          if (existing) {
            Object.assign(existing, { stockReel: impLine.stockReel, stockTheo: impLine.stockTheo, prixUnit: impLine.prixUnit, unite: impLine.unite, categorie: impLine.categorie });
            misAJour++;
          } else {
            newLignes.push(impLine);
            nouveaux++;
          }
        });
        const updated = recalcInventaire({ ...inv, lignes: newLignes });
        setInventairesAll(prev => prev.map(i => i.id !== inv.id ? i : updated));
        await saveInv(updated);
        notifyLegacy(`✓ Import terminé\n${nouveaux} produit${nouveaux > 1 ? 's' : ''} ajouté${nouveaux > 1 ? 's' : ''}\n${misAJour} produit${misAJour > 1 ? 's' : ''} mis à jour`, 'success');
      } catch (err) {
        console.error(err);
        notifyLegacy('Erreur lors de l\'import : ' + err.message, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const totEcart = (inv.lignes || []).reduce((s,l) => s + Math.abs(l.ecartValeur), 0);
  const totPositif = (inv.lignes || []).filter(l => l.ecart > 0).length;
  const totNegatif = (inv.lignes || []).filter(l => l.ecart < 0).length;
  const totNul = (inv.lignes || []).filter(l => l.ecart === 0).length;

  const deltaValeur = previousInv ? (inv.valeurTotale - previousInv.valeurTotale) : null;
  const deltaPct = (previousInv && previousInv.valeurTotale > 0)
    ? (deltaValeur / previousInv.valeurTotale * 100)
    : null;

  const printInventory = () => {
    if (!pdfUtils?.printElement) {
      notifyLegacy('Export PDF indisponible pour le moment.', 'error');
      return;
    }
    pdfUtils.printElement('inventaire-print', 'Inventaire mensuel', { etablissement, orientation: 'landscape' });
  };

  const exportInventoryPdf = () => {
    if (!pdfUtils?.exportElementToPdf) {
      notifyLegacy('Export PDF indisponible pour le moment.', 'error');
      return;
    }
    pdfUtils.exportElementToPdf('inventaire-print', 'inventaire.pdf', { etablissement, title: 'Inventaire mensuel', orientation: 'landscape' });
  };

  return (
    <div style={invs.root}>
      <div style={invs.header} className="no-print">
        <div style={invs.headerLeft}>
          <select style={invs.invSelect} value={inv.id} onChange={e => setSelectedId(e.target.value)}>
            {(inventaires || []).map(i => <option key={i.id} value={i.id}>Inventaire {i.date} — {i.statut}</option>)}
          </select>
          <span style={{...invs.badge, background: inv.statut==='validé' ? 'var(--success-bg)' : 'var(--warning-bg)', color: inv.statut==='validé' ? 'var(--success-text)' : 'var(--warning-text)'}}>{inv.statut === 'validé' ? '✓ Validé' : '⏳ En cours'}</span>
        </div>
        <div style={invs.headerRight} className="desktop-toolbar">
          {canManage && <button style={invs.addBtn} onClick={() => setShowNew(true)}>+ Nouvel inventaire</button>}
          {canManage && <button style={invs.exportBtn} onClick={openAddLine}>+ Ajouter produit</button>}
          {canManage && !sel.active && <button style={invs.exportBtn} onClick={sel.enter}>☑ Sélectionner</button>}
          {canExport && <button style={invs.exportBtn} onClick={downloadInventoryTemplate}>📄 Template XLSX</button>}
          {canExport && (
            <label style={{...invs.exportBtn, cursor:'pointer'}}>
              📥 Importer XLSX
              <input type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={handleImportInventoryXLSX}/>
            </label>
          )}
          {canManage && inventaires.length > 1 && <button style={invs.deleteBtn} onClick={deleteInventory}>Supprimer inventaire</button>}
          {canExport && <button style={invs.exportBtn} onClick={printInventory}>🖨 Imprimer</button>}
          {canExport && <button style={invs.exportBtn} onClick={exportInventoryPdf}>⬇ Export PDF</button>}
        </div>
      </div>

      <div id="inventaire-print">
        <div style={invs.kpiBar}>
          <div style={invs.kpiCard}><div style={invs.kpiLabel}>Valeur totale du stock</div><div style={invs.kpiVal}>CHF {inv.valeurTotale.toLocaleString('fr-CH', {minimumFractionDigits:2})}</div></div>
          {/* Évolution vs inventaire précédent */}
          {previousInv && deltaValeur != null && (
            <div style={invs.kpiCard}>
              <div style={invs.kpiLabel}>
                Évolution vs précédent
                <span style={{ fontSize: 9, color: 'var(--text2)', fontWeight: 400, marginLeft: 4 }}>
                  ({previousInv.date})
                </span>
              </div>
              <div style={{
                ...invs.kpiVal,
                color: deltaValeur > 0 ? 'var(--success-strong)' : deltaValeur < 0 ? 'var(--danger-strong)' : 'var(--text2)',
              }}>
                {deltaValeur > 0 ? '+' : ''}CHF {deltaValeur.toLocaleString('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                {deltaPct != null && (
                  <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 6, opacity: 0.85 }}>
                    ({deltaPct > 0 ? '+' : ''}{deltaPct.toFixed(1)}%)
                  </span>
                )}
              </div>
            </div>
          )}
          <div style={invs.kpiCard}><div style={invs.kpiLabel}>Écarts défavorables</div><div style={{...invs.kpiVal, color:'var(--danger-strong)'}}>−CHF {totEcart.toFixed(2)}</div></div>
          <div style={invs.kpiCard}><div style={invs.kpiLabel}>Lignes conformes</div><div style={{...invs.kpiVal, color:'var(--success-text)'}}>{totNul} / {(inv.lignes || []).length}</div></div>
          <div style={invs.kpiCard}><div style={invs.kpiLabel}>Écarts négatifs</div><div style={{...invs.kpiVal, color:'var(--danger-strong)'}}>{totNegatif} lignes</div></div>
          <div style={invs.kpiCard}><div style={invs.kpiLabel}>Écarts positifs</div><div style={{...invs.kpiVal, color:'var(--success-strong)'}}>{totPositif} lignes</div></div>
        </div>

        <div style={invs.filters} className="no-print">
          <div style={invs.catTabs}>{cats.map(c => <button key={c} style={{...invs.catBtn, ...(catFilter===c?invs.catActive:{})}} onClick={()=>setCatFilter(c)}>{c}</button>)}</div>
          {hasTypes && (
            <div style={{display:'flex', gap:4, alignItems:'center', marginLeft:8}}>
              <span style={{fontSize:11, color:'var(--text2)', fontWeight:600, textTransform:'uppercase', letterSpacing:0.4, marginRight:4}}>Type :</span>
              {['Tous', 'sec', 'positif', 'negatif'].map(t => (
                <button key={t} style={{...invs.catBtn, ...(typeFilter===t?invs.catActive:{}), textTransform:'capitalize'}} onClick={()=>setTypeFilter(t)}>{t === 'Tous' ? 'Tous' : t === 'negatif' ? 'Négatif' : t}</button>
              ))}
            </div>
          )}
          <input style={invs.search} placeholder="Rechercher un produit…" value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>

        {sel.active && (
          <SelectionToolbar
            count={sel.count}
            total={filtered.length}
            allSelected={sel.count > 0 && sel.count === filtered.length}
            onToggleAll={() => (sel.count === filtered.length ? sel.clear() : sel.selectAll(filtered.map(l => l.id)))}
            onDelete={supprimerLignesSelection}
            onExport={exporterLignesSelection}
            exportLabel="⬇ Exporter Excel"
            onCancel={sel.exit}
            busy={bulkBusy}
          />
        )}

        <div style={invs.tableWrap}>
          <div style={{...invs.tableHead, gridTemplateColumns: (sel.active ? '34px ' : '') + (canManage ? '2fr 1fr 1fr 1fr 1fr 1.2fr 1.2fr 90px' : '2fr 1fr 1fr 1fr 1fr 1.2fr 1.2fr')}}>
            {sel.active && <span className="no-print"/>}
            <span>Produit</span><span>Catégorie</span><span style={{textAlign:'right'}}>Stock théorique</span><span style={{textAlign:'right'}}>Stock réel</span><span style={{textAlign:'right'}}>Écart</span><span style={{textAlign:'right'}}>Valeur (CHF)</span><span style={{textAlign:'right'}}>Écart valeur</span>{canManage && <span className="no-print"/>}
          </div>
          {(filtered || []).map(l => {
            const ecartColor = l.ecart < 0 ? 'var(--danger-strong)' : l.ecart > 0 ? 'var(--success-strong)' : 'var(--text2)';
            // Badge type (sec/positif/négatif) si ligne importée via format Samper
            const typeBadge = l.type ? (
              <span style={{
                display: 'inline-block', fontSize: 9, fontWeight: 700, marginLeft: 6, padding: '2px 6px', borderRadius: 4, verticalAlign: 'middle',
                background: l.type === 'sec' ? '#f3e8d6' : l.type === 'positif' ? 'var(--success-bg)' : 'var(--danger-bg)',
                color: l.type === 'sec' ? '#588157' : l.type === 'positif' ? 'var(--success-text)' : 'var(--danger-text)',
                textTransform: 'uppercase', letterSpacing: 0.5,
              }}>{l.type}</span>
            ) : null;
            return (
              <div key={l.id} style={{
                ...invs.tableRow,
                gridTemplateColumns: (sel.active ? '34px ' : '') + (canManage ? '2fr 1fr 1fr 1fr 1fr 1.2fr 1.2fr 90px' : '2fr 1fr 1fr 1fr 1fr 1.2fr 1.2fr'),
                ...(sel.active && sel.isSelected(l.id) ? { background: 'var(--bg)' } : {}),
              }}>
                {sel.active && (
                  <span className="no-print" style={{ display: 'flex', alignItems: 'center' }}>
                    <input type="checkbox" checked={sel.isSelected(l.id)} onChange={() => sel.toggle(l.id)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                  </span>
                )}
                <span style={invs.prodName}>{l.produit}{typeBadge}</span>
                <span style={invs.cell}><span style={invs.catTag}>{l.categorie}</span></span>
                <span style={{...invs.cell, textAlign:'right'}}>{l.stockTheo} {l.unite}</span>
                <span style={{...invs.cellBold, textAlign:'right'}}>{l.stockReel} {l.unite}</span>
                <span style={{...invs.cell, textAlign:'right', color:ecartColor, fontWeight:600}}>{l.ecart > 0 ? '+' : ''}{l.ecart} {l.unite}</span>
                <span style={{...invs.cellBold, textAlign:'right'}}>{l.valeur.toLocaleString('fr-CH', {minimumFractionDigits:2})}</span>
                <span style={{...invs.cell, textAlign:'right', color:ecartColor, fontWeight:600}}>{l.ecartValeur > 0 ? '+' : ''}{l.ecartValeur.toFixed(2)}</span>
                {canManage && <span className="no-print"><button style={invs.deleteBtn} onClick={() => deleteLine(l.id)}>Supprimer</button></span>}
              </div>
            );
          })}
        </div>
      </div>

      {showNew && (
        <div style={invs.overlay} onClick={() => setShowNew(false)}>
          <div style={invs.modal} onClick={e=>e.stopPropagation()}>
            <div style={invs.modalHeader}><div style={{fontWeight:700, fontSize:16, fontFamily:'var(--font-serif)'}}>Nouvel inventaire</div><button style={invs.closeBtn} onClick={() => setShowNew(false)}>✕</button></div>
            <div style={{padding:'22px', display:'flex', flexDirection:'column', gap:16}}>
              <div><label style={invs.fieldLabel}>Date de l'inventaire</label><input type="date" defaultValue={new Date().toISOString().slice(0,10)} style={invs.fieldInput}/></div>
              <div><label style={invs.fieldLabel}>Modèle de base</label><select style={invs.fieldInput}><option>Dupliquer depuis l'inventaire courant</option><option>Inventaire vierge</option></select></div>
              <div style={{display:'flex', gap:10, justifyContent:'flex-end', marginTop:4}}><button style={invs.exportBtn} onClick={() => setShowNew(false)}>Annuler</button><button style={invs.addBtn} onClick={createInventory}>Créer</button></div>
            </div>
          </div>
        </div>
      )}

      {/* Modale ajout produit manuel */}
      {showAddLine && (
        <div className="modal-sheet-overlay" style={invs.overlay} onClick={() => setShowAddLine(false)}>
          <div className="modal-sheet" style={{...invs.modal, width: 500}} onClick={e=>e.stopPropagation()}>
            <div style={invs.modalHeader}>
              <div style={{fontWeight:700, fontSize:16, fontFamily:'var(--font-serif)'}}>Ajouter un produit à l'inventaire</div>
              <button style={invs.closeBtn} onClick={() => setShowAddLine(false)}>✕</button>
            </div>
            <div style={{padding:'22px', display:'flex', flexDirection:'column', gap:14}}>
              {/* Champ nom du produit avec autocomplétion catalogue */}
              <div style={{ position: 'relative' }}>
                <label style={invs.fieldLabel}>
                  Nom du produit *
                  {catalogue.length > 0 && (
                    <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text2)', fontWeight: 400, fontStyle: 'italic' }}>
                      ({catalogue.length} produits dans le catalogue — tapez pour rechercher)
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  style={invs.fieldInput}
                  value={newLine.produit}
                  placeholder={catalogue.length > 0 ? "Tapez pour piocher dans le catalogue ou saisir un nom libre" : "Ex : Filet de bœuf CH"}
                  autoComplete="off"
                  onChange={e => {
                    setNewLine({...newLine, produit: e.target.value});
                    setAutocompleteOpen(true);
                    setAutocompleteFocus(-1);
                  }}
                  onFocus={() => setAutocompleteOpen(true)}
                  onBlur={() => {
                    // Délai pour laisser le clic sur une suggestion arriver
                    setTimeout(() => setAutocompleteOpen(false), 150);
                  }}
                  onKeyDown={e => {
                    const q = (newLine.produit || '').toLowerCase().trim();
                    const matches = catalogue
                      .filter(p => p.nom && p.nom.toLowerCase().includes(q))
                      .slice(0, 8);
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setAutocompleteFocus(i => Math.min(i + 1, matches.length - 1));
                      setAutocompleteOpen(true);
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setAutocompleteFocus(i => Math.max(i - 1, -1));
                    } else if (e.key === 'Enter' && autocompleteFocus >= 0 && matches[autocompleteFocus]) {
                      e.preventDefault();
                      const p = matches[autocompleteFocus];
                      setNewLine({
                        ...newLine,
                        produit: p.nom,
                        categorie: p.categorie || 'Autres',
                        unite: p.uniteRef || 'pcs',
                        prixUnit: p.prixUnitaire || 0,
                      });
                      setAutocompleteOpen(false);
                      setAutocompleteFocus(-1);
                    } else if (e.key === 'Escape') {
                      setAutocompleteOpen(false);
                    }
                  }}
                />
                {/* Dropdown suggestions */}
                {autocompleteOpen && newLine.produit.trim() && catalogue.length > 0 && (() => {
                  const q = newLine.produit.toLowerCase().trim();
                  const matches = catalogue
                    .filter(p => p.nom && p.nom.toLowerCase().includes(q))
                    .slice(0, 8);
                  if (matches.length === 0) return null;
                  return (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0,
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 6, maxHeight: 280, overflowY: 'auto',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 10,
                      marginTop: 2,
                    }}>
                      {matches.map((p, i) => (
                        <div
                          key={p.id}
                          onMouseDown={e => {
                            // mouseDown plutôt que click pour battre le onBlur
                            e.preventDefault();
                            setNewLine({
                              ...newLine,
                              produit: p.nom,
                              categorie: p.categorie || 'Autres',
                              unite: p.uniteRef || 'pcs',
                              prixUnit: p.prixUnitaire || 0,
                            });
                            setAutocompleteOpen(false);
                            setAutocompleteFocus(-1);
                          }}
                          onMouseEnter={() => setAutocompleteFocus(i)}
                          style={{
                            padding: '8px 12px',
                            cursor: 'pointer',
                            borderBottom: i < matches.length - 1 ? '1px solid var(--border)' : 'none',
                            background: i === autocompleteFocus ? 'var(--bg)' : 'transparent',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{p.nom}</div>
                            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>
                              {p.categorie || 'Autres'}
                              {p.uniteRef && ` · ${p.uniteRef}`}
                              {p.fournisseurNom && ` · ${p.fournisseurNom}`}
                            </div>
                          </div>
                          {p.prixUnitaire != null && p.prixUnitaire > 0 && (
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap' }}>
                              {p.prixUnitaire.toFixed(p.prixUnitaire < 1 ? 4 : 2)} CHF/{p.uniteRef}
                            </div>
                          )}
                        </div>
                      ))}
                      <div style={{ padding: '6px 12px', fontSize: 10, color: 'var(--text2)', borderTop: '1px solid var(--border)', background: 'var(--bg)', fontStyle: 'italic' }}>
                        ↑↓ pour naviguer · Entrée pour valider · Échap pour fermer
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
                <div>
                  <label style={invs.fieldLabel}>Catégorie</label>
                  <select style={invs.fieldInput} value={newLine.categorie} onChange={e => setNewLine({...newLine, categorie: e.target.value})}>
                    {['Viandes','Poissons','Légumes','Fruits','Produits laitiers','Féculents','Épicerie','Boissons','Autres'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={invs.fieldLabel}>Unité</label>
                  <select style={invs.fieldInput} value={newLine.unite} onChange={e => setNewLine({...newLine, unite: e.target.value})}>
                    {['pcs','kg','g','L','ml','btl','cs','cc'].map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10}}>
                <div>
                  <label style={invs.fieldLabel}>Stock théorique</label>
                  <input type="number" step="0.01" style={invs.fieldInput} value={newLine.stockTheo}
                    onChange={e => setNewLine({...newLine, stockTheo: e.target.value})}/>
                </div>
                <div>
                  <label style={invs.fieldLabel}>Stock réel</label>
                  <input type="number" step="0.01" style={invs.fieldInput} value={newLine.stockReel}
                    onChange={e => setNewLine({...newLine, stockReel: e.target.value})}/>
                </div>
                <div>
                  <label style={invs.fieldLabel}>Prix unit. (CHF)</label>
                  <input type="number" step="0.01" style={invs.fieldInput} value={newLine.prixUnit}
                    onChange={e => setNewLine({...newLine, prixUnit: e.target.value})}/>
                </div>
              </div>
              <div style={{display:'flex', gap:10, justifyContent:'flex-end', marginTop:4}}>
                <button style={invs.exportBtn} onClick={() => setShowAddLine(false)}>Annuler</button>
                <button style={invs.addBtn} onClick={addLine}>Ajouter à l'inventaire</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <BottomActionBar
        actions={[
          canExport ? { label: 'Template', icon: FileSpreadsheet, onClick: downloadInventoryTemplate } : null,
          canExport ? { label: 'Export PDF', icon: FileDown, onClick: exportInventoryPdf } : null,
        ].filter(Boolean)}
        primaryAction={canManage ? { label: 'Ajouter produit', icon: Plus, onClick: openAddLine } : null}
      />
    </div>
  );
};

const invs = {
  root: {display:'flex',flexDirection:'column',gap:16}, header: {display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}, headerLeft: {display:'flex',alignItems:'center',gap:12}, headerRight: {display:'flex',gap:8,flexWrap:'wrap'},
  invSelect: {padding:'8px 12px',border:'1px solid var(--border)',borderRadius:8,fontSize:13,color:'var(--text)',background:'var(--surface)',fontFamily:'var(--font)',cursor:'pointer'}, badge: {display:'inline-block',padding:'5px 12px',borderRadius:12,fontSize:12,fontWeight:600},
  addBtn: {padding:'8px 16px',background:'var(--accent)',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'var(--font)'},
  exportBtn: {padding:'8px 16px',background:'var(--surface)',border:'1px solid var(--border)',color:'var(--text2)',borderRadius:8,fontSize:13,cursor:'pointer',fontFamily:'var(--font)'},
  deleteBtn:{padding:'6px 10px',background:'none',border:'1px solid var(--danger-bd)',color:'var(--danger-strong)',borderRadius:8,fontSize:12,cursor:'pointer',fontFamily:'var(--font)'},
  kpiBar: {display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:12}, kpiCard: {background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:'14px 16px'}, kpiLabel: {fontSize:11,fontWeight:600,color:'var(--text2)',textTransform:'uppercase',letterSpacing:0.4,marginBottom:6}, kpiVal: {fontSize:20,fontWeight:700,fontFamily:'var(--font-serif)',color:'var(--text)'},
  filters: {display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}, catTabs: {display:'flex',gap:4,flexWrap:'wrap'}, catBtn: {padding:'5px 14px',border:'1px solid var(--border)',borderRadius:20,background:'var(--surface)',color:'var(--text2)',fontSize:12,cursor:'pointer',fontFamily:'var(--font)'}, catActive: {background:'var(--nav)',color:'#fff',borderColor:'var(--nav)'}, search: {padding:'7px 14px',border:'1px solid var(--border)',borderRadius:8,fontSize:13,color:'var(--text)',background:'var(--surface)',outline:'none',fontFamily:'var(--font)',width:200},
  tableWrap: {background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden'}, tableHead: {display:'grid',padding:'10px 18px',background:'var(--bg)',fontSize:10,fontWeight:700,color:'var(--text2)',textTransform:'uppercase',letterSpacing:0.4,borderBottom:'1px solid var(--border)',gap:12}, tableRow: {display:'grid',padding:'11px 18px',borderBottom:'1px solid var(--border)',gap:12,alignItems:'center'}, prodName: {fontSize:13,fontWeight:600,color:'var(--text)'}, cell: {fontSize:13,color:'var(--text)'}, cellBold: {fontSize:13,fontWeight:600,color:'var(--text)'}, catTag: {fontSize:10,fontWeight:600,background:'var(--bg)',border:'1px solid var(--border)',color:'var(--text2)',padding:'2px 8px',borderRadius:10},
  overlay: {position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}, modal: {background:'var(--surface)',borderRadius:14,width:420,maxWidth:'90vw',boxShadow:'0 20px 60px rgba(0,0,0,0.2)'}, modalHeader: {display:'flex',alignItems:'center',justifyContent:'space-between',padding:'18px 22px',borderBottom:'1px solid var(--border)'}, closeBtn: {background:'none',border:'none',fontSize:18,cursor:'pointer',color:'var(--text2)'}, fieldLabel: {display:'block',fontSize:12,fontWeight:600,color:'var(--text2)',marginBottom:6,textTransform:'uppercase',letterSpacing:0.4}, fieldInput: {width:'100%',padding:'9px 12px',border:'1px solid var(--border)',borderRadius:8,fontSize:13,color:'var(--text)',background:'var(--bg)',fontFamily:'var(--font)',boxSizing:'border-box'},
};

export default Inventaire;
