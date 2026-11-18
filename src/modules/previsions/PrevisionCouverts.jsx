import { useEffect, useMemo, useState } from 'react';
import { Btn, Panneau } from '../../components/ui/index.jsx';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { supabase } from '../../services/supabase.js';
import { dbService } from '../../services/dbService.js';
import { zurichAjouterJours, zurichToday } from '../../utils/zurichTime.js';
import { formatDateCourte, formatJourSemaine } from '../../utils/dateHelpers.js';
import { SERVICE_META, SERVICES_AFFICHES } from './statutsReservation.js';
import {
  construirePrevision, JOURS_MIN_PAR_CLASSE, JOURS_PREVUS, SEMAINES, SEMAINES_EFFET, SEMAINES_MIN,
} from './previsionCouverts.js';
import { chargerMeteo, npaDepuisAdresse } from './meteo.js';

// ═══════════════════════════════════════════════════════════════════════════
// Prévision des couverts des 7 prochains jours, sous le planning des
// réservations : elle les accompagne, elle ne les remplace pas.
//
// Visible par qui voit Réservations, sans garde de plus : elle ne lit que
// les réservations de l'établissement (déjà ouvertes à ces personnes) et la
// météo publique de MétéoSuisse. Le calcul est dans previsionCouverts.js ;
// chaque nombre se déplie en sa composition (moyenne, semaines comptées,
// effet de la météo, réservations prises).
//
// Traduction du DOM : chaque nombre vit dans son propre nœud
// data-no-translate, chaque libellé est une phrase fixe.
// ═══════════════════════════════════════════════════════════════════════════

const JOURS_PLURIEL = ['dimanches', 'lundis', 'mardis', 'mercredis', 'jeudis', 'vendredis', 'samedis'];
const PAGE = 1000;

const nb = (v) => <span data-no-translate="">{v}</span>;
const virgule = (x) => String(x).replace('.', ',');
const pourcent = (taux) => `${taux > 0 ? '+' : '-'}${Math.round(Math.abs(taux) * 100)} %`;
const degres = (t) => `${Math.round(t)} °C`;

// ── Lectures ────────────────────────────────────────────────────────────
// Toutes les pages : un établissement chargé dépasse les 1 000 lignes d'une
// réponse sur 12 semaines.
async function lireReservations(etabId, debut, fin) {
  const toutes = [];
  for (let de = 0; ; de += PAGE) {
    const { data, error } = await supabase
      .from('reservations')
      .select('id, date_service, service, nb_couverts, statut')
      .eq('etablissement_id', etabId)
      .gte('date_service', debut)
      .lte('date_service', fin)
      .neq('statut', 'annule')
      .order('date_service', { ascending: true })
      .order('id', { ascending: true })
      .range(de, de + PAGE - 1);
    if (error) throw error;
    toutes.push(...(data || []));
    if (!data || data.length < PAGE) return toutes;
  }
}

async function lirePremiereDate(etabId) {
  const { data, error } = await supabase
    .from('reservations')
    .select('date_service')
    .eq('etablissement_id', etabId)
    .order('date_service', { ascending: true })
    .limit(1);
  if (error) throw error;
  return data?.[0]?.date_service || null;
}

