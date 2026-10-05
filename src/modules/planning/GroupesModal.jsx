import React from 'react';
import { X } from 'lucide-react';
import { pls } from './Planning.styles.js';
import { notifyLegacy, confirmLegacy } from '../../legacy/legacyApi.js';
import { useBackLayer } from '../../hooks/useBackLayer.js';
import { familleDuRole } from '../../hooks/usePlanningGroupes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Groupes du Planning & Pointage.
//
//   * Groupes : Salle et Cuisine existent toujours (renommables), d'autres
//     s'ajoutent et se suppriment. Qui gère le planning (canGerer).
//   * Personnes : chacun dans un groupe ; « Selon le rôle » remet le groupe par
//     défaut (serveur en Salle, cuisinier en Cuisine).
//   * Comptes de pointage partagés : un compte d'appareil (iPad du restaurant)
//     qui pointe l'arrivée et le départ des membres des groupes cochés.
//     Consultant et patron seulement (canPostes), comme en base.
// ─────────────────────────────────────────────────────────────────────────────

export default function GroupesModal({ onClose, groupesEtab, personnes, comptes, canGerer, canPostes, roles }) {
  const { groupes, groupeDe, affectations, postesParCompte, creerGroupe, renommerGroupe, supprimerGroupe, affecter, reglerPoste } = groupesEtab;
  const [enCours, setEnCours] = React.useState(null);
  const [nouveau, setNouveau] = React.useState('');
  const [noms, setNoms] = React.useState({});
  const [compteAjoute, setCompteAjoute] = React.useState('');
  useBackLayer(true, onClose, 'planning-groupes');

  const tries = React.useMemo(
    () => [...personnes].sort((a, b) => `${a.prenom} ${a.nom}`.localeCompare(`${b.prenom} ${b.nom}`, 'fr')),
    [personnes]
  );
  const comptesPostes = comptes.filter((c) => postesParCompte.has(c.id));
  const comptesDisponibles = comptes.filter((c) => !postesParCompte.has(c.id));

  async function agir(cle, action) {
    if (enCours) return false;
    setEnCours(cle);
    try {
      const { error } = await action();
      if (error) { notifyLegacy(error, 'error'); return false; }
      return true;
    } finally {
      setEnCours(null);
    }
  }

  async function ajouterGroupe() {
    const ok = await agir('nouveau', () => creerGroupe(nouveau));
    if (ok) setNouveau('');
  }

  async function validerNom(g) {
    const nom = (noms[g.id] ?? g.nom).trim();
    if (nom === g.nom) return;
    const ok = await agir(`nom-${g.id}`, () => renommerGroupe(g.id, nom));
    if (!ok) setNoms((n) => ({ ...n, [g.id]: g.nom }));
  }

  async function retirerGroupe(g) {
    const nb = personnes.filter((p) => groupeDe(p) === g.id).length;
    const suite = nb > 0 ? ` Ses ${nb} membre${nb > 1 ? 's' : ''} retrouveront le groupe de leur rôle.` : '';
    if (!confirmLegacy(`Supprimer le groupe « ${g.nom} » ?${suite}`)) return;
    await agir(`suppr-${g.id}`, () => supprimerGroupe(g.id));
  }

  async function ajouterCompte() {
    if (!compteAjoute || !groupes.length) return;
    // Premier rattachement : au groupe de son rôle s'il en a un, sinon au premier.
    const compte = comptes.find((c) => c.id === compteAjoute);
    const cible = groupeDe(compte) || groupes[0].id;
    const ok = await agir(`poste-${compteAjoute}`, () => reglerPoste(compteAjoute, cible, true));
    if (ok) setCompteAjoute('');
  }

  return (
    <div className="modal-full-overlay" style={pls.overlay} onClick={onClose}>
      <div className="modal-full" style={{ ...pls.modal, width: 560, maxHeight: '92vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Groupes">
        <div style={pls.modalHeader}>
          <div style={pls.modalTitle}>Groupes</div>
          <button type="button" style={{ ...pls.closeBtn, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44 }} onClick={onClose} aria-label="Fermer">
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* ── Groupes ── */}
          <section style={s.section}>
            <div style={s.titre}>Groupes de l'établissement</div>
            {groupes.map((g) => {
              const nb = personnes.filter((p) => groupeDe(p) === g.id).length;
              return (
                <div key={g.id} style={s.ligne}>
                  {canGerer ? (
                    <input
                      type="text"
                      maxLength={40}
                      value={noms[g.id] ?? g.nom}
                      onChange={(e) => setNoms((n) => ({ ...n, [g.id]: e.target.value }))}
                      onBlur={() => validerNom(g)}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      style={{ ...pls.fieldInput, flex: '1 1 auto', minWidth: 0 }}
                      aria-label={`Nom du groupe ${g.nom}`}
                    />
                  ) : (
                    <span style={{ ...s.nom, flex: '1 1 auto' }}>{g.nom}</span>
                  )}
                  <span style={s.compte}>{nb} pers.</span>
                  {canGerer && !g.famille && (
                    <button type="button" style={{ ...pls.exportBtn, ...s.danger }} disabled={!!enCours} onClick={() => retirerGroupe(g)}>Supprimer</button>
                  )}
                </div>
              );
            })}
            {canGerer && (
              <div style={s.ligne}>
                <input
                  type="text"
                  maxLength={40}
                  placeholder="Nouveau groupe (ex. Plonge, Réception)"
                  value={nouveau}
                  onChange={(e) => setNouveau(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') ajouterGroupe(); }}
                  style={{ ...pls.fieldInput, flex: '1 1 auto', minWidth: 0 }}
                />
                <button type="button" style={{ ...pls.addBtn, minHeight: 44, flexShrink: 0 }} disabled={!nouveau.trim() || !!enCours} onClick={ajouterGroupe}>Ajouter</button>
              </div>
            )}
          </section>

          {/* ── Personnes ── */}
          <section style={s.section}>
            <div style={s.titre}>Qui est dans quel groupe</div>
            {!tries.length && <div style={s.aide}>Aucun équipier dans cet établissement.</div>}
            {tries.map((p) => {
              const explicite = affectations.get(p.id);
              const actuel = groupeDe(p);
              const valeur = explicite && groupes.some((g) => g.id === explicite) ? explicite : '';
              const groupeRole = groupes.find((g) => g.famille && g.famille === familleDuRole(p.role));
              return (
                <div key={p.id} style={s.ligne}>
                  <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <span style={s.nom} data-no-translate>{p.prenom} {p.nom}</span>
                    <span style={s.role}>{roles?.[p.role]?.label || p.role}</span>
                  </span>
                  {canGerer ? (
                    <select
                      value={valeur}
                      disabled={enCours === `membre-${p.id}`}
                      onChange={(e) => agir(`membre-${p.id}`, () => affecter(p.id, e.target.value || null))}
                      style={{ ...pls.fieldInput, width: 'auto', maxWidth: '50%', flexShrink: 0 }}
                      aria-label={`Groupe de ${p.prenom} ${p.nom}`}
                    >
                      <option value="">{groupeRole ? `Selon le rôle (${groupeRole.nom})` : 'Sans groupe'}</option>
                      {groupes.map((g) => <option key={g.id} value={g.id}>{g.nom}</option>)}
                    </select>
                  ) : (
                    <span style={s.compte}>{groupes.find((g) => g.id === actuel)?.nom || 'Sans groupe'}</span>
                  )}
                </div>
              );
            })}
          </section>

          {/* ── Comptes de pointage partagés ── */}
          {(canPostes || comptesPostes.length > 0) && (
            <section style={s.section}>
              <div style={s.titre}>Comptes de pointage partagés</div>
              <div style={s.aide}>
                Un compte partagé (par exemple l'iPad de la salle ou de la cuisine) peut pointer l'arrivée et le départ des membres des groupes cochés.
                Chacun garde son pointage sur son propre compte. Ces comptes n'apparaissent plus dans le planning.
              </div>
              {comptesPostes.map((c) => {
                const rattaches = postesParCompte.get(c.id) || new Set();
                return (
                  <div key={c.id} style={{ ...s.ligne, flexWrap: 'wrap' }}>
                    <span style={{ flex: '1 1 160px', minWidth: 0 }}>
                      <span style={s.nom} data-no-translate>{c.prenom} {c.nom}</span>
                      <span style={s.role}>{c.email || roles?.[c.role]?.label || c.role}</span>
                    </span>
                    <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {groupes.map((g) => {
                        const coche = rattaches.has(g.id);
                        return (
                          <label key={g.id} style={{ ...s.case, ...(coche ? s.caseOn : null), opacity: canPostes ? 1 : 0.7 }}>
                            <input
                              type="checkbox"
                              checked={coche}
                              disabled={!canPostes || enCours === `poste-${c.id}`}
                              onChange={() => agir(`poste-${c.id}`, () => reglerPoste(c.id, g.id, !coche))}
                            />
                            {g.nom}
                          </label>
                        );
                      })}
                    </span>
                  </div>
                );
              })}
              {canPostes && comptesDisponibles.length > 0 && (
                <div style={s.ligne}>
                  <select value={compteAjoute} onChange={(e) => setCompteAjoute(e.target.value)} style={{ ...pls.fieldInput, flex: '1 1 auto', minWidth: 0 }} aria-label="Compte à rendre partagé">
                    <option value="">Choisir un compte…</option>
                    {comptesDisponibles.map((c) => <option key={c.id} value={c.id}>{c.prenom} {c.nom}{c.email ? ` (${c.email})` : ''}</option>)}
                  </select>
                  <button type="button" style={{ ...pls.addBtn, minHeight: 44, flexShrink: 0 }} disabled={!compteAjoute || !!enCours} onClick={ajouterCompte}>Ajouter</button>
                </div>
              )}
              {canPostes && comptesPostes.length > 0 && (
                <div style={s.aide}>Pour retirer un compte partagé, décoche tous ses groupes.</div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

const s = {
  section: { display: 'flex', flexDirection: 'column', gap: 6 },
  titre: { fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 },
  aide: { fontSize: 13, color: 'var(--text2)', lineHeight: 1.45 },
  ligne: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', minHeight: 56,
    borderRadius: 10, background: 'var(--bg)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
  },
  nom: { display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  role: { display: 'block', fontSize: 12, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  compte: { fontSize: 12, color: 'var(--text2)', flexShrink: 0 },
  danger: { color: 'var(--danger-strong)', borderColor: 'var(--danger-bd)', minHeight: 44, flexShrink: 0 },
  case: {
    display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 12px', borderRadius: 8, fontSize: 13,
    cursor: 'pointer', background: 'var(--surface)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', color: 'var(--text)',
  },
  caseOn: { background: 'var(--accent-light)', borderColor: 'var(--accent-bd)', color: 'var(--accent)', fontWeight: 600 },
};
