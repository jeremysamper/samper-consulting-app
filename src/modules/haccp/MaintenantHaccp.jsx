import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { heureEnMinutes } from './HACCP.utils.js';

// ─────────────────────────────────────────────────────────────────────────────
// Carte « Maintenant », en tête de l'accueil HACCP : la seule question du
// premier jour, « qu'est-ce que je fais maintenant ? ». Ce qu'il y a à faire,
// l'avancement en clair, ce qui est en retard, un gros bouton. Elle est
// l'entrée des températures (relevé guidé) : pas de tuile « relevé » en plus.
//
// États (etat = etatDuJour de haccpJour.js) : à faire, en retard, tout est à
// jour, manque (une tournée passée incomplète), sans heures de relevé, pas
// encore réglé ; plus le chargement et la lecture en échec, qui ne disent
// jamais « Tout est à jour » : un écran sans données ne rassure pas. Un frigo
// dont le dernier relevé du jour est hors plage (etat.aRevoir) est rappelé
// dans tous les états, en ton danger, jusqu'à un relevé bon.
// Relecture en échec avec des données à l'écran (enEchecRelecture) : la carte
// garde son contenu, mais « Tout est à jour » devient « Dernière mise à jour à ».
//
// L'heure vient du parent, rafraîchie par useTicMinute : une tablette restée
// ouverte la nuit n'affiche pas à 07:10 le « Tout est à jour » de la veille.
//
// Crochets du banc : data-haccp-maintenant (la carte), data-haccp-action="releve"
// (le gros bouton du relevé, quel que soit son libellé), data-haccp-a-revoir
// (chaque frigo à relever de nouveau).
// ─────────────────────────────────────────────────────────────────────────────

// Un tic par minute : le composant qui l'appelle se redessine, et recalcule
// avec lui le jour (zurichToday) et l'heure (zurichClock). Nettoyé au démontage.
export function useTicMinute() {
  const [, setTic] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setTic(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);
}

const N = ({ children }) => <span data-no-translate="">{children}</span>;

// Retard d'une tournée en mots : « prévu il y a 35 min », « prévu il y a 2 h ».
function Retard({ minutes }) {
  if (minutes < 60) return <>prévu il y a <N>{minutes}</N> min</>;
  return <>prévu il y a <N>{Math.floor(minutes / 60)}</N> h</>;
}

function Barre({ faits, total }) {
  const pct = total > 0 ? Math.min(100, Math.round(faits / total * 100)) : 0;
  return (
    <div aria-hidden="true" data-cadre="" style={st.piste}>
      <div style={{ ...st.plein, width: pct + '%' }} />
    </div>
  );
}

const TONS = {
  neutre: { fond: 'var(--surface2)', titre: 'var(--accent)' },
  retard: { fond: 'var(--warning-bg-soft)', titre: 'var(--warning-text)' },
  grave: { fond: 'var(--danger-bg-soft)', titre: 'var(--danger-text)' },
  ok: { fond: 'var(--success-bg-soft)', titre: 'var(--success-text)' },
};