function usePrevisionCouverts(etablissement, refreshKey) {
  const etabId = etablissement?.id || null;
  const npa = npaDepuisAdresse(etablissement?.adresse);
  const aujourdhui = zurichToday();
  const [donnees, setDonnees] = useState({ etat: 'chargement' });
  const [meteo, setMeteo] = useState({ etat: 'chargement', valeur: null });
  const [relecture, setRelecture] = useState(0);

  useEffect(() => {
    if (!etabId) return undefined;
    let annule = false;
    const debut = zurichAjouterJours(aujourdhui, -Math.max(SEMAINES, SEMAINES_EFFET) * 7);
    const fin = zurichAjouterJours(aujourdhui, JOURS_PREVUS - 1);
    Promise.all([lireReservations(etabId, debut, fin), lirePremiereDate(etabId)])
      .then(([resas, premiereDate]) => { if (!annule) setDonnees({ etat: 'pret', resas, premiereDate }); })
      .catch((e) => {
        console.error('[PrevisionCouverts] lecture des réservations', e);
        // Une prévision déjà affichée reste : seule la première lecture
        // montre l'erreur.
        if (!annule) setDonnees((cur) => (cur.etat === 'pret' ? cur : { etat: 'erreur' }));
      });
    return () => { annule = true; };
  }, [etabId, aujourdhui, refreshKey, relecture]);

  useEffect(() => {
    if (!npa) { setMeteo({ etat: 'sans_localisation', valeur: null }); return undefined; }
    let annule = false;
    setMeteo({ etat: 'chargement', valeur: null });
    chargerMeteo(npa, { aujourdhui })
      .then((valeur) => { if (!annule) setMeteo({ etat: 'ok', valeur }); })
      .catch((e) => {
        console.warn('[PrevisionCouverts] météo indisponible', e?.message || e);
        if (!annule) setMeteo({ etat: 'indisponible', valeur: null });
      });
    return () => { annule = true; };
  }, [npa, aujourdhui]);

  // Une réservation saisie sur un autre poste relève le plancher sans
  // recharger ; subscribeReload rejoue aussi la lecture au réveil.
  useEffect(() => {
    const realtime = dbService.getBridge()?.realtime;
    if (!etabId || !realtime?.subscribeReload) return undefined;
    const unsub = realtime.subscribeReload('reservations', () => setRelecture((k) => k + 1));
    return () => { unsub && unsub(); };
  }, [etabId]);

  const prevision = useMemo(() => (donnees.etat === 'pret'
    ? construirePrevision({
      aujourdhui, premiereDate: donnees.premiereDate, resas: donnees.resas,
      meteo: meteo.valeur, etatMeteo: meteo.etat,
    })
    : null), [donnees, meteo, aujourdhui]);

  return { donnees, prevision, relire: () => setRelecture((k) => k + 1) };
}

// ── Pièces d'affichage ──────────────────────────────────────────────────
const texteDoux = { fontSize: 'var(--t1)', color: 'var(--text3)', lineHeight: 1.45 };
const texteCourant = { fontSize: 'var(--t2)', color: 'var(--text2)', lineHeight: 1.5 };

function Ligne({ libelle, valeur, fort = false, valeurTraduite = false }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12,
      fontSize: 'var(--t1)', lineHeight: 1.5,
      color: fort ? 'var(--text)' : 'var(--text2)', fontWeight: fort ? 'var(--g3)' : 'var(--g1)',
    }}>
      <span style={{ minWidth: 0 }}>{libelle}</span>
      {valeurTraduite
        ? <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{valeur}</span>
        : <span data-no-translate="" style={{ fontFamily: 'var(--font-num)', flexShrink: 0, whiteSpace: 'nowrap' }}>{valeur}</span>}
    </div>
  );
}

