import React from 'react';
import { Btn, Input, Panneau, ligneStyle } from '../../components/ui/index.jsx';
import { Fenetre, st as stF } from '../../components/ui/Fenetres.jsx';
import { notify } from '../../components/toast/index.js';
import * as caisse from '../../services/caisseService.js';
import { estCategorieVirtuelle } from './categories.js';
import { libelleMode } from './reglages.js';
import {
  ETAPES_MAX, FORMULES_ACTIVES_MAX, corpsFormule, erreurFormule, lireFormule,
} from './formules.js';

// ─────────────────────────────────────────────────────────────────────────────
// Réglages de la caisse, onglet « Formules » (lot 09 du panel, 25.11.2026).
//
// Une formule à prix fixe : un nom, un prix, puis des étapes ordonnées, chacune
// avec son mode d'envoi et ses produits cochés parmi les articles en vente.
// Montée par ReglagesCaisse, donc vue par les rôles de l'habillage
// (peutHabillerCaisse) ; la base ne connaît que le rôle (policies de
// caisse_formules) et refuse les autres. Une formule ne se supprime jamais :
// elle s'archive, après confirmation. Les noms sont des données
// (data-no-translate), chaque nombre est dans son propre noeud.
// ─────────────────────────────────────────────────────────────────────────────

const chf = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
const etapeVide = (n) => ({ cle: `${Date.now()}-${n}`, nom: '', suite: Math.min(n + 1, 3), platIds: [] });

export default function SectionFormules({ etablissementId, formules, lectureEchouee = false, rangement, reglages, onChange }) {
  const [edition, setEdition] = React.useState(null); // null | formule lue | 'nouvelle'
  const [occupe, setOccupe] = React.useState(false);

  const lues = React.useMemo(
    () => (formules || []).map((brut) => ({ brut, lue: lireFormule(brut) })).filter((x) => x.lue),
    [formules],
  );
  const actives = lues.filter((x) => !x.lue.archivee);
  const archivees = lues.filter((x) => x.lue.archivee);
  const pleine = actives.length >= FORMULES_ACTIVES_MAX;

  async function archiver(f) {
    if (occupe) return;
    if (!window.confirm(`Archiver la formule « ${f.nom} » ? Elle ne sera plus proposée à la caisse. Les tickets déjà posés ne changent pas.`)) return;
    setOccupe(true);
    const { error } = await caisse.archiverFormule(f.id);
    setOccupe(false);
    if (error) { notify(error, 'error'); return; }
    notify('Formule archivée.', 'success');
    onChange?.();
  }

  if (lectureEchouee) {
    return <p style={st.aide}>Les formules n'ont pas pu être lues. Rechargez la page pour réessayer.</p>;
  }

  return (
    <div style={st.bloc}>
      <p style={st.aide}>
        Une formule se vend à prix fixe. Le serveur choisit un produit par étape ; chaque produit part en cuisine dans le mode de son étape.
      </p>
      <div style={st.rang}>
        <Btn variant="primary" onClick={() => setEdition('nouvelle')} disabled={pleine} style={st.btn44}>Nouvelle formule</Btn>
        {pleine && <span style={st.aide}>La maison a déjà {FORMULES_ACTIVES_MAX} formules en vente. Archivez-en une pour en créer une autre.</span>}
      </div>

      {actives.length === 0 ? (
        <p style={st.aide}>Aucune formule pour l'instant.</p>
      ) : (
        <Panneau style={st.panneau}>
          {actives.map(({ lue }, i) => (
            <div key={lue.id} data-formule-reglage="" style={{ ...ligneStyle({ derniere: i === actives.length - 1 }), padding: '6px 0' }}>
              <button type="button" onClick={() => setEdition(lue)} style={st.ligneBtn}>
                <span style={st.ligneNom} data-no-translate="">{lue.nom}</span>
                <span style={st.ligneDetail}>
                  <span style={st.num}>{chf(lue.prix)}</span> <span>CHF</span>
                  <span aria-hidden="true">, </span>
                  <span style={st.num}>{lue.etapes.length}</span> <span>{lue.etapes.length > 1 ? 'étapes' : 'étape'}</span>
                </span>
              </button>
              <Btn onClick={() => archiver(lue)} disabled={occupe} style={st.btn44}>Archiver</Btn>
            </div>
          ))}
        </Panneau>
      )}

      {archivees.length > 0 && (
        <>
          <div style={st.sousTitre}>Formules archivées</div>
          <p style={st.aide}>
            {archivees.map(({ lue }, i) => (
              <React.Fragment key={lue.id}>
                {i > 0 && ', '}
                <span data-no-translate="">{lue.nom}</span>
              </React.Fragment>
            ))}
          </p>
        </>
      )}

      {edition && (
        <FenetreFormule
          etablissementId={etablissementId}
          formule={edition === 'nouvelle' ? null : edition}
          rangement={rangement}
          reglages={reglages}
          onClose={() => setEdition(null)}
          onEnregistree={() => { setEdition(null); onChange?.(); }}
        />
      )}
    </div>
  );
}

