import React from 'react';

const TECHNIQUES_KEYWORDS = {
  'Cuisson': ['cuire', 'cuisson', 'rôtir', 'rôti', 'four', 'cuisson', 'enfourner'],
  'Sauter / Poêler': ['sauter', 'saisir', 'poêler', 'poêle', 'snacker', 'snack'],
  'Pocher / Bouillir': ['pocher', 'pochage', 'bouillir', 'bouillon', 'frémir', 'frémissement'],
  'Réduire': ['réduire', 'réduction', 'concentrer'],
  'Émulsionner': ['émulsionner', 'émulsion', 'monter', 'fouetter', 'monter au beurre'],
  'Frire': ['frire', 'friture', 'tempura', 'panure'],
  'Griller / Plancha': ['griller', 'grillé', 'plancha', 'braise'],
  'Mijoter / Braiser': ['mijoter', 'braiser', 'braisé', 'braisage', 'mijotage'],
  'Fumer': ['fumer', 'fumage', 'fumé'],
  'Mariner': ['mariner', 'marinade', 'macérer'],
  'Congeler / Gel': ['congeler', 'congélation', 'gélifier', 'gelée', 'glace'],
  'Cru / Tartare': ['cru', 'tartare', 'carpaccio', 'sashimi', 'ceviche'],
  'Sous-vide': ['sous-vide', 'sous vide', 'basse température'],
  'Confire / Confit': ['confire', 'confit', 'confit de'],
  'Glacer / Caraméliser': ['glacer', 'caraméliser', 'caramel', 'sucre cuit'],
  'Lever / Pousser (boulangerie)': ['lever', 'pousser', 'fermenter', 'pétrir', 'pâte levée'],
  'Découpe / Taillage': ['émincer', 'ciseler', 'tailler', 'brunoise', 'julienne', 'mirepoix'],
  'Trancher / Hacher': ['trancher', 'hacher', 'mixer', 'mixé', 'mixage'],
  'Mariner / Saumurer': ['saumurer', 'saumure'],
};

// Détecte les techniques présentes dans le texte des étapes d'une recette
const detectTechniques = (etapes) => {
  if (!etapes || !etapes.length) return new Set();
  const fullText = etapes.join(' ').toLowerCase();
  const found = new Set();
  Object.entries(TECHNIQUES_KEYWORDS).forEach(([techName, keywords]) => {
    if (keywords.some(kw => fullText.includes(kw))) {
      found.add(techName);
    }
  });
  return found;
};

// Heuristique : la recette est-elle une "minute" ou une "avance" ?
// V1 = détection auto (V2 = champ explicite dans le formulaire de recette)
const isPreparationMinute = (recette) => {
  const tempsTotal = (Number(recette.tempsPreparation) || 0) + (Number(recette.tempsCuisson) || 0);
  if (tempsTotal > 0 && tempsTotal <= 15) return true;  // Moins de 15 min = minute
  const fullText = (recette.etapes || []).join(' ').toLowerCase();
  if (fullText.includes('à la minute') || fullText.includes('a la minute') || fullText.includes('minute')) return true;
  return false;
};

// Heuristique : dressage complexe ?
// V1 = longueur du texte de dressage > 100 chars OU mots-clés
const isDressageComplexe = (recette) => {
  const dressage = (recette.dressage || '').toLowerCase();
  if (dressage.length > 100) return true;
  const keywords = ['composé', 'élaboré', 'graphique', 'précis', 'pinceau', 'pipette', 'siphon', 'gouttes'];
  return keywords.some(kw => dressage.includes(kw));
};

