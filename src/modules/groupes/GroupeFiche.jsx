import { useMemo, useState } from 'react';
import { notify } from '../../components/toast/index.js';
import { SegmentedTabs } from '../../components/ui/index.jsx';
import { pdfUtils } from '../../services/pdf.js';
import { labelAllergene, sortAllergenes } from '../../utils/allergenes.js';
import { userDisplayName } from '../../utils/userDisplay.js';
import {
  allergenesEnConflit, computeListeCourses, formatQuantiteCourses, payloadCoursesPdf,
} from './listeCourses.js';
import { dateComplete, enTeteCourses, payloadFicheGroupe } from './pdfGroupe.js';
import { STATUTS, libelleGroupe, lignesParSection, metaStatut } from './typesGroupe.js';

// ─────────────────────────────────────────────────────────────────────────────
// Fiche d'un groupe : ce que la brigade lit, et l'endroit où elle dit qu'elle
// l'a lu.
//
// L'état se règle d'un tap sur un sélecteur à trois positions (À lire · Lu ·
// Prêt), ouvert à TOUS les rôles : c'est la cuisine qui fait passer la case du
// rouge au vert, pas le patron. « Lu par » et l'heure sont posés par la base.
//
// Deux onglets : la fiche, et la liste de courses calculée pour le nombre de
// couverts du groupe. Les deux s'exportent en PDF dans la DA de la maison.
// ─────────────────────────────────────────────────────────────────────────────

