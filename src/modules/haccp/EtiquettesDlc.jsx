import React from 'react';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import { getBrowserWindow, notifyLegacy } from '../../legacy/legacyApi.js';
import { pdfUtils } from '../../services/pdf.js';
import { normalizeSearch } from '../../utils/searchText.js';
import { agentDisponible, attendreImpression, envoyerLot } from '../../services/printQueue.js';
import { zurichToday } from '../../utils/zurichTime.js';
import {
  ETIQUETTE_MEDIA, ETIQUETTE_MODES, QUANTITE_MAX, QUANTITE_MIN,
  calculerDlc, dureeVieMode, estEligible, formatDateFr, getMode, lignesEtiquette, motifNonEligible,
} from '../../utils/etiquettesDlc.js';
import { hs } from './HACCP.styles.js';

// ─────────────────────────────────────────────────────────────────────────────
// ÉTIQUETTES DLC - poste d'étiquetage du module HACCP
//
// Imprime en une seule opération les étiquettes de DLC de plusieurs
// préparations, vers une Brother QL-820NWB en AirPrint. Le transport
// d'impression est le système natif de l'OS : l'app produit un PDF à la
// dimension exacte de l'étiquette (une page = une étiquette), la tablette
// imprime. Aucun driver, aucun SDK, aucune configuration matérielle.
//
// Le PDF est OUVERT, jamais imprimé par le navigateur : imprimer une page web
// fait ajouter au système son en-tête et son pied de page, et l'URL du document
// ressortait imprimée en bas de l'étiquette. Le visualiseur PDF, lui, sort la
// page telle quelle.
//
// Un lot porte UN seul mode : en cuisine, on étiquette un lot qui part au même
// endroit. Les durées de vie ne se saisissent pas ici - elles relèvent de
// l'autocontrôle et vivent sur la fiche recette.
//
// La sélection est en état de composant : quitter l'onglet la perd, comportement
// accepté pour cette version.
// ─────────────────────────────────────────────────────────────────────────────