function FenetreFormule({ etablissementId, formule, rangement, reglages, onClose, onEnregistree }) {
  const [nom, setNom] = React.useState(formule?.nom || '');
  const [prix, setPrix] = React.useState(formule ? chf(formule.prix) : '');
  const [etapes, setEtapes] = React.useState(() => (formule?.etapes?.length
    ? formule.etapes.map((e, n) => ({ cle: `e${n}`, nom: e.nom, suite: e.suite, platIds: [...e.platIds] }))
    : [etapeVide(0)]));
  const [ouverte, setOuverte] = React.useState(formule ? null : 0);
  const [enCours, setEnCours] = React.useState(false);
  const verrou = React.useRef(false);

  const suites = React.useMemo(() => {
    const max = 1 + (reglages?.modes?.max ?? 0);
    return Array.from({ length: Math.max(1, Math.min(max, 9)) }, (_, i) => i + 1);
  }, [reglages]);
  const categories = React.useMemo(
    () => (rangement?.categories || []).filter((c) => c.articles.length > 0 && (c.actif !== false || estCategorieVirtuelle(c.id))),
    [rangement],
  );
  const nomsArticles = React.useMemo(() => {
    const m = new Map();
    (rangement?.categories || []).forEach((c) => c.articles.forEach((a) => m.set(a.id, a.nom)));
    return m;
  }, [rangement]);

  const changerEtape = (i, partiel) => setEtapes((liste) => liste.map((e, k) => (k === i ? { ...e, ...partiel } : e)));
  const basculer = (i, id) => setEtapes((liste) => liste.map((e, k) => {
    if (k !== i) return e;
    const ids = e.platIds.includes(id) ? e.platIds.filter((x) => x !== id) : [...e.platIds, id];
    return { ...e, platIds: ids };
  }));
  const toutCocher = (i, ids) => setEtapes((liste) => liste.map((e, k) => {
    if (k !== i) return e;
    const tous = ids.every((id) => e.platIds.includes(id));
    return { ...e, platIds: tous ? e.platIds.filter((x) => !ids.includes(x)) : [...new Set([...e.platIds, ...ids])] };
  }));
  const deplacer = (i, sens) => setEtapes((liste) => {
    const j = i + sens;
    if (j < 0 || j >= liste.length) return liste;
    const copie = [...liste];
    [copie[i], copie[j]] = [copie[j], copie[i]];
    return copie;
  });

  const erreur = erreurFormule({ nom, prix, etapes });

  async function enregistrer() {
    if (erreur) { notify(erreur, 'warning'); return; }
    if (verrou.current) return;
    verrou.current = true;
    setEnCours(true);
    const corps = corpsFormule({ nom, prix: String(prix).replace(',', '.'), etapes, actif: true, archivee: false });
    const { error } = await caisse.enregistrerFormule({ ...corps, id: formule?.id, etablissementId });
    verrou.current = false;
    setEnCours(false);
    if (error) { notify(error, 'error'); return; }
    notify(formule ? 'Formule enregistrée.' : 'Formule créée.', 'success');
    onEnregistree();
  }

  return (
    <Fenetre
      id="formule-caisse"
      titre={formule ? 'Modifier la formule' : 'Nouvelle formule'}
      onClose={onClose}
      largeur={620}
      pied={(
        <>
          <button type="button" onClick={onClose} style={stF.secondaire}>Annuler</button>
          <button type="button" onClick={enregistrer} disabled={enCours} style={{ ...stF.primaire, opacity: erreur ? 0.7 : 1 }}>Enregistrer</button>
        </>
      )}
    >
      <label style={st.champBloc}>
        <span style={stF.label}>Nom de la formule</span>
        <Input value={nom} onChange={(e) => setNom(e.target.value.slice(0, 40))} placeholder="Formule midi" maxLength={40} style={st.champ} data-no-translate="" />
      </label>
      <label style={st.champBloc}>
        <span style={stF.label}>Prix en francs</span>
        <Input value={prix} onChange={(e) => setPrix(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="24.00" inputMode="decimal" style={{ ...st.champ, maxWidth: 160 }} />
      </label>

      <div style={stF.sectionTitre}>Étapes</div>
      {etapes.map((e, i) => (
        <div key={e.cle} data-etape-formule="" style={st.etape}>
          <div style={st.rang}>
            <span style={st.rangEtape}><span style={st.num}>{i + 1}</span></span>
            <Input
              value={e.nom}
              onChange={(ev) => changerEtape(i, { nom: ev.target.value.slice(0, 30) })}
              placeholder="Entrée"
              maxLength={30}
              style={{ ...st.champ, flex: '1 1 160px' }}
              data-no-translate=""
              aria-label="Nom de l'étape"
            />
          </div>
          <div style={st.sousTitre}>Envoi en cuisine</div>
          <div style={st.rang}>
            {suites.map((s) => (
              <Btn key={s} variant={e.suite === s ? 'primary' : 'ghost'} onClick={() => changerEtape(i, { suite: s })} style={st.btn44}>
                {libelleMode(reglages, s)}
              </Btn>
            ))}
          </div>
          <div style={st.rang}>
            <Btn onClick={() => setOuverte(ouverte === i ? null : i)} style={st.btn44}>
              {ouverte === i ? 'Fermer la liste' : 'Choisir les produits'}
            </Btn>
            <span style={st.aide}>
              <span style={st.num}>{e.platIds.length}</span> <span>{e.platIds.length > 1 ? 'produits cochés' : 'produit coché'}</span>
            </span>
          </div>
          {ouverte !== i && e.platIds.length > 0 && (
            <p style={st.aide} data-no-translate="">{e.platIds.map((id) => nomsArticles.get(id) || '').filter(Boolean).join(', ')}</p>
          )}
          {ouverte === i && (
            <div style={st.liste}>
              {categories.map((c) => {
                const ids = c.articles.map((a) => a.id);
                return (
                  <div key={c.id} style={st.categorie}>
                    <div style={st.rangCat}>
                      <span style={st.nomCat} data-no-translate="">{c.nom}</span>
                      <Btn small onClick={() => toutCocher(i, ids)} style={st.btn44}>Tout cocher</Btn>
                    </div>
                    {c.articles.map((a) => (
                      <label key={a.id} style={st.produit}>
                        <input type="checkbox" checked={e.platIds.includes(a.id)} onChange={() => basculer(i, a.id)} style={st.case} />
                        <span style={st.produitNom} data-no-translate="">{a.nom}</span>
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
          <div style={st.rang}>
            <Btn onClick={() => deplacer(i, -1)} disabled={i === 0} style={st.btn44}>Monter</Btn>
            <Btn onClick={() => deplacer(i, 1)} disabled={i === etapes.length - 1} style={st.btn44}>Descendre</Btn>
            <Btn variant="danger" onClick={() => setEtapes((l) => l.filter((_, k) => k !== i))} disabled={etapes.length <= 1} style={st.btn44}>Retirer l'étape</Btn>
          </div>
        </div>
      ))}
      {etapes.length < ETAPES_MAX && (
        <div>
          <Btn onClick={() => { setEtapes((l) => [...l, etapeVide(l.length)]); setOuverte(etapes.length); }} style={st.btn44}>Ajouter une étape</Btn>
        </div>
      )}
      {erreur && <p style={st.aide}>{erreur}</p>}
    </Fenetre>
  );
}

const st = {
  bloc: { display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 },
  aide: { fontSize: 'var(--t2)', color: 'var(--text2)', margin: 0, lineHeight: 1.4 },
  rang: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', minWidth: 0 },
  btn44: { minHeight: 44 },
  panneau: { padding: '4px 16px' },
  ligneBtn: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, flex: 1, minWidth: 0, minHeight: 44,
    padding: '4px 0', background: 'transparent', border: 'none', borderRadius: 0, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)',
  },
  ligneNom: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)', overflowWrap: 'anywhere' },
  ligneDetail: { fontSize: 'var(--t1)', color: 'var(--text2)' },
  num: { fontFamily: 'var(--font-num)' },
  sousTitre: { fontSize: 'var(--t1)', fontWeight: 'var(--g2)', color: 'var(--text2)', marginTop: 4 },
  champBloc: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 },
  champ: { minHeight: 44 },
  etape: {
    display: 'flex', flexDirection: 'column', gap: 8, padding: 12, minWidth: 0,
    background: 'var(--piste)', borderRadius: 'var(--r)',
  },
  rangEtape: {
    width: 32, height: 32, borderRadius: '50%', background: 'var(--surface)', color: 'var(--text)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--t2)', flexShrink: 0,
  },
  liste: { display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--surface)', borderRadius: 'var(--r)', padding: '8px 12px', minWidth: 0 },
  categorie: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  rangCat: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', minHeight: 44 },
  nomCat: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)' },
  produit: { display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, cursor: 'pointer', minWidth: 0 },
  case: { width: 22, height: 22, flexShrink: 0, accentColor: 'var(--accent)' },
  produitNom: { flex: 1, minWidth: 0, fontSize: 'var(--t2)', color: 'var(--text)', overflowWrap: 'anywhere' },
};
