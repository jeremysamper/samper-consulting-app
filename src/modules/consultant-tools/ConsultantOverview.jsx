import React from 'react';
import { computeCoutMatiere } from '../../services/prixResolution.js';

// ─────────────────────────────────────────────────────────────────────────────
// Vue d'ensemble - cockpit d'arrivée des Outils consultant.
// Tout est calculé à partir des données déjà chargées par ConsultantTools
// (recettes, plats, cartes) : aucune lecture réseau ici. Chaque alerte renvoie
// vers l'endroit où elle se corrige (onglet, recette, modale) via les
// callbacks du parent.
// ─────────────────────────────────────────────────────────────────────────────

const S = {
  root: { display: 'flex', flexDirection: 'column', gap: 16 },
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 },
  kpiCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  kpiLabel: { fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.4 },
  kpiValue: { fontSize: 26, fontWeight: 800, fontFamily: 'var(--font-serif)', color: 'var(--text)', lineHeight: 1.1 },
  kpiSub: { fontSize: 11, color: 'var(--text3)' },
  actionsRow: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  primaryBtn: { padding: '9px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
  ghostBtn: { padding: '9px 16px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
  twoCols: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'start' },
  card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', minWidth: 0 },
  cardTitle: { padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: 0.4 },
  okBanner: { padding: '14px 16px', fontSize: 13, color: 'var(--success-text)', background: 'var(--success-bg)', display: 'flex', alignItems: 'center', gap: 8 },
  alertHead: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 16px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left' },
  alertLabel: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)' },
  alertBody: { padding: '10px 16px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' },
  alertHint: { fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 10 },
  chipWrap: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip: { display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%', padding: '5px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, fontSize: 12, color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--font)' },
  chipMeta: { fontSize: 11, fontWeight: 700, color: 'var(--text2)', whiteSpace: 'nowrap' },
  chipMore: { alignSelf: 'center', fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' },
  actionBtn: { marginTop: 10, padding: '7px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' },
  recentRow: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 16px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left' },
  recentName: { fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  recentMeta: { fontSize: 11, color: 'var(--text2)', marginTop: 2 },
  recentDate: { fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap', flexShrink: 0 },
  emptyHint: { padding: '14px 16px', fontSize: 12, color: 'var(--text2)', fontStyle: 'italic' },
};

// Pastille de sévérité + badge de compteur, par niveau.
const SEV = {
  danger: { dot: 'var(--danger-strong)', badgeBg: 'var(--danger-bg)', badgeBd: 'var(--danger-bd)', badgeText: 'var(--danger-text)' },
  warning: { dot: 'var(--warning-strong)', badgeBg: 'var(--warning-bg)', badgeBd: 'var(--warning-bd)', badgeText: 'var(--warning-text)' },
  info: { dot: 'var(--text3)', badgeBg: 'var(--bg)', badgeBd: 'var(--border)', badgeText: 'var(--text2)' },
};
const SEV_ORDER = { danger: 0, warning: 1, info: 2 };

// Mêmes formules que l'éditeur de recettes : coût matière → coût portion → FC.
// Le prix des ingrédients liés vient du catalogue via produitIndex, pas de la
// copie figée dans la recette : les deux écrans doivent afficher le même chiffre.
const foodCostOf = (r, produitIndex) => {
  const coutMatiere = computeCoutMatiere(r.ingredients, produitIndex);
  const coutPortion = Number(r.portions) > 0 ? coutMatiere / Number(r.portions) : 0;
  return Number(r.prixVente) > 0 ? (coutPortion / Number(r.prixVente)) * 100 : null;
};
const fcColor = (fc) => (fc == null ? 'var(--text2)' : fc < 30 ? 'var(--success-strong)' : fc < 35 ? 'var(--warning-strong)' : 'var(--danger-strong)');
const fmtDate = (iso) => {
  const [y, m, d] = String(iso || '').split('-');
  return y && m && d ? `${d}.${m}.${y}` : '';
};

const MAX_CHIPS = 10;

export default function ConsultantOverview({
  recettesActives, recettesArchivees, plats, cartesActives,
  pendingDrafts, reviewCount,
  onOpenRecette, onNewRecette, onNewPlat, onEditPlat, onImport,
  onMatchReview, onBulkAllergenes, onRestoreDrafts, onGoTab,
  produitIndex,
}) {
  const [expandedKey, setExpandedKey] = React.useState(null);

  // ─── Dérivés ───
  const linkedIds = new Set();
  (plats || []).forEach(p => (p.recettes || []).forEach(pr => linkedIds.add(pr.recetteId)));
  const activesIds = new Set(recettesActives.map(r => r.id));

  const orphelines = recettesActives.filter(r => !linkedIds.has(r.id));
  const platsVides = (plats || []).filter(p => !(p.recettes || []).some(pr => activesIds.has(pr.recetteId)));
  const sansIngredients = recettesActives.filter(r => !(r.ingredients || []).length);
  const sansEtapes = recettesActives.filter(r => (r.ingredients || []).length > 0 && !(r.etapes || []).length);
  const sansPrix = recettesActives.filter(r => !(Number(r.prixVente) > 0));
  const sansAllergenes = recettesActives.filter(r => (r.ingredients || []).length > 0 && !(r.allergenesIds || []).length);
  const sansPhoto = recettesActives.filter(r => !r.photoUrl);
  const aRelire = recettesActives.filter(r => (r.ingredients || []).some(i => i.needsReview));

  const chiffrees = recettesActives.map(r => ({ r, fc: foodCostOf(r, produitIndex) })).filter(x => x.fc != null);
  const fcMoyen = chiffrees.length ? chiffrees.reduce((s, x) => s + x.fc, 0) / chiffrees.length : null;
  const fcEleves = chiffrees.filter(x => x.fc >= 35);

  const recChip = (r) => ({ id: r.id, nom: r.nom, onClick: () => onOpenRecette(r.id) });

  const alerts = [
    sansAllergenes.length > 0 && {
      key: 'allergenes', sev: 'danger', count: sansAllergenes.length,
      label: 'Recettes sans allergènes renseignés',
      hint: 'Obligatoire pour la carte et les fiches salle. La détection IA les remplit à partir des ingrédients, sans retirer l\'existant.',
      items: sansAllergenes.map(recChip),
      actionLabel: 'Détecter par IA (toutes)', onAction: onBulkAllergenes,
    },
    fcEleves.length > 0 && {
      key: 'foodcost', sev: 'danger', count: fcEleves.length,
      label: 'Food cost à 35 % ou plus',
      hint: 'Prix de vente à revoir ou recette à retravailler. Cliquez une recette pour l\'ouvrir.',
      items: fcEleves.map(({ r, fc }) => ({ id: r.id, nom: r.nom, meta: `${fc.toFixed(1)} %`, onClick: () => onOpenRecette(r.id) })),
    },
    reviewCount > 0 && {
      key: 'review', sev: 'warning', count: reviewCount,
      label: 'Correspondances catalogue à valider',
      hint: 'Des ingrédients importés ressemblent à plusieurs produits du catalogue : le prix reste faux tant que le bon produit n\'est pas choisi.',
      items: aRelire.map(recChip),
      actionLabel: 'Vérifier maintenant', onAction: onMatchReview,
    },
    (pendingDrafts || []).length > 0 && {
      key: 'drafts', sev: 'warning', count: pendingDrafts.length,
      label: 'Brouillons non synchronisés',
      hint: 'Des modifications locales (crash ou hors-ligne) n\'ont pas été sauvegardées en base.',
      items: pendingDrafts.map(d => ({ id: d.id, nom: d.nom, onClick: () => onOpenRecette(d.id) })),
      actionLabel: 'Tout restaurer', onAction: onRestoreDrafts,
    },
    sansPrix.length > 0 && {
      key: 'prix', sev: 'warning', count: sansPrix.length,
      label: 'Recettes sans prix de vente',
      hint: 'Sans prix, ni food cost ni marge ne sont calculés et la simulation de carte les ignore.',
      items: sansPrix.map(recChip),
    },
    sansIngredients.length > 0 && {
      key: 'ingredients', sev: 'warning', count: sansIngredients.length,
      label: 'Recettes sans ingrédient',
      hint: 'Fiches vides : ni coût matière, ni allergènes, ni analyse HACCP possibles.',
      items: sansIngredients.map(recChip),
    },
    sansEtapes.length > 0 && {
      key: 'etapes', sev: 'info', count: sansEtapes.length,
      label: 'Recettes sans étapes de préparation',
      hint: 'La fiche imprimée pour la brigade sortira sans méthode.',
      items: sansEtapes.map(recChip),
    },
    orphelines.length > 0 && {
      key: 'orphelines', sev: 'info', count: orphelines.length,
      label: 'Recettes non rattachées à un plat',
      hint: 'Invisibles dans la hiérarchie Carte ▸ Plat : rattachez-les pour les retrouver et les publier.',
      items: orphelines.map(recChip),
    },
    platsVides.length > 0 && {
      key: 'platsVides', sev: 'info', count: platsVides.length,
      label: 'Plats sans recette',
      hint: 'Coquilles vides sur la carte. Cliquez un plat pour l\'éditer.',
      items: platsVides.map(p => ({ id: p.id, nom: p.nom, onClick: () => onEditPlat(p) })),
    },
    sansPhoto.length > 0 && {
      key: 'photos', sev: 'info', count: sansPhoto.length,
      label: 'Recettes sans photo',
      hint: 'La photo aide la brigade au dressage et habille les fiches.',
      items: sansPhoto.map(recChip),
    },
  ].filter(Boolean).sort((a, b) => SEV_ORDER[a.sev] - SEV_ORDER[b.sev]);

  const recentes = [...recettesActives]
    .sort((a, b) => String(b.modifie || '').localeCompare(String(a.modifie || '')))
    .slice(0, 6);

  return (
    <div style={S.root}>
      {/* ─── KPIs ─── */}
      <div style={S.kpiRow}>
        <div style={S.kpiCard}>
          <span style={S.kpiLabel}>Recettes actives</span>
          <span style={S.kpiValue}>{recettesActives.length}</span>
          <span style={S.kpiSub}>{recettesArchivees.length ? `${recettesArchivees.length} archivée${recettesArchivees.length > 1 ? 's' : ''}` : 'aucune archivée'}</span>
        </div>
        <div style={S.kpiCard}>
          <span style={S.kpiLabel}>Plats</span>
          <span style={S.kpiValue}>{(plats || []).length}</span>
          <span style={S.kpiSub}>{platsVides.length ? `${platsVides.length} sans recette` : 'tous composés'}</span>
        </div>
        <div style={S.kpiCard}>
          <span style={S.kpiLabel}>Cartes actives</span>
          <span style={S.kpiValue}>{(cartesActives || []).length}</span>
          <span style={S.kpiSub}>menus en service</span>
        </div>
        <div style={S.kpiCard}>
          <span style={S.kpiLabel}>Food cost moyen</span>
          <span style={{ ...S.kpiValue, color: fcColor(fcMoyen) }}>
            {fcMoyen == null ? '-' : `${fcMoyen.toFixed(1)} %`}
          </span>
          <span style={S.kpiSub}>{chiffrees.length ? `sur ${chiffrees.length} fiche${chiffrees.length > 1 ? 's' : ''} chiffrée${chiffrees.length > 1 ? 's' : ''}` : 'aucune fiche chiffrée'}</span>
        </div>
      </div>

      {/* ─── Actions rapides ─── */}
      <div style={S.actionsRow}>
        <button style={S.primaryBtn} onClick={onNewRecette}>+ Nouvelle recette</button>
        <button style={S.ghostBtn} onClick={onNewPlat}>+ Nouveau plat</button>
        <button style={S.ghostBtn} onClick={onImport}>Importer des recettes</button>
        <button style={S.ghostBtn} onClick={() => onGoTab('creation_carte')}>Créer une carte</button>
        <button style={S.ghostBtn} onClick={() => onGoTab('simulation')}>Simuler une carte</button>
      </div>

      <div style={S.twoCols}>
        {/* ─── À traiter ─── */}
        <div style={S.card}>
          <div style={S.cardTitle}>À traiter ({alerts.length})</div>
          {alerts.length === 0 ? (
            <div style={S.okBanner}>
              <span aria-hidden="true">✓</span>
              Tout est en ordre : aucune action en attente sur {recettesActives.length} recette{recettesActives.length > 1 ? 's' : ''}.
            </div>
          ) : alerts.map(alert => {
            const sev = SEV[alert.sev];
            const open = expandedKey === alert.key;
            return (
              <div key={alert.key}>
                <button
                  style={S.alertHead}
                  onClick={() => setExpandedKey(open ? null : alert.key)}
                  aria-expanded={open}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: sev.dot, flexShrink: 0 }} />
                  <span style={S.alertLabel}>{alert.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 10, background: sev.badgeBg, border: `1px solid ${sev.badgeBd}`, color: sev.badgeText, flexShrink: 0 }}>
                    {alert.count}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text3)', flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
                </button>
                {open && (
                  <div style={S.alertBody}>
                    <div style={S.alertHint}>{alert.hint}</div>
                    <div style={S.chipWrap}>
                      {alert.items.slice(0, MAX_CHIPS).map(item => (
                        <button key={item.id} style={S.chip} onClick={item.onClick} title="Ouvrir">
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.nom}</span>
                          {item.meta && <span style={{ ...S.chipMeta, color: 'var(--danger-strong)' }}>{item.meta}</span>}
                        </button>
                      ))}
                      {alert.items.length > MAX_CHIPS && (
                        <span style={S.chipMore}>+ {alert.items.length - MAX_CHIPS} autre{alert.items.length - MAX_CHIPS > 1 ? 's' : ''}</span>
                      )}
                    </div>
                    {alert.actionLabel && (
                      <button style={S.actionBtn} onClick={alert.onAction}>{alert.actionLabel}</button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ─── Modifiées récemment ─── */}
        <div style={S.card}>
          <div style={S.cardTitle}>Modifiées récemment</div>
          {recentes.length === 0 ? (
            <div style={S.emptyHint}>Aucune recette pour cet établissement. Créez-en une ou importez un fichier.</div>
          ) : recentes.map(r => {
            const fc = foodCostOf(r, produitIndex);
            return (
              <button key={r.id} style={S.recentRow} onClick={() => onOpenRecette(r.id)} title="Ouvrir la recette">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={S.recentName}>{r.nom}</div>
                  <div style={S.recentMeta}>
                    {r.categorie || 'Sans catégorie'} · {r.portions || '?'} p.
                    {fc != null && <span style={{ marginLeft: 6, fontWeight: 700, color: fcColor(fc) }}>FC {fc.toFixed(1)} %</span>}
                  </div>
                </div>
                <span style={S.recentDate}>{fmtDate(r.modifie)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
