import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Anneau, Btn, CarteAvant, Encadre, Panneau, carteAvantStyles } from '../../components/ui/index.jsx';
import { heureEnMinutes } from './HACCP.utils.js';

// ─────────────────────────────────────────────────────────────────────────────
// Carte « Maintenant », en tête de l'accueil HACCP : la seule question du
// premier jour, « qu'est-ce que je fais maintenant ? ». Ce qu'il y a à faire,
// l'avancement en clair, ce qui est en retard, un gros bouton. Elle est
// l'entrée des températures (relevé guidé) : pas de tuile « relevé » en plus.
//
// Direction Galet : c'est la carte nuit de l'écran (CarteAvant). Sa couleur ne
// dit pas un état : l'état se lit dans le surtitre, à l'encre d'alerte de la
// carte (--carte-nuit-info, -alerte, -danger, -succes). Sous le texte, une
// tuile par heure de relevé, avec son anneau (zones relevées sur zones à
// relever) : c'est le programme du jour, qui n'est plus répété dessous. La
// flèche en haut à droite ouvre le registre. Le bouton du relevé est écrit à
// l'encre inversée de la carte (un aplat d'accent ne s'y verrait pas).
//
// États (etat = etatDuJour de haccpJour.js) : à faire, en retard, tout est à
// jour, manque (une tournée passée incomplète), sans heures de relevé, pas
// encore réglé ; plus le chargement et la lecture en échec, qui ne disent
// jamais « Tout est à jour » : un écran sans données ne rassure pas. Ces deux
// derniers sont une carte blanche (un encadré pour l'échec). Un frigo
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
// (chaque frigo à relever de nouveau), data-haccp-creneau (chaque tuile).
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

// Nombres et heures dans leurs propres nœuds : la phrase autour reste une
// entrée du glossaire.
const N = ({ children }) => <span data-no-translate="">{children}</span>;

// Retard d'une tournée en mots : « prévu il y a 35 min », « prévu il y a 2 h ».
function Retard({ minutes }) {
  if (minutes < 60) return <>prévu il y a <N>{minutes}</N> min</>;
  return <>prévu il y a <N>{Math.floor(minutes / 60)}</N> h</>;
}

// Encre du surtitre selon l'état, sur la carte nuit.
const ENCRES = {
  neutre: 'var(--carte-nuit-info)',
  retard: 'var(--carte-nuit-alerte)',
  grave: 'var(--carte-nuit-danger)',
  ok: 'var(--carte-nuit-succes)',
};

// Les mots du programme du jour (ProgrammeDuJour.jsx), à l'encre de la carte.
const ETATS_TOURNEE = {
  fait: { mot: 'Fait', encre: 'var(--carte-nuit-succes)' },
  a_faire: { mot: 'À faire', encre: 'var(--carte-nuit-info)' },
  en_retard: { mot: 'En retard', encre: 'var(--carte-nuit-alerte)' },
  plus_tard: { mot: 'Plus tard', encre: 'var(--carte-nuit-doux)' },
};

const cs = carteAvantStyles('nuit');