// Le nombre prévu d'un service, les réservations prises et le temps.
function CelluleService({ cellule, svc }) {
  const meta = SERVICE_META[svc];
  const prevue = cellule.etat === 'prevision';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span data-no-translate="" style={{
          fontFamily: 'var(--font-num)', fontWeight: 'var(--g-chiffre)', fontSize: 'var(--t5)',
          color: prevue ? 'var(--text)' : 'var(--text3)', lineHeight: 1.1,
        }}>
          {prevue ? cellule.valeur : '-'}
        </span>
        <span style={texteDoux}>{prevue ? 'prévus' : 'pas de prévision'}</span>
      </div>
      <div style={{ ...texteDoux, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        <span>Réservés</span>
        <span data-no-translate="" style={{ fontFamily: 'var(--font-num)', color: meta.couleur }}>{cellule.reserves}</span>
      </div>
      {cellule.temps && <div style={{ ...texteDoux, color: 'var(--text2)' }}>{cellule.temps.libelle}</div>}
    </div>
  );
}

function Composition({ jour, cellule, svc }) {
  const meta = SERVICE_META[svc];
  const libelleMoyenne = `Moyenne des ${JOURS_PLURIEL[jour.jourSemaine]} ${svc === 'midi' ? 'midi' : 'soir'}`;
  return (
    <div style={{ minWidth: 0, maxWidth: 360 }}>
      <div style={{ fontSize: 'var(--t1)', fontWeight: 'var(--g3)', color: meta.couleur, marginBottom: 4 }}>{meta.label}</div>
      {cellule.etat === 'prevision' ? (
        <>
          <Ligne libelle={libelleMoyenne} valeur={Math.round(cellule.moyenne)} />
          <Ligne libelle="Semaines comptées" valeur={cellule.semaines} />
          {cellule.effet && (
            <Ligne
              libelle={cellule.effet.classe === 'precipitations' ? 'Jour de pluie ou de neige prévu' : 'Jour sec prévu'}
              valeur={pourcent(cellule.effet.taux)}
            />
          )}
          <Ligne libelle="Déjà réservés" valeur={cellule.reserves} />
          <Ligne libelle="Prévision" valeur={cellule.valeur} fort />
          {cellule.plancher && (
            <div style={{ ...texteDoux, marginTop: 2 }}>Les réservations déjà prises dépassent le calcul : elles font la prévision.</div>
          )}
        </>
      ) : (
        <>
          <div style={{ ...texteDoux, marginBottom: 2 }}>{`Pas de prévision : moins de ${SEMAINES_MIN} semaines comparables.`}</div>
          <Ligne libelle="Semaines comptées" valeur={cellule.semaines} />
          <Ligne libelle="Déjà réservés" valeur={cellule.reserves} />
        </>
      )}
      {cellule.temps && (
        <>
          <Ligne libelle="Temps prévu" valeur={cellule.temps.libelle} valeurTraduite />
          <Ligne libelle="Pluie ou neige sur le service" valeur={`${virgule(cellule.temps.pluieMm)} mm`} />
        </>
      )}
    </div>
  );
}

function TempsDuJour({ jour }) {
  const m = jour.meteoJour;
  if (!m || m.tmin === null || m.tmax === null) return null;
  return (
    <div style={{ ...texteDoux, marginTop: 2 }}>
      <span data-no-translate="">{degres(m.tmin)}</span>
      <span> à </span>
      <span data-no-translate="">{degres(m.tmax)}</span>
    </div>
  );
}

// ── Constats du calcul, en tête du panneau ──────────────────────────────
const RAISONS = {
  jours_insuffisants: `effet de la météo non mesurable : il faut au moins ${JOURS_MIN_PAR_CLASSE} jours de pluie ou de neige et ${JOURS_MIN_PAR_CLASSE} jours secs comparables.`,
  ecart_non_significatif: 'effet de la météo non mesurable : vos couverts ne changent pas assez entre jours de pluie et jours secs.',
  sans_mesures: 'effet de la météo non mesurable : aucune station de mesure MétéoSuisse à moins de 25 km.',
};

function Constats({ prevision }) {
  const { statut, semainesMax, etatMeteo, meteo, effets } = prevision;
  const lignes = [];
  if (statut === 'historique_court') {
    lignes.push(<div key="h" style={texteCourant}>{`Pas encore de prévision : il faut au moins ${SEMAINES_MIN} semaines de réservations.`}</div>);
    lignes.push(<div key="hn" style={{ maxWidth: 360 }}><Ligne libelle="Semaines de réservations à ce jour" valeur={semainesMax} /></div>);
  } else if (semainesMax < SEMAINES) {
    lignes.push(
      <div key="h" style={texteCourant}>
        <span>Historique court : la moyenne porte sur</span>{' '}{nb(semainesMax)}{' '}<span>{`semaines au lieu de ${SEMAINES}.`}</span>
      </div>,
    );
  } else {
    lignes.push(<div key="h" style={texteCourant}>{`Moyenne des mêmes services sur les ${SEMAINES} dernières semaines. La prévision ne descend jamais sous les réservations déjà prises.`}</div>);
  }

  if (etatMeteo === 'sans_localisation') {
    lignes.push(<div key="m" style={texteCourant}>Pas de météo : l'adresse de l'établissement ne contient pas de NPA.</div>);
  } else if (etatMeteo === 'indisponible') {
    lignes.push(<div key="m" style={texteCourant}>Météo indisponible pour le moment : la prévision ne tient compte que des réservations.</div>);
  } else if (etatMeteo === 'chargement') {
    lignes.push(<div key="m" style={texteDoux}>Chargement de la météo…</div>);
  } else if (meteo && statut === 'prevision') {
    const parRaison = new Map();
    for (const svc of SERVICES_AFFICHES) {
      const e = effets[svc];
      const cle = e.mesurable ? 'mesure' : e.raison;
      if (!parRaison.has(cle)) parRaison.set(cle, []);
      parRaison.get(cle).push(svc);
    }
    for (const [cle, services] of parRaison) {
      const qui = services.length === SERVICES_AFFICHES.length
        ? null
        : services.map((s) => SERVICE_META[s].label).join(', ');
      const phrase = cle === 'mesure'
        ? 'effet de la météo mesuré sur vos réservations passées, appliqué à la prévision.'
        : `${RAISONS[cle] || RAISONS.ecart_non_significatif} La météo s'affiche sans corriger la prévision.`;
      lignes.push(
        <div key={`e-${cle}`} style={texteCourant}>
          {qui ? <><span>{qui}</span><span> : </span></> : <span>Pour les deux services : </span>}
          <span>{phrase}</span>
        </div>,
      );
    }
  }
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{lignes}</div>;
}

// ── Composant ───────────────────────────────────────────────────────────
export default function PrevisionCouverts({ etablissement, refreshKey }) {
  const isMobile = useIsMobile();
  const { donnees, prevision, relire } = usePrevisionCouverts(etablissement, refreshKey);
  const [ouvert, setOuvert] = useState(() => zurichToday());
  const colonnes = `104px repeat(${SERVICES_AFFICHES.length}, minmax(0, 1fr))`;

  if (!etablissement?.id) return null;

  return (
    <Panneau style={{ padding: 0, overflow: 'hidden', marginTop: 24 }}>
      <section aria-label="Prévision des couverts" style={{ fontFamily: 'var(--font)' }}>
        <div style={{ padding: isMobile ? '14px 14px 12px' : '16px 18px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 'var(--t3)', fontWeight: 'var(--g3)', color: 'var(--text)' }}>Prévision des couverts</h3>
            <span style={texteDoux}>Les 7 prochains jours, service par service</span>
          </div>
          {donnees.etat === 'chargement' && <div style={texteDoux}>Calcul de la prévision…</div>}
          {donnees.etat === 'erreur' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ ...texteCourant, color: 'var(--danger-text)' }}>La prévision n'a pas pu être calculée.</span>
              <Btn small onClick={relire}>Réessayer</Btn>
            </div>
          )}
          {prevision && <Constats prevision={prevision} />}
        </div>

        {/* Sans prévision (historique court), les jours restent : leurs
            réservations et leur météo servent quand même. */}
        {prevision && (
          <div style={{ borderTop: '1px solid var(--rule-soft)' }}>
            {!isMobile && (
              <div style={{ display: 'grid', gridTemplateColumns: colonnes, borderBottom: '1px solid var(--rule-soft)', background: 'var(--bg)' }}>
                <div style={{ padding: '8px 12px', fontSize: 'var(--t1)', fontWeight: 'var(--g3)', color: 'var(--text3)' }}>Jour</div>
                {SERVICES_AFFICHES.map((svc) => (
                  <div key={svc} style={{
                    padding: '8px 12px', fontSize: 'var(--t1)', fontWeight: 'var(--g3)',
                    color: SERVICE_META[svc].couleur, background: SERVICE_META[svc].fond,
                  }}>
                    {SERVICE_META[svc].label}
                  </div>
                ))}
              </div>
            )}
            {prevision.jours.map((jour, i) => {
              const deplie = ouvert === jour.jour;
              const dernier = i === prevision.jours.length - 1;
              const basculer = () => setOuvert((cur) => (cur === jour.jour ? null : jour.jour));
              // Le nom du jour, puis sa date : à l'ordinateur, l'un sous
              // l'autre (« Aujourd'hui » et la date ne tiennent pas sur une
              // ligne de la colonne du jour).
              const entete = (
                <>
                  <span style={{ display: isMobile ? 'inline' : 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: i === 0 ? 'var(--lien)' : 'var(--text)' }}>
                      {i === 0 ? "Aujourd'hui" : formatJourSemaine(jour.jour)}
                    </span>
                    <span data-no-translate="" style={{ fontSize: 'var(--t1)', fontWeight: 'var(--g2)', color: 'var(--text3)', marginLeft: isMobile ? 6 : 0 }}>
                      {formatDateCourte(jour.jour)}
                    </span>
                  </span>
                  <TempsDuJour jour={jour} />
                </>
              );
              return (
                <div key={jour.jour} style={{
                  borderBottom: dernier ? 'none' : '1px solid var(--rule-soft)',
                  background: deplie ? 'var(--selection)' : 'transparent',
                }}>
                  <button
                    type="button"
                    onClick={basculer}
                    aria-expanded={deplie}
                    title={deplie ? 'Masquer le calcul' : 'Voir le calcul'}
                    style={{
                      width: '100%', display: 'grid', alignItems: 'start', textAlign: 'left',
                      gridTemplateColumns: isMobile ? '1fr 1fr' : colonnes,
                      gap: isMobile ? '8px 12px' : 0,
                      padding: isMobile ? '12px 14px' : 0,
                      borderWidth: 0, borderStyle: 'none', background: 'transparent',
                      cursor: 'pointer', fontFamily: 'var(--font)', color: 'var(--text)',
                    }}
                  >
                    <div style={isMobile ? { gridColumn: '1 / -1', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 } : { padding: '10px 12px' }}>
                      {entete}
                    </div>
                    {SERVICES_AFFICHES.map((svc) => (
                      <div key={svc} style={{ padding: isMobile ? 0 : '10px 12px', minWidth: 0 }}>
                        {isMobile && (
                          <div style={{ fontSize: 'var(--t1)', fontWeight: 'var(--g3)', color: SERVICE_META[svc].couleur, marginBottom: 2 }}>
                            {SERVICE_META[svc].label}
                          </div>
                        )}
                        <CelluleService cellule={jour.services[svc]} svc={svc} />
                      </div>
                    ))}
                  </button>
                  {deplie && (
                    <div style={{
                      display: 'grid', gap: isMobile ? 14 : 24,
                      gridTemplateColumns: isMobile ? '1fr' : `104px repeat(${SERVICES_AFFICHES.length}, minmax(0, 1fr))`,
                      padding: isMobile ? '0 14px 14px' : '0 12px 14px',
                    }}>
                      {!isMobile && <div style={texteDoux}>Le calcul</div>}
                      {SERVICES_AFFICHES.map((svc) => (
                        <Composition key={svc} jour={jour} cellule={jour.services[svc]} svc={svc} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {prevision?.meteo && (
          <div style={{ ...texteDoux, padding: isMobile ? '10px 14px 12px' : '10px 18px 12px', borderTop: '1px solid var(--rule-soft)' }}>
            <span>Météo prévue par</span>{' '}<span data-no-translate="">MétéoSuisse</span>{' '}<span>(données ouvertes), point</span>{' '}
            <span data-no-translate="">{prevision.meteo.point.nom}</span>
            {prevision.meteo.station && (
              <>
                <span>. Mesures passées : station</span>{' '}
                <span data-no-translate="">{prevision.meteo.station.nom}</span>
              </>
            )}
            <span>.</span>
          </div>
        )}
      </section>
    </Panneau>
  );
}
