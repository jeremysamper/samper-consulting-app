// Panneau du tour des nouveautés (/demo.html?nouveautes=1). Trois états :
// la liste par module, la carte de la nouveauté en cours (après « Voir »), et
// replié en une pilule. La capture « avant » s'ouvre à côté de l'écran. Tout
// l'état vit dans le stockage de l'onglet : le changement de rôle recharge la
// page, le tour reprend où il en était.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NOUVEAUTES, NOTES, CRITERES, LOTS, ORDRE_LOTS, ROLES, captureAvant } from './nouveautes.js';
import { lireEtat, ecrireEtat, voir, effacerEvidence } from './voir.js';
import { MOMENT_DU_TOUR_LIBELLE } from './actif.js';

const s = {
  panneau: {
    position: 'fixed', top: 12, right: 12, bottom: 12, zIndex: 2147482000,
    width: 'min(420px, calc(100vw - 24px))', display: 'flex', flexDirection: 'column',
    background: 'var(--surface)', color: 'var(--text)', borderRadius: 'var(--r-xl)', boxShadow: 'var(--sh-lg)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)', fontFamily: 'var(--font)', fontSize: 'var(--t2)',
    overflow: 'hidden',
  },
  tete: { padding: '18px 18px 12px', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)' },
  titre: { margin: 0, fontSize: 'var(--t4)', fontWeight: 'var(--g2)', lineHeight: 1.2 },
  texte: { margin: '6px 0 0', color: 'var(--text2)', fontSize: 'var(--t1)', lineHeight: 1.45 },
  rangee: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10 },
  corps: { flex: 1, overflowY: 'auto', padding: '8px 18px 18px' },
  module: { margin: '18px 0 6px', fontSize: 'var(--t2)', fontWeight: 'var(--g3)' },
  item: { padding: '12px 0', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)' },
  itemCourant: { background: 'var(--selection)', borderRadius: 'var(--r)', padding: '12px 10px', margin: '0 -10px' },
  phrase: { margin: 0, lineHeight: 1.45 },
  meta: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, alignItems: 'center' },
  pastille: { display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 10px', borderRadius: 'var(--r-full)', background: 'var(--piste)', color: 'var(--text2)', fontSize: 'var(--t1)', whiteSpace: 'nowrap' },
  note: { fontSize: 'var(--t1)', color: 'var(--text2)', whiteSpace: 'nowrap' },
  noteMontee: { color: 'var(--text)', fontWeight: 'var(--g2)' },
  actions: { display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  primaire: { minHeight: 40, padding: '0 16px', borderRadius: 'var(--r-full)', borderWidth: 0, borderStyle: 'solid', background: 'var(--accent)', color: 'var(--on-accent)', fontFamily: 'var(--font)', fontSize: 'var(--t2)', fontWeight: 'var(--g2)', cursor: 'pointer' },
  secondaire: { minHeight: 40, padding: '0 14px', borderRadius: 'var(--r-full)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)', background: 'var(--btn-fond)', color: 'var(--btn-texte)', fontFamily: 'var(--font)', fontSize: 'var(--t2)', cursor: 'pointer' },
  choix: { minHeight: 40, padding: '0 12px', borderRadius: 'var(--r-full)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 'var(--t2)' },
  vu: { fontSize: 'var(--t1)', color: 'var(--text3)' },
  carte: {
    position: 'fixed', right: 12, zIndex: 2147482000, width: 'min(400px, calc(100vw - 24px))',
    background: 'var(--surface)', color: 'var(--text)', borderRadius: 'var(--r-xl)', boxShadow: 'var(--sh-lg)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)', fontFamily: 'var(--font)', fontSize: 'var(--t2)', padding: 16,
  },
  alerte: { margin: '8px 0 0', fontSize: 'var(--t1)', color: 'var(--text)', background: 'var(--piste)', borderRadius: 'var(--r)', padding: '8px 10px', lineHeight: 1.45 },
  pilule: {
    position: 'fixed', right: 12, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)', zIndex: 2147482000,
    minHeight: 44, padding: '0 18px', borderRadius: 'var(--r-full)', borderWidth: 0, borderStyle: 'solid',
    background: 'var(--accent)', color: 'var(--on-accent)', boxShadow: 'var(--sh-lg)', fontFamily: 'var(--font)', fontSize: 'var(--t2)', fontWeight: 'var(--g2)', cursor: 'pointer',
  },
  avant: {
    position: 'fixed', left: 12, top: 12, zIndex: 2147481900, width: 'min(46vw, 760px)', maxHeight: 'calc(100vh - 24px)',
    display: 'flex', flexDirection: 'column', background: 'var(--surface)', color: 'var(--text)', borderRadius: 'var(--r-xl)',
    boxShadow: 'var(--sh-lg)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)', fontFamily: 'var(--font)', fontSize: 'var(--t2)', overflow: 'hidden',
  },
  avantTete: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 10px 10px 16px', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)' },
  avantImage: { display: 'block', width: '100%', height: 'auto', objectFit: 'contain', background: 'var(--bg)' },
};

