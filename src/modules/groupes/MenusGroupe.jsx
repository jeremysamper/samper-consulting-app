import { useMemo, useState } from 'react';
import { notify } from '../../components/toast/index.js';
import { SegmentedTabs } from '../../components/ui/index.jsx';
import { pdfUtils } from '../../services/pdf.js';
import { payloadMenuSeul } from './pdfGroupe.js';
import {
  NUMEROS_MENU, SECTIONS_MENU, TYPES_GROUPE, lignesParSection, metaType, sectionParDefaut,
} from './typesGroupe.js';

// ─────────────────────────────────────────────────────────────────────────────
// Menus prédéfinis : cinq numéros pour chacun des cinq types de groupe.
//
// Un menu se compose à partir des plats de l'établissement (Cartes &
// Recettes). C'est ce lien qui permet ensuite de calculer la liste de courses
// d'un groupe : un plat saisi en texte libre s'imprime très bien sur le menu,
// mais ne peut pas être chiffré - l'éditeur le signale ligne par ligne.
//
// « Par personne » vaut 1 pour un plat servi à l'assiette. Il sert surtout à
// l'apéro dînatoire : 3 pièces par personne, c'est trois fois la fiche.
// ─────────────────────────────────────────────────────────────────────────────

export default function MenusGroupe({
  menuDe, menusStatus = 'ready', enregistrer, plats, platsStatus, etablissement,
  canEditMenus = false, voirPrix = false,
}) {
  const [typeActif, setTypeActif] = useState(TYPES_GROUPE[0].id);
  const [enEdition, setEnEdition] = useState(null); // { typeGroupe, numero }

  function imprimer(numero) {
    const menu = menuDe(typeActif, numero);
    const { payload, filename } = payloadMenuSeul({ typeGroupe: typeActif, numero, menu });
    pdfUtils.exportGroupeMenuPdf(payload, { etablissement, filename }).catch(() => {});
  }

  return (
    <div>
      <SegmentedTabs
        tabs={TYPES_GROUPE.map((t) => ({ id: t.id, label: t.label }))}
        active={typeActif}
        onChange={setTypeActif}
        style={{ marginBottom: 14 }}
      />

      {/* Tant que les menus ne sont pas LUS, on n'affiche ni « À composer » ni
          bouton « Composer » : l'enregistrement est un upsert, ouvrir un éditeur
          vide sur un menu qui existe en base l'écraserait. */}
      {menusStatus !== 'ready' && (
        <div style={st.vide}>
          {menusStatus === 'error' ? 'Menus indisponibles pour le moment (connexion ?).' : 'Chargement des menus…'}
        </div>
      )}

      {menusStatus === 'ready' && (
      <div style={st.grille}>
        {NUMEROS_MENU.map((numero) => {
          const menu = menuDe(typeActif, numero);
          const sections = lignesParSection(menu?.lignes || []);
          return (
            <div key={numero} style={st.carte}>
              <div style={st.carteEntete}>
                <div style={{ minWidth: 0 }}>
                  <div style={st.carteTitre}>Menu n°{numero}</div>
                  {menu?.nom && <div style={st.carteNom}>{menu.nom}</div>}
                </div>
                {voirPrix && menu?.prixPax != null && (
                  <div style={st.prix}>{menu.prixPax} CHF<span style={st.prixUnite}> / pers.</span></div>
                )}
              </div>

              <div style={st.carteCorps}>
                {!sections.length && <div style={st.vide}>À composer.</div>}
                {sections.map((sec) => (
                  <div key={sec.id}>
                    <div style={st.section}>{sec.label}</div>
                    {sec.lignes.map((l) => <div key={l.id} style={st.plat}>{l.libelle}</div>)}
                  </div>
                ))}
              </div>

              <div style={st.carteActions}>
                {canEditMenus && (
                  <button
                    type="button"
                    onClick={() => setEnEdition({ typeGroupe: typeActif, numero })}
                    style={{ ...st.bouton, ...st.boutonPrincipal }}
                  >
                    {sections.length ? 'Modifier' : 'Composer'}
                  </button>
                )}
                {sections.length > 0 && (
                  <button type="button" onClick={() => imprimer(numero)} style={st.bouton}>PDF</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      )}

      {enEdition && menusStatus === 'ready' && (
        <EditeurMenu
          typeGroupe={enEdition.typeGroupe}
          numero={enEdition.numero}
          menu={menuDe(enEdition.typeGroupe, enEdition.numero)}
          plats={plats}
          platsStatus={platsStatus}
          voirPrix={voirPrix}
          onSave={enregistrer}
          onClose={() => setEnEdition(null)}
        />
      )}
    </div>
  );
}

let compteurLigne = 0;
const nouvelleLigne = (typeGroupe, section) => ({
  id: `l-${Date.now()}-${compteurLigne++}`,
  section: section || sectionParDefaut(typeGroupe),
  platId: '',
  libelle: '',
  description: '',
  parPersonne: '1',
});

function EditeurMenu({ typeGroupe, numero, menu, plats, platsStatus, voirPrix, onSave, onClose }) {
  const [nom, setNom] = useState(menu?.nom || '');
  const [prixPax, setPrixPax] = useState(menu?.prixPax != null ? String(menu.prixPax) : '');
  const [description, setDescription] = useState(menu?.description || '');
  const [lignes, setLignes] = useState(() => (
    (menu?.lignes || []).length
      ? menu.lignes.map((l) => ({
        ...l, platId: l.platId || '', parPersonne: String(l.parPersonne ?? 1),
      }))
      : [nouvelleLigne(typeGroupe)]
  ));
  const [enCours, setEnCours] = useState(false);

  // Plats rangés par catégorie pour le sélecteur natif (le plus rapide au doigt
  // sur iPad, et il reste utilisable avec deux cents plats).
  const platsParCategorie = useMemo(() => {
    const map = new Map();
    (plats || []).filter((p) => p.actif !== false).forEach((p) => {
      const c = p.categorie || 'Plats';
      if (!map.has(c)) map.set(c, []);
      map.get(c).push(p);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'));
  }, [plats]);
  const platById = useMemo(() => new Map((plats || []).map((p) => [p.id, p])), [plats]);

  const majLigne = (id, patch) => setLignes((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  function choisirPlat(ligne, platId) {
    const plat = platById.get(platId);
    const ancien = platById.get(ligne.platId);
    // Le libellé suit le plat tant qu'il n'a pas été réécrit à la main.
    const libelleLibre = ligne.libelle && ligne.libelle !== ancien?.nom;
    majLigne(ligne.id, { platId, libelle: libelleLibre ? ligne.libelle : (plat?.nom || '') });
  }

  function deplacer(index, delta) {
    setLignes((ls) => {
      const cible = index + delta;
      if (cible < 0 || cible >= ls.length) return ls;
      const copie = ls.slice();
      [copie[index], copie[cible]] = [copie[cible], copie[index]];
      return copie;
    });
  }

  async function enregistrer() {
    const utiles = lignes.filter((l) => String(l.libelle || '').trim() || l.platId);
    setEnCours(true);
    try {
      const { error } = await onSave({
        typeGroupe, numero, nom, description,
        prixPax: prixPax === '' ? null : Number(String(prixPax).replace(',', '.')),
        lignes: utiles.map((l) => ({
          ...l,
          libelle: String(l.libelle || '').trim() || platById.get(l.platId)?.nom || '',
          parPersonne: Number(String(l.parPersonne).replace(',', '.')) || 1,
        })),
      });
      if (error) { notify(error, 'error'); return; }
      notify(`Menu ${metaType(typeGroupe).label.toLowerCase()} n°${numero} enregistré.`, 'success');
      onClose();
    } finally {
      setEnCours(false);
    }
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
          background: 'var(--surface)', width: 680, maxWidth: '100%', maxHeight: '92vh',
          borderRadius: 14, display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={st.entete}>
          <div style={st.titre}>{metaType(typeGroupe).label} · Menu n°{numero}</div>
          <button type="button" onClick={onClose} aria-label="Fermer" style={st.fermer}>×</button>
        </div>

        <div style={st.corps}>
        <div style={st.colonne}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ flex: '2 1 240px', minWidth: 0 }}>
              <label style={st.label} htmlFor="menu-nom">Intitulé du menu</label>
              <input
                id="menu-nom" type="text" value={nom} onChange={(e) => setNom(e.target.value)}
                placeholder="Facultatif : Menu Prestige, Menu du terroir…"
                style={{ ...st.champ, minHeight: 44 }}
              />
            </div>
            {voirPrix && (
              <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                <label style={st.label} htmlFor="menu-prix">Prix par personne (CHF)</label>
                <input
                  id="menu-prix" type="text" inputMode="decimal" value={prixPax}
                  onChange={(e) => setPrixPax(e.target.value.replace(/[^0-9.,]/g, ''))}
                  placeholder="Facultatif"
                  style={{ ...st.champ, minHeight: 44 }}
                />
              </div>
            )}
          </div>

          <div>
            <label style={st.label} htmlFor="menu-description">Présentation</label>
            <textarea
              id="menu-description" value={description} rows={2}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Facultatif : une ligne d'accroche, imprimée sous l'intitulé."
              style={{ ...st.champ, resize: 'vertical' }}
            />
          </div>

          <div>
            <span style={st.label}>Composition</span>
            {platsStatus === 'loading' && <div style={st.vide}>Chargement des plats…</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {lignes.map((l, index) => {
                const sansFiche = !l.platId || !(platById.get(l.platId)?.recettes || []).length;
                return (
                  <div key={l.id} style={st.ligne}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      <select
                        value={l.section} aria-label="Service"
                        onChange={(e) => majLigne(l.id, { section: e.target.value })}
                        style={{ ...st.champ, flex: '1 1 150px', minHeight: 44 }}
                      >
                        {SECTIONS_MENU.map((sec) => <option key={sec.id} value={sec.id}>{sec.label}</option>)}
                      </select>
                      <select
                        value={l.platId} aria-label="Plat de la carte"
                        onChange={(e) => choisirPlat(l, e.target.value)}
                        style={{ ...st.champ, flex: '2 1 220px', minHeight: 44 }}
                      >
                        <option value="">Plat hors carte (texte libre)</option>
                        {platsParCategorie.map(([categorie, liste]) => (
                          <optgroup key={categorie} label={categorie}>
                            {liste.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    <input
                      type="text" value={l.libelle} aria-label="Intitulé sur le menu"
                      onChange={(e) => majLigne(l.id, { libelle: e.target.value })}
                      placeholder="Intitulé imprimé sur le menu"
                      style={{ ...st.champ, minHeight: 44 }}
                    />
                    <input
                      type="text" value={l.description} aria-label="Précision"
                      onChange={(e) => majLigne(l.id, { description: e.target.value })}
                      placeholder="Précision facultative : garniture, jus, origine…"
                      style={{ ...st.champ, minHeight: 44 }}
                    />

                    <div style={st.ligneBas}>
                      <label style={st.parPersonne}>
                        <input
                          type="text" inputMode="decimal" value={l.parPersonne}
                          aria-label="Quantité par personne"
                          onChange={(e) => majLigne(l.id, { parPersonne: e.target.value.replace(/[^0-9.,]/g, '') })}
                          style={{ ...st.champ, width: 64, minHeight: 44, textAlign: 'center' }}
                        />
                        <span>par personne</span>
                      </label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" onClick={() => deplacer(index, -1)} disabled={index === 0} aria-label="Monter" style={st.icone}>↑</button>
                        <button type="button" onClick={() => deplacer(index, 1)} disabled={index === lignes.length - 1} aria-label="Descendre" style={st.icone}>↓</button>
                        <button
                          type="button" aria-label="Retirer la ligne"
                          onClick={() => setLignes((ls) => ls.filter((x) => x.id !== l.id))}
                          style={{ ...st.icone, color: 'var(--danger-text)' }}
                        >
                          ×
                        </button>
                      </div>
                    </div>

                    {sansFiche && (l.libelle || l.platId) && (
                      <div style={st.avis}>
                        {l.platId
                          ? "Ce plat n'a pas de fiche technique : il ne sera pas compté dans la liste de courses."
                          : 'Texte libre : imprimé sur le menu, mais pas compté dans la liste de courses.'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setLignes((ls) => [...ls, nouvelleLigne(typeGroupe, ls[ls.length - 1]?.section)])}
              style={{ ...st.bouton, marginTop: 10, width: '100%' }}
            >
              + Ajouter un plat
            </button>
          </div>
        </div>
        </div>

        <div style={st.pied}>
          <button type="button" onClick={onClose} disabled={enCours} style={st.bouton}>Annuler</button>
          <button
            type="button" onClick={enregistrer} disabled={enCours}
            style={{ ...st.bouton, ...st.boutonPrincipal, opacity: enCours ? 0.6 : 1 }}
          >
            {enCours ? 'Enregistrement…' : 'Enregistrer le menu'}
          </button>
        </div>
      </div>
    </div>
  );
}

const st = {
  grille: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 },
  carte: {
    display: 'flex', flexDirection: 'column', minWidth: 0,
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--r)', boxShadow: 'var(--sh-xs)', overflow: 'hidden',
  },
  carteEntete: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8,
    padding: '12px 14px', borderBottom: '1px solid var(--border)',
  },
  carteTitre: { fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' },
  carteNom: { fontSize: 12, color: 'var(--text2)', marginTop: 2, overflowWrap: 'anywhere' },
  prix: { flexShrink: 0, fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--accent)', whiteSpace: 'nowrap' },
  prixUnite: { fontSize: 11, fontWeight: 500, fontFamily: 'var(--font)', color: 'var(--text2)' },
  carteCorps: { flex: '1 1 auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 },
  carteActions: { display: 'flex', gap: 8, padding: '0 14px 14px' },
  section: {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
    color: 'var(--text3)', marginBottom: 2,
  },
  plat: { fontSize: 13, fontFamily: 'var(--font-serif)', color: 'var(--text)', lineHeight: 1.4, overflowWrap: 'anywhere' },
  vide: { fontSize: 13, color: 'var(--text2)', fontStyle: 'italic' },
  entete: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0,
  },
  titre: { fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-serif)', color: 'var(--text)' },
  fermer: {
    background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', flexShrink: 0,
    color: 'var(--text2)', padding: 4, lineHeight: 1, minWidth: 44,
  },
  // Bloc scrollable ; la colonne flex vit à l'intérieur (st.colonne). Poser le
  // flex ici ferait rétrécir les enfants à overflow non visible (onglets,
  // tableaux arrondis) dès que la modale atteint sa hauteur maximale.
  corps: { flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '18px 20px' },
  colonne: { display: 'flex', flexDirection: 'column', gap: 16 },
  pied: {
    display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0,
    padding: '14px 20px', borderTop: '1px solid var(--border)',
  },
  label: { display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 6 },
  champ: {
    width: '100%', padding: '9px 12px', boxSizing: 'border-box',
    border: '1px solid var(--border)', borderRadius: 8,
    background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 14,
  },
  ligne: {
    display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0,
    padding: 12, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)',
  },
  ligneBas: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  parPersonne: { display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)' },
  icone: {
    width: 44, minHeight: 44, flexShrink: 0, borderRadius: 8, cursor: 'pointer',
    border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
    fontSize: 17, fontFamily: 'var(--font)', lineHeight: 1,
  },
  avis: { fontSize: 12, color: 'var(--warning-text)', lineHeight: 1.45 },
  bouton: {
    flex: '1 1 auto', minHeight: 44, padding: '9px 14px', borderRadius: 8, cursor: 'pointer',
    fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)',
    background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)',
  },
  boutonPrincipal: { background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)' },
};