// Une tuile par heure de relevé : l'heure, son nom, où elle en est, et
// l'anneau des zones relevées. Muet : les nombres sont dits par le texte.
function Tournees({ tournees }) {
  if (!tournees?.length) return null;
  return (
    <div className="haccp-tournees">
      {tournees.map(t => {
        const e = ETATS_TOURNEE[t.etat] || ETATS_TOURNEE.plus_tard;
        const partiel = t.etat !== 'fait' && t.faites > 0;
        return (
          <div key={t.id} data-haccp-creneau={t.heure} style={{ ...cs.tuile, ...st.tuile }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ ...cs.chiffre, ...st.tuileHeure }} data-no-translate="">{t.heure}</span>
              <span style={{ ...cs.libelle, ...st.tuileLibelle }} data-no-translate="">{t.label}</span>
              <span style={{ ...st.tuileEtat, color: e.encre }}>
                {e.mot}
                {partiel && <span style={st.tuileCompte}> (<N>{t.faites}</N> sur <N>{t.total}</N>)</span>}
              </span>
            </span>
            <Anneau part={t.total ? t.faites / t.total : 0} couleur={e.encre} piste="var(--carte-nuit)" />
          </div>
        );
      })}
    </div>
  );
}

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
      <section data-haccp-maintenant="" style={{ minWidth: 0 }}>
        <Panneau style={st.panneau}>
          <Encadre ton="alerte" titre="Impossible de lire les relevés" style={st.panneauTexte}>
            <div style={st.panneauLigne}>Vérifiez le réseau, puis réessayez.</div>
          </Encadre>
          <Btn variant="ghost" disabled={reessaiEnCours} onClick={reessayer} style={st.panneauBouton}>
            {reessaiEnCours ? 'Actualisation…' : 'Réessayer'}
          </Btn>
        </Panneau>
      </section>
    );
  }
  if (lecture === 'chargement' || !etat) {
    return (
      <section data-haccp-maintenant="" style={{ minWidth: 0 }}>
        <Panneau><div style={st.chargement}>Chargement…</div></Panneau>
      </section>
    );
  }

  // ─── Rien de réglé ───
  if (etat.statut === 'non_regle') {
    return (
      <Carte ton="neutre" bouton={isConsultant ? (
        <button type="button" style={st.primaire} data-cadre="" data-haccp-action="reglages" onClick={onReglages}>Ajouter les frigos et appareils</button>
      ) : null}>
        <div style={{ ...st.surtitre, color: ENCRES.neutre }}>Pas encore prêt</div>
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
      <Carte
        ton={aJour ? tonAJour : 'neutre'}
        bouton={aJour
          ? boutonHorsTournee
          : boutonReleve(etat.zonesFaitesJour > 0 ? 'Continuer le relevé' : 'Commencer le relevé')}
        pied={(
          <div className="haccp-tournees haccp-tournees--une">
            <div style={{ ...cs.tuile, ...st.tuile }}>
              <span style={{ ...st.ligne, minWidth: 0 }}><N>{etat.zonesFaitesJour}</N> sur <N>{etat.totalZones}</N> frigos et appareils relevés aujourd'hui</span>
              <Anneau
                part={etat.totalZones ? etat.zonesFaitesJour / etat.totalZones : 0}
                couleur={aJour ? ENCRES.ok : ENCRES.neutre} piste="var(--carte-nuit)"
              />
            </div>
          </div>
        )}
      >
        <Surtitre ton={aJour ? tonAJour : 'neutre'} ok={aJour && coche}>
          {aJour ? surtitreAJour : <>À faire aujourd'hui</>}
        </Surtitre>
        <div style={st.titre}>Relever les températures</div>
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
  const tuiles = <Tournees tournees={etat.tournees} />;

  // ─── Une tournée à faire maintenant, ou en retard ───
  if (etat.statut === 'a_faire' || etat.statut === 'en_retard') {
    const retard = etat.statut === 'en_retard' ? Math.max(0, maintenantMin - (heureEnMinutes(courante.heure) ?? 0)) : 0;
    const ton = etat.statut === 'a_faire' ? 'neutre' : retard >= 120 ? 'grave' : 'retard';
    return (
      <Carte ton={ton} pied={tuiles} bouton={boutonReleve(courante.faites > 0 ? 'Continuer le relevé' : 'Commencer le relevé')}>
        <Surtitre ton={ton}>{etat.statut === 'a_faire' ? <>À faire maintenant</> : <>En retard</>}</Surtitre>
        <div style={st.titre}>
          Relevé de <N>{courante.heure}</N>
          {etat.statut === 'en_retard' && <span style={st.titreSuite}>, <Retard minutes={retard} /></span>}
        </div>
        <div style={st.sousTitre} data-no-translate="">{courante.label}</div>
        <div style={st.ligne}><N>{courante.faites}</N> sur <N>{courante.total}</N> frigos et appareils relevés</div>
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
      <Carte ton="retard" pied={tuiles} bouton={boutonHorsTournee}>
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
    <Carte ton={tonAJour} pied={tuiles} bouton={boutonHorsTournee}>
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
    <div style={{ ...st.surtitre, color: ENCRES[ton] }}>
      {ok && <CheckCircle2 size={18} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0 }} />}
      <span>{children}</span>
    </div>
  );
}

// La carte nuit : le texte (le registre s'ouvre par sa tuile), le bouton du relevé
// (pleine largeur au téléphone, borné au-delà), puis les tuiles des heures de
// relevé. data-haccp-ton garde l'état lisible pour le banc.
function Carte({ ton, bouton, pied, children }) {
  return (
    <CarteAvant ton="nuit" data-haccp-maintenant="" data-haccp-ton={ton}>
      <div className="haccp-maintenant-tete">
        <div style={st.texte}>{children}</div>
      </div>
      {bouton && <div className="haccp-maintenant-action">{bouton}</div>}
      {pied}
    </CarteAvant>
  );
}

const st = {
  texte: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  surtitre: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--t2)', fontWeight: 'var(--g3)', letterSpacing: 0.2 },
  titre: { fontSize: 'var(--t4)', lineHeight: 1.2, fontFamily: 'var(--font)', fontWeight: 'var(--g3)', color: 'var(--carte-nuit-texte)' },
  titreSuite: { fontSize: 'var(--t2)', fontFamily: 'var(--font)', fontWeight: 'var(--g1)', color: 'var(--carte-nuit-doux)' },
  sousTitre: { fontSize: 'var(--t2)', color: 'var(--carte-nuit-doux)' },
  ligne: { fontSize: 'var(--t2)', color: 'var(--carte-nuit-texte)', lineHeight: 1.4 },
  ligneForte: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--carte-nuit-texte)', lineHeight: 1.4 },
  ligneDiscrete: { fontSize: 'var(--t1)', color: 'var(--carte-nuit-doux)', lineHeight: 1.4 },
  manque: { display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 },
  aRevoir: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--carte-nuit-danger)', lineHeight: 1.4 },
  // Tuile d'une heure de relevé.
  tuile: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  tuileHeure: { display: 'block', fontSize: 'var(--t5)' },
  tuileLibelle: { display: 'block', marginTop: 4, overflowWrap: 'anywhere' },
  tuileEtat: { display: 'block', marginTop: 4, fontSize: 'var(--t1)', fontWeight: 'var(--g3)', lineHeight: 1.35 },
  tuileCompte: { fontWeight: 'var(--g1)', color: 'var(--carte-nuit-doux)' },
  // Sur la carte nuit, l'action principale est à l'encre inversée : fond clair
  // de son texte, encre de la carte. Une pilule : le libellé tient sur une ligne.
  primaire: {
    width: '100%', minHeight: 52, padding: '12px 18px', borderRadius: 'var(--r-full)', border: 'none',
    background: 'var(--carte-nuit-texte)', color: 'var(--carte-nuit)', fontFamily: 'var(--font)', fontSize: 'var(--t3)', fontWeight: 'var(--g3)', cursor: 'pointer',
  },
  secondaire: {
    width: '100%', minHeight: 44, padding: '10px 16px', borderRadius: 'var(--r-full)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--carte-nuit-doux)',
    background: 'transparent', color: 'var(--carte-nuit-texte)', fontFamily: 'var(--font)', fontSize: 'var(--t2)', fontWeight: 'var(--g2)', cursor: 'pointer',
  },
  // Chargement et lecture en échec : une carte blanche.
  panneau: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 },
  panneauTexte: { flex: '999 1 260px', minWidth: 0 },
  panneauLigne: { fontSize: 'var(--t2)', color: 'var(--text)', lineHeight: 1.4 },
  panneauBouton: { minHeight: 44, flex: '1 0 200px' },
  chargement: { fontSize: 'var(--t2)', color: 'var(--text3)' },
};
