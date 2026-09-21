import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { SectionHeader, SegmentedTabs } from '../../components/ui/index.jsx';
import { notify } from '../../components/toast/index.js';
import { canManageModule } from '../../data/demoData.js';
import { useGroupes } from '../../hooks/useGroupes.js';
import { useGroupeMenus } from '../../hooks/useGroupeMenus.js';
import { dbService } from '../../services/dbService.js';
import { formatDateCourte, formatJourSemaine, isoDate } from '../../utils/dateHelpers.js';
import { zurichToday } from '../../utils/zurichTime.js';
import AlerteAnticipation from './AlerteAnticipation.jsx';
import CalendrierMois from './CalendrierMois.jsx';
import GroupeFiche from './GroupeFiche.jsx';
import GroupeForm from './GroupeForm.jsx';
import MenusGroupe from './MenusGroupe.jsx';
import { dateComplete } from './pdfGroupe.js';
import {
  STATUTS, groupesAAnticiper, libelleGroupe, metaStatut,
} from './typesGroupe.js';

// ─────────────────────────────────────────────────────────────────────────────
// GROUPES - calendrier des événements de groupe.
//
// Un écran, deux onglets : le calendrier du mois (ce que tout le monde regarde)
// et les menus prédéfinis (ce que le patron et le chef composent une fois).
//
// Le calendrier ne porte qu'une information en couleur : l'état de préparation
// de chaque groupe. Rouge pas encore lu, orange lu, vert prêt. Au-dessus, le
// bandeau d'anticipation rappelle les groupes des 14 prochains jours.
//
// Droits : tout rôle ayant accès au module lit le calendrier et fait avancer
// l'état (c'est la brigade qui passe la case au vert). Créer, modifier et
// annuler un groupe relève du droit « gérer » du module (Rôles & accès →
// Droits d'action ; défaut consultant / patron / resp. cuisine / hôte).
//
// Annuler n'efface rien : le groupe reste visible, barré, dans « groupes
// annulés », et se rétablit d'un tap avec ses allergies. Ce n'est qu'une fois
// barré qu'il peut être supprimé définitivement, par le patron ou le consultant.
// ─────────────────────────────────────────────────────────────────────────────

const MOIS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
// Rôles que la BASE autorise à créer / modifier un groupe (politique INSERT et
// trigger de la migration 20260920) et à composer un menu. Le droit « gérer »
// de Rôles & accès ne peut que RETIRER dans ces listes : l'accorder à un autre
// rôle afficherait un bouton qui finit sur un refus de la base.
const ROLES_GESTION = ['consultant', 'patron', 'resp_cuisine', 'hote'];
const ROLES_MENUS = ['consultant', 'patron', 'resp_cuisine'];
// Miroir de la politique groupe_evenements_delete : une suppression refusée par
// la RLS ne renvoie pas d'erreur, le bouton ne doit donc apparaître qu'à ces rôles.
const ROLES_SUPPRESSION = ['consultant', 'patron'];
// Densité des cases du mois, d'après la largeur du calendrier lui-même et non
// de la fenêtre : sur desktop la barre latérale en mange une partie.
// < 620 : téléphone (« M4 ») · < 910 : iPad debout (« Apéro n°1 ») · au-delà :
// libellé complet et heure.
const LARGEUR_COMPACTE = 620;
const LARGEUR_MOYENNE = 910;

