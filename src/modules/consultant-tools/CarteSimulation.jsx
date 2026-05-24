import React, { useState } from 'react';
import { useSimulationIA, computeCouverts } from '../../hooks/useSimulationIA.js';
import { SimulationParams } from './components/SimulationParams.jsx';
import { SimulationResults } from './components/SimulationResults.jsx';
import { SimulationPlatRow } from './components/SimulationPlatRow.jsx';

// ─── Résolution des unités (plats ou recettes directes) ───────────────────────
function buildUnits(plats, recettes) {
  const recettesActives = (recettes || []).filter(r => r && r.statut !== 'archivée');
  const recetteById = new Map(recettesActives.map(r => [r.id, r]));
  const platsActifs = (plats || []).filter(p => p.actif !== false);
  const platsLies = platsActifs.filter(p =>
    (p.recettes || []).some(pr => recetteById.has(pr.recetteId))
  );

  if (platsLies.length === 0) {
    return {
      units: recettesActives.map(r => ({
        id: r.id, nom: r.nom, categorie: r.categorie || 'Plats',
        prixVente: Number(r.prixVente) || 0, recettes: [r],
      })),
      useRecettesDirect: true,
      recetteById,
    };
  }
  return {
    units: platsActifs.map(p => ({
      id: p.id, nom: p.nom, categorie: p.categorie || 'Plats',
      prixVente: Number(p.prixVente) || 0,
      recettes: (p.recettes || []).map(pr => recetteById.get(pr.recetteId)).filter(Boolean),
    })),
    useRecettesDirect: false,
    recetteById,
  };
}

// ─── Food cost moyen ───────────────────────────────────────────────────────────
function computeFoodCost(units) {
  let totalRevenu = 0, totalCout = 0;
  units.forEach(u => {
    const prix = u.prixVente || 0;
    const cout = (u.recettes || []).reduce((s, r) => s + (Number(r.coutPortion) || 0), 0);
    if (prix > 0 && cout > 0) { totalRevenu += prix; totalCout += cout; }
  });
  return totalRevenu > 0 ? (totalCout / totalRevenu * 100) : null;
}

