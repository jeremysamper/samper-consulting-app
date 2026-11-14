import React from 'react';
import { Btn } from '../../components/ui/index.jsx';
import { dbService } from '../../services/dbService.js';
import * as caisse from '../../services/caisseService.js';
import * as tpe from '../../services/caisseTpeService.js';
import ReglagesCaisse from './ReglagesCaisse.jsx';
import { idPoste } from './modeTest.js';
import { cartesEtArticlesEnVente, fusionnerReglages } from './reglages.js';

// ─────────────────────────────────────────────────────────────────────────────
// Section « Caisse » de la page des réglages : monte ReglagesCaisse tel quel
// et lui lit ce que Caisse.jsx lui passait (articles en vente, boutons,
// catégories, cartes actives, config, terminaux), par les mêmes fonctions.
//
// L'écran n'est rendu qu'une fois la première lecture aboutie : avec des
// catégories pas encore lues, son premier geste créerait en base les
// catégories du code par-dessus celles de la maison. Une lecture en échec le
// dit et propose de réessayer, elle ne montre jamais un écran vide.
//
// Chaque écriture relit, puis signale : la Caisse et le KDS gardés montés
// appliquent la nouvelle valeur sans recharger l'app (reglagesSignal.js).
// ─────────────────────────────────────────────────────────────────────────────

export default function SectionReglagesCaisse({ user, etablissement, signaler }) {
  const etabId = etablissement?.id;
  const role = user?.role;
  const poste = React.useMemo(() => idPoste(), []);

  // 'lecture' | 'lue' | 'echec' : état de la première lecture.
  const [etat, setEtat] = React.useState('lecture');
  const [plats, setPlats] = React.useState([]);
  const [cartesLues, setCartesLues] = React.useState([]);
  const [boutons, setBoutons] = React.useState({});
  const [categories, setCategories] = React.useState([]);
  const [config, setConfig] = React.useState({});
  const [terminaux, setTerminaux] = React.useState([]);
  const [lectureTerminaux, setLectureTerminaux] = React.useState('lecture');

  const rechargerGrille = React.useCallback(async () => {
    if (!etabId) return false;
    const [b, c, r] = await Promise.all([caisse.listBoutons(etabId), caisse.listCategories(etabId), caisse.getReglages(etabId)]);
    if (!b.error) setBoutons(b.data || {});
    if (!c.error) setCategories(c.data);
    if (!r.error) setConfig(r.data);
    return !b.error && !c.error && !r.error;
  }, [etabId]);

  const rechargerTerminaux = React.useCallback(async () => {
    if (!etabId) return;
    const { data, error } = await tpe.listTerminaux(etabId);
    if (error) { setLectureTerminaux('echec'); return; }
    setTerminaux(data);
    setLectureTerminaux('lue');
  }, [etabId]);

  const lire = React.useCallback(async () => {
    if (!etabId) return;
    setEtat('lecture');
    try {
      const db = dbService.getDb();
      const [grille, platsLus, cartes] = await Promise.all([
        rechargerGrille(),
        db ? db.listPlats(etabId, { strict: true }) : [],
        db ? db.listCartes(etabId, { strict: true }) : [],
        rechargerTerminaux(),
      ]);
      setPlats(platsLus || []);
      setCartesLues(cartes || []);
      setEtat(grille ? 'lue' : 'echec');
    } catch (e) {
      console.warn('[réglages caisse] lecture', e);
      setEtat('echec');
    }
  }, [etabId, rechargerGrille, rechargerTerminaux]);
  React.useEffect(() => { lire(); }, [lire]);

  const reglages = React.useMemo(() => fusionnerReglages(config), [config]);
  const { cartesActives, articles } = React.useMemo(
    () => cartesEtArticlesEnVente({ plats, cartes: cartesLues, cartesIds: reglages.cartes_ids }),
    [plats, cartesLues, reglages.cartes_ids],
  );

  const surChangement = React.useCallback(async () => { await rechargerGrille(); signaler?.(); }, [rechargerGrille, signaler]);
  const surTerminaux = React.useCallback(async () => { await rechargerTerminaux(); signaler?.(); }, [rechargerTerminaux, signaler]);

  if (!etabId) return null;
  if (etat === 'lecture') return <p style={st.attente}>Chargement…</p>;
  if (etat === 'echec') {
    return (
      <div style={st.erreur}>
        <p style={{ margin: 0 }}>Réglages illisibles. Réessayez.</p>
        <Btn variant="primary" onClick={lire} style={st.btn44}>Réessayer</Btn>
      </div>
    );
  }

  return (
    <ReglagesCaisse
      etablissementId={etabId}
      articles={articles}
      boutons={boutons}
      categories={categories}
      cartes={cartesActives}
      config={config}
      onChange={surChangement}
      poste={poste}
      peutLireJournalTests={['consultant', 'patron'].includes(role)}
      onTestsVides={signaler}
      onModeTest={signaler}
      role={role}
      terminaux={terminaux}
      lectureTerminaux={lectureTerminaux}
      onTerminauxChange={surTerminaux}
    />
  );
}

const st = {
  attente: { margin: 0, fontSize: 13, color: 'var(--text2)' },
  erreur: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10, fontSize: 14, color: 'var(--text)' },
  btn44: { minHeight: 44 },
};