// Plats, fiches techniques et catalogue de l'établissement : ils servent à
// composer les menus et à calculer les listes de courses. Lecture stricte -
// une liste vide issue d'une erreur réseau produirait une liste de courses
// vide « qui a l'air juste ».
function useCuisine(etabId) {
  const [etat, setEtat] = useState({ plats: [], recettes: [], catalogue: [], status: 'loading' });

  useEffect(() => {
    const db = dbService.getDb();
    if (!etabId || !db) { setEtat({ plats: [], recettes: [], catalogue: [], status: 'ready' }); return undefined; }
    let mounted = true;

    const charger = async () => {
      try {
        const [plats, recettes, catalogue] = await Promise.all([
          db.listPlats(etabId, { strict: true }),
          db.listRecettes(etabId, { strict: true }),
          db.listProduits(etabId),
        ]);
        if (!mounted) return;
        setEtat({
          plats: plats || [],
          // Une fiche archivée ne doit plus nourrir une liste de courses.
          recettes: (recettes || []).filter((r) => r.statut !== 'archivée'),
          catalogue: catalogue || [],
          status: 'ready',
        });
      } catch (err) {
        console.error('[Groupes] lecture plats/recettes', err);
        if (mounted) setEtat((p) => (p.status === 'ready' ? p : { ...p, status: 'error' }));
      }
    };

    charger();
    const realtime = dbService.getRealtime();
    const unsub = realtime?.subscribeReload
      ? realtime.subscribeReload(['plats', 'plat_recettes', 'recettes'], () => { if (mounted) charger(); })
      : null;
    return () => { mounted = false; if (unsub) unsub(); };
  }, [etabId]);

  return etat;
}

// Largeur d'un élément, suivie par ResizeObserver. Ref en CALLBACK et non en
// objet : le calendrier est démonté quand on passe sur l'onglet Menus, et un
// effet à dépendances vides continuerait d'observer l'ancien nœud détaché -
// la densité des cases restait figée après un aller-retour puis une rotation.
function useLargeur() {
  const [largeur, setLargeur] = useState(0);
  const observateur = useRef(null);
  const ref = useCallback((el) => {
    if (observateur.current) { observateur.current.disconnect(); observateur.current = null; }
    if (!el) return;
    const initiale = el.getBoundingClientRect().width;
    if (initiale > 0) setLargeur(initiale);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      // Module gardé monté en arrière-plan (display:none) : largeur 0, ignorée.
      if (w > 0) setLargeur(w);
    });
    ro.observe(el);
    observateur.current = ro;
  }, []);
  return [ref, largeur];
}

