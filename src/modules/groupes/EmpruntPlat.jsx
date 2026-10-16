import { useMemo, useState } from 'react';
import { makeSearchMatcher } from '../../utils/searchText.js';
import {
  labelRegime, libelleFenetre, ligneServieLe, metaSaison, saisonDeDate,
} from './choixMenu.js';
import { NUMERO_COMPLEMENTS, TYPES_GROUPE, metaType, plurielSection } from './typesGroupe.js';

// ─────────────────────────────────────────────────────────────────────────────
// Prendre un plat dans un autre menu, à titre exceptionnel : une entrée du
// menu à 119 pour un mariage à 95, le plat d'un séminaire pour un groupe.
//
// On ne propose que ce qui est servi à la date du groupe : la saison et les
// fenêtres courtes (« de mai à juin ») s'appliquent aussi aux emprunts. Par
// défaut la même rubrique (une entrée pour une entrée), avec un interrupteur
// pour élargir. Le supplément par personne se saisit à la main : il s'ajoute
// au prix du menu dans le récapitulatif. Sans accès aux prix (cuisinier), il
// reste à zéro et se règle avec le patron.
// ─────────────────────────────────────────────────────────────────────────────

export default function EmpruntPlat({
  menus, exclure, section, dateISO, voirPrix = false, onChoisir, onClose,
}) {
  const [recherche, setRecherche] = useState('');
  const [toutes, setToutes] = useState(false);
  const [choisi, setChoisi] = useState(null); // { menu, ligne }
  const [supplement, setSupplement] = useState('');
  const saison = saisonDeDate(dateISO);

  const blocs = useMemo(() => {
    const match = makeSearchMatcher(recherche);
    const ordreType = (t) => TYPES_GROUPE.findIndex((x) => x.id === t);
    return (menus || [])
      .filter((m) => m.numero !== NUMERO_COMPLEMENTS)
      .filter((m) => !(m.typeGroupe === exclure?.typeGroupe && m.numero === Number(exclure?.numero)))
      .sort((a, b) => ordreType(a.typeGroupe) - ordreType(b.typeGroupe) || a.numero - b.numero)
      .map((m) => ({
        menu: m,
        lignes: (m.lignes || []).filter((l) => (toutes || l.section === section)
          && ligneServieLe(l, dateISO)
          && match(l.libelle, l.description, l.rubrique)),
      }))
      .filter((b) => b.lignes.length);
  }, [menus, exclure, section, dateISO, toutes, recherche]);

  function valider() {
    if (!choisi) return;
    const n = Number(String(supplement).replace(',', '.'));
    onChoisir({
      source: { typeGroupe: choisi.menu.typeGroupe, numero: choisi.menu.numero, ligneId: choisi.ligne.id },
      ligne: choisi.ligne,
      supplement: Number.isFinite(n) ? n : 0,
    });
  }

  return (
    <div
      className="modal-full-overlay"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1100, padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="modal-full"
        style={{
          background: 'var(--surface)', width: 620, maxWidth: '100%', maxHeight: '90vh',
          borderRadius: 14, display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={st.entete}>
          <div style={{ minWidth: 0 }}>
            <div style={st.titre}>Prendre dans un autre menu</div>
            <div style={st.sousTitre}>
              {plurielSection(section)}, servis {saison ? `en ${metaSaison(saison).label.toLowerCase()}` : ''} à la date du groupe
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="ui-fermer" style={st.fermer}>×</button>
        </div>

        <div style={st.corps}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)}
              placeholder="Chercher un plat : truite, morilles, burrata"
              aria-label="Chercher un plat"
              style={{ ...st.champ, minHeight: 44 }}
            />
            <label style={st.bascule}>
              <input type="checkbox" checked={toutes} onChange={(e) => setToutes(e.target.checked)} style={st.case} />
              <span>Toutes les rubriques, pas seulement {plurielSection(section).toLowerCase()}</span>
            </label>

            {!blocs.length && <div style={st.vide}>Aucun plat servi à cette date ne correspond.</div>}

            {blocs.map((b) => (
              <div key={b.menu.id}>
                <div style={st.menuTitre}>
                  {metaType(b.menu.typeGroupe).label}, menu n°{b.menu.numero}
                  {b.menu.nom ? `, ${b.menu.nom}` : ''}
                  {voirPrix && b.menu.prixPax != null ? `, ${b.menu.prixPax} CHF` : ''}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {b.lignes.map((l) => {
                    const actif = choisi?.ligne.id === l.id && choisi?.menu.id === b.menu.id;
                    const details = [
                      toutes ? plurielSection(l.section) : '',
                      labelRegime(l.regime).toLowerCase(),
                      libelleFenetre(l),
                    ].filter(Boolean).join(', ');
                    return (
                      <button
                        key={l.id} type="button" aria-pressed={actif}
                        onClick={() => setChoisi({ menu: b.menu, ligne: l })}
                        style={{ ...st.option, ...(actif ? st.optionActive : null) }}
                      >
                        <span style={{ display: 'block', fontFamily: 'var(--font-serif)', fontSize: 14, lineHeight: 1.35 }}>{l.libelle}</span>
                        {details && <span style={st.detail}>{details}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={st.pied}>
          {choisi && (
            <div style={{ flex: '1 1 100%', fontSize: 13, color: 'var(--text2)' }}>
              Retenu : <span style={{ color: 'var(--text)' }}>{choisi.ligne.libelle}</span>
            </div>
          )}
          {voirPrix ? (
            <label style={{ ...st.supplement, flex: '1 1 220px' }}>
              <span>Supplément par personne (CHF)</span>
              <input
                type="text" inputMode="decimal" value={supplement}
                onChange={(e) => setSupplement(e.target.value.replace(/[^0-9.,-]/g, ''))}
                placeholder="0"
                style={{ ...st.champ, width: 90, minHeight: 44, textAlign: 'center' }}
              />
            </label>
          ) : (
            <div style={{ flex: '1 1 220px', fontSize: 12, color: 'var(--text2)' }}>
              Le supplément éventuel se règle avec le patron.
            </div>
          )}
          <button type="button" onClick={onClose} style={st.bouton}>Annuler</button>
          <button
            type="button" onClick={valider} disabled={!choisi}
            style={{ ...st.bouton, ...st.boutonPrincipal, opacity: choisi ? 1 : 0.5 }}
          >
            Ajouter ce plat
          </button>
        </div>
      </div>
    </div>
  );
}

const st = {
  entete: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
    padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0,
  },
  titre: { fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-serif)', color: 'var(--text)' },
  sousTitre: { fontSize: 12, color: 'var(--text2)', marginTop: 3 },
  fermer: {
    background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', flexShrink: 0,
    color: 'var(--text2)', padding: 4, lineHeight: 1, minWidth: 44,
  },
  corps: { flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '14px 20px' },
  pied: {
    display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, flexShrink: 0,
    padding: '12px 20px', borderTop: '1px solid var(--border)',
  },
  champ: {
    width: '100%', padding: '9px 12px', boxSizing: 'border-box',
    border: '1px solid var(--border)', borderRadius: 8,
    background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 14,
  },
  bascule: { display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, fontSize: 13, color: 'var(--text)', cursor: 'pointer' },
  case: { width: 20, height: 20, flexShrink: 0, accentColor: 'var(--accent)' },
  menuTitre: { fontSize: 12, fontWeight: 700, color: 'var(--text2)', margin: '6px 0 6px' },
  // Base en borderWidth / borderStyle / borderColor : l'état actif surcharge
  // borderColor.
  option: {
    display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', minHeight: 44,
    padding: '9px 12px', borderRadius: 8, fontFamily: 'var(--font)', color: 'var(--text)',
    background: 'var(--bg)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
  },
  optionActive: { borderColor: 'var(--accent)', background: 'var(--accent-light)' },
  detail: { display: 'block', fontSize: 12, color: 'var(--text2)', marginTop: 2 },
  vide: { fontSize: 13, color: 'var(--text2)', fontStyle: 'italic' },
  supplement: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text2)' },
  bouton: {
    minHeight: 44, padding: '9px 14px', borderRadius: 8, cursor: 'pointer',
    fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)',
    background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)',
  },
  boutonPrincipal: { background: 'var(--accent)', color: 'var(--on-accent)', border: '1px solid var(--accent)' },
};