// ─── Composant principal ───────────────────────────────────────────────────────
const CarteSimulation = ({ plats, recettes, etablissement }) => {
  const [nbCuisiniers, setNbCuisiniers] = useState(2);
  const [dureeService, setDureeService]  = useState('soir');
  const [segment, setSegment]            = useState('bistro');

  const { result, loading, error, analyseSimulation } = useSimulationIA();

  const { units, useRecettesDirect } = buildUnits(plats, recettes);
  const totalPlats = units.length;

  const foodCost = computeFoodCost(units);

  // Payload pour l'IA : id + nom + ingrédients dédupliqués
  const platsPayload = units.map(u => ({
    id: String(u.id),
    nom: u.nom,
    ingredients: [...new Set(
      (u.recettes || [])
        .flatMap(r => (r.ingredients || []).map(i => (typeof i === 'string' ? i : i?.nom)).filter(Boolean))
    )],
  }));

  // Scores IA disponibles → recalcul live des couverts au slider
  const scoresIA = (result?.plats || []).map(p => p.score).filter(Number.isFinite);
  const scoreMoyenIA = result?.score_moyen ?? null;

  const liveCouverts = scoreMoyenIA !== null
    ? computeCouverts(scoreMoyenIA, nbCuisiniers, dureeService, scoresIA)
    : null;

  const displayMin    = liveCouverts?.couverts_min    ?? result?.couverts_min    ?? null;
  const displayMax    = liveCouverts?.couverts_max    ?? result?.couverts_max    ?? null;
  const displayCharge = liveCouverts?.charge_brigade  ?? result?.charge_brigade  ?? null;

  const handleAnalyse = () => {
    if (!platsPayload.length) return;
    analyseSimulation({ plats: platsPayload, nbCuisiniers, dureeService, segment });
  };

  // ── Empty state ────────────────────────────────────────────────────────────
  if (totalPlats === 0) {
    return (
      <div style={cs.empty}>
        <div style={{ fontSize: 40, opacity: 0.3 }}>📊</div>
        <div style={cs.emptyTitle}>Aucune recette ni plat à analyser</div>
        <div style={cs.emptyHint}>
          Créez des recettes (onglet "Plats & Recettes") pour lancer la simulation.
        </div>
      </div>
    );
  }

  return (
    <div style={cs.root}>
      {/* Header */}
      <div style={cs.header}>
        <div style={cs.title}>📊 Simulation de la carte</div>
        <div style={cs.subtitle}>
          {etablissement?.nom || ''}
          {etablissement?.nom ? ' · ' : ''}
          {totalPlats} {useRecettesDirect ? 'recette' : 'plat'}{totalPlats > 1 ? 's' : ''}
        </div>
      </div>

      {/* Food cost (si données disponibles) */}
      {foodCost !== null && (
        <div style={cs.foodCostBar}>
          <span style={cs.foodCostLabel}>Food cost moyen</span>
          <span
            style={{
              ...cs.foodCostValue,
              color: foodCost < 30 ? '#16a34a' : foodCost < 35 ? '#d97706' : '#dc2626',
            }}
          >
            {foodCost.toFixed(1)}%
          </span>
          <span style={cs.foodCostHint}>cible &lt; 30%</span>
        </div>
      )}

      {/* Simulation brigade : params + résultats côte à côte */}
      <div style={cs.simGrid}>
        <div style={cs.simCard}>
          <div style={cs.sectionTitle}>PARAMÈTRES BRIGADE</div>
          <SimulationParams
            nbCuisiniers={nbCuisiniers}
            onNbCuisiniers={setNbCuisiniers}
            dureeService={dureeService}
            onDureeService={setDureeService}
            segment={segment}
            onSegment={setSegment}
            onAnalyse={handleAnalyse}
            loading={loading}
            hasPlats={platsPayload.length > 0}
          />
        </div>

        <div style={cs.simCard}>
          <div style={cs.sectionTitle}>RÉSULTATS</div>
          <SimulationResults
            scoreMoyen={scoreMoyenIA}
            couvertsMin={displayMin}
            couvertsMax={displayMax}
            chargeBrigade={displayCharge}
            alerte={result?.alerte ?? false}
            synthese={result?.synthese ?? null}
            loading={loading}
            hasResult={!!result}
          />
        </div>
      </div>

      {/* Erreur IA */}
      {error && (
        <div style={cs.errorBox}>⚠ {error}</div>
      )}

      {/* Analyse par plat */}
      {result?.plats?.length > 0 && (
        <div style={cs.section}>
          <div style={cs.sectionTitle}>ANALYSE PAR PLAT</div>
          {result.plats.map(plat => (
            <SimulationPlatRow key={plat.id || plat.nom} plat={plat} />
          ))}
        </div>
      )}
    </div>
  );
};

const cs = {
  root: { padding: '0 4px 40px', overflowY: 'auto', maxHeight: 'calc(100vh - 140px)' },

  empty: { padding: 60, textAlign: 'center' },
  emptyTitle: {
    fontSize: 16, fontWeight: 700, marginTop: 10,
    fontFamily: 'var(--font-serif)', color: 'var(--text)',
  },
  emptyHint: { fontSize: 13, color: 'var(--text2)', marginTop: 4 },

  header: { marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' },
  subtitle: { fontSize: 12, color: 'var(--text2)', marginTop: 4 },

  foodCostBar: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 16px', background: 'var(--surface)',
    border: '1px solid var(--border)', borderRadius: 10, marginBottom: 14,
  },
  foodCostLabel: {
    fontSize: 11, fontWeight: 700, color: 'var(--text2)',
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  foodCostValue: { fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-serif)' },
  foodCostHint: { fontSize: 10, color: 'var(--text3)', fontStyle: 'italic' },

  simGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(240px, 340px) 1fr',
    gap: 14, marginBottom: 14,
    alignItems: 'start',
  },
  simCard: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 12, padding: 18,
  },

  sectionTitle: {
    fontSize: 11, fontWeight: 700, color: 'var(--text2)',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 14, fontFamily: 'var(--font-serif)',
  },

  section: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 12, padding: 18, marginBottom: 14,
  },

  errorBox: {
    padding: '12px 16px', background: '#fef2f2', border: '1px solid #fca5a5',
    color: '#dc2626', borderRadius: 10, fontSize: 13, fontWeight: 600, marginBottom: 14,
  },
};

export { CarteSimulation };
