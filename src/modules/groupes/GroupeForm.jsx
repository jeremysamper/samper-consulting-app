import { useState } from 'react';
import { notify } from '../../components/toast/index.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { ALLERGENES, sortAllergenes } from '../../utils/allergenes.js';
import { zurichToday } from '../../utils/zurichTime.js';
import { dateComplete } from './pdfGroupe.js';
import { NUMEROS_MENU, TYPES_GROUPE, lignesParSection, metaType } from './typesGroupe.js';

// ─────────────────────────────────────────────────────────────────────────────
// Prise de réservation d'un groupe. Pensée pour le patron au téléphone : six
// gestes dans l'ordre où le client donne ses informations - la date, le type,
// le menu, combien ils sont, ce qu'ils ne mangent pas, le reste.
//
// Tout ce qui se choisit se tape (type, menu, allergènes) ; on ne saisit au
// clavier que le nom, le nombre et les textes libres.
//
// Le menu peut rester « à définir » : un mariage se réserve bien avant que le
// menu soit arrêté, et bloquer la saisie ferait noter le groupe sur un papier.
//
// Allergènes : uniquement des ids du référentiel partagé. Toute nuance
// (« 2 végétariens », « cœliaque strict ») va dans la précision en texte libre.
// ─────────────────────────────────────────────────────────────────────────────

function etatInitial(groupe, dateInitiale) {
  if (groupe) {
    return {
      dateEvenement: groupe.dateEvenement,
      heure: groupe.heure || '',
      typeGroupe: groupe.typeGroupe,
      menuNumero: groupe.menuNumero || null,
      nom: groupe.nom || '',
      contact: groupe.contact || '',
      nbPax: String(groupe.nbPax || ''),
      allergenesIds: groupe.allergenesIds || [],
      allergiesNote: groupe.allergiesNote || '',
      modifications: groupe.modifications || '',
      commentaires: groupe.commentaires || '',
    };
  }
  return {
    dateEvenement: dateInitiale || zurichToday(),
    heure: '',
    typeGroupe: 'mariage',
    menuNumero: null,
    nom: '',
    contact: '',
    nbPax: '',
    allergenesIds: [],
    allergiesNote: '',
    modifications: '',
    commentaires: '',
  };
}

function valider(form) {
  const erreurs = [];
  const pax = Number(form.nbPax);
  if (!form.nom.trim()) erreurs.push('Le nom du client ou du groupe est obligatoire.');
  if (!form.dateEvenement) erreurs.push('La date est obligatoire.');
  if (!Number.isInteger(pax) || pax < 1 || pax > 5000) erreurs.push('Indique le nombre de personnes.');
  return erreurs;
}