export default function MaintenantHaccp({
  lecture, enEchecRelecture, derniereMaj, etat, maintenant,
  canWrite, isConsultant, onReleve, onReglages, onReessayer,
}) {
  const [reessaiEnCours, setReessaiEnCours] = React.useState(false);
  const monteRef = React.useRef(true);
  React.useEffect(() => { monteRef.current = true; return () => { monteRef.current = false; }; }, []);
  const reessayer = async () => {
    if (reessaiEnCours) return;
    setReessaiEnCours(true);
    try { await onReessayer?.(); } finally { if (monteRef.current) setReessaiEnCours(false); }
  };

  // ─── Lecture en échec, chargement : rien qui rassure à tort ───
  if (lecture === 'echec') {
    return (
      <Carte ton="retard" bouton={(
        <button type="button" style={st.secondaire} data-cadre="" disabled={reessaiEnCours} onClick={reessayer}>
          {reessaiEnCours ? 'Actualisation…' : 'Réessayer'}
        </button>
      )}>
        <div style={st.titre}>Impossible de lire les relevés</div>
        <div style={st.ligne}>Vérifiez le réseau, puis réessayez.</div>
      </Carte>
    );
  }
  if (lecture === 'chargement' || !etat) {
    return <Carte ton="neutre"><div style={st.ligne}>Chargement…</div></Carte>;
  }

  // ─── Rien de réglé ───
  if (etat.statut === 'non_regle') {
    return (
      <Carte ton="neutre" bouton={isConsultant ? (
        <button type="button" style={st.primaire} data-haccp-action="reglages" onClick={onReglages}>Ajouter les frigos et appareils</button>
      ) : null}>
        <div style={{ ...st.surtitre, color: TONS.neutre.titre }}>Pas encore prêt</div>
        <div style={st.ligne}>Aucun frigo à relever n'est réglé pour cet établissement.</div>
        {!isConsultant && <div style={st.ligne}>Le consultant ajoute les frigos à relever. En attendant, les étiquettes et les contrôles fonctionnent.</div>}
      </Carte>
    );
  }

  const aJour = etat.statut === 'a_jour';
  // Un frigo trop chaud ou trop froid au dernier relevé : la carte le rappelle
  // jusqu'à un relevé bon (etat.aRevoir), et ne dit pas « Tout est à jour ».
  const aRevoir = etat.aRevoir || [];
  const lignesARevoir = aRevoir.length > 0 && (
    <div style={st.manque}>
      {aRevoir.map(a => (
        <div key={a.zone.id} data-haccp-a-revoir="" style={st.aRevoir}>
          <span>{a.zone.nom}</span> : {minuscule(a.mot)} à <N>{a.heure}</N>. À relever de nouveau.
        </div>
      ))}
    </div>
  );
  // Une relecture a échoué : la carte ne dit pas « Tout est à jour » sur des
  // données peut-être périmées.
  let surtitreAJour = <>Tout est à jour</>;
  let tonAJour = 'ok';
  if (aRevoir.length) { surtitreAJour = <>À revoir</>; tonAJour = 'retard'; }
  else if (enEchecRelecture) { surtitreAJour = <>Dernière mise à jour à <N>{derniereMaj || '-'}</N></>; tonAJour = 'neutre'; }
  const coche = !aRevoir.length && !enEchecRelecture;

  const boutonReleve = (libelle, principal = true) => (canWrite ? (
    <button type="button" data-haccp-action="releve" data-cadre="" style={principal ? st.primaire : st.secondaire} onClick={onReleve}>{libelle}</button>
  ) : null);
  // Rien de dû maintenant : « Relever de nouveau » s'il y a un frigo à revoir
  // (le relevé guidé le propose avec les autres), sinon « quand même ».
  const boutonHorsTournee = aRevoir.length
    ? boutonReleve('Relever de nouveau')
    : boutonReleve('Faire un relevé quand même', false);
  const lectureSeule = !canWrite && <div style={st.ligneDiscrete}>Seule l'équipe de cuisine note les relevés.</div>;

  // ─── Sans heures de relevé : toutes les zones, une fois par jour ───
  if (!etat.tournees.length) {
    return (
      <Carte ton={aJour ? tonAJour : 'neutre'} bouton={aJour
        ? boutonHorsTournee
        : boutonReleve(etat.zonesFaitesJour > 0 ? 'Continuer le relevé' : 'Commencer le relevé')}>
        <Surtitre ton={aJour ? tonAJour : 'neutre'} ok={aJour && coche}>
          {aJour ? surtitreAJour : <>À faire aujourd'hui</>}
        </Surtitre>
        <div style={st.titre}>Relever les températures</div>
        <div style={st.ligne}><N>{etat.zonesFaitesJour}</N> sur <N>{etat.totalZones}</N> frigos et appareils relevés aujourd'hui</div>
        <Barre faits={etat.zonesFaitesJour} total={etat.totalZones} />
        {lignesARevoir}
        {isConsultant && <div style={st.ligneDiscrete}>Pour savoir à quelle heure relever, réglez les heures de relevé dans Réglages.</div>}
        {lectureSeule}
      </Carte>
    );
  }

  const { courante, prochaine, manquees } = etat;
  const maintenantMin = heureEnMinutes(maintenant) ?? 0;
  const aujourdhui = (
    <div style={st.ligneDiscrete}>
      Aujourd'hui : <N>{etat.faitsJour}</N> {etat.faitsJour > 1 ? 'relevés faits sur' : 'relevé fait sur'} <N>{etat.totalJour}</N> prévus
    </div>
  );
  const manquent = (t) => <Manquent manque={t.total - t.faites} total={t.total} />;
  const lignesManquees = manquees.map(t => (
    <div key={t.id} style={st.manque}>
      <div style={st.ligneForte}>Pas fait aujourd'hui : relevé de <N>{t.heure}</N></div>
      <div style={st.ligne}>{manquent(t)}</div>
    </div>
  ));

  // ─── Une tournée à faire maintenant, ou en retard ───
  if (etat.statut === 'a_faire' || etat.statut === 'en_retard') {
    const retard = etat.statut === 'en_retard' ? Math.max(0, maintenantMin - (heureEnMinutes(courante.heure) ?? 0)) : 0;
    const ton = etat.statut === 'a_faire' ? 'neutre' : retard >= 120 ? 'grave' : 'retard';
    return (
      <Carte ton={ton} bouton={boutonReleve(courante.faites > 0 ? 'Continuer le relevé' : 'Commencer le relevé')}>
        <Surtitre ton={ton}>{etat.statut === 'a_faire' ? <>À faire maintenant</> : <>En retard</>}</Surtitre>
        <div style={st.titre}>
          Relevé de <N>{courante.heure}</N>
          {etat.statut === 'en_retard' && <span style={st.titreSuite}>, <Retard minutes={retard} /></span>}
        </div>
        <div style={st.sousTitre} data-no-translate="">{courante.label}</div>
        <div style={st.ligne}><N>{courante.faites}</N> sur <N>{courante.total}</N> frigos et appareils relevés</div>
        <Barre faits={courante.faites} total={courante.total} />
        {lignesARevoir}
        {aujourdhui}
        {lignesManquees}
        {lectureSeule}
      </Carte>
    );
  }

  // ─── Une tournée passée manque (la courante faite ou à venir) ───
  // Ce qu'on lit en premier est le problème : « En retard », « Relevé de
  // 07:00 pas fait » en titre, puis la prochaine tournée. Même ton que l'état
  // « en retard » qui le précède : rien ne change à l'écran à mi-chemin entre
  // deux tournées, quand la courante passe à la suivante.
  if (etat.statut === 'manque') {
    const seule = manquees.length === 1 ? manquees[0] : null;
    return (
      <Carte ton="retard" bouton={boutonHorsTournee}>
        <Surtitre ton="retard">En retard</Surtitre>
        <div style={st.titre}>
          {seule ? <>Relevé de <N>{seule.heure}</N> pas fait</> : <><N>{manquees.length}</N> relevés pas faits</>}
        </div>
        <div style={st.sousTitre}>
          {courante.etat === 'fait'
            ? <>Relevé de <N>{courante.heure}</N> fait</>
            : <>Prochain relevé à <N>{courante.heure}</N></>}
        </div>
        {seule ? <div style={st.ligne}>{manquent(seule)}</div> : lignesManquees}
        {lignesARevoir}
        {aujourdhui}
        {lectureSeule}
      </Carte>
    );
  }

  // ─── Rien à faire maintenant, rien en retard ───
  return (
    <Carte ton={tonAJour} bouton={boutonHorsTournee}>
      <Surtitre ton={tonAJour} ok={coche}>{surtitreAJour}</Surtitre>
      {prochaine ? (
        <>
          <div style={st.titre}>Prochain relevé à <N>{prochaine.heure}</N></div>
          <div style={st.sousTitre} data-no-translate="">{prochaine.label}</div>
        </>
      ) : <div style={st.titre}>Tout est fait pour aujourd'hui.</div>}
      {lignesARevoir}
      {aujourdhui}
      {lectureSeule}
    </Carte>
  );
}

// « Trop chaud » se lit « trop chaud » au milieu d'une phrase.
const minuscule = (mot) => (mot ? mot.charAt(0).toLowerCase() + mot.slice(1) : mot);

// « 5 frigos sur 8 manquent », « 1 frigo sur 8 manque ».
function Manquent({ manque, total }) {
  return manque > 1
    ? <><N>{manque}</N> frigos sur <N>{total}</N> manquent. Prévenez le chef.</>
    : <><N>{manque}</N> frigo sur <N>{total}</N> manque. Prévenez le chef.</>;
}

function Surtitre({ ton, ok = false, children }) {
  return (
    <div style={{ ...st.surtitre, color: TONS[ton].titre }}>
      {ok && <CheckCircle2 size={18} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0 }} />}
      <span>{children}</span>
    </div>
  );
}

