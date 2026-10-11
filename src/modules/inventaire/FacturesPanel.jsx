import React from 'react';
import { createPortal } from 'react-dom';
import { dbService } from '../../services/dbService.js';
import { notifyLegacy, confirmLegacy } from '../../legacy/legacyApi.js';
import { useBackLayer } from '../../hooks/useBackLayer.js';
import { useSelection } from '../../hooks/useSelection.js';
import { zurichToday } from '../../utils/zurichTime.js';
import { makeSearchMatcher } from '../../utils/searchText.js';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import SearchToggle from '../../components/ui/SearchToggle.jsx';
import { SelectionToolbar } from '../../components/ui/SelectionToolbar.jsx';
import { Btn } from '../../components/ui/index.jsx';
import { libelleVoir, VisionneusePieces } from './achatsPieces.jsx';
import ImportDocumentsAchats from './ImportDocumentsAchats.jsx';
import {
  MODES_REGLEMENT, libelleMode, periodesFactures, rangerParPeriode, statutPaiement,
  totauxFactures, joursEntre, dateLongue, intervalleLong, lendemainIso,
} from './facturesLogic.js';

// ─────────────────────────────────────────────────────────────────────────────
// Onglet « Factures » de l'inventaire (demande de Jérémy, 07.10.2026).
//
// Les factures du périmètre affiché, rangées par période d'inventaire : la
// période en cours se clôt toute seule au prochain inventaire du périmètre,
// la suivante démarre le lendemain. L'onglet « Achats & consommation »
// reprend les factures de chaque période, par les mêmes dates.
//
// Le comptable y marque les factures réglées, une par une ou par sélection,
// avec la date, le mode et une note. Ce droit (manage:factures_achat, réglable
// personne par personne dans Rôles & accès) est vérifié en base par un
// déclencheur : le bouton n'apparaît qu'à qui la base laissera écrire.
//
// Mêmes documents que l'onglet Achats (achats_documents) : seules les
// factures y sont listées, les bons de livraison et de commande ne se paient
// pas. Une facture réglée reste listée même si son type change ensuite.
// ─────────────────────────────────────────────────────────────────────────────