const es = {
  banniere: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 14px', background: 'var(--warning-bg)', border: '1px solid var(--warning-bd)', borderRadius: 10, color: 'var(--warning-text)', fontSize: 12, lineHeight: 1.5 },
  bloc: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 },
  champsDates: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 },
  ligne: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' },
  ligneInfo: { flex: 1, minWidth: 140, maxWidth: '100%' },
  nom: { fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 },
  meta: { fontSize: 11, color: 'var(--text2)', marginTop: 3 },
  dlc: { fontSize: 12, fontWeight: 700, color: 'var(--accent)' },
  stepper: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 },
  // flexShrink 0 : le min-height global de 44px sur les <button> écrase le flex
  // et fait se superposer les boutons d'une rangée sur mobile.
  stepBtn: { width: 34, height: 34, flexShrink: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 16, fontWeight: 700, color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
  qteInput: { width: 52, padding: '7px 6px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 14, fontWeight: 700, textAlign: 'center', color: 'var(--text)', background: 'var(--bg)', fontFamily: 'var(--font)', outline: 'none' },
  // Barre de résumé posée en bas de l'onglet (sticky, jamais flottante).
  resume: { position: 'sticky', bottom: 0, zIndex: 3, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '12px 16px', background: 'var(--surface)', borderTop: '1px solid var(--border)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 -2px 10px rgba(0,0,0,0.05)' },
  resumeTotal: { fontSize: 13, color: 'var(--text2)', flex: 1, minWidth: 160 },
  dernierLot: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 14px', background: 'var(--success-bg-soft)', border: '1px solid var(--success-bd)', borderRadius: 10, fontSize: 12, color: 'var(--text2)' },
  rechercheWrap: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' },
  rechercheInput: { flex: 1, minWidth: 0, padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', outline: 'none' },
};

// Feuille de partage du système : le PDF y arrive directement, « Imprimer » est
// sous le pouce, et l'écran d'aperçu disparaît du parcours. C'est le chemin le
// plus court qu'une page web puisse offrir sur iPad — aucun navigateur n'expose
// d'impression silencieuse, seul l'agent local sait faire mieux.
//
// Rien d'asynchrone ici : iOS n'autorise le partage que dans la tâche du geste
// utilisateur. Le PDF est donc construit sur place, jsPDF ayant été préchargé
// au montage de l'onglet.
const partagerPdf = (blob, nomFichier) => {
  const win = getBrowserWindow();
  const nav = win?.navigator;
  if (!nav?.share || typeof win.File !== 'function') return null;
  try {
    const fichier = new win.File([blob], nomFichier, { type: 'application/pdf' });
    // canShare avec des fichiers : la seule façon de savoir AVANT d'appeler si
    // le système acceptera un PDF. Un share() refusé consommerait le geste.
    if (!nav.canShare?.({ files: [fichier] })) return null;
    return nav.share({ files: [fichier], title: nomFichier });
  } catch {
    return null;
  }
};

// Onglet vide ouvert dans la foulée du clic, garni du PDF une fois celui-ci
// prêt. Sans ce pré-ouvrage, iOS bloque l'ouverture : la génération comporte
// des await, et Safari n'autorise window.open que dans la tâche déclenchée par
// le geste de l'utilisateur.
const ouvrirOngletVide = () => {
  const win = getBrowserWindow();
  try { return win?.open('', '_blank') || null; } catch { return null; }
};

const fermerOnglet = (onglet) => {
  try { onglet?.close(); } catch { /* déjà fermé */ }
};

const EtiquettesDlc = ({ etabId, legacySB, user }) => {
  const today = zurichToday();

  const [recettes, setRecettes] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [modeId, setModeId] = React.useState('frais');
  const [dates, setDates] = React.useState({ fabrication: today, surgelation: today, decongelation: today });
  const [search, setSearch] = React.useState('');
  const [searchApplied, setSearchApplied] = React.useState('');
  // id de recette → quantité d'étiquettes. La présence de la clé = sélection.
  const [quantites, setQuantites] = React.useState({});
  // Retraits du dernier changement de mode : jamais de retrait silencieux.
  const [retraits, setRetraits] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(null);
  // Dernier lot produit. Le lien vers le PDF n'apparaît QUE si l'ouverture
  // automatique a échoué : en marche normale l'opérateur a déjà le PDF sous les
  // yeux, un lien de plus en bas de l'écran n'est que du bruit.
  const [dernierLot, setDernierLot] = React.useState(null);
  // Agent d'impression du restaurant : présent = le lot part directement sur
  // l'imprimante, absent = feuille d'impression système. Jamais bloquant.
  const [agent, setAgent] = React.useState(null);
  const urlsRef = React.useRef([]);
  React.useEffect(() => () => {
    urlsRef.current.forEach(u => { try { URL.revokeObjectURL(u); } catch { /* déjà libérée */ } });
  }, []);

  const mode = getMode(modeId);

  // ─── Chargement des recettes de l'établissement + realtime ───
  React.useEffect(() => {
    if (!legacySB) { setRecettes([]); setLoading(false); return; }
    let mounted = true;
    const reload = async () => {
      try {
        const list = await legacySB.db.listRecettes(etabId);
        if (!mounted) return;
        // Les recettes archivées ne sont plus produites : pas d'étiquette.
        setRecettes((list || []).filter(r => r.statut !== 'archivée'));
      } catch (err) { console.error('[EtiquettesDlc load]', err); }
      finally { if (mounted) setLoading(false); }
    };
    reload();
    const unsub = legacySB.realtime.subscribeReload(['recettes'], reload);
    return () => { mounted = false; if (unsub) unsub(); };
  }, [etabId, legacySB]);

  // ─── Disponibilité de l'impression directe ───
  React.useEffect(() => {
    let vivant = true;
    agentDisponible(etabId).then(a => { if (vivant) setAgent(a); });
    return () => { vivant = false; };
  }, [etabId]);

  // ─── Préchargement de jsPDF ───
  // Au montage et non au clic : iOS refuse la feuille de partage dès qu'une
  // promesse s'est intercalée depuis le geste, fût-ce celle d'un import déjà
  // résolu. C'est ce préchargement qui rend la construction du PDF synchrone.
  React.useEffect(() => { pdfUtils.precharger?.(); }, []);

  // ─── Recherche : filtre local, debounce 200 ms, aucune requête par frappe ───
  React.useEffect(() => {
    const t = setTimeout(() => setSearchApplied(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  const parId = React.useMemo(() => {
    const m = new Map();
    recettes.forEach(r => m.set(r.id, r));
    return m;
  }, [recettes]);

  const visibles = React.useMemo(() => {
    const q = normalizeSearch(searchApplied.trim());
    if (!q) return recettes;
    return recettes.filter(r => {
      // Une recette déjà sélectionnée reste visible même hors du filtre courant,
      // sinon on imprimerait un lot dont une partie a disparu de l'écran.
      if (Object.prototype.hasOwnProperty.call(quantites, r.id)) return true;
      return normalizeSearch(`${r.nom || ''} ${r.categorie || ''}`).includes(q);
    });
  }, [recettes, searchApplied, quantites]);

  const nbSelection = Object.keys(quantites).length;
  const totalEtiquettes = Object.values(quantites).reduce((s, n) => s + (Number(n) || 0), 0);

  const setQuantite = (id, valeur) => {
    const n = Math.min(QUANTITE_MAX, Math.max(QUANTITE_MIN, Math.round(Number(valeur) || QUANTITE_MIN)));
    setQuantites(prev => ({ ...prev, [id]: n }));
  };

  const toggleSelection = (recette) => {
    setQuantites(prev => {
      const next = { ...prev };
      if (Object.prototype.hasOwnProperty.call(next, recette.id)) delete next[recette.id];
      else next[recette.id] = 1;
      return next;
    });
  };

  // ─── Changement de mode : retrait explicite des lignes devenues inéligibles ───
  const changerMode = (nextId) => {
    if (nextId === modeId) return;
    const retires = Object.keys(quantites)
      .map(id => parId.get(id))
      .filter(r => r && !estEligible(r, nextId));
    if (retires.length) {
      const ids = new Set(retires.map(r => r.id));
      setQuantites(prev => {
        const next = {};
        Object.entries(prev).forEach(([id, n]) => { if (!ids.has(id)) next[id] = n; });
        return next;
      });
      setRetraits({ nb: retires.length, noms: retires.map(r => r.nom), modeLabel: getMode(nextId).label });
      notifyLegacy(
        `${retires.length} préparation${retires.length > 1 ? 's' : ''} retirée${retires.length > 1 ? 's' : ''} de la sélection : non congelable${retires.length > 1 ? 's' : ''}.`,
        'warning',
      );
    } else {
      setRetraits(null);
    }
    setModeId(nextId);
  };

  // ─── Génération : une étiquette = une page, quantités groupées par recette ───
  const genererEtiquettes = async () => {
    if (busy || totalEtiquettes === 0) return;
    const dateManquante = mode.dates.find(d => !dates[d.id]);
    if (dateManquante) { notifyLegacy(`Renseignez la ${dateManquante.label.toLowerCase()}.`, 'warning'); return; }

    // Ordre des pages : ordre de la liste (recettes triées par nom côté DB),
    // quantités groupées par recette.
    const etiquettes = [];
    recettes.forEach(r => {
      const n = quantites[r.id];
      if (!n || !estEligible(r, modeId)) return;
      const lignes = lignesEtiquette({ recette: r, modeId, dates });
      for (let i = 0; i < n; i += 1) etiquettes.push({ lignes });
    });
    if (!etiquettes.length) { notifyLegacy('Aucune étiquette à générer.', 'warning'); return; }

    const nb = etiquettes.length;
    const pluriel = nb > 1 ? 's' : '';
    const nomFichier = `etiquettes-dlc-${modeId}-${dates[mode.dlcDepuis]}.pdf`;

    // ─── Chemin le plus court : la feuille de partage, sans écran d'aperçu ───
    // Tout est synchrone jusqu'à l'appel de partage, sans quoi iOS le refuse.
    // On ne re-vérifie pas l'agent ici : ce chemin n'est pris que s'il était
    // déjà absent, et une requête réseau ferait perdre le geste utilisateur.
    if (!agent && pdfUtils.jsPdfDisponible?.()) {
      const lot = pdfUtils.construireEtiquettesDlcSync(etiquettes, {});
      const promesse = lot && partagerPdf(lot.blob, nomFichier);
      if (promesse) {
        const url = lot.doc.output('bloburl');
        urlsRef.current.push(url);
        setBusy(true);
        promesse
          .then(() => {
            setDernierLot({ url, nb, ouvert: true, viaPartage: true });
            notifyLegacy(`${nb} étiquette${pluriel} envoyée${pluriel} à l'impression.`, 'success');
          })
          .catch((err) => {
            // AbortError = feuille refermée par l'opérateur : rien à signaler,
            // mais on garde le PDF sous la main pour qu'il n'ait pas à relancer.
            if (err?.name !== 'AbortError') console.warn('[EtiquettesDlc partage]', err);
            setDernierLot({ url, nb, ouvert: false, viaPartage: true });
          })
          .finally(() => setBusy(false));
        return;
      }
    }

    // Onglet ouvert AVANT le moindre await, et rempli avec le PDF une fois
    // celui-ci prêt : iOS refuse window.open dès qu'une promesse s'est
    // intercalée depuis le geste de l'opérateur. Inutile si l'impression part
    // par l'agent — on le referme alors, mais seulement une fois le lot déposé.
    const fenetrePdf = agent ? null : ouvrirOngletVide();

    setBusy(true);
    // Indicateur de progression au-delà de 50 étiquettes seulement : en dessous,
    // la génération est trop rapide pour qu'il serve à autre chose qu'à clignoter.
    const suivi = nb > 50;
    if (suivi) setProgress({ done: 0, total: nb });
    const onProgress = suivi ? (done, total) => setProgress({ done, total }) : undefined;

    try {
      // ─── Impression directe, si l'agent du restaurant est joignable ───
      // Vérification juste avant l'envoi et non seulement au montage : l'onglet
      // peut rester ouvert des heures, l'agent peut être tombé entre-temps.
      const agentActuel = await agentDisponible(etabId);
      setAgent(agentActuel);

      if (agentActuel) {
        const res = await pdfUtils.exportEtiquettesDlcPdf(etiquettes, { destination: 'agent', onProgress });
        if (res?.url) urlsRef.current.push(res.url);
        try {
          const jobId = await envoyerLot({
            etabId, pdfBase64: res.base64, nbEtiquettes: nb, mode: modeId, userId: user?.id,
          });
          // Le lot est déposé : plus rien à afficher, l'onglet de secours part.
          fermerOnglet(fenetrePdf);
          setDernierLot({ url: res.url, nb, viaAgent: true, etat: 'envoye' });
          notifyLegacy(`${nb} étiquette${pluriel} envoyée${pluriel} à l'imprimante.`, 'success');

          const fin = await attendreImpression(jobId);
          if (fin.statut === 'imprime') {
            setDernierLot(l => (l ? { ...l, etat: 'imprime' } : l));
          } else if (fin.statut === 'erreur') {
            setDernierLot(l => (l ? { ...l, etat: 'erreur', erreur: fin.erreur } : l));
            notifyLegacy('L\'imprimante a refusé le lot : ' + (fin.erreur || 'erreur inconnue'), 'error');
          } else {
            // L'agent n'a pas répondu à temps : le lot reste dans la file et
            // partira à son retour. Rien n'est perdu, mais on le dit.
            setDernierLot(l => (l ? { ...l, etat: 'attente' } : l));
            notifyLegacy('Lot en attente : l\'imprimante n\'a pas encore répondu.', 'warning');
          }
          return;
        } catch (err) {
          // Dépôt impossible : on ne laisse pas la brigade sans étiquettes,
          // on bascule sur l'ouverture du PDF.
          console.error('[EtiquettesDlc envoyerLot]', err);
          notifyLegacy('Envoi direct impossible, ouverture du PDF.', 'warning');
          setAgent(null);
        }
      }

      // ─── PDF ouvert dans le visualiseur (aucun agent, ou envoi échoué) ───
      const res = await pdfUtils.exportEtiquettesDlcPdf(etiquettes, {
        autoPrint: true,
        filename: nomFichier,
        onProgress,
        fenetre: fenetrePdf,
      });
      if (res?.url) {
        urlsRef.current.push(res.url);
        setDernierLot({ url: res.url, nb, ouvert: !!res.ouvert });
      }
      notifyLegacy(`${nb} étiquette${pluriel} générée${pluriel}.`, 'success');
    } catch (err) {
      // Onglet vide laissé derrière soi = onglet à refermer à la main.
      fermerOnglet(fenetrePdf);
      /* notify déjà géré dans le service */
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>Chargement des recettes…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── Mode du lot ── */}
      <SegmentedTabs
        tabs={ETIQUETTE_MODES.map(m => ({ id: m.id, label: m.label }))}
        active={modeId}
        onChange={changerMode}
      />

      {/* ── Retraits au changement de mode ── */}
      {retraits && (
        <div style={es.banniere}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>⚠</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <strong>{retraits.nb} préparation{retraits.nb > 1 ? 's' : ''} retirée{retraits.nb > 1 ? 's' : ''} de la sélection</strong>
            {' '}en passant en mode {retraits.modeLabel} : non congelable{retraits.nb > 1 ? 's' : ''}, donc ni surgelable{retraits.nb > 1 ? 's' : ''} ni décongelable{retraits.nb > 1 ? 's' : ''}.
            <span style={{ display: 'block', marginTop: 3, fontStyle: 'italic' }}>{retraits.noms.join(' · ')}</span>
          </span>
          <button
            type="button"
            onClick={() => setRetraits(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', fontSize: 15, cursor: 'pointer', flexShrink: 0, padding: 0 }}
            aria-label="Masquer le message"
          >✕</button>
        </div>
      )}

      {/* ── Dates du lot (globales, jamais par ligne) ── */}
      <div style={es.bloc}>
        <div style={es.champsDates}>
          {mode.dates.map(champ => (
            <div key={champ.id} style={hs.field}>
              <label style={hs.fLabel}>{champ.label}</label>
              <input
                type="date"
                style={hs.fInput}
                value={dates[champ.id] || ''}
                onChange={e => setDates(prev => ({ ...prev, [champ.id]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 }}>
          {modeId === 'surgelation' && (
            <div style={{ marginBottom: 4 }}>
              La DLC part de la date de surgélation : une préparation refroidie la veille de son passage au congélateur a bien deux dates.
            </div>
          )}
          {/* Le seul renseignement qui serve au poste : quel rouleau charger.
              Le format de papier iOS et le parcours d'impression relèvent de la
              mise en service, pas de l'écran quotidien de la brigade. */}
          Rouleau {ETIQUETTE_MEDIA.ref}
          {agent && (
            <> · impression <strong style={{ color: 'var(--success-text)' }}>directe</strong> sur
              {' '}<strong style={{ color: 'var(--text)' }}>{agent.imprimante || agent.nom}</strong></>
          )}
        </div>
      </div>

      {/* ── Liste des préparations ── */}
      <div style={hs.tableCard}>
        <div style={es.rechercheWrap}>
          <input
            type="text"
            style={es.rechercheInput}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher une préparation…"
            aria-label="Rechercher une préparation"
          />
          {search !== '' && (
            <button type="button" style={{ ...hs.exportBtn, flexShrink: 0 }} onClick={() => setSearch('')}>Effacer</button>
          )}
        </div>

        {visibles.length === 0 && (
          <div style={hs.empty}>
            {recettes.length === 0 ? 'Aucune recette dans cet établissement.' : 'Aucune préparation ne correspond à la recherche.'}
          </div>
        )}

        {visibles.map(r => {
          const eligible = estEligible(r, modeId);
          const selected = Object.prototype.hasOwnProperty.call(quantites, r.id);
          const dlc = eligible ? calculerDlc(r, modeId, dates) : null;
          const duree = dureeVieMode(r, modeId);
          return (
            <div key={r.id} style={{ ...es.ligne, opacity: eligible ? 1 : 0.55, background: selected ? 'var(--bg)' : 'transparent' }}>
              <input
                type="checkbox"
                checked={selected}
                disabled={!eligible}
                onChange={() => toggleSelection(r)}
                style={{ width: 18, height: 18, flexShrink: 0, cursor: eligible ? 'pointer' : 'not-allowed' }}
                aria-label={`Sélectionner ${r.nom}`}
              />
              <div style={es.ligneInfo}>
                <div style={es.nom}>{r.nom}</div>
                <div style={es.meta}>
                  {r.categorie || 'Sans catégorie'}
                  {eligible
                    ? <> · {duree} jour{duree > 1 ? 's' : ''} · <span style={es.dlc}>DLC {formatDateFr(dlc)}</span></>
                    : <> · <strong>{motifNonEligible(r)}</strong></>}
                </div>
              </div>
              {selected && (
                <div style={es.stepper}>
                  <button type="button" style={es.stepBtn} onClick={() => setQuantite(r.id, quantites[r.id] - 1)} aria-label="Retirer une étiquette">−</button>
                  <input
                    type="number"
                    min={QUANTITE_MIN}
                    max={QUANTITE_MAX}
                    style={es.qteInput}
                    value={quantites[r.id]}
                    onChange={e => setQuantite(r.id, e.target.value)}
                    aria-label={`Nombre d'étiquettes pour ${r.nom}`}
                  />
                  <button type="button" style={es.stepBtn} onClick={() => setQuantite(r.id, quantites[r.id] + 1)} aria-label="Ajouter une étiquette">+</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Dernier lot ──
          Le lien vers le PDF ne s'affiche que si l'ouverture automatique n'a
          pas eu lieu : filet de sécurité, pas étape de la marche normale. */}
      {dernierLot && (
        <div style={{
          ...es.dernierLot,
          ...(dernierLot.etat === 'erreur'
            ? { background: 'var(--danger-bg-soft)', borderColor: 'var(--danger-bd)' }
            : dernierLot.etat === 'attente'
              ? { background: 'var(--warning-bg)', borderColor: 'var(--warning-bd)' }
              : null),
        }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            {dernierLot.nb} étiquette{dernierLot.nb > 1 ? 's' : ''}
            {!dernierLot.viaAgent && dernierLot.viaPartage && (dernierLot.ouvert
              ? <> parti{dernierLot.nb > 1 ? 'es' : 'e'} à l'impression.</>
              : <> prête{dernierLot.nb > 1 ? 's' : ''}, mais la feuille d'impression a été refermée :</>)}
            {!dernierLot.viaAgent && !dernierLot.viaPartage && (dernierLot.ouvert
              ? <> prête{dernierLot.nb > 1 ? 's' : ''} dans le PDF : Partager › Imprimer.</>
              : <> prête{dernierLot.nb > 1 ? 's' : ''}, mais le PDF ne s'est pas ouvert tout seul :</>)}
            {dernierLot.viaAgent && dernierLot.etat === 'envoye' && ' envoyée(s) à l\'imprimante, impression en cours…'}
            {dernierLot.viaAgent && dernierLot.etat === 'imprime' && ' imprimée(s).'}
            {dernierLot.viaAgent && dernierLot.etat === 'attente' && ' en attente : l\'imprimante n\'a pas encore répondu. Le lot partira dès son retour.'}
            {dernierLot.viaAgent && dernierLot.etat === 'erreur' && ` refusée(s) par l'imprimante : ${dernierLot.erreur || 'erreur inconnue'}.`}
          </span>
          {/* Chemin de secours uniquement : ouverture bloquée par le navigateur,
              ou lot refusé/en attente côté agent. Sinon, aucun lien affiché. */}
          {((!dernierLot.viaAgent && !dernierLot.ouvert) || dernierLot.etat === 'erreur' || dernierLot.etat === 'attente') && (
            <a
              href={dernierLot.url}
              target="_blank"
              rel="noreferrer"
              style={{ ...hs.exportBtn, flexShrink: 0, textDecoration: 'none', display: 'inline-block' }}
            >Ouvrir le PDF</a>
          )}
        </div>
      )}

      {/* ── Résumé du lot + génération ── */}
      <div style={es.resume}>
        <span style={es.resumeTotal}>
          <strong style={{ color: 'var(--text)' }}>{nbSelection}</strong> préparation{nbSelection > 1 ? 's' : ''}
          {' · '}
          <strong style={{ color: 'var(--text)' }}>{totalEtiquettes}</strong> étiquette{totalEtiquettes > 1 ? 's' : ''}
          {progress && <span style={{ marginLeft: 8, color: 'var(--accent)' }}>· génération {progress.done}/{progress.total}</span>}
        </span>
        {nbSelection > 0 && (
          <button type="button" style={hs.cancelBtn} disabled={busy} onClick={() => setQuantites({})}>Tout désélectionner</button>
        )}
        <button
          type="button"
          style={{ ...hs.addBtn, opacity: totalEtiquettes === 0 || busy ? 0.5 : 1 }}
          disabled={totalEtiquettes === 0 || busy}
          onClick={genererEtiquettes}
        >
          {busy
            ? (agent ? 'Envoi…' : 'Génération…')
            : (agent ? 'Envoyer à l\'imprimante' : 'Générer les étiquettes')}
        </button>
      </div>
    </div>
  );
};

export default EtiquettesDlc;
