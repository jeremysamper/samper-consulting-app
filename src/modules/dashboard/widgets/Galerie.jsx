import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { pictoCercleStyle } from '../../../components/ui/index.jsx';
import { Fenetre, st } from '../../../components/ui/Fenetres.jsx';
import { getModuleIcon } from '../../moduleIcons.js';
import { FAMILLES, NOMS_TAILLES } from './catalogue.js';
import { REGISTRE } from './registre.js';
import { estVisible, raccourcisAffiches } from './dispositionLogique.js';

// ─────────────────────────────────────────────────────────────────────────────
// Galerie des widgets : rangés par famille, avec leur nom, une ligne de
// description, leurs tailles et « Ajouter ». Elle ne liste que ce que la garde
// permet ; un widget déjà posé le dit (un widget se pose une seule fois).
// ─────────────────────────────────────────────────────────────────────────────

const SOUS_TITRES = { gestion: 'Visible par la direction seulement' };

export function Galerie({ ctx, poses, onAjouter, onClose }) {
  const familles = FAMILLES
    .map((f) => ({ ...f, widgets: REGISTRE.filter((w) => w.famille === f.id && estVisible(w.id, ctx)) }))
    .filter((f) => f.widgets.length);
  return (
    <Fenetre id="tdb-galerie" titre="Ajouter un widget" sousTitre="Les widgets que votre rôle et vos modules permettent." onClose={onClose} largeur={560}>
      <div data-tdb-galerie="" style={g.liste}>
        {familles.map((f) => (
          <section key={f.id} aria-labelledby={`tdb-galerie-${f.id}`} style={g.famille}>
            <h3 id={`tdb-galerie-${f.id}`} style={g.familleTitre}>{f.nom}</h3>
            {SOUS_TITRES[f.id] && <p style={g.familleSous}>{SOUS_TITRES[f.id]}</p>}
            {f.widgets.map((w) => {
              const pose = poses.has(w.id);
              const Picto = w.picto;
              return (
                <div key={w.id} style={g.ligne} data-galerie-widget={w.id}>
                  <span style={pictoCercleStyle(40)} aria-hidden="true">{Picto && <Picto size={18} strokeWidth={1.8} />}</span>
                  <span style={{ minWidth: 0, flex: '1 1 auto' }}>
                    <span style={g.nom} id={`tdb-gn-${w.id}`}>{w.nom}</span>
                    <span style={g.description}>{w.description}</span>
                    <span style={g.tailles}>
                      <span>Tailles :</span>{' '}
                      {w.tailles.map((t, i) => <React.Fragment key={t}>{i ? ', ' : ''}<span>{NOMS_TAILLES[t]}</span></React.Fragment>)}
                    </span>
                  </span>
                  {pose ? (
                    <span style={g.pose}>Déjà posé</span>
                  ) : (
                    <button type="button" style={{ ...st.secondaire, flexShrink: 0 }} onClick={() => onAjouter(w.id)} aria-labelledby={`tdb-ga-${w.id} tdb-gn-${w.id}`}><span id={`tdb-ga-${w.id}`}>Ajouter</span></button>
                  )}
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </Fenetre>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Choix des raccourcis : parmi les modules que le menu de la personne montre,
// ceux du widget et leur ordre. Le choix entre dans le brouillon du mode
// « Personnaliser » : il n'est gardé qu'à « Terminé ».
// ─────────────────────────────────────────────────────────────────────────────

export function ChoixRaccourcis({ modules, choisis, onChange, onClose }) {
  const actuels = raccourcisAffiches(choisis, modules).map((m) => m.id);
  const parId = new Map(modules.map((m) => [m.id, m]));
  const autres = modules.filter((m) => !actuels.includes(m.id) && m.id !== 'dashboard' && m.id !== 'accueil');
  const poser = (ids) => onChange(ids);
  const bouger = (id, sens) => {
    const i = actuels.indexOf(id);
    const j = i + sens;
    if (i < 0 || j < 0 || j >= actuels.length) return;
    const l = [...actuels];
    [l[i], l[j]] = [l[j], l[i]];
    poser(l);
  };
  const ligne = (m, enPlace, i) => {
    const Icone = getModuleIcon(m.id);
    return (
      <div key={m.id} style={g.ligne} data-raccourci-choix={m.id}>
        <span style={pictoCercleStyle(40)} aria-hidden="true"><Icone size={18} strokeWidth={1.8} /></span>
        <span style={{ ...g.nom, flex: '1 1 auto', minWidth: 0 }} id={`tdb-rn-${m.id}`}>{m.label}</span>
        {enPlace && (
          <>
            <button type="button" className="tdb-cercle" onClick={() => bouger(m.id, -1)} disabled={i === 0} aria-labelledby={`tdb-ra-monter-${m.id} tdb-rn-${m.id}`}><ChevronUp size={18} strokeWidth={1.8} aria-hidden="true" /><span id={`tdb-ra-monter-${m.id}`} style={srOnly}>Monter</span></button>
            <button type="button" className="tdb-cercle" onClick={() => bouger(m.id, 1)} disabled={i === actuels.length - 1} aria-labelledby={`tdb-ra-descendre-${m.id} tdb-rn-${m.id}`}><ChevronDown size={18} strokeWidth={1.8} aria-hidden="true" /><span id={`tdb-ra-descendre-${m.id}`} style={srOnly}>Descendre</span></button>
          </>
        )}
        <button
          type="button"
          style={{ ...st.secondaire, flexShrink: 0 }}
          onClick={() => poser(enPlace ? actuels.filter((x) => x !== m.id) : [...actuels, m.id])}
          aria-labelledby={`tdb-ra-bascule-${m.id} tdb-rn-${m.id}`}
        >
          <span id={`tdb-ra-bascule-${m.id}`}>{enPlace ? 'Retirer' : 'Ajouter'}</span>
        </button>
      </div>
    );
  };
  return (
    <Fenetre
      id="tdb-raccourcis"
      titre="Choisir les raccourcis"
      sousTitre="Parmi les modules de votre menu. Rien n'est enregistré avant « Terminé »."
      onClose={onClose}
      largeur={520}
      pied={<button type="button" style={st.primaire} onClick={onClose}>Fermer</button>}
    >
      <div style={g.liste}>
        <section aria-labelledby="tdb-raccourcis-choisis" style={g.famille}>
          <h3 id="tdb-raccourcis-choisis" style={g.familleTitre}>Dans le widget</h3>
          {!actuels.length && <p style={g.familleSous}>Aucun raccourci.</p>}
          {actuels.map((id, i) => parId.get(id) && ligne(parId.get(id), true, i))}
        </section>
        {autres.length > 0 && (
          <section aria-labelledby="tdb-raccourcis-autres" style={g.famille}>
            <h3 id="tdb-raccourcis-autres" style={g.familleTitre}>Autres modules</h3>
            {autres.map((m) => ligne(m, false))}
          </section>
        )}
      </div>
    </Fenetre>
  );
}

const srOnly = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 };

const g = {
  liste: { display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 },
  famille: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  familleTitre: { margin: '0 0 2px', fontFamily: 'var(--font)', fontSize: 'var(--t3)', fontWeight: 'var(--g3)', color: 'var(--text)' },
  familleSous: { margin: '0 0 4px', fontSize: 'var(--t2)', color: 'var(--text2)' },
  ligne: {
    display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, minHeight: 56, padding: '8px 0', boxSizing: 'border-box',
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)',
  },
  nom: { display: 'block', fontSize: 'var(--t2)', fontWeight: 'var(--g3)', lineHeight: 1.35, color: 'var(--text)' },
  description: { display: 'block', fontSize: 'var(--t2)', lineHeight: 1.4, color: 'var(--text2)' },
  tailles: { display: 'block', fontSize: 'var(--t1)', lineHeight: 1.4, color: 'var(--text2)', marginTop: 2 },
  pose: { flexShrink: 0, fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--text2)', whiteSpace: 'nowrap' },
};