const chf = (n) => (Number(n) || 0).toLocaleString('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const perimetreDe = (d) => (d.perimetre || '').trim() || 'Général';
const estFacture = (d) => d.typeDocument === 'facture' || !!d.regleLe;

// « 1'234.50 », « 1 234,50 », « 454.5 » : saisie libre du montant.
const lireMontant = (texte) => {
  const t = String(texte ?? '').replace(/[\s'’]/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined;
};

const FILTRES = [
  { id: 'toutes', label: 'Toutes' },
  { id: 'a_regler', label: 'À régler' },
  { id: 'en_retard', label: 'En retard' },
  { id: 'reglees', label: 'Réglées' },
];

export default function FacturesPanel({
  user, etabId, perimetreActif, datesInventaires, canRegler, canModifier, achats,
}) {
  const legacySB = dbService.getBridge();
  // Documents partagés avec l'onglet Achats (useAchatsDocuments, tenu par Inventaire.jsx).
  const {
    docs, tousLesDocs, tableAbsente, loadError, docsRef, majDocs, reload, avecPieces, setAvecPieces,
  } = achats;
  const aujourdhui = zurichToday();

  const [filtre, setFiltre] = React.useState('toutes');
  const [recherche, setRecherche] = React.useState('');
  const [importOuvert, setImportOuvert] = React.useState(false);
  // Périodes dépliées ou repliées à la main ; les autres suivent leur défaut.
  const [plis, setPlis] = React.useState({});
  const [ouverte, setOuverte] = React.useState(null); // id de la facture dépliée
  const [apercu, setApercu] = React.useState(null);
  const fermerApercu = React.useCallback(() => setApercu(null), []);
  // { ids, regleLe, regleMode, regleNote, modification } | null
  const [reglement, setReglement] = React.useState(null);
  const fermerReglement = React.useCallback(() => setReglement(null), []);
  useBackLayer(!!reglement, fermerReglement, 'factures-reglement');
  const sel = useSelection();

  // Une sélection ne survit pas à un changement de ce qui est affiché :
  // cocher « tout » doit toujours vouloir dire « tout ce que je vois ».
  React.useEffect(() => { sel.exit(); setOuverte(null); }, [perimetreActif, etabId]);
  React.useEffect(() => { sel.clear(); }, [filtre, recherche]);

  // ── Données ──
  const factures = React.useMemo(
    () => tousLesDocs.filter(d => estFacture(d) && perimetreDe(d) === perimetreActif),
    [docs, perimetreActif],
  );
  // Factures à régler rangées dans les autres périmètres : signalées, pour
  // que le comptable ne croie pas avoir tout vu.
  const autresARegler = React.useMemo(() => {
    const m = new Map();
    tousLesDocs.forEach(d => {
      if (!estFacture(d) || d.regleLe || perimetreDe(d) === perimetreActif) return;
      m.set(perimetreDe(d), (m.get(perimetreDe(d)) || 0) + 1);
    });
    return Array.from(m.entries());
  }, [docs, perimetreActif]);
  const nbBons = React.useMemo(
    () => tousLesDocs.filter(d => !estFacture(d) && perimetreDe(d) === perimetreActif).length,
    [docs, perimetreActif],
  );

  const cleDates = (datesInventaires || []).join('|');
  const periodes = React.useMemo(() => periodesFactures(datesInventaires), [cleDates]);
  const totaux = React.useMemo(() => totauxFactures(factures, aujourdhui), [factures, aujourdhui]);

  const match = makeSearchMatcher(recherche);
  const visible = (f) => {
    const s = statutPaiement(f, aujourdhui);
    if (filtre === 'a_regler' && s === 'reglee') return false;
    if (filtre === 'en_retard' && s !== 'en_retard') return false;
    if (filtre === 'reglees' && s !== 'reglee') return false;
    return match(f.fournisseurNom, f.numero, f.regleNote);
  };
  const facturesVisibles = factures.filter(visible);
  const groupes = rangerParPeriode(facturesVisibles, periodes);
  const groupesTous = rangerParPeriode(factures, periodes);

  // Groupes affichés : la période en cours toujours (c'est là qu'arrivent les
  // nouvelles factures), la dernière période close aussi (celle que l'on
  // boucle), les autres dès qu'elles contiennent une facture.
  const derniereClose = periodes.find(p => !p.ouverte && !p.anterieures);
  const blocs = [
    ...(groupes.get('sans-date').length ? [{ id: 'sans-date', sansDate: true }] : []),
    ...periodes,
  ].filter(p => {
    const n = groupes.get(p.id).length;
    if (n) return true;
    if (filtre !== 'toutes' || match.active) return false;
    return p.ouverte || p.id === derniereClose?.id;
  });

  // Pli par défaut : ouvert s'il reste à régler. Décidé à la première
  // apparition de la période puis figé : sinon, marquer réglée la dernière
  // facture d'une période la replierait sous le doigt du comptable.
  // Clés préfixées par l'établissement et le périmètre : Cuisine et Boissons
  // ont souvent les mêmes dates d'inventaire, donc les mêmes ids de période.
  const plisParDefautRef = React.useRef(new Map());
  const clePli = (p) => `${etabId}|${perimetreActif}|${p.id}`;
  const estDeplie = (p) => {
    if (plis[clePli(p)] != null) return plis[clePli(p)];
    if (match.active || filtre !== 'toutes') return true;
    if (p.ouverte || p.sansDate) return true;
    if (!plisParDefautRef.current.has(clePli(p))) {
      plisParDefautRef.current.set(clePli(p), groupesTous.get(p.id).some(f => !f.regleLe));
    }
    return plisParDefautRef.current.get(clePli(p));
  };

  // ── Écritures ──
  // Optimiste : la liste suit tout de suite. En cas d'échec on remet d'abord
  // les valeurs d'avant, PUIS on relit : hors réseau la relecture échoue
  // aussi et garde la liste telle quelle, une facture non réglée resterait
  // affichée « réglée ».
  const restaurer = (avant) => majDocs(liste => liste.map(d => (avant.has(d.id) ? avant.get(d.id) : d)));

  const poserReglement = async (ids, valeur, { nouveau = false } = {}) => {
    const avant = new Map((docsRef.current || []).filter(d => ids.includes(d.id)).map(d => [d.id, d]));
    majDocs(liste => liste.map(d => (avant.has(d.id)
      ? { ...d, regleLe: valeur?.regleLe || null, regleMode: valeur?.regleMode || '', regleNote: valeur?.regleNote || '' }
      : d)));
    try {
      const faits = await legacySB.db.reglerFacturesAchat(ids, valeur, { nouveau });
      const n = faits.length;
      if (n < ids.length) {
        // Une autre personne les a réglées entre-temps, ou elles ne sont plus visibles.
        restaurer(avant);
        notifyLegacy(n
          ? `${n} facture${n > 1 ? 's' : ''} mise${n > 1 ? 's' : ''} à jour ; ${ids.length - n} déjà réglée${ids.length - n > 1 ? 's' : ''} ou introuvable${ids.length - n > 1 ? 's' : ''} : la liste est rechargée.`
          : 'Ces factures ont déjà été réglées entre-temps : la liste est rechargée.', 'warning');
        reload();
        return;
      }
      notifyLegacy(valeur
        ? `${n > 1 ? `${n} factures marquées réglées` : 'Facture marquée réglée'}.`
        : `${n > 1 ? `Règlement annulé pour ${n} factures` : 'Règlement annulé'}.`, 'success');
    } catch (err) {
      restaurer(avant);
      notifyLegacy('Règlement non enregistré : ' + (err.message || err), 'error');
      reload();
    }
  };

  const ouvrirReglement = (ids, existant) => {
    if (!ids.length) return;
    setReglement({
      ids,
      modification: !!existant,
      regleLe: existant?.regleLe || aujourdhui,
      regleMode: existant ? (existant.regleMode || '') : 'virement',
      regleNote: existant?.regleNote || '',
    });
  };

  const validerReglement = () => {
    const r = reglement;
    if (!r?.regleLe) return;
    setReglement(null);
    sel.exit();
    poserReglement(r.ids, { regleLe: r.regleLe, regleMode: r.regleMode || null, regleNote: r.regleNote }, { nouveau: !r.modification });
  };

  const annulerReglement = (ids) => {
    if (!ids.length) return;
    const texte = ids.length > 1
      ? `Annuler le règlement de ${ids.length} factures ?\nElles repassent « à régler », leur date, mode et note de règlement sont effacés.`
      : 'Annuler le règlement de cette facture ?\nElle repasse « à régler », sa date, son mode et sa note de règlement sont effacés.';
    if (!confirmLegacy(texte)) return;
    sel.exit();
    poserReglement(ids, null);
  };

  const majFacture = async (f, patch) => {
    const avant = new Map((docsRef.current || []).filter(d => d.id === f.id).map(d => [d.id, d]));
    majDocs(liste => liste.map(d => (d.id === f.id ? { ...d, ...patch } : d)));
    try {
      await legacySB.db.majFactureAchat(f.id, patch);
    } catch (err) {
      restaurer(avant);
      notifyLegacy('Facture non enregistrée : ' + (err.message || err), 'error');
      reload();
    }
  };

  // ─────────── Rendu ───────────
  if (docs === null) {
    return <div style={st.info}>Chargement des factures…</div>;
  }

  // « Tout sélectionner » = ce qui est à l'écran : les périodes repliées n'en
  // font pas partie (leur propre case reste là pour les prendre en bloc).
  const idsVisibles = blocs.filter(estDeplie).flatMap(p => groupes.get(p.id).map(f => f.id));
  const selection = factures.filter(f => sel.ids.has(f.id));
  const selectionAReglee = selection.filter(f => !f.regleLe);
  const selectionReglee = selection.filter(f => f.regleLe);
  const montantSelection = selection.reduce((t, f) => t + (Number(f.totalTTC) || 0), 0);
  const selectionSansTTC = selection.filter(f => f.totalTTC == null).length;

  return (
    <div style={st.root}>
      {tableAbsente && (
        <div style={st.alerte}>
          La table des documents d'achat n'existe pas encore sur la base : la migration
          « 20260928_achats_documents » est à appliquer.
        </div>
      )}
      {loadError && (
        <div style={st.alerte}>
          Factures indisponibles pour le moment : la liste affichée peut être incomplète.
          <button type="button" style={{ ...st.btn, marginLeft: 10 }} onClick={reload}>Réessayer</button>
        </div>
      )}

      {/* ── Synthèse ── */}
      <div style={st.carte}>
        <div style={st.titre}>Factures « <span data-no-translate>{perimetreActif}</span> »</div>
        <div style={st.sousTitre}>
          Rangées par période d'inventaire : chaque inventaire « <span data-no-translate>{perimetreActif}</span> » clôt
          une période et la suivante commence le lendemain. L'onglet Achats & consommation reprend les factures
          de chaque période pour calculer la consommation.
        </div>
        {/* Nombres dans leur propre nœud : la phrase autour reste la même
            d'un jour à l'autre et ne repart pas à la traduction. */}
        <div style={st.kpis}>
          <Kpi
            label="À régler"
            valeur={`CHF ${chf(totaux.aRegler.montant)}`}
            note={totaux.aRegler.n
              ? <><span>{totaux.aRegler.n}</span>{totaux.aRegler.n > 1 ? ' factures pas encore réglées, montants TTC' : ' facture pas encore réglée, montant TTC'}</>
              : 'tout est réglé'}
            fort
          />
          <Kpi
            label="En retard"
            valeur={`CHF ${chf(totaux.enRetard.montant)}`}
            note={totaux.enRetard.n
              ? <><span>{totaux.enRetard.n}</span>{totaux.enRetard.n > 1 ? ' factures dont l’échéance est passée' : ' facture dont l’échéance est passée'}</>
              : 'aucune échéance dépassée'}
            alerte={totaux.enRetard.n > 0}
          />
          <Kpi
            label="Réglées"
            valeur={`CHF ${chf(totaux.reglees.montant)}`}
            note={<><span>{totaux.reglees.n}</span>{totaux.reglees.n > 1 ? ' factures marquées réglées' : ' facture marquée réglée'}</>}
          />
        </div>
        {(totaux.sansTTC > 0 || autresARegler.length > 0) && (
          <ul style={st.avertissements}>
            {totaux.sansTTC > 0 && (
              <li>
                {totaux.sansTTC > 1 ? `${totaux.sansTTC} factures n'ont` : 'Une facture n\'a'} pas de montant TTC lu :
                {totaux.sansTTC > 1 ? ' elles ne comptent' : ' elle ne compte'} dans aucun total ci-dessus. Dépliez-la pour saisir le montant à payer.
              </li>
            )}
            {autresARegler.map(([p, n]) => (
              <li key={p}>
                {n > 1 ? `${n} autres factures à régler sont rangées` : 'Une autre facture à régler est rangée'} dans « <span data-no-translate>{p}</span> ».
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Import : replié, la liste passe d'abord. Masqué plutôt que démonté :
          une lecture en cours continue quand on le referme. ── */}
      <div style={{ display: importOuvert ? 'block' : 'none' }}>
        <ImportDocumentsAchats
          user={user}
          etabId={etabId}
          perimetreActif={perimetreActif}
          docsRef={docsRef}
          tableAbsente={tableAbsente}
          typeParDefaut="facture"
          onImporte={(doc, pieceGardee) => {
            majDocs(liste => [doc, ...liste]);
            if (pieceGardee) setAvecPieces(s => new Set(s).add(doc.id));
          }}
          titre="Importer des factures"
          sousTitre={<>PDF reçus par mail ou photos. Chaque facture est lue automatiquement (fournisseur, date, montant à payer, échéance) et rangée dans « <span data-no-translate>{perimetreActif}</span> ». Ses lignes servent aussi au calcul des achats.</>}
        />
      </div>

      {/* ── Barre : filtres, recherche, import, sélection ── */}
      <div style={st.barre}>
        <SegmentedTabs
          size="sm"
          active={filtre}
          onChange={setFiltre}
          tabs={FILTRES.map(f => {
            const n = f.id === 'toutes' ? totaux.n
              : f.id === 'a_regler' ? totaux.aRegler.n
                : f.id === 'en_retard' ? totaux.enRetard.n
                  : totaux.reglees.n;
            // Compteur dans son propre nœud : le libellé reste une entrée du
            // glossaire au lieu de partir à l'IA à chaque nouveau nombre.
            return { id: f.id, label: <>{f.label} <span>({n})</span></> };
          })}
        />
        <div style={st.barreDroite}>
          <SearchToggle value={recherche} onChange={setRecherche} placeholder="Fournisseur, numéro…" />
          <Btn small variant={importOuvert ? 'primary' : 'ghost'} onClick={() => setImportOuvert(v => !v)}>
            {importOuvert ? 'Fermer l’import' : '+ Importer des factures'}
          </Btn>
          {canRegler && !sel.active && factures.length > 0 && (
            <Btn small variant="ghost" onClick={sel.enter}>Sélectionner</Btn>
          )}
        </div>
      </div>

      {sel.active && (
        <SelectionToolbar
          count={sel.count}
          total={idsVisibles.length}
          allSelected={sel.count > 0 && idsVisibles.every(id => sel.ids.has(id))}
          onToggleAll={() => (idsVisibles.every(id => sel.ids.has(id)) ? sel.clear() : sel.selectAll(idsVisibles))}
          onCancel={sel.exit}
        >
          {sel.count > 0 && (
            <span style={st.selectionMontant}>
              <span data-no-translate>CHF {chf(montantSelection)}</span>
              {/* Une facture sans TTC n'entre pas dans la somme : le dire. */}
              {selectionSansTTC > 0 && (
                <span style={st.selectionNote}>
                  {selectionSansTTC > 1 ? `hors ${selectionSansTTC} factures sans montant TTC` : 'hors une facture sans montant TTC'}
                </span>
              )}
            </span>
          )}
          <Btn small variant="primary" onClick={() => ouvrirReglement(selectionAReglee.map(f => f.id))} disabled={!selectionAReglee.length}>
            Marquer réglées <span>({selectionAReglee.length})</span>
          </Btn>
          {selectionReglee.length > 0 && (
            <Btn small variant="ghost" onClick={() => annulerReglement(selectionReglee.map(f => f.id))}>
              Annuler le règlement <span>({selectionReglee.length})</span>
            </Btn>
          )}
        </SelectionToolbar>
      )}

      {factures.length === 0 && (
        <div style={st.info}>
          Aucune facture « <span data-no-translate>{perimetreActif}</span> » pour l'instant. Importez-les avec « + Importer des factures » :
          elles seront rangées par période d'inventaire.
          {nbBons > 0 && ` ${nbBons} bon${nbBons > 1 ? 's' : ''} de livraison ou de commande ${nbBons > 1 ? 'sont' : 'est'} dans l'onglet Achats & consommation.`}
        </div>
      )}
      {factures.length > 0 && facturesVisibles.length === 0 && (
        <div style={st.info}>
          {match.active ? 'Aucune facture ne correspond à la recherche.'
            : filtre === 'a_regler' ? 'Aucune facture à régler : tout est réglé.'
              : filtre === 'en_retard' ? 'Aucune facture en retard.'
                : 'Aucune facture réglée pour l\'instant.'}
        </div>
      )}

      {/* ── Périodes ── */}
      {blocs.map(p => {
        const liste = groupes.get(p.id).slice()
          .sort((a, b) => String(b.dateDocument || '').localeCompare(String(a.dateDocument || '')));
        // Totaux et pastille sur TOUTES les factures de la période, pas sur
        // celles que le filtre ou la recherche laissent voir : sinon, filtre
        // « Réglées » actif, une période encore due s'affichait « tout est réglé ».
        const t = totauxFactures(groupesTous.get(p.id), aujourdhui);
        const deplie = estDeplie(p);
        const idsPeriode = liste.map(f => f.id);
        const nbCoches = idsPeriode.filter(id => sel.ids.has(id)).length;
        const { titre, detail } = enteteDePeriode(p, perimetreActif);
        return (
          <div key={p.id} style={st.carte}>
            <div style={st.periodeTete}>
              {sel.active && liste.length > 0 && (
                <label style={st.caseCible} title="Toute la période">
                  <input
                    type="checkbox"
                    checked={nbCoches === liste.length}
                    ref={el => { if (el) el.indeterminate = nbCoches > 0 && nbCoches < liste.length; }}
                    onChange={() => {
                      if (nbCoches === liste.length) sel.selectAll(Array.from(sel.ids).filter(id => !idsPeriode.includes(id)));
                      else sel.selectAll([...new Set([...sel.ids, ...idsPeriode])]);
                    }}
                    style={st.case}
                    aria-label={`Sélectionner les factures, ${titre}`}
                  />
                </label>
              )}
              <button
                type="button"
                style={st.periodeBouton}
                onClick={() => setPlis(x => ({ ...x, [clePli(p)]: !deplie }))}
                aria-expanded={deplie}
              >
                <span style={{ width: 14, flexShrink: 0 }}>{deplie ? '▾' : '▸'}</span>
                <span style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <span style={st.periodeTitre}>{titre}</span>
                  <span style={st.periodeDetail}>{detail}</span>
                </span>
                <span style={st.periodeTotaux}>
                  <span>
                    <span>{t.n}</span>{t.n > 1 ? ' factures' : ' facture'}
                    {t.n > 0 && <span data-no-translate>{` pour CHF ${chf(t.total)}`}</span>}
                    {t.sansTTC > 0 && <span>{t.sansTTC > 1 ? `, dont ${t.sansTTC} sans montant TTC` : ', dont une sans montant TTC'}</span>}
                    {liste.length !== t.n && <span>{`, ${liste.length} affichée${liste.length > 1 ? 's' : ''}`}</span>}
                  </span>
                  {/* Montant à régler seulement s'il diffère du total : « 3 factures,
                      CHF 2 432,40, à régler CHF 2 432,40 » se répétait. */}
                  {t.aRegler.n > 0 && (
                    <span style={{ ...st.pastille, ...(t.enRetard.n ? st.pastilleRetard : st.pastilleARegler) }}>
                      {t.aRegler.n === t.n
                        ? (t.enRetard.n ? `à régler, ${t.enRetard.n} en retard` : 'à régler')
                        : <>à régler <span data-no-translate>CHF {chf(t.aRegler.montant)}</span>{t.enRetard.n ? `, ${t.enRetard.n} en retard` : ''}</>}
                    </span>
                  )}
                  {t.n > 0 && t.aRegler.n === 0 && <span style={{ ...st.pastille, ...st.pastilleOk }}>tout est réglé</span>}
                </span>
              </button>
            </div>

            {deplie && liste.length === 0 && (
              <div style={st.vide}>Aucune facture importée pour cette période.</div>
            )}
            {deplie && liste.map(f => (
              <LigneFacture
                key={f.id}
                f={f}
                aujourdhui={aujourdhui}
                ouverte={ouverte === f.id}
                onBasculer={() => setOuverte(o => (o === f.id ? null : f.id))}
                selectionActive={sel.active}
                coche={sel.ids.has(f.id)}
                onCocher={() => sel.toggle(f.id)}
                canRegler={canRegler}
                canModifier={canModifier}
                avecPiece={avecPieces.has(f.id)}
                onVoir={() => setApercu(f)}
                onRegler={() => ouvrirReglement([f.id])}
                onModifierReglement={() => ouvrirReglement([f.id], f)}
                onAnnulerReglement={() => annulerReglement([f.id])}
                onMaj={(patch) => majFacture(f, patch)}
              />
            ))}
          </div>
        );
      })}

      {apercu && <VisionneusePieces doc={apercu} etabId={etabId} onClose={fermerApercu} />}

      {reglement && createPortal(
        <ModaleReglement
          reglement={reglement}
          factures={factures.filter(f => reglement.ids.includes(f.id))}
          aujourdhui={aujourdhui}
          onChange={(patch) => setReglement(r => ({ ...r, ...patch }))}
          onValider={validerReglement}
          onFermer={fermerReglement}
        />,
        document.body,
      )}
    </div>
  );
}

// Titre (texte, sert aussi aux libellés d'accessibilité) et sous-titre d'une
// période, en toutes lettres. Le nom du périmètre n'est jamais traduit.
function enteteDePeriode(p, perimetre) {
  const nom = <span data-no-translate>{perimetre}</span>;
  if (p.sansDate) {
    return { titre: 'Sans date', detail: 'Date de facture non lue : saisissez-la pour ranger la facture dans sa période.' };
  }
  if (p.ouverte) {
    return p.debut
      ? { titre: 'Période en cours', detail: <>Depuis le {dateLongue(lendemainIso(p.debut))}. Elle se clôturera au prochain inventaire « {nom} ».</> }
      : { titre: 'Période en cours', detail: <>Aucun inventaire « {nom} » pour l'instant : elle se clôturera au premier.</> };
  }
  if (p.anterieures) {
    return { titre: `Avant le ${dateLongue(p.fin)}`, detail: <>Factures datées d'avant le premier inventaire « {nom} ».</> };
  }
  const debut = p.debutInclus ? p.debut : lendemainIso(p.debut);
  const titre = intervalleLong(debut, p.fin);
  return {
    titre: titre.charAt(0).toUpperCase() + titre.slice(1),
    detail: p.premiere
      ? <>Close par le premier inventaire « {nom} », le {dateLongue(p.fin)}.</>
      : <>Close par l'inventaire « {nom} » du {dateLongue(p.fin)}.</>,
  };
}

// Date saisie au clavier : un brouillon, écrit seulement à la sortie du champ
// (ou Entrée). En écrivant à chaque frappe, Chrome envoyait 0002, 0020,
// 0202 puis 2026 : la facture changeait de période à chaque chiffre et le
// champ perdait la main. Une date hors 2000-2099 est refusée.
const DATE_VALIDE = /^20\d{2}-\d{2}-\d{2}$/;
function ChampDate({ valeur, onValider, style, ariaLabel, disabled }) {
  const [brouillon, setBrouillon] = React.useState(valeur || '');
  React.useEffect(() => { setBrouillon(valeur || ''); }, [valeur]);
  const valider = () => {
    if (brouillon === (valeur || '')) return;
    if (brouillon && !DATE_VALIDE.test(brouillon)) {
      notifyLegacy('Date illisible : choisissez un jour dans le calendrier.', 'warning');
      setBrouillon(valeur || '');
      return;
    }
    onValider(brouillon || null);
  };
  return (
    <input
      type="date"
      value={brouillon}
      min="2000-01-01"
      max="2099-12-31"
      onChange={e => setBrouillon(e.target.value)}
      onBlur={valider}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      style={style}
      aria-label={ariaLabel}
      disabled={disabled}
    />
  );
}

function LigneFacture({
  f, aujourdhui, ouverte, onBasculer, selectionActive, coche, onCocher,
  canRegler, canModifier, avecPiece, onVoir, onRegler, onModifierReglement, onAnnulerReglement, onMaj,
}) {
  const statut = statutPaiement(f, aujourdhui);
  const [montant, setMontant] = React.useState(f.totalTTC != null ? String(f.totalTTC) : '');
  React.useEffect(() => { setMontant(f.totalTTC != null ? String(f.totalTTC) : ''); }, [f.totalTTC]);

  const retard = statut === 'en_retard' ? joursEntre(f.dateEcheance, aujourdhui) : 0;
  const echeance = statut === 'reglee' ? null
    : statut === 'en_retard'
      ? {
        // Au-delà de deux mois, le nombre de jours ne dit plus rien : la date suffit.
        texte: retard > 60
          ? `Échéance dépassée depuis le ${dateLongue(f.dateEcheance)}`
          : `Échéance dépassée de ${retard} jour${retard > 1 ? 's' : ''} (${dateLongue(f.dateEcheance)})`,
        ton: st.retard,
      }
      : f.dateEcheance
        ? { texte: `À régler avant le ${dateLongue(f.dateEcheance)}`, ton: null }
        : { texte: 'Échéance non lue', ton: null };

  const enregistrerMontant = () => {
    const v = lireMontant(montant);
    if (v === undefined) { notifyLegacy('Montant illisible : écrivez par exemple 454.50', 'warning'); return; }
    if (v === (f.totalTTC != null ? Number(f.totalTTC) : null)) return;
    onMaj({ totalTTC: v });
  };

  return (
    <div style={{ ...st.facture, ...(coche ? st.factureCochee : {}) }}>
      <div style={st.factureLigne}>
        {selectionActive && (
          <label style={st.caseCible}>
            <input type="checkbox" checked={coche} onChange={onCocher} style={st.case}
              aria-label={`Sélectionner la facture ${f.fournisseurNom || ''} ${f.numero || ''}`} />
          </label>
        )}
        <button type="button" style={st.factureBouton} onClick={onBasculer} aria-expanded={ouverte}>
          <span style={st.factureFournisseur}>
            <span data-no-translate>{f.fournisseurNom || 'Fournisseur non lu'}</span>
            {f.numero ? <span style={st.factureNumero} data-no-translate>{` n° ${f.numero}`}</span> : null}
          </span>
          <span style={st.factureMeta}>
            {f.dateDocument ? `Facture du ${dateLongue(f.dateDocument)}` : 'Date non lue'}
            {echeance && <span style={echeance.ton || undefined}>{`, ${echeance.texte}`}</span>}
          </span>
        </button>
        <div style={st.factureMontant}>
          {f.totalTTC != null ? (
            <>
              <span style={st.montant} data-no-translate>CHF {chf(f.totalTTC)}</span>
              <span style={st.montantNote}>TTC</span>
            </>
          ) : (
            <>
              <span style={{ ...st.montant, color: 'var(--text2)' }} data-no-translate>{f.totalHT != null ? `CHF ${chf(f.totalHT)}` : '-'}</span>
              <span style={{ ...st.montantNote, color: 'var(--warning-text)' }}>{f.totalHT != null ? 'HT, TTC à saisir' : 'montant à saisir'}</span>
            </>
          )}
        </div>
        <div style={st.factureStatut}>
          {statut === 'reglee' ? (
            <span style={{ ...st.pastille, ...st.pastilleOk }}>
              Réglée le {dateLongue(f.regleLe, { sansAnnee: f.regleLe?.slice(0, 4) === aujourdhui.slice(0, 4) })}
              {f.regleMode ? `, ${libelleMode(f.regleMode).toLowerCase()}` : ''}
            </span>
          ) : canRegler && !selectionActive ? (
            <Btn small variant="primary" onClick={onRegler}>Marquer réglée</Btn>
          ) : (
            <span style={{ ...st.pastille, ...(statut === 'en_retard' ? st.pastilleRetard : st.pastilleARegler) }}>
              {statut === 'en_retard' ? 'En retard' : 'À régler'}
            </span>
          )}
        </div>
      </div>

      {ouverte && (
        <div style={st.detail}>
          {/* Une facture réglée est une pièce comptable : montant, échéance et
              date ne se changent plus sans le droit de régler (vérifié en base). */}
          {canModifier && (!f.regleLe || canRegler) ? (
            <div style={st.champs}>
              <label style={st.champ}>
                <span style={st.champLabel}>Montant à payer TTC, en CHF</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={montant}
                  onChange={e => setMontant(e.target.value)}
                  onBlur={enregistrerMontant}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  placeholder={f.totalHT != null ? `HT : ${chf(f.totalHT)}` : '0.00'}
                  style={st.input}
                />
              </label>
              <label style={st.champ}>
                <span style={st.champLabel}>Échéance</span>
                <ChampDate valeur={f.dateEcheance} onValider={v => onMaj({ dateEcheance: v })} style={st.input} />
              </label>
              <label style={st.champ}>
                <span style={st.champLabel}>Date de la facture</span>
                <ChampDate
                  valeur={f.dateDocument}
                  onValider={v => onMaj({ dateDocument: v })}
                  style={{ ...st.input, ...(f.dateDocument ? {} : { borderColor: 'var(--warning-bd)' }) }}
                />
              </label>
            </div>
          ) : (
            <div style={st.detailTexte}>
              {f.totalHT != null && <>Total hors taxes : <span data-no-translate>CHF {chf(f.totalHT)}</span>. </>}
              {f.dateEcheance ? `Échéance : ${dateLongue(f.dateEcheance)}.` : 'Échéance non lue.'}
              {canModifier && f.regleLe && ' Facture réglée : montant, échéance et date ne se modifient plus qu’avec le droit de régler les factures.'}
            </div>
          )}
          {f.totalHT != null && f.totalTTC != null && canModifier && (!f.regleLe || canRegler) && (
            <div style={st.detailTexte}>Total hors taxes lu sur la facture : <span data-no-translate>CHF {chf(f.totalHT)}</span>.</div>
          )}

          {statut === 'reglee' && (
            <div style={st.detailTexte}>
              Réglée le {dateLongue(f.regleLe)}
              {f.regleMode ? `, par ${libelleMode(f.regleMode).toLowerCase()}` : ''}.
              {f.regleNote ? <> Note : <span data-no-translate>{f.regleNote}</span></> : null}
            </div>
          )}

          <div style={st.detailActions}>
            {avecPiece
              ? <Btn small variant="ghost" onClick={onVoir}>{libelleVoir(f)}</Btn>
              : <span style={st.detailNote}>Pas de photo conservée pour cette facture.</span>}
            {statut === 'reglee' && canRegler && (
              <>
                <Btn small variant="ghost" onClick={onModifierReglement}>Modifier le règlement</Btn>
                <Btn small variant="ghost" onClick={onAnnulerReglement}>Annuler le règlement</Btn>
              </>
            )}
            {f.exclu && <span style={st.detailNote}>Exclue du calcul des achats (onglet Achats).</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function ModaleReglement({ reglement, factures, aujourdhui, onChange, onValider, onFermer }) {
  const n = factures.length;
  const total = factures.reduce((t, f) => t + (Number(f.totalTTC) || 0), 0);
  const sansTTC = factures.filter(f => f.totalTTC == null).length;
  const titre = reglement.modification ? 'Modifier le règlement'
    : n > 1 ? `Marquer ${n} factures réglées` : 'Marquer la facture réglée';
  const seule = n === 1 ? factures[0] : null;
  return (
    // Styles inline = desktop/tablette ; les classes modal-* ne stylent qu'en
    // mobile (≤767px), où la modale devient une feuille posée en bas d'écran.
    <div className="modal-sheet-overlay" style={st.modaleFond} onClick={onFermer}>
      <div
        className="modal-sheet"
        style={st.modale}
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        onClick={e => e.stopPropagation()}
      >
        <div style={st.modaleTitre}>{titre}</div>
        <div style={st.modaleSous}>
          {seule
            ? <><span data-no-translate>{seule.fournisseurNom || 'Fournisseur non lu'}{seule.numero ? `, n° ${seule.numero}` : ''}</span>{seule.totalTTC != null ? `, CHF ${chf(seule.totalTTC)}` : ''}</>
            : `Total CHF ${chf(total)}${sansTTC ? `, hors ${sansTTC > 1 ? `${sansTTC} factures` : 'une facture'} sans montant TTC` : ''}`}
        </div>
        <form
          onSubmit={e => { e.preventDefault(); onValider(); }}
          style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}
        >
          <label style={st.champ}>
            <span style={st.champLabel}>Date du règlement</span>
            <input
              type="date"
              required
              value={reglement.regleLe}
              max={aujourdhui}
              onChange={e => onChange({ regleLe: e.target.value })}
              style={st.input}
            />
          </label>
          <label style={st.champ}>
            <span style={st.champLabel}>Mode de paiement</span>
            <select value={reglement.regleMode} onChange={e => onChange({ regleMode: e.target.value })} style={st.input}>
              <option value="">Non précisé</option>
              {MODES_REGLEMENT.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          <label style={st.champ}>
            <span style={st.champLabel}>Note ou référence</span>
            <input
              type="text"
              value={reglement.regleNote}
              onChange={e => onChange({ regleNote: e.target.value })}
              placeholder="Référence du virement, remarque…"
              maxLength={300}
              style={st.input}
            />
          </label>
          <div style={st.modaleActions}>
            <Btn variant="ghost" onClick={onFermer}>Annuler</Btn>
            <Btn variant="primary" type="submit" disabled={!reglement.regleLe}>
              {reglement.modification ? 'Enregistrer' : n > 1 ? `Marquer ${n} factures réglées` : 'Marquer réglée'}
            </Btn>
          </div>
        </form>
      </div>
    </div>
  );
}

function Kpi({ label, valeur, note, fort, alerte }) {
  return (
    <div style={{ ...st.kpi, ...(fort ? st.kpiFort : {}), ...(alerte ? st.kpiAlerte : {}) }}>
      <div style={st.kpiLabel}>{label}</div>
      <div style={st.kpiVal} data-no-translate>{valeur}</div>
      {note && <div style={st.kpiNote}>{note}</div>}
    </div>
  );
}

const st = {
  root: { display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 },
  carte: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 },
  titre: { fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' },
  sousTitre: { fontSize: 12, color: 'var(--text2)', lineHeight: 1.45 },
  info: { fontSize: 13, color: 'var(--text2)', padding: '12px 14px', background: 'var(--bg)', border: '1px dashed var(--border)', borderRadius: 10, lineHeight: 1.45 },
  alerte: { fontSize: 12, lineHeight: 1.5, padding: '10px 14px', borderRadius: 8, background: 'var(--warning-bg)', color: 'var(--warning-text)', border: '1px solid var(--warning-bd)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  btn: { padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 44 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 170px), 1fr))', gap: 10 },
  kpi: { background: 'var(--bg)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 10, padding: '10px 12px', minWidth: 0 },
  kpiFort: { borderColor: 'var(--accent)' },
  kpiAlerte: { borderColor: 'var(--danger-bd)' },
  kpiLabel: { fontSize: 11, fontWeight: 600, color: 'var(--text2)', letterSpacing: 0.2 },
  kpiVal: { fontSize: 19, fontWeight: 700, fontFamily: 'var(--font-num)', color: 'var(--text)', marginTop: 4 },
  kpiNote: { fontSize: 11, color: 'var(--text2)', marginTop: 2, lineHeight: 1.4 },
  avertissements: { margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--warning-text)', lineHeight: 1.55 },
  barre: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 },
  barreDroite: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginLeft: 'auto', minWidth: 0 },
  selectionMontant: { display: 'inline-flex', flexDirection: 'column', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-num)', color: 'var(--text)' },
  selectionNote: { fontSize: 11, fontWeight: 400, fontFamily: 'var(--font)', color: 'var(--warning-text)' },
  periodeTete: { display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 },
  periodeBouton: { flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: 'none', border: 'none', padding: '4px 0', cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left', color: 'var(--text)', minHeight: 44 },
  periodeTitre: { display: 'block', fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' },
  periodeDetail: { display: 'block', fontSize: 12, color: 'var(--text2)', marginTop: 2, lineHeight: 1.4 },
  periodeTotaux: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, color: 'var(--text2)', fontFamily: 'var(--font-num)' },
  pastille: { display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 10, borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text2)', whiteSpace: 'nowrap' },
  pastilleOk: { background: 'var(--success-bg)', color: 'var(--success-text)', borderColor: 'var(--success-bd)' },
  pastilleARegler: { background: 'var(--warning-bg)', color: 'var(--warning-text)', borderColor: 'var(--warning-bd)' },
  pastilleRetard: { background: 'var(--danger-bg-soft)', color: 'var(--danger-text)', borderColor: 'var(--danger-bd)' },
  vide: { fontSize: 12, color: 'var(--text2)', padding: '4px 0 2px 22px' },
  facture: { borderTop: '1px solid var(--border)', padding: '6px 0' },
  factureCochee: { background: 'var(--bg)' },
  factureLigne: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 },
  caseCible: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, flexShrink: 0, cursor: 'pointer' },
  case: { width: 20, height: 20, cursor: 'pointer', margin: 0 },
  factureBouton: { flex: '1 1 240px', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, background: 'none', border: 'none', padding: '6px 0', cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left', minHeight: 44 },
  factureFournisseur: { fontSize: 14, fontWeight: 700, color: 'var(--text)', wordBreak: 'break-word' },
  factureNumero: { fontWeight: 400, color: 'var(--text2)' },
  factureMeta: { fontSize: 12, color: 'var(--text2)', lineHeight: 1.4 },
  retard: { color: 'var(--danger-text)', fontWeight: 600 },
  factureMontant: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flex: '0 0 auto', minWidth: 110 },
  montant: { fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-num)', color: 'var(--text)', whiteSpace: 'nowrap' },
  montantNote: { fontSize: 10, color: 'var(--text2)', whiteSpace: 'nowrap' },
  factureStatut: { flex: '0 0 auto', display: 'flex', justifyContent: 'flex-end', minWidth: 120 },
  detail: { margin: '6px 0 4px', padding: '10px 12px', background: 'var(--bg)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 10 },
  champs: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))', gap: 10 },
  champ: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  champLabel: { fontSize: 12, fontWeight: 600, color: 'var(--text2)' },
  input: { padding: '9px 10px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontFamily: 'var(--font)', minHeight: 44, boxSizing: 'border-box', width: '100%', minWidth: 0 },
  detailTexte: { fontSize: 12, color: 'var(--text)', lineHeight: 1.5 },
  detailActions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  detailNote: { fontSize: 11, color: 'var(--text2)' },
  modaleFond: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 16 },
  modale: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '22px 24px', width: 440, maxWidth: '100%', boxShadow: 'var(--sh-lg)', boxSizing: 'border-box' },
  modaleTitre: { fontSize: 17, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' },
  modaleSous: { fontSize: 13, color: 'var(--text2)', marginTop: 4, lineHeight: 1.45 },
  modaleActions: { display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', marginTop: 4 },
};
