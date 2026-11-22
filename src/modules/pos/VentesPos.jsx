import { useState } from 'react';
import { useShell } from '../../layouts/ShellContext.js';
import { useReglageModifie } from '../../services/reglagesSignal.js';
import BoutonRegler, { peutOuvrirSection } from '../../components/ui/BoutonRegler.jsx';
import { canManageModule } from '../../data/demoData.js';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import PosConnectionBar   from './components/PosConnectionBar.jsx';
import MappingPlats       from './MappingPlats.jsx';
import MiseEnPlace        from './views/MiseEnPlace.jsx';
import ConsoIngredients   from './views/ConsoIngredients.jsx';

// ─────────────────────────────────────────────────────────────────
// VentesPos - Module Ventes POS
//
// J2 : Sync automatique Lightspeed (cron 04:00 UTC).
// J3 : ✅ Mapping plats POS ↔ Recettes (onglet Mapping).
// J4 : Vues cuisine (Mise en place J+1, Top/Flop, Conso).
// J5 : Permissions cuisinier - lecture seule, onglet Mapping masqué.
// ─────────────────────────────────────────────────────────────────

const ALL_TABS = [
  { id: 'mise_en_place', label: 'Mise en place J+1', icon: '◷' },
  { id: 'conso',         label: 'Conso ingrédients', icon: '◈' },
  { id: 'mapping',       label: 'Correspondance des plats', icon: '⇄' },
];

export default function VentesPos({ user, etablissement }) {
  const [tab, setTab] = useState('mise_en_place');
  // Incremente apres une synchro pour forcer le rechargement des vues (refetch).
  const [dataVersion, setDataVersion] = useState(0);
  // Connexion et synchro : Réglages > Ventes POS pour qui les règle (plan 15,
  // lot 2) ; les autres gardent l'état de la connexion, en lecture, ici.
  const shell = useShell();
  const regleDansReglages = peutOuvrirSection('ventes_pos', { user, etablissement, shellMode: shell?.mode || 'ordinateur' });
  // Une synchro lancée depuis les réglages recharge les vues.
  useReglageModifie('ventes_pos', () => setDataVersion((v) => v + 1));

  // canEdit : accès à l'onglet Mapping + actions d'écriture (connexion, mapping).
  // Droit « gérer » du module pos (Rôles & accès, case « Modifier »).
  const canEdit = canManageModule(user?.role, 'pos');

  // Onglets visibles selon le rôle - cuisinier ne voit pas Mapping
  const TABS = canEdit ? ALL_TABS : ALL_TABS.filter(t => t.id !== 'mapping');

  // Guard : si l'onglet actif est 'mapping' alors que le rôle ne l'autorise pas
  // (ex. changement de rôle en cours de session), on revient sur la vue par défaut.
  const effectiveTab = (!canEdit && tab === 'mapping') ? 'mise_en_place' : tab;

  // onNavigateToMapping : proposé uniquement aux rôles canEdit
  const handleNavigateToMapping = canEdit ? () => setTab('mapping') : undefined;

  // Pas de titre interne : « Ventes POS » est déjà le titre de la barre du haut.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── Barre connexion / synchro (couplage + sync manuelle) ── */}
      {regleDansReglages ? (
        <div className="module-actions" style={{ justifyContent: 'flex-end' }}>
          <BoutonRegler section="ventes_pos" user={user} etablissement={etablissement} />
        </div>
      ) : (
        <PosConnectionBar
          etablissement={etablissement}
          user={user}
          onSynced={() => setDataVersion((v) => v + 1)}
        />
      )}

      {/* Libellés seuls : pas de glyphe devant un onglet. */}
      {/* « Meilleures et moins bonnes ventes » s'ouvre dans Statistiques
          (analyse « Ventes POS ») : l'onglet a quitté ce module. */}
      {/* Les onglets passent à la ligne au lieu de défiler : aucun n'est coupé
          au bord de l'écran (lot 3). */}
      <SegmentedTabs tabs={TABS.map(({ id, label }) => ({ id, label }))} active={effectiveTab} onChange={setTab} style={{ flexWrap: 'wrap', overflowX: 'visible' }} />

      {/* ── Mise en place J+1 ── */}
      {effectiveTab === 'mise_en_place' && (
        <MiseEnPlace
          key={dataVersion}
          etablissement={etablissement}
          onNavigateToMapping={handleNavigateToMapping}
        />
      )}

      {/* ── Conso ingrédients ── */}
      {effectiveTab === 'conso' && (
        <ConsoIngredients
          key={dataVersion}
          etablissement={etablissement}
          onNavigateToMapping={handleNavigateToMapping}
        />
      )}

      {/* ── Mapping plats POS ↔ Recettes (J3) - canEdit uniquement ── */}
      {effectiveTab === 'mapping' && canEdit && (
        <MappingPlats key={dataVersion} user={user} etablissement={etablissement} />
      )}
    </div>
  );
}