function Notes({ item }) {
  const fiche = NOTES[item.module];
  if (!fiche || !item.criteres?.length) return null;
  return item.criteres.map((c) => {
    const [a, b] = fiche[c] || [];
    if (a == null) return null;
    return (
      <span key={c} style={s.note}>
        <span>{CRITERES[c]}</span>{' '}
        <span data-no-translate="" style={b > a ? s.noteMontee : null}>{a} → {b}</span>
      </span>
    );
  });
}

function Meta({ item }) {
  return (
    <div style={s.meta}>
      <span style={s.pastille}>{ROLES[item.role]}</span>
      {item.coque === 'tablette' && <span style={s.pastille}>Tablette</span>}
      <span style={s.pastille} data-no-translate="">{`Lot ${item.lot}`}</span>
      <Notes item={item} />
    </div>
  );
}

function FenetreAvant({ item, cote, onCote, onFermer }) {
  const capture = captureAvant(item);
  if (!capture) return null;
  const { src, legende, role } = capture;
  const place = cote === 'droite' ? { right: 12, left: 'auto' } : { left: 12, right: 'auto' };
  return (
    <section style={{ ...s.avant, ...place }} aria-label="Capture avant">
      <div style={s.avantTete}>
        <strong style={{ flex: 1, fontWeight: 'var(--g3)' }}>Avant</strong>
        <button type="button" style={s.secondaire} onClick={onCote}>Autre côté</button>
        <a href={src} target="_blank" rel="noreferrer" style={{ ...s.secondaire, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Agrandir</a>
        <button type="button" style={s.secondaire} onClick={onFermer}>Fermer</button>
      </div>
      <div style={{ overflowY: 'auto' }}>
        <img src={src} alt={`Avant : ${NOTES[item.module]?.nom || ''}, ${ROLES[item.role]}`} style={s.avantImage} />
        <p style={{ ...s.texte, padding: '8px 16px 12px' }}>{`L'écran à l'arrivée, vu par : ${ROLES[role] || ROLES[item.role]}. ${legende} L'après est l'écran de la démo, à côté.`}</p>
      </div>
    </section>
  );
}

export default function PanneauNouveautes() {
  const [etat, setEtat] = useState(lireEtat);
  const [statut, setStatut] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [carteEnHaut, setCarteEnHaut] = useState(false);
  const corps = useRef(null);
  const repris = useRef(false);

  // Écriture immédiate, depuis l'état gardé : un « Voir » qui recharge la page
  // écrit sa reprise juste après, elle ne doit pas être recouverte.
  const maj = useCallback((patch) => {
    const suivant = { ...lireEtat(), ...patch };
    ecrireEtat(suivant);
    setEtat(suivant);
  }, []);

  const liste = useMemo(() => NOUVEAUTES.filter((x) => etat.lot === 'tous' || String(x.lot) === etat.lot), [etat.lot]);
  const courant = NOUVEAUTES.find((x) => x.id === etat.courant) || null;
  const rangCourant = courant ? liste.findIndex((x) => x.id === courant.id) : -1;

  const jouer = useCallback(async (item, options = {}) => {
    if (!item) return;
    setEnCours(true);
    setStatut(null);
    const vues = lireEtat().vues || [];
    maj({ courant: item.id, mode: 'carte', ouvert: true, vues: vues.includes(item.id) ? vues : [...vues, item.id], attente: null });
    const r = await voir(item, options);
    if (r.recharge) return;
    setEnCours(false);
    if (!r.ok) {
      setStatut(r.etape === 'application'
        ? "L'application n'a pas fini de se charger. Touchez « Voir » de nouveau."
        : `Repère introuvable sur cet écran : « ${r.etape} ». La page est ouverte, cherchez-le à l'œil.`);
      return;
    }
    const rect = r.element?.getBoundingClientRect();
    setCarteEnHaut(Boolean(rect && rect.top + rect.height / 2 > window.innerHeight * 0.55));
    if (rect) maj({ coteAvant: rect.left + rect.width / 2 < window.innerWidth / 2 ? 'droite' : 'gauche' });
  }, [maj]);

  // Reprise après le rechargement d'un changement de rôle ou de coque.
  useEffect(() => {
    if (repris.current) return;
    repris.current = true;
    const attente = lireEtat().attente;
    const item = attente && NOUVEAUTES.find((x) => x.id === attente.id);
    if (item) jouer(item, { apresRechargement: true });
  }, [jouer]);

  // Défilement de la liste gardé, pour rouvrir au même endroit.
  useEffect(() => {
    if (etat.ouvert && etat.mode === 'liste' && corps.current) corps.current.scrollTop = etat.defilement || 0;
  }, [etat.ouvert, etat.mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const allerA = (decalage) => {
    const suivant = liste[rangCourant + decalage];
    if (suivant) jouer(suivant);
  };

  const fermer = () => { effacerEvidence(); maj({ ouvert: false }); };
  const versListe = () => { effacerEvidence(); maj({ mode: 'liste', ouvert: true }); };
  const basculerAvant = () => maj({ avant: !etat.avant });

  const avant = etat.avant && courant
    ? <FenetreAvant item={courant} cote={etat.coteAvant || 'gauche'} onCote={() => maj({ coteAvant: etat.coteAvant === 'droite' ? 'gauche' : 'droite' })} onFermer={() => maj({ avant: false })} />
    : null;

  if (!etat.ouvert) {
    return (
      <>
        {avant}
        <button type="button" style={s.pilule} onClick={() => maj({ ouvert: true })}>
          {`Nouveautés, ${etat.vues.length} vues sur ${NOUVEAUTES.length}`}
        </button>
      </>
    );
  }

  if (etat.mode === 'carte' && courant) {
    return (
      <>
        {avant}
        <section style={{ ...s.carte, ...(carteEnHaut ? { top: 12 } : { bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }) }} aria-label="Nouveauté en cours">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <strong style={{ flex: 1, fontWeight: 'var(--g3)' }}>{NOTES[courant.module]?.nom}</strong>
            <span style={s.vu} data-no-translate="">{`${rangCourant + 1} / ${liste.length}`}</span>
          </div>
          <p style={{ ...s.phrase, marginTop: 6 }}>{courant.phrase}</p>
          <Meta item={courant} />
          {enCours && <p style={s.texte}>Ouverture de l'écran…</p>}
          {statut && <p style={s.alerte} role="status">{statut}</p>}
          <div style={s.actions}>
            <button type="button" style={s.secondaire} onClick={() => allerA(-1)} disabled={rangCourant <= 0 || enCours}>Précédente</button>
            <button type="button" style={s.primaire} onClick={() => allerA(1)} disabled={rangCourant >= liste.length - 1 || enCours}>Suivante</button>
            {captureAvant(courant) && <button type="button" style={s.secondaire} onClick={basculerAvant} aria-pressed={etat.avant}>{etat.avant ? 'Cacher avant' : 'Avant'}</button>}
            <button type="button" style={s.secondaire} onClick={() => jouer(courant)} disabled={enCours}>Revoir</button>
            <button type="button" style={s.secondaire} onClick={versListe}>Liste</button>
            <button type="button" style={s.secondaire} onClick={fermer}>Réduire</button>
          </div>
        </section>
      </>
    );
  }

  const parModule = [];
  liste.forEach((item) => {
    const groupe = parModule.find((g) => g.module === item.module);
    if (groupe) groupe.items.push(item);
    else parModule.push({ module: item.module, items: [item] });
  });

  return (
    <>
      {avant}
      <aside style={s.panneau} aria-label="Nouveautés du plan 15">
        <div style={s.tete}>
          <h2 style={s.titre}>Les nouveautés à regarder</h2>
          <p style={s.texte}>{`Touchez « Voir » : la démo prend le bon rôle, ouvre l'écran et entoure la nouveauté. « Avant » montre l'écran d'avant le plan, pour comparer. Les notes sont celles de la mesure du 23 novembre, avant puis après.`}</p>
          <p style={s.texte}>{`Pour ce tour, l'horloge de la démo est fixée au ${MOMENT_DU_TOUR_LIBELLE}, le moment de la mesure : un jour ouvert, quel que soit le jour de votre visite. Le jeu de démo est retouché pour montrer chaque nouveauté (bons au KDS, solde des points, check-in de la réception, un plat sans fiche salle, une facture sans taux de TVA, le lundi déclaré fermé).`}</p>
          <div style={s.rangee}>
            <select style={s.choix} value={etat.lot} onChange={(e) => maj({ lot: e.target.value, defilement: 0 })} aria-label="Lot">
              <option value="tous">Tous les lots</option>
              {ORDRE_LOTS.map((k) => <option key={k} value={k}>{LOTS[k]}</option>)}
            </select>
            <span style={s.vu} data-no-translate="">{`${etat.vues.length} vues sur ${NOUVEAUTES.length}`}</span>
            <span style={{ flex: 1 }} />
            <button type="button" style={s.secondaire} onClick={fermer}>Réduire</button>
          </div>
        </div>
        <div style={s.corps} ref={corps} onScroll={(e) => { const v = e.currentTarget.scrollTop; ecrireEtat({ ...lireEtat(), defilement: v }); }}>
          {parModule.map((g) => (
            <section key={g.module} aria-label={NOTES[g.module]?.nom}>
              <h3 style={s.module}>{NOTES[g.module]?.nom}</h3>
              {g.items.map((item) => (
                <div key={item.id} style={{ ...s.item, ...(item.id === etat.courant ? s.itemCourant : null) }}>
                  <p style={s.phrase}>{item.phrase}</p>
                  <Meta item={item} />
                  <div style={s.actions}>
                    <button type="button" style={s.secondaire} onClick={() => jouer(item)}>Voir</button>
                    {captureAvant(item) && <button type="button" style={s.secondaire} onClick={() => maj({ courant: item.id, avant: true })}>Avant</button>}
                    {etat.vues.includes(item.id) && <span style={{ ...s.vu, alignSelf: 'center' }}>Vue</span>}
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      </aside>
    </>
  );
}