// Analyse complète d'une unité de carte.
// `unit` = { id, nom, categorie, prixVente, recettes: [<recettes résolues>] }
// — fonctionne aussi bien pour un plat (avec ses recettes liées) que pour
// une recette analysée directement (recettes = [la recette elle-même]).
const analyzeUnit = (unit) => {
  const recettesUnit = unit.recettes || [];

  if (recettesUnit.length === 0) {
    return {
      plat: unit, recettes: [], coutTotal: 0, foodCost: null,
      etapesTotal: 0, techniques: new Set(), techniquesUniques: 0,
      isMinute: false, isDressageComplexe: false, score: 0, hasData: false,
    };
  }

  const coutTotal = recettesUnit.reduce((s, r) => s + (Number(r.coutPortion) || 0), 0);
  const prix = Number(unit.prixVente) || 0;
  const foodCost = (prix > 0 && coutTotal > 0) ? (coutTotal / prix * 100) : null;

  const etapesTotal = recettesUnit.reduce((s, r) => s + (r.etapes || []).length, 0);

  const techniquesAll = new Set();
  recettesUnit.forEach(r => {
    detectTechniques(r.etapes).forEach(t => techniquesAll.add(t));
  });

  // "Minute" / dressage complexe si AU MOINS UNE recette l'est.
  const isMinute = recettesUnit.some(isPreparationMinute);
  const isDressageComplexeFlag = recettesUnit.some(isDressageComplexe);

  // Score : +1 par étape, +2 par technique, +3 si minute, +2 si dressage complexe.
  const score = etapesTotal * 1
    + techniquesAll.size * 2
    + (isMinute ? 3 : 0)
    + (isDressageComplexeFlag ? 2 : 0);

  return {
    plat: unit, recettes: recettesUnit,
    coutTotal, foodCost,
    etapesTotal,
    techniques: techniquesAll,
    techniquesUniques: techniquesAll.size,
    isMinute, isDressageComplexe: isDressageComplexeFlag,
    score, hasData: true,
  };
};

// Niveau global selon le score total
const computeNiveau = (totalScore) => {
  if (totalScore < 50) return { id: 'facile', label: 'Facile', couleur: '#16a34a', emoji: '🟢' };
  if (totalScore < 100) return { id: 'moyen', label: 'Moyen', couleur: '#d97706', emoji: '🟡' };
  return { id: 'complexe', label: 'Complexe', couleur: '#dc2626', emoji: '🔴' };
};

