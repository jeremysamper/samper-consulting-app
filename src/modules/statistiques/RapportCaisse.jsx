import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import * as caisse from '../../services/caisseService.js';
import { Btn } from '../../components/ui/index.jsx';
import { fusionnerReglages } from '../caisse/reglages.js';
// Les sections du rapport perdent le filet de leur dernière ligne par la
// feuille de la caisse.
import '../caisse/caisse.css';

// ─────────────────────────────────────────────────────────────────────────────
// Le rapport complet de la caisse, monté tel quel dans les Statistiques
// (14.11.2026 : la tuile « Rapports » a quitté la Caisse). Même composant,
// mêmes lectures, mêmes exports et même dossier fiduciaire : rien n'est
// recalculé ni recopié. La garde est celle de la famille Caisse
// (GARDES_ECRANS.caisse : habillage, hors mode test), puis la base décide du
// niveau, comme avant.
//
// Les réglages de la maison (fin de journée, bascule de service) se lisent
// comme dans la Caisse. Une lecture en échec ne retombe pas sur les réglages
// d'origine : le jour d'exploitation pourrait différer de celui de la caisse.
// ─────────────────────────────────────────────────────────────────────────────

const Rapports = lazy(() => import('../caisse/rapports/Rapports.jsx'));

const st = {
  etat: { fontSize: 'var(--t2)', color: 'var(--text2)', minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
};

export default function RapportCaisse({ etablissement, onRetour }) {
  const etabId = etablissement?.id || null;
  const [lecture, setLecture] = useState({ status: 'loading', config: null });
  const [tour, setTour] = useState(0);
  useEffect(() => {
    let vivant = true;
    setLecture({ status: 'loading', config: null });
    if (!etabId) return undefined;
    caisse.getReglages(etabId).then((r) => {
      if (!vivant) return;
      setLecture(r.error ? { status: 'error', config: null } : { status: 'ready', config: r.data || {} });
    });
    return () => { vivant = false; };
  }, [etabId, tour]);
  const reglages = useMemo(() => (lecture.status === 'ready' ? fusionnerReglages(lecture.config) : null), [lecture]);

  if (lecture.status === 'error') {
    return (
      <div style={st.etat} data-stat-rapport-caisse="error">
        <span>Les réglages de la caisse n'ont pas pu être lus.</span>
        <Btn variant="ghost" onClick={() => setTour((n) => n + 1)} style={{ minHeight: 44 }}>Réessayer</Btn>
      </div>
    );
  }
  if (!reglages) return <div style={st.etat} data-stat-rapport-caisse="loading">Lecture en cours</div>;
  return (
    <div data-stat-rapport-caisse="ready" style={{ minWidth: 0 }}>
      <Suspense fallback={<div style={st.etat}>Lecture en cours</div>}>
        <Rapports etablissement={etablissement} reglages={reglages} onRetour={onRetour} />
      </Suspense>
    </div>
  );
}