export default function GroupeForm({
  groupe = null, dateInitiale = null, menuDe, menusStatus = 'ready', voirPrix = false, onSave, onClose,
}) {
  const isMobile = useIsMobile();
  const [form, setForm] = useState(() => etatInitial(groupe, dateInitiale));
  const [enCours, setEnCours] = useState(false);
  const set = (cle, valeur) => setForm((p) => ({ ...p, [cle]: valeur }));

  const menuChoisi = form.menuNumero ? menuDe?.(form.typeGroupe, form.menuNumero) : null;
  const sections = lignesParSection(menuChoisi?.lignes || []);
  // Modifier le contenu d'un groupe déjà lu le repasse en rouge (trigger en
  // base) : on le dit avant l'enregistrement, pas après.
  const repasseraARelire = !!groupe && groupe.statut !== 'a_lire';

  function basculerAllergene(id) {
    setForm((p) => ({
      ...p,
      allergenesIds: p.allergenesIds.includes(id)
        ? p.allergenesIds.filter((a) => a !== id)
        : [...p.allergenesIds, id],
    }));
  }

  function ajusterPax(delta) {
    setForm((p) => {
      const suivant = Math.max(1, Math.min(5000, (Number(p.nbPax) || 0) + delta));
      return { ...p, nbPax: String(suivant) };
    });
  }

  async function enregistrer() {
    const erreurs = valider(form);
    if (erreurs.length) { erreurs.forEach((e) => notify(e, 'error')); return; }
    setEnCours(true);
    try {
      const { error } = await onSave({
        ...form,
        nbPax: Number(form.nbPax),
        allergenesIds: sortAllergenes(form.allergenesIds),
      });
      if (error) { notify(error, 'error'); return; }
      notify(groupe ? 'Groupe modifié.' : 'Groupe enregistré.', 'success');
      onClose();
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div
      className="modal-sheet-overlay"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="modal-sheet"
        style={{
          background: 'var(--surface)', width: 560, maxWidth: '100%', maxHeight: '90vh',
          borderRadius: 14, display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={st.entete}>
          <div style={st.titre}>{groupe ? 'Modifier le groupe' : 'Nouveau groupe'}</div>
          <button type="button" onClick={onClose} aria-label="Fermer" style={st.fermer}>×</button>
        </div>

        <div style={st.corps}>
        <div style={st.colonne}>
          {repasseraARelire && (
            <div style={st.avertissement}>
              Ce groupe a déjà été lu par la brigade. Si tu changes la date, le menu, le nombre de
              personnes, les allergies ou les remarques, il repassera en rouge pour être relu.
            </div>
          )}

          {/* 1. Quand */}
          <div>
            <label style={st.label} htmlFor="groupe-date">Date</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <input
                id="groupe-date" type="date" value={form.dateEvenement}
                onChange={(e) => e.target.value && set('dateEvenement', e.target.value)}
                style={{ ...st.champ, flex: '1 1 200px', minHeight: 44 }}
              />
              <input
                type="time" value={form.heure} aria-label="Heure d'arrivée"
                onChange={(e) => set('heure', e.target.value)}
                style={{ ...st.champ, flex: '1 1 200px', minHeight: 44 }}
              />
            </div>
            <div style={st.aide}>{dateComplete(form.dateEvenement)}{form.heure ? ` · ${form.heure}` : " · heure facultative"}</div>
          </div>

          {/* 2. Type de groupe */}
          <div>
            <span style={st.label}>Type de groupe</span>
            <div style={st.rangee}>
              {TYPES_GROUPE.map((t) => {
                const actif = form.typeGroupe === t.id;
                return (
                  <button
                    key={t.id} type="button" aria-pressed={actif}
                    onClick={() => set('typeGroupe', t.id)}
                    style={{ ...st.choix, ...(actif ? st.choixActif : null) }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Menu */}
          <div>
            <span style={st.label}>Menu {metaType(form.typeGroupe).label.toLowerCase()}</span>
            <div style={st.rangee}>
              {NUMEROS_MENU.map((n) => {
                const actif = form.menuNumero === n;
                const menu = menuDe?.(form.typeGroupe, n);
                return (
                  <button
                    key={n} type="button" aria-pressed={actif}
                    onClick={() => set('menuNumero', actif ? null : n)}
                    style={{ ...st.choix, ...st.choixMenu, ...(actif ? st.choixActif : null) }}
                  >
                    <span style={{ fontSize: 15, fontFamily: 'var(--font-serif)' }}>n°{n}</span>
                    {menu?.nom ? <span style={st.choixSousTitre}>{menu.nom}</span> : null}
                    {voirPrix && menu?.prixPax != null
                      ? <span style={st.choixSousTitre}>{menu.prixPax} CHF / pers.</span>
                      : null}
                  </button>
                );
              })}
            </div>
            <div style={st.aide}>
              {!form.menuNumero && 'Menu à définir : tu pourras le choisir plus tard.'}
              {form.menuNumero && !sections.length && menusStatus === 'ready'
                && "Ce menu n'a pas encore été composé (onglet Menus)."}
            </div>
            {sections.length > 0 && (
              <div style={st.apercu}>
                {sections.map((sec) => (
                  <div key={sec.id} style={{ minWidth: 0 }}>
                    <div style={st.apercuSection}>{sec.label}</div>
                    {sec.lignes.map((l) => (
                      <div key={l.id} style={st.apercuLigne}>{l.libelle}</div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 4. Qui et combien */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ flex: '2 1 220px', minWidth: 0 }}>
              <label style={st.label} htmlFor="groupe-nom">Client ou nom du groupe</label>
              <input
                id="groupe-nom" type="text" value={form.nom} autoComplete="off"
                onChange={(e) => set('nom', e.target.value)}
                placeholder="Famille Dupont, Société Alpina…"
                style={{ ...st.champ, minHeight: 44 }}
              />
            </div>
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <label style={st.label} htmlFor="groupe-pax">Nombre de personnes</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={() => ajusterPax(-1)} aria-label="Une personne de moins" style={st.pas}>−</button>
                <input
                  id="groupe-pax" type="text" inputMode="numeric" pattern="[0-9]*"
                  value={form.nbPax} placeholder="0"
                  onChange={(e) => set('nbPax', e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                  style={{ ...st.champ, minHeight: 44, textAlign: 'center', fontSize: 16, fontWeight: 700, flex: '1 1 0', minWidth: 0 }}
                />
                <button type="button" onClick={() => ajusterPax(1)} aria-label="Une personne de plus" style={st.pas}>+</button>
              </div>
            </div>
          </div>

          <div>
            <label style={st.label} htmlFor="groupe-contact">Contact (téléphone ou e-mail)</label>
            <input
              id="groupe-contact" type="text" value={form.contact} autoComplete="off"
              onChange={(e) => set('contact', e.target.value)}
              placeholder="Facultatif"
              style={{ ...st.champ, minHeight: 44 }}
            />
          </div>

          {/* 5. Allergies */}
          <div>
            <span style={st.label}>Allergies</span>
            <div style={st.rangee}>
              {ALLERGENES.map((a) => {
                const actif = form.allergenesIds.includes(a.id);
                return (
                  <button
                    key={a.id} type="button" aria-pressed={actif}
                    onClick={() => basculerAllergene(a.id)}
                    style={{ ...st.pastille, ...(actif ? st.pastilleActive : null) }}
                  >
                    {a.label}
                  </button>
                );
              })}
            </div>
            <textarea
              value={form.allergiesNote} rows={2}
              onChange={(e) => set('allergiesNote', e.target.value)}
              placeholder="Précisions : combien de personnes, régimes (végétarien, sans porc, cœliaque strict…)"
              style={{ ...st.champ, marginTop: 8, resize: 'vertical' }}
            />
          </div>

          {/* 6. Le reste */}
          <div>
            <label style={st.label} htmlFor="groupe-modifs">Modifications du menu</label>
            <textarea
              id="groupe-modifs" value={form.modifications} rows={2}
              onChange={(e) => set('modifications', e.target.value)}
              placeholder="Ce qui change par rapport au menu prévu : dessert remplacé par une pièce montée…"
              style={{ ...st.champ, resize: 'vertical' }}
            />
          </div>

          <div>
            <label style={st.label} htmlFor="groupe-commentaires">Commentaires</label>
            <textarea
              id="groupe-commentaires" value={form.commentaires} rows={3}
              onChange={(e) => set('commentaires', e.target.value)}
              placeholder="Déroulé, horaires de service, salle, boissons, tout ce que la brigade doit savoir."
              style={{ ...st.champ, resize: 'vertical' }}
            />
          </div>
        </div>
        </div>

        <div style={{ ...st.pied, flexDirection: isMobile ? 'column-reverse' : 'row' }}>
          <button type="button" onClick={onClose} disabled={enCours} style={st.secondaire}>Annuler</button>
          <button type="button" onClick={enregistrer} disabled={enCours} style={{ ...st.principal, opacity: enCours ? 0.6 : 1 }}>
            {enCours ? 'Enregistrement…' : (groupe ? 'Enregistrer les modifications' : 'Enregistrer le groupe')}
          </button>
        </div>
      </div>
    </div>
  );
}

const st = {
  entete: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0,
  },
  titre: { fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-serif)', color: 'var(--text)' },
  fermer: {
    background: 'none', border: 'none', fontSize: 22, cursor: 'pointer',
    color: 'var(--text2)', padding: 4, lineHeight: 1, minWidth: 44,
  },
  // Bloc scrollable ; la colonne flex vit à l'intérieur (st.colonne). Poser le
  // flex ici ferait rétrécir les enfants à overflow non visible (onglets,
  // tableaux arrondis) dès que la modale atteint sa hauteur maximale.
  corps: { flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '18px 20px' },
  colonne: { display: 'flex', flexDirection: 'column', gap: 18 },
  pied: {
    display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0,
    padding: '14px 20px', borderTop: '1px solid var(--border)',
  },
  label: { display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 6 },
  aide: { fontSize: 12, color: 'var(--text2)', marginTop: 6, minHeight: 16 },
  champ: {
    width: '100%', padding: '9px 12px', boxSizing: 'border-box',
    border: '1px solid var(--border)', borderRadius: 8,
    background: 'var(--bg)', color: 'var(--text)',
    fontFamily: 'var(--font)', fontSize: 14,
  },
  rangee: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  // Base en borderWidth / borderStyle / borderColor : l'état actif surcharge
  // borderColor, et React avertit à chaque bascule si la base est en raccourci.
  choix: {
    flex: '1 1 auto', minHeight: 44, padding: '9px 14px', borderRadius: 8, cursor: 'pointer',
    fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
    background: 'var(--bg)', color: 'var(--text)',
  },
  choixMenu: {
    flex: '1 1 84px', display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: 2, padding: '8px 6px', minWidth: 0,
  },
  choixActif: { borderColor: 'var(--accent)', background: 'var(--accent)', color: '#fff' },
  choixSousTitre: {
    fontSize: 11, fontWeight: 500, opacity: 0.85, maxWidth: '100%',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  pastille: {
    minHeight: 44, padding: '8px 12px', borderRadius: 22, cursor: 'pointer',
    fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
    background: 'var(--bg)', color: 'var(--text)',
  },
  pastilleActive: {
    borderColor: 'var(--danger-bd)', background: 'var(--danger-bg)', color: 'var(--danger-text)',
  },
  pas: {
    width: 44, minHeight: 44, flexShrink: 0, borderRadius: 8, cursor: 'pointer',
    border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
    fontSize: 20, fontFamily: 'var(--font)', lineHeight: 1,
  },
  apercu: {
    marginTop: 8, padding: '10px 12px', borderRadius: 8,
    background: 'var(--bg)', border: '1px solid var(--border)',
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10,
  },
  apercuSection: {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
    color: 'var(--text3)', marginBottom: 2,
  },
  apercuLigne: { fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font-serif)', lineHeight: 1.35 },
  avertissement: {
    padding: '10px 12px', borderRadius: 8, fontSize: 12, lineHeight: 1.5,
    background: 'var(--warning-bg-soft)', border: '1px solid var(--warning-bd)', color: 'var(--warning-text)',
  },
  principal: {
    minHeight: 44, padding: '10px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
    background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font)',
  },
  secondaire: {
    minHeight: 44, padding: '10px 18px', borderRadius: 8, cursor: 'pointer',
    background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)',
    fontSize: 14, fontWeight: 600, fontFamily: 'var(--font)',
  },
};