// La carte : texte à gauche, bouton à droite quand la largeur le permet
// (iPad, ordinateur), bouton sous le texte et pleine largeur sur téléphone.
function Carte({ ton, bouton, children }) {
  return (
    <section data-haccp-maintenant="" data-cadre="" style={{ ...st.carte, background: TONS[ton].fond }}>
      <div style={st.texte}>{children}</div>
      {bouton && <div style={st.action}>{bouton}</div>}
    </section>
  );
}

const st = {
  carte: {
    display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 16, minWidth: 0,
    padding: '18px 16px', borderRadius: 'var(--r-lg)', color: 'var(--text)',
  },
  // Le texte prend la place, le bouton garde ~260 px à côté ; sous 560 px de
  // large, le bouton passe dessous et s'étire.
  texte: { flex: '999 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  action: { flex: '1 0 260px', minWidth: 0 },
  surtitre: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, letterSpacing: 0.2 },
  titre: { fontSize: 20, lineHeight: 1.2, fontFamily: 'var(--font-serif)', color: 'var(--text)' },
  titreSuite: { fontSize: 15, fontFamily: 'var(--font)', color: 'var(--text2)' },
  sousTitre: { fontSize: 14, color: 'var(--text2)' },
  ligne: { fontSize: 14, color: 'var(--text)', lineHeight: 1.4 },
  ligneForte: { fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4 },
  ligneDiscrete: { fontSize: 12, color: 'var(--text2)', lineHeight: 1.4 },
  manque: { display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 },
  aRevoir: { fontSize: 14, fontWeight: 600, color: 'var(--danger-text)', lineHeight: 1.4 },
  piste: { height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden', marginTop: 2 },
  plein: { height: '100%', borderRadius: 3, background: 'var(--accent)' },
  primaire: {
    width: '100%', minHeight: 52, padding: '12px 18px', borderRadius: 'var(--r)', border: 'none',
    background: 'var(--accent)', color: 'var(--on-accent)', fontFamily: 'var(--font)', fontSize: 16, fontWeight: 600, cursor: 'pointer',
  },
  secondaire: {
    width: '100%', minHeight: 44, padding: '10px 16px', borderRadius: 'var(--r)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
    background: 'var(--surface)', color: 'var(--accent)', fontFamily: 'var(--font)', fontSize: 15, fontWeight: 600, cursor: 'pointer',
  },
};