// ─── Composant principal ───
const CarteSimulation = ({ plats, recettes, etablissement }) => {
  // Recettes exploitables (non archivées) + index par id.
  const recettesActives = (recettes || []).filter(r => r && r.statut !== 'archivée');
  const recetteById = new Map(recettesActives.map(r => [r.id, r]));
  const platsActifs = (plats || []).filter(p => p.actif !== false);
  // Plats réellement exploitables : au moins une recette liée connue.
  const platsLies = platsActifs.filter(p => (p.recettes || []).some(pr => recetteById.has(pr.recetteId)));

  // Source d'analyse : les plats si la carte en utilise, sinon les recettes
  // directement (les recettes portent toutes les données nécessaires).
  const useRecettesDirect = platsLies.length === 0;
  const uniteLabel = useRecettesDirect ? 'recette' : 'plat';
  const Unites = useRecettesDirect ? 'Recettes' : 'Plats';
  const units = useRecettesDirect
    ? recettesActives.map(r => ({
        id: r.id, nom: r.nom, categorie: r.categorie || 'Plats',
        prixVente: Number(r.prixVente) || 0, recettes: [r],
      }))
    : platsActifs.map(p => ({
        id: p.id, nom: p.nom, categorie: p.categorie || 'Plats',
        prixVente: Number(p.prixVente) || 0,
        recettes: (p.recettes || []).map(pr => recetteById.get(pr.recetteId)).filter(Boolean),
      }));

  // Analyse unité par unité
  const analyses = units.map(analyzeUnit);
  const platsAvecRecettes = analyses.filter(a => a.hasData);

  // Métriques globales
  const totalPlats = units.length;
  const platsAvecData = platsAvecRecettes.length;
  const platsSansRecette = totalPlats - platsAvecData;

  // Food cost moyen pondéré (par prix de vente)
  let totalRevenu = 0, totalCout = 0;
  platsAvecRecettes.forEach(a => {
    if (a.plat.prixVente) {
      totalRevenu += a.plat.prixVente;
      totalCout += a.coutTotal;
    }
  });
  const foodCostMoyen = totalRevenu > 0 ? (totalCout / totalRevenu * 100) : null;

  const totalEtapes = analyses.reduce((s, a) => s + a.etapesTotal, 0);

  // Toutes techniques utilisées sur la carte (uniques)
  const techniquesGlobales = new Set();
  analyses.forEach(a => a.techniques.forEach(t => techniquesGlobales.add(t)));

  const platsMinute = analyses.filter(a => a.isMinute).length;
  const platsAvance = platsAvecData - platsMinute;
  const platsDressageComplexe = analyses.filter(a => a.isDressageComplexe).length;

  // Score global = somme des scores
  const scoreTotal = analyses.reduce((s, a) => s + a.score, 0);
  const niveau = computeNiveau(scoreTotal);

  if (totalPlats === 0) {
    return (
      <div style={cs.empty}>
        <div style={{ fontSize: 40, opacity: 0.3 }}>📊</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginTop: 10, fontFamily: 'var(--font-serif)' }}>Aucune recette ni plat à analyser</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>Créez des recettes (onglet "Plats & Recettes") pour lancer la simulation.</div>
      </div>
    );
  }

  return (
    <div style={cs.root}>
      {/* Header */}
      <div style={cs.header}>
        <div>
          <div style={cs.title}>📊 Simulation de la carte</div>
          <div style={cs.subtitle}>
            {etablissement?.nom || ''} · {totalPlats} {uniteLabel}{totalPlats > 1 ? 's' : ''}
            {useRecettesDirect ? ' · analyse basée sur les recettes' : ''}
          </div>
        </div>
      </div>

      {/* KPIs principaux */}
      <div style={cs.kpisRow}>
        <div style={cs.kpiBox}>
          <div style={cs.kpiLabel}>Food cost moyen</div>
          <div style={{ ...cs.kpiValue, color: foodCostMoyen == null ? 'var(--text2)' : foodCostMoyen < 30 ? '#16a34a' : foodCostMoyen < 35 ? '#d97706' : '#dc2626' }}>
            {foodCostMoyen != null ? `${foodCostMoyen.toFixed(1)}%` : '—'}
          </div>
          <div style={cs.kpiHint}>cible &lt; 30%</div>
        </div>

        <div style={cs.kpiBox}>
          <div style={cs.kpiLabel}>Score complexité</div>
          <div style={{ ...cs.kpiValue, color: niveau.couleur }}>{scoreTotal}</div>
          <div style={cs.kpiHint}>somme étapes + techniques + minute + dressage</div>
        </div>

        <div style={{ ...cs.kpiBox, background: niveau.couleur + '15', border: `1px solid ${niveau.couleur}` }}>
          <div style={cs.kpiLabel}>Niveau de la carte</div>
          <div style={{ ...cs.kpiValue, color: niveau.couleur }}>{niveau.emoji} {niveau.label}</div>
          <div style={cs.kpiHint}>
            {niveau.id === 'facile' && 'Carte simple à exécuter, équipe junior OK'}
            {niveau.id === 'moyen' && 'Niveau professionnel attendu'}
            {niveau.id === 'complexe' && 'Équipe expérimentée requise'}
          </div>
        </div>
      </div>

      {/* Métriques détaillées */}
      <div style={cs.section}>
        <div style={cs.sectionTitle}>📈 Métriques détaillées</div>
        <div style={cs.metricsGrid}>
          <div style={cs.metric}><span>{Unites} sur la carte</span><strong>{totalPlats}</strong></div>
          <div style={cs.metric}><span>{Unites} analysé(e)s</span><strong>{platsAvecData} / {totalPlats}</strong></div>
          <div style={cs.metric}><span>Étapes cumulées</span><strong>{totalEtapes}</strong></div>
          <div style={cs.metric}><span>Techniques différentes</span><strong>{techniquesGlobales.size}</strong></div>
          <div style={cs.metric}><span>{Unites} à la minute</span><strong>{platsMinute}</strong></div>
          <div style={cs.metric}><span>{Unites} préparé(e)s à l'avance</span><strong>{platsAvance}</strong></div>
          <div style={cs.metric}><span>{Unites} à dressage complexe</span><strong>{platsDressageComplexe}</strong></div>
          {platsSansRecette > 0 && (
            <div style={{ ...cs.metric, color: '#d97706' }}>
              <span>⚠ {Unites} sans recette</span><strong>{platsSansRecette}</strong>
            </div>
          )}
        </div>

        {techniquesGlobales.size > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 700, marginBottom: 6 }}>Techniques détectées sur la carte</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[...techniquesGlobales].sort().map(t => (
                <span key={t} style={cs.techBadge}>{t}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Analyse plat par plat */}
      <div style={cs.section}>
        <div style={cs.sectionTitle}>🍽 Analyse {useRecettesDirect ? 'recette par recette' : 'plat par plat'}</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={cs.table}>
            <thead>
              <tr style={cs.tableHeadRow}>
                <th style={cs.tableHead}>{useRecettesDirect ? 'Recette' : 'Plat'}</th>
                <th style={cs.tableHead}>Catégorie</th>
                <th style={{ ...cs.tableHead, textAlign: 'right' }}>Prix</th>
                <th style={{ ...cs.tableHead, textAlign: 'right' }}>FC %</th>
                <th style={{ ...cs.tableHead, textAlign: 'right' }}>Étapes</th>
                <th style={{ ...cs.tableHead, textAlign: 'right' }}>Tech.</th>
                <th style={{ ...cs.tableHead, textAlign: 'center' }}>Min/Avance</th>
                <th style={{ ...cs.tableHead, textAlign: 'center' }}>Dress.</th>
                <th style={{ ...cs.tableHead, textAlign: 'right' }}>Score</th>
              </tr>
            </thead>
            <tbody>
              {analyses.map(a => (
                <tr key={a.plat.id} style={cs.tableRow}>
                  <td style={cs.tableCell}>
                    <div style={{ fontWeight: 600 }}>{a.plat.nom}</div>
                    {!a.hasData && <div style={{ fontSize: 10, color: '#d97706' }}>Aucune recette liée</div>}
                  </td>
                  <td style={{ ...cs.tableCell, fontSize: 11, color: 'var(--text2)' }}>{a.plat.categorie}</td>
                  <td style={{ ...cs.tableCell, textAlign: 'right' }}>
                    {Number.isFinite(Number(a.plat.prixVente)) ? `CHF ${Number(a.plat.prixVente).toFixed(2)}` : '—'}
                  </td>
                  <td style={{ ...cs.tableCell, textAlign: 'right', color: a.foodCost == null ? 'var(--text2)' : a.foodCost < 30 ? '#16a34a' : a.foodCost < 35 ? '#d97706' : '#dc2626', fontWeight: 700 }}>
                    {Number.isFinite(Number(a.foodCost)) ? `${Number(a.foodCost).toFixed(1)}%` : '—'}
                  </td>
                  <td style={{ ...cs.tableCell, textAlign: 'right' }}>{a.hasData ? a.etapesTotal : '—'}</td>
                  <td style={{ ...cs.tableCell, textAlign: 'right' }}>{a.hasData ? a.techniquesUniques : '—'}</td>
                  <td style={{ ...cs.tableCell, textAlign: 'center', fontSize: 11 }}>
                    {a.hasData ? (a.isMinute ? <span style={{ color: '#dc2626', fontWeight: 700 }}>Minute</span> : <span style={{ color: 'var(--text2)' }}>Avance</span>) : '—'}
                  </td>
                  <td style={{ ...cs.tableCell, textAlign: 'center', fontSize: 11 }}>
                    {a.hasData ? (a.isDressageComplexe ? '🔴' : '⚪') : '—'}
                  </td>
                  <td style={{ ...cs.tableCell, textAlign: 'right', fontWeight: 700 }}>{a.hasData ? a.score : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Méthodologie */}
      <div style={cs.section}>
        <div style={cs.sectionTitle}>ℹ Méthodologie de calcul</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
          <strong>Score complexité par plat</strong> = nb étapes × 1 + nb techniques × 2 + (3 si minute) + (2 si dressage complexe)
          <br/>
          <strong>Score total</strong> = somme des scores de tous les plats
          <br/>
          <strong>Niveau</strong> : 0–50 = Facile · 50–100 = Moyen · 100+ = Complexe
          <br/>
          <strong>Détection automatique V1</strong> : techniques détectées par mots-clés dans le texte des étapes ; "minute" si temps total &lt; 15 min ou mention "minute" ; dressage complexe si description &gt; 100 chars ou mots-clés (siphon, pinceau, gouttes...).
          <br/>
          <em style={{ fontSize: 11 }}>V2 prévue : champs explicites dans le formulaire de recette + estimation staff + temps de production.</em>
        </div>
      </div>
    </div>
  );
};

const cs = {
  root: { padding: '0 4px 40px', overflowY: 'auto', maxHeight: 'calc(100vh - 140px)' },
  header: { marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' },
  subtitle: { fontSize: 12, color: 'var(--text2)', marginTop: 4 },
  empty: { padding: 60, textAlign: 'center' },

  kpisRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 20 },
  kpiBox: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 },
  kpiLabel: { fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.4 },
  kpiValue: { fontSize: 32, fontWeight: 700, fontFamily: 'var(--font-serif)', marginTop: 6 },
  kpiHint: { fontSize: 10, color: 'var(--text2)', marginTop: 4, fontStyle: 'italic' },

  section: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 14 },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 12, fontFamily: 'var(--font-serif)' },

  metricsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 },
  metric: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'var(--bg)', borderRadius: 6, fontSize: 12 },

  techBadge: { padding: '4px 10px', background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: 12, fontSize: 11, fontWeight: 600 },

  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  tableHeadRow: { borderBottom: '2px solid var(--border)' },
  tableHead: { padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap' },
  tableRow: { borderBottom: '1px solid var(--border)' },
  tableCell: { padding: '8px 10px', verticalAlign: 'middle' },
};

export { CarteSimulation };