export default function Groupes({ user, etablissement }) {
  const etabId = etablissement?.id || null;
  const canEdit = ROLES_GESTION.includes(user?.role) && canManageModule(user?.role, 'groupes');
  const canEditMenus = canEdit && ROLES_MENUS.includes(user?.role);
  const canSupprimer = canEdit && ROLES_SUPPRESSION.includes(user?.role);

  const aujourdhui = zurichToday();
  const [onglet, setOnglet] = useState('calendrier');
  const [vue, setVue] = useState(() => {
    const [a, m] = aujourdhui.split('-').map(Number);
    return { annee: a, mois: m - 1 };
  });
  const [ficheId, setFicheId] = useState(null);
  const [formulaire, setFormulaire] = useState(null); // { groupe?, date? }
  const [jourOuvert, setJourOuvert] = useState(null); // ISO d'un jour à plusieurs groupes
  const [voirAnnules, setVoirAnnules] = useState(false);

  const {
    groupes, status, reload, assurerDepuis, creer, modifier, changerStatut, annuler, supprimer,
  } = useGroupes(etabId);
  const { status: menusStatus, reload: reloadMenus, menuDe, enregistrer: enregistrerMenu } = useGroupeMenus(etabId);
  const cuisine = useCuisine(etabId);
  const [refCalendrier, largeurCalendrier] = useLargeur();
  const compact = largeurCalendrier > 0 && largeurCalendrier < LARGEUR_COMPACTE;
  const densite = compact ? 'compacte'
    : (largeurCalendrier > 0 && largeurCalendrier < LARGEUR_MOYENNE ? 'moyenne' : 'large');

  // Remonter dans le passé au-delà de la fenêtre chargée : on l'élargit.
  useEffect(() => {
    assurerDepuis(isoDate(new Date(vue.annee, vue.mois, 1)));
  }, [vue.annee, vue.mois, assurerDepuis]);

  const actifs = useMemo(() => groupes.filter((g) => !g.annule), [groupes]);
  const aAnticiper = useMemo(() => groupesAAnticiper(groupes, aujourdhui), [groupes, aujourdhui]);

  const prefixeMois = `${vue.annee}-${String(vue.mois + 1).padStart(2, '0')}-`;
  const duMois = useMemo(
    () => groupes.filter((g) => g.dateEvenement.startsWith(prefixeMois)),
    [groupes, prefixeMois]
  );
  const duMoisActifs = duMois.filter((g) => !g.annule);
  const duMoisAnnules = duMois.filter((g) => g.annule);
  const totalPax = duMoisActifs.reduce((s, g) => s + g.nbPax, 0);

  const fiche = ficheId ? groupes.find((g) => g.id === ficheId) || null : null;
  const groupesDuJourOuvert = jourOuvert
    ? actifs.filter((g) => g.dateEvenement === jourOuvert)
    : [];

  const changerMois = (delta) => setVue((v) => {
    const d = new Date(v.annee, v.mois + delta, 1);
    return { annee: d.getFullYear(), mois: d.getMonth() };
  });
  const revenirAujourdhui = () => {
    const [a, m] = aujourdhui.split('-').map(Number);
    setVue({ annee: a, mois: m - 1 });
  };
  const surMoisCourant = aujourdhui.startsWith(prefixeMois);

  const ouvrirFiche = useCallback((g) => {
    setJourOuvert(null);
    setFicheId(g.id);
    const [a, m] = g.dateEvenement.split('-').map(Number);
    setVue({ annee: a, mois: m - 1 });
  }, []);

  function tapJour(iso, duJour) {
    if (duJour.length === 1) { setFicheId(duJour[0].id); return; }
    if (duJour.length > 1) { setJourOuvert(iso); return; }
    if (canEdit) setFormulaire({ date: iso });
  }

  async function sauver(contenu) {
    const cible = formulaire?.groupe;
    return cible ? modifier(cible.id, contenu) : creer(contenu);
  }

  async function basculerAnnulation(g, annule) {
    if (annule && !window.confirm(`Annuler le groupe « ${g.nom} » du ${dateComplete(g.dateEvenement)} ?`)) return;
    const { error } = await annuler(g.id, annule);
    if (error) { notify(error, 'error'); return; }
    notify(
      annule ? 'Groupe annulé : il reste barré dans « groupes annulés ».' : 'Groupe rétabli.',
      'success'
    );
    if (annule) setFicheId(null);
  }

  async function supprimerDefinitivement(g) {
    if (!g.annule) return;
    const ok = window.confirm(
      `Supprimer définitivement le groupe « ${g.nom} » du ${dateComplete(g.dateEvenement)} ?\n\n`
      + "Il disparaîtra de la liste des annulés et ne pourra plus être rétabli."
    );
    if (!ok) return;
    const { error } = await supprimer(g.id);
    if (error) { notify(error, 'error'); reload(); return; }
    notify('Groupe supprimé définitivement.', 'success');
    setFicheId(null);
  }

  if (!etabId) {
    return (
      <section style={st.page}>
        <SectionHeader title="Groupes" />
        <div style={st.encartAttention}>
          Aucun établissement sélectionné. Sélectionne un établissement pour voir ses groupes.
        </div>
      </section>
    );
  }

  return (
    <section style={st.page}>
      <div className="module-toolbar" style={{ marginBottom: 12 }}>
        <SectionHeader
          title="Groupes"
          sub="Mariages, anniversaires, séminaires, groupes et apéros dînatoires"
          style={{ marginBottom: 0 }}
        />
        <div className="module-actions">
          <SegmentedTabs
            tabs={[{ id: 'calendrier', label: 'Calendrier' }, { id: 'menus', label: 'Menus' }]}
            active={onglet}
            onChange={setOnglet}
          />
          {canEdit && status !== 'absent' && (
            <button type="button" onClick={() => setFormulaire({})} style={st.nouveau}>
              + Nouveau groupe
            </button>
          )}
        </div>
      </div>

      {(status === 'absent' || menusStatus === 'absent') && (
        <div style={st.encartAttention}>
          Le module Groupes est en cours d'activation : sa base de données n'est pas encore en place.
          Rien ne peut être enregistré pour l'instant.
        </div>
      )}

      {(status === 'error' || menusStatus === 'error') && (
        <div style={st.encartDanger}>
          {status === 'error' ? 'Lecture des groupes impossible' : 'Lecture des menus impossible'} (connexion ?).{' '}
          <button type="button" onClick={() => { reload(); reloadMenus(); }} style={st.lien}>Réessayer</button>
        </div>
      )}

      {onglet === 'calendrier' && status !== 'absent' && (
        <>
          <AlerteAnticipation groupes={aAnticiper} aujourdhui={aujourdhui} compact={compact} onOuvrir={ouvrirFiche} />

          {/* ── Navigation du mois ── */}
          <div style={st.barreMois}>
            <button type="button" onClick={() => changerMois(-1)} aria-label="Mois précédent" style={st.fleche}>‹</button>
            <div style={st.titreMois}>
              {MOIS[vue.mois]} <span style={{ color: 'var(--text2)' }} data-no-translate>{vue.annee}</span>
            </div>
            <button type="button" onClick={() => changerMois(1)} aria-label="Mois suivant" style={st.fleche}>›</button>
            {!surMoisCourant && (
              <button type="button" onClick={revenirAujourdhui} style={st.aujourdhui}>Aujourd'hui</button>
            )}
          </div>

          <div ref={refCalendrier} style={{ minWidth: 0, opacity: status === 'loading' ? 0.55 : 1 }}>
            <CalendrierMois
              annee={vue.annee}
              mois={vue.mois}
              groupes={actifs}
              aujourdhui={aujourdhui}
              densite={densite}
              peutCreer={canEdit}
              onJour={tapJour}
            />
          </div>

          {/* ── Légende : les trois états, rien d'autre ── */}
          <div style={st.legende}>
            {STATUTS.map((sid) => {
              const m = metaStatut(sid);
              return (
                <span key={sid} style={st.legendeItem}>
                  <span aria-hidden="true" style={{ ...st.pastille, background: m.barre }} />
                  {m.detail}
                </span>
              );
            })}
          </div>

          {/* ── Le mois en liste : le détail que les cases ne peuvent pas porter
                 sur un téléphone (nom du client, heure) ── */}
          <div style={{ marginTop: 18 }}>
            <div style={st.titreListe}>
              {duMoisActifs.length
                ? `${duMoisActifs.length} groupe${duMoisActifs.length > 1 ? 's' : ''} en ${MOIS[vue.mois].toLowerCase()} · ${totalPax} pax`
                : status === 'ready' ? `Aucun groupe en ${MOIS[vue.mois].toLowerCase()}.` : ''}
            </div>
            <div style={st.liste}>
              {duMoisActifs.map((g) => <LigneGroupe key={g.id} groupe={g} onClick={() => setFicheId(g.id)} />)}
            </div>

            {duMoisAnnules.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <button type="button" onClick={() => setVoirAnnules((v) => !v)} style={st.lien}>
                  {voirAnnules ? 'Masquer' : 'Voir'} les groupes annulés ({duMoisAnnules.length})
                </button>
                {voirAnnules && (
                  <div style={{ ...st.liste, marginTop: 8 }}>
                    {duMoisAnnules.map((g) => (
                      <LigneGroupe
                        key={g.id}
                        groupe={g}
                        onClick={() => setFicheId(g.id)}
                        onSupprimer={canSupprimer ? () => supprimerDefinitivement(g) : undefined}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {onglet === 'menus' && menusStatus !== 'absent' && (
        <MenusGroupe
          menuDe={menuDe}
          menusStatus={menusStatus}
          enregistrer={enregistrerMenu}
          plats={cuisine.plats}
          platsStatus={cuisine.status}
          etablissement={etablissement}
          canEditMenus={canEditMenus}
          voirPrix={canEdit}
        />
      )}

      {/* ── Jour portant plusieurs groupes : on choisit lequel ouvrir ── */}
      {jourOuvert && (
        <div
          className="modal-sheet-overlay"
          style={st.voile}
          onClick={() => setJourOuvert(null)}
        >
          <div className="modal-sheet" style={st.feuille} onClick={(e) => e.stopPropagation()}>
            <div style={st.feuilleTitre}>{dateComplete(jourOuvert)}</div>
            <div style={st.liste}>
              {groupesDuJourOuvert.map((g) => <LigneGroupe key={g.id} groupe={g} onClick={() => ouvrirFiche(g)} />)}
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => { setFormulaire({ date: jourOuvert }); setJourOuvert(null); }}
                style={{ ...st.nouveau, marginTop: 12, width: '100%' }}
              >
                + Ajouter un groupe ce jour-là
              </button>
            )}
          </div>
        </div>
      )}

      {fiche && !formulaire && (
        <GroupeFiche
          groupe={fiche}
          menu={fiche.menuNumero ? menuDe(fiche.typeGroupe, fiche.menuNumero) : null}
          menusStatus={menusStatus}
          cuisine={cuisine}
          etablissement={etablissement}
          canEdit={canEdit}
          onStatut={changerStatut}
          onEdit={(g) => setFormulaire({ groupe: g })}
          onAnnuler={basculerAnnulation}
          onSupprimer={canSupprimer ? supprimerDefinitivement : undefined}
          onClose={() => setFicheId(null)}
        />
      )}

      {formulaire && canEdit && (
        <GroupeForm
          groupe={formulaire.groupe || null}
          dateInitiale={formulaire.date || null}
          menuDe={menuDe}
          menusStatus={menusStatus}
          voirPrix={canEdit}
          onSave={sauver}
          onClose={() => setFormulaire(null)}
        />
      )}
    </section>
  );
}

function LigneGroupe({ groupe, onClick, onSupprimer }) {
  const ligne = <CorpsLigneGroupe groupe={groupe} onClick={onClick} enRangee={Boolean(onSupprimer)} />;
  if (!onSupprimer) return ligne;
  return (
    <div style={st.ligneAvecAction}>
      {ligne}
      <button
        type="button"
        onClick={onSupprimer}
        title="Supprimer définitivement"
        aria-label={`Supprimer définitivement le groupe ${groupe.nom}`}
        style={st.boutonSupprimer}
      >
        <Trash2 size={16} aria-hidden="true" />
        <span>Supprimer</span>
      </button>
    </div>
  );
}

function CorpsLigneGroupe({ groupe, onClick, enRangee }) {
  const m = metaStatut(groupe.statut);
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ ...st.ligne, ...(enRangee ? st.ligneEnRangee : null), opacity: groupe.annule ? 0.6 : 1 }}
    >
      <span aria-hidden="true" style={{ ...st.ligneBarre, background: groupe.annule ? 'var(--border)' : m.barre }} />
      <span style={st.ligneDate}>
        <span style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>{formatJourSemaine(groupe.dateEvenement)}</span>
        <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-serif)' }} data-no-translate>
          {formatDateCourte(groupe.dateEvenement)}
        </span>
      </span>
      <span style={{ flex: '1 1 auto', minWidth: 0 }}>
        <span style={{
          display: 'block', fontSize: 14, fontWeight: 700,
          textDecoration: groupe.annule ? 'line-through' : 'none',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {libelleGroupe(groupe.typeGroupe, groupe.menuNumero)} · {groupe.nom}
        </span>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--text2)' }}>
          {groupe.nbPax} pax{groupe.heure ? ` · ${groupe.heure}` : ''}
          {!groupe.menuNumero ? ' · menu à définir' : ''}
          {groupe.allergenesIds.length || groupe.allergiesNote ? ' · allergies' : ''}
        </span>
      </span>
      {!groupe.annule && (
        <span style={{
          flexShrink: 0, padding: '4px 9px', borderRadius: 12, fontSize: 11, fontWeight: 700,
          background: m.fond, color: m.texte, whiteSpace: 'nowrap',
        }}>
          {m.label}
        </span>
      )}
    </button>
  );
}

const st = {
  page: { padding: '20px 24px', position: 'relative', minHeight: '100%', minWidth: 0 },
  nouveau: {
    minHeight: 38, padding: '9px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
    background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)',
  },
  encartAttention: {
    marginBottom: 14, padding: '10px 14px', borderRadius: 8, fontSize: 13, lineHeight: 1.5,
    background: 'var(--warning-bg-soft)', border: '1px solid var(--warning-bd)', color: 'var(--warning-text)',
  },
  encartDanger: {
    marginBottom: 14, padding: '10px 14px', borderRadius: 8, fontSize: 13, lineHeight: 1.5,
    background: 'var(--danger-bg-soft)', border: '1px solid var(--danger-bd)', color: 'var(--danger-text)',
  },
  lien: {
    background: 'none', border: 'none', padding: '4px 0', cursor: 'pointer',
    color: 'var(--accent)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)',
    textDecoration: 'underline',
  },
  barreMois: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 },
  titreMois: {
    flex: '1 1 auto', minWidth: 0, textAlign: 'center',
    fontSize: 19, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)',
  },
  fleche: {
    width: 44, minHeight: 44, flexShrink: 0, borderRadius: 10, cursor: 'pointer',
    border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)',
    fontSize: 22, lineHeight: 1, fontFamily: 'var(--font)',
  },
  aujourdhui: {
    minHeight: 44, flexShrink: 0, padding: '0 14px', borderRadius: 10, cursor: 'pointer',
    border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)',
    fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)',
  },
  legende: { display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 10 },
  legendeItem: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)' },
  pastille: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  titreListe: { fontSize: 13, fontWeight: 700, color: 'var(--text2)', marginBottom: 8 },
  liste: { display: 'flex', flexDirection: 'column', gap: 6 },
  ligne: {
    display: 'flex', alignItems: 'center', gap: 12, width: '100%', minWidth: 0,
    minHeight: 56, flexShrink: 0, boxSizing: 'border-box',
    padding: '8px 12px 8px 0', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
    background: 'var(--surface)', border: '1px solid var(--border)', overflow: 'hidden',
    fontFamily: 'var(--font)', color: 'var(--text)',
  },
  ligneBarre: { alignSelf: 'stretch', width: 5, flexShrink: 0, margin: '-8px 0' },
  ligneAvecAction: { display: 'flex', alignItems: 'stretch', gap: 6, minWidth: 0, flexShrink: 0 },
  ligneEnRangee: { flex: '1 1 auto', width: 'auto' },
  boutonSupprimer: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    flexShrink: 0, minHeight: 56, padding: '0 12px', borderRadius: 10, cursor: 'pointer',
    background: 'var(--danger-bg-soft)', color: 'var(--danger-text)', border: '1px solid var(--danger-bd)',
    fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)',
  },
  ligneDate: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    width: 46, flexShrink: 0, lineHeight: 1.15,
  },
  voile: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  feuille: {
    background: 'var(--surface)', width: 460, maxWidth: '100%', maxHeight: '80vh', overflowY: 'auto',
    borderRadius: 14, padding: 18, boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  },
  feuilleTitre: {
    fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)', marginBottom: 12,
  },
};