function horodatage(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('fr-CH', {
    timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export default function GroupeFiche({
  groupe, menu, menusStatus = 'ready', cuisine, etablissement, canEdit = false,
  onStatut, onEdit, onAnnuler, onSupprimer, onClose,
}) {
  const [onglet, setOnglet] = useState('fiche');
  const [statutEnCours, setStatutEnCours] = useState(false);

  const sections = useMemo(() => lignesParSection(menu?.lignes || []), [menu]);
  const allergenes = sortAllergenes(groupe.allergenesIds || []);
  const meta = metaStatut(groupe.statut);

  const conflits = useMemo(() => allergenesEnConflit({
    lignes: menu?.lignes || [],
    allergenesGroupe: groupe.allergenesIds,
    plats: cuisine.plats,
    recettes: cuisine.recettes,
  }), [menu, groupe.allergenesIds, cuisine.plats, cuisine.recettes]);

  const liste = useMemo(() => computeListeCourses({
    lignes: menu?.lignes || [],
    pax: groupe.nbPax,
    plats: cuisine.plats,
    recettes: cuisine.recettes,
    catalogue: cuisine.catalogue,
  }), [menu, groupe.nbPax, cuisine.plats, cuisine.recettes, cuisine.catalogue]);

  async function choisirStatut(statut) {
    if (statut === groupe.statut || statutEnCours) return;
    setStatutEnCours(true);
    try {
      const { error } = await onStatut(groupe.id, statut);
      if (error) notify(error, 'error');
    } finally {
      setStatutEnCours(false);
    }
  }

  const donneesPretes = menusStatus === 'ready' && cuisine.status === 'ready';

  function exporterFiche() {
    if (menusStatus !== 'ready') { notify('Le menu est encore en cours de chargement.', 'info'); return; }
    const { payload, filename } = payloadFicheGroupe({ groupe, menu });
    pdfUtils.exportGroupeMenuPdf(payload, { etablissement, filename }).catch(() => {});
  }

  function exporterCourses() {
    if (!donneesPretes) { notify('La liste est encore en cours de calcul.', 'info'); return; }
    if (!liste.items.length) { notify('Aucun ingrédient à lister pour ce menu.', 'info'); return; }
    const entete = enTeteCourses(groupe);
    const remarques = [];
    if (liste.nonChiffres.length) {
      remarques.push({
        label: 'À commander à la main',
        texte: `Plats sans fiche technique, absents du calcul : ${liste.nonChiffres.join(', ')}.`,
      });
    }
    if (liste.aVerifier.length) {
      remarques.push({
        label: 'Fiches à compléter',
        texte: `Nombre de portions manquant, fiches non comptées : ${liste.aVerifier.join(', ')}.`,
      });
    }
    const payload = { ...payloadCoursesPdf({ liste, titre: entete.titre, sousTitre: entete.sousTitre }), remarques };
    pdfUtils.exportCommandePdf(payload, { etablissement, filename: entete.filename }).catch(() => {});
  }

  return (
    <div
      className="modal-full-overlay"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="modal-full"
        style={{
          background: 'var(--surface)', width: 640, maxWidth: '100%', maxHeight: '92vh',
          borderRadius: 14, display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Liseré à la couleur de l'état : la fiche se reconnaît avant d'être lue */}
        <div style={{ height: 5, background: meta.barre, flexShrink: 0 }} />

        <div style={st.entete}>
          <div style={{ minWidth: 0 }}>
            <div style={st.titre}>{libelleGroupe(groupe.typeGroupe, groupe.menuNumero)} · {groupe.nom}</div>
            <div style={st.sousTitre}>
              {dateComplete(groupe.dateEvenement)}{groupe.heure ? ` · ${groupe.heure}` : ''} · {groupe.nbPax} pax
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" style={st.fermer}>×</button>
        </div>

        <div style={st.corps}>
        <div style={st.colonne}>
          {groupe.annule && (
            <div style={{ ...st.encart, ...st.encartDanger }}>
              Ce groupe est annulé : il reste barré dans « groupes annulés ».
              {canEdit && ' Tu peux le rétablir'}
              {canEdit && onSupprimer && ' ou le supprimer définitivement'}
              {canEdit && '.'}
            </div>
          )}

          {/* ── État de préparation ── */}
          {!groupe.annule && (
            <div>
              <div style={st.selecteur} role="radiogroup" aria-label="État de préparation">
                {STATUTS.map((sid) => {
                  const m = metaStatut(sid);
                  const actif = groupe.statut === sid;
                  return (
                    <button
                      key={sid} type="button" role="radio" aria-checked={actif}
                      disabled={statutEnCours}
                      onClick={() => choisirStatut(sid)}
                      style={{
                        ...st.position,
                        ...(actif ? { background: m.fond, color: m.texte, borderColor: m.barre } : null),
                      }}
                    >
                      <span aria-hidden="true" style={{ ...st.pastilleEtat, background: m.barre }} />
                      {m.label}
                    </button>
                  );
                })}
              </div>
              <div style={st.trace}>
                {groupe.statut === 'a_lire' && (groupe.modifieAt
                  ? `Modifié le ${horodatage(groupe.modifieAt)} : à relire par la brigade.`
                  : 'Pas encore lu par la brigade.')}
                {groupe.statut !== 'a_lire' && groupe.luAt
                  && `Lu par ${userDisplayName(groupe.luPar)} le ${horodatage(groupe.luAt)}`}
                {groupe.statut === 'pret' && groupe.pretAt
                  && ` · Préparé par ${userDisplayName(groupe.pretPar)} le ${horodatage(groupe.pretAt)}`}
              </div>
            </div>
          )}

          <SegmentedTabs
            tabs={[{ id: 'fiche', label: 'Fiche' }, { id: 'courses', label: 'Liste de courses' }]}
            active={onglet}
            onChange={setOnglet}
          />

          {onglet === 'fiche' && (
            <>
              {conflits.length > 0 && (
                <div style={{ ...st.encart, ...st.encartDanger }}>
                  <strong style={{ fontWeight: 700 }}>Allergènes présents dans le menu.</strong>{' '}
                  {conflits.map((c) => `${c.label} (${c.plats.join(', ')})`).join(' · ')}.
                  {' '}À vérifier sur les fiches techniques.
                </div>
              )}

              {(allergenes.length > 0 || groupe.allergiesNote) && (
                <div>
                  <div style={st.rubrique}>Allergies et régimes</div>
                  {allergenes.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: groupe.allergiesNote ? 8 : 0 }}>
                      {allergenes.map((id) => (
                        <span key={id} style={st.allergene}>{labelAllergene(id)}</span>
                      ))}
                    </div>
                  )}
                  {groupe.allergiesNote && <div style={st.texte}>{groupe.allergiesNote}</div>}
                </div>
              )}

              {groupe.modifications && (
                <div style={{ ...st.encart, ...st.encartAttention }}>
                  <div style={{ ...st.rubrique, color: 'var(--warning-text)' }}>Modifications du menu</div>
                  <div style={{ ...st.texte, color: 'var(--warning-text)' }}>{groupe.modifications}</div>
                </div>
              )}

              <div>
                <div style={st.rubrique}>
                  {groupe.menuNumero ? `Menu n°${groupe.menuNumero}` : 'Menu'}{menu?.nom ? ` · ${menu.nom}` : ''}
                </div>
                {!groupe.menuNumero && <div style={st.vide}>Menu à définir.</div>}
                {groupe.menuNumero && !sections.length && (
                  <div style={st.vide}>
                    {menusStatus === 'ready'
                      ? "Ce menu n'a pas encore été composé (onglet Menus)."
                      : menusStatus === 'error' ? 'Menu indisponible pour le moment (connexion ?).' : 'Chargement du menu…'}
                  </div>
                )}
                {sections.length > 0 && (
                  <div style={st.menu}>
                    {sections.map((sec) => (
                      <div key={sec.id}>
                        <div style={st.menuSection}>{sec.label}</div>
                        {sec.lignes.map((l) => (
                          <div key={l.id} style={{ marginBottom: 4 }}>
                            <div style={st.menuPlat}>
                              {l.libelle}
                              {Number(l.parPersonne) > 0 && Number(l.parPersonne) !== 1
                                ? <span style={st.menuMention}> · {String(l.parPersonne).replace('.', ',')} par personne</span>
                                : null}
                            </div>
                            {l.description && <div style={st.menuNote}>{l.description}</div>}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {groupe.commentaires && (
                <div>
                  <div style={st.rubrique}>Commentaires</div>
                  <div style={st.texte}>{groupe.commentaires}</div>
                </div>
              )}

              {groupe.contact && (
                <div>
                  <div style={st.rubrique}>Contact</div>
                  <div style={st.texte} data-no-translate>{groupe.contact}</div>
                </div>
              )}
            </>
          )}

          {onglet === 'courses' && (
            <ListeCourses
              liste={liste} groupe={groupe} menu={menu}
              chargement={cuisine.status === 'loading' || menusStatus === 'loading'}
              indisponible={cuisine.status === 'error' || menusStatus === 'error'}
            />
          )}
        </div>
        </div>

        <div style={st.pied}>
          <button type="button" onClick={exporterFiche} style={st.bouton}>Menu PDF</button>
          <button type="button" onClick={exporterCourses} style={st.bouton}>Courses PDF</button>
          {canEdit && !groupe.annule && (
            <button type="button" onClick={() => onEdit(groupe)} style={{ ...st.bouton, ...st.boutonPrincipal }}>Modifier</button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => onAnnuler(groupe, !groupe.annule)}
              style={{ ...st.bouton, ...(groupe.annule ? null : st.boutonDanger) }}
            >
              {groupe.annule ? 'Rétablir le groupe' : 'Annuler le groupe'}
            </button>
          )}
          {/* Seulement une fois barré : annuler d'abord, supprimer ensuite. */}
          {canEdit && groupe.annule && onSupprimer && (
            <button
              type="button"
              onClick={() => onSupprimer(groupe)}
              style={{ ...st.bouton, ...st.boutonDanger }}
            >
              Supprimer définitivement
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ListeCourses({ liste, groupe, menu, chargement, indisponible }) {
  if (chargement) return <div style={st.vide}>Calcul de la liste…</div>;
  // Une liste vide née d'une lecture en échec aurait l'air juste : on le dit.
  if (indisponible) return <div style={st.vide}>Liste indisponible pour le moment (connexion ?).</div>;
  if (!groupe.menuNumero) return <div style={st.vide}>Choisis d'abord un menu pour ce groupe.</div>;
  if (!(menu?.lignes || []).length) {
    return <div style={st.vide}>Ce menu n'a pas encore été composé : aucune liste à calculer.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={st.texte}>
        Quantités calculées pour <strong style={{ fontWeight: 700 }}>{groupe.nbPax} personnes</strong> à partir
        des fiches techniques, arrondies au-dessus.
      </div>

      {liste.nonChiffres.length > 0 && (
        <div style={{ ...st.encart, ...st.encartAttention }}>
          Plats sans fiche technique, absents du calcul et à commander à la main : {liste.nonChiffres.join(', ')}.
        </div>
      )}
      {liste.aVerifier.length > 0 && (
        <div style={{ ...st.encart, ...st.encartAttention }}>
          Fiches sans nombre de portions, non comptées : {liste.aVerifier.join(', ')}.
        </div>
      )}
      {!liste.items.length && <div style={st.vide}>Aucun ingrédient à lister.</div>}

      {liste.groupes.map((g) => (
        <div key={g.categorie}>
          <div style={st.rubrique}>{g.categorie}</div>
          <div style={st.tableau}>
            {g.items.map((it, i) => (
              <div key={it.cle} style={{ ...st.ligneCourse, ...(i % 2 ? st.ligneCourseAlt : null) }}>
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{it.nom}</span>
                <span style={st.quantite}>{formatQuantiteCourses(it.besoin, it.unite)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const st = {
  entete: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
    padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0,
  },
  titre: { fontWeight: 700, fontSize: 17, fontFamily: 'var(--font-serif)', color: 'var(--text)', lineHeight: 1.25 },
  sousTitre: { fontSize: 13, color: 'var(--text2)', marginTop: 3 },
  fermer: {
    background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', flexShrink: 0,
    color: 'var(--text2)', padding: 4, lineHeight: 1, minWidth: 44,
  },
  // Bloc scrollable ; la colonne flex vit à l'intérieur (st.colonne). Poser le
  // flex ici ferait rétrécir les enfants à overflow non visible (onglets,
  // tableaux arrondis) dès que la modale atteint sa hauteur maximale.
  corps: { flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '16px 20px' },
  colonne: { display: 'flex', flexDirection: 'column', gap: 16 },
  pied: {
    display: 'flex', flexWrap: 'wrap', gap: 8, flexShrink: 0,
    padding: '12px 20px', borderTop: '1px solid var(--border)',
  },
  selecteur: { display: 'flex', gap: 6 },
  // borderWidth / borderStyle / borderColor : la position active surcharge
  // borderColor, la base ne peut donc pas être écrite en raccourci `border`.
  position: {
    flex: '1 1 0', minWidth: 0, minHeight: 48, padding: '8px 6px', borderRadius: 10, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    fontSize: 13, fontWeight: 700, fontFamily: 'var(--font)',
    borderWidth: 2, borderStyle: 'solid', borderColor: 'var(--border)',
    background: 'var(--bg)', color: 'var(--text2)',
  },
  pastilleEtat: { width: 9, height: 9, borderRadius: 5, flexShrink: 0 },
  trace: { fontSize: 12, color: 'var(--text2)', marginTop: 6, minHeight: 16 },
  rubrique: {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
    color: 'var(--text3)', marginBottom: 6,
  },
  texte: { fontSize: 14, color: 'var(--text)', lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  vide: { fontSize: 13, color: 'var(--text2)', fontStyle: 'italic' },
  allergene: {
    padding: '5px 11px', borderRadius: 16, fontSize: 13, fontWeight: 700,
    background: 'var(--danger-bg)', color: 'var(--danger-text)', border: '1px solid var(--danger-bd)',
  },
  encart: { padding: '10px 12px', borderRadius: 8, fontSize: 13, lineHeight: 1.5 },
  encartDanger: { background: 'var(--danger-bg-soft)', border: '1px solid var(--danger-bd)', color: 'var(--danger-text)' },
  encartAttention: { background: 'var(--warning-bg-soft)', border: '1px solid var(--warning-bd)', color: 'var(--warning-text)' },
  menu: {
    padding: '14px 16px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)',
    display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'center',
  },
  menuSection: {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
    color: 'var(--text3)', marginBottom: 4,
  },
  menuPlat: { fontSize: 15, fontFamily: 'var(--font-serif)', color: 'var(--text)', lineHeight: 1.35 },
  menuMention: { fontSize: 12, fontFamily: 'var(--font)', color: 'var(--text2)' },
  menuNote: { fontSize: 12, color: 'var(--text2)', fontStyle: 'italic', lineHeight: 1.4 },
  tableau: { border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' },
  ligneCourse: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    padding: '9px 12px', fontSize: 14, color: 'var(--text)', background: 'var(--surface)',
  },
  ligneCourseAlt: { background: 'var(--bg)' },
  quantite: { flexShrink: 0, fontFamily: 'var(--font-serif)', fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap' },
  bouton: {
    flex: '1 1 auto', minHeight: 44, padding: '9px 14px', borderRadius: 8, cursor: 'pointer',
    fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)',
    background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)',
  },
  boutonPrincipal: { background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)' },
  boutonDanger: { background: 'var(--danger-bg-soft)', color: 'var(--danger-text)', border: '1px solid var(--danger-bd)' },
};
