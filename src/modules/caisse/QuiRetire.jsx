import React from 'react';
import { Btn, Input, SegmentedTabs } from '../../components/ui/index.jsx';
import { useBackLayer } from '../../hooks/useBackLayer.js';
import Interrupteur from '../roles/Interrupteur.jsx';
import { st } from './QuiEstLa.jsx';
import { heurePromiseIso, heureRetrait, nomRetraitValide, NOM_RETRAIT_MAX } from './retrait.js';

// ─────────────────────────────────────────────────────────────────────────────
// « Qui retire la commande ? » (lot 01 du panel, 25.11.2026) : la feuille qui
// s'ouvre sur « Vente directe », hors mode test. Un nom libre (un prénom
// suffit, jamais une fiche du fichier clients), l'heure promise (« Dès que
// possible » d'origine) et l'interrupteur « À emporter ».
//   - « Ouvrir le ticket » rend { ticketId, nom, heure, aEmporter } à
//     onOuvrir. L'identifiant du ticket est tiré à l'ouverture de la feuille
//     et gardé d'un essai à l'autre (un second toucher rejoint le premier
//     ticket) ; il change seulement quand onOuvrir rend { nouvelId: true }.
//   - « Continuer sans nom » ouvre le ticket nu d'avant (onSansNom).
// En modification (ticket donné), la feuille corrige le nom et l'heure d'un
// ticket ouvert ; l'interrupteur vit alors dans le bandeau du ticket.
// La fermeture n'est jamais désactivée pendant une écriture. Refermable par
// le geste retour et par Échap.
// ─────────────────────────────────────────────────────────────────────────────

const nouvelId = () => (globalThis.crypto?.randomUUID
  ? globalThis.crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : ((r % 4) + 8)).toString(16);
  }));

const CHOIX_HEURE = [
  { id: 'vite', label: 'Dès que possible' },
  { id: 'heure', label: 'Heure promise' },
];

export default function QuiRetire({ ticket = null, onOuvrir, onSansNom, onClose }) {
  const modification = Boolean(ticket);
  const heureInitiale = modification ? heureRetrait(ticket.retrait_heure) : null;
  const [nom, setNom] = React.useState(modification ? (ticket.retrait_nom || '') : '');
  const [choix, setChoix] = React.useState(heureInitiale ? 'heure' : 'vite');
  const [hhmm, setHhmm] = React.useState(heureInitiale || '');
  const [aEmporter, setAEmporter] = React.useState(false);
  const [erreur, setErreur] = React.useState(null);
  const [enCours, setEnCours] = React.useState(false);
  const verrou = React.useRef(false);
  const idTicket = React.useRef(nouvelId());

  useBackLayer(true, onClose, 'caisse-qui-retire');
  React.useEffect(() => {
    const echap = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', echap, true);
    return () => document.removeEventListener('keydown', echap, true);
  }, [onClose]);

  // L'heure choisie, en instant UTC ; une heure déjà enregistrée et laissée
  // telle quelle se garde même si elle est passée.
  function heureChoisie() {
    if (choix !== 'heure') return { iso: null };
    if (modification && heureInitiale && hhmm === heureInitiale) return { iso: ticket.retrait_heure };
    const iso = heurePromiseIso(hhmm, new Date());
    return iso ? { iso } : { erreur: 'Choisissez une heure à venir.' };
  }

  async function valider() {
    if (verrou.current) return;
    const h = heureChoisie();
    if (h.erreur) { setErreur(h.erreur); return; }
    verrou.current = true;
    setEnCours(true);
    setErreur(null);
    try {
      const r = await onOuvrir({
        ticketId: idTicket.current,
        nom: nomRetraitValide(nom),
        heure: h.iso,
        aEmporter,
      });
      if (r?.error) {
        setErreur(r.error);
        if (r.nouvelId) idTicket.current = nouvelId();
      }
    } finally {
      verrou.current = false;
      setEnCours(false);
    }
  }

  async function sansNom() {
    if (verrou.current) return;
    verrou.current = true;
    setEnCours(true);
    setErreur(null);
    try {
      const r = await onSansNom();
      if (r?.error) setErreur(r.error);
    } finally {
      verrou.current = false;
      setEnCours(false);
    }
  }

  return (
    <div className="modal-sheet-overlay" data-fenetre="" style={st.overlay} onClick={onClose}>
      <div
        className="modal-sheet"
        role="region"
        aria-label="Qui retire la commande ?"
        data-caisse-qui-retire={modification ? 'modifier' : 'ouvrir'}
        style={st.feuille}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={st.enTete}>
          <div style={{ minWidth: 0 }}>
            <div style={st.titre}>Qui retire la commande ?</div>
            <div style={st.sousTitre}>Vente directe</div>
          </div>
          <Btn variant="ghost" onClick={onClose} style={st.btn44}>Fermer</Btn>
        </div>

        <div style={st.colonne}>
          <label style={lr.label} htmlFor="caisse-retrait-nom">Nom</label>
          <Input
            id="caisse-retrait-nom"
            value={nom}
            onChange={(e) => setNom(e.target.value.slice(0, NOM_RETRAIT_MAX))}
            placeholder="Prénom ou nom"
            autoComplete="off"
            style={{ minHeight: 44 }}
          />
        </div>

        <div style={st.colonne}>
          <span style={lr.label}>Heure de retrait</span>
          <SegmentedTabs tabs={CHOIX_HEURE} active={choix} onChange={(id) => { setChoix(id); setErreur(null); }} retourLigne />
          {choix === 'heure' && (
            <Input
              type="time"
              value={hhmm}
              onChange={(e) => { setHhmm(e.target.value); setErreur(null); }}
              aria-label="Heure promise"
              style={{ minHeight: 44, maxWidth: 180 }}
            />
          )}
        </div>

        {!modification && (
          <div style={lr.rangInter}>
            <span style={lr.interTexte}>À emporter</span>
            <Interrupteur checked={aEmporter} onChange={() => setAEmporter((v) => !v)} label="À emporter" />
          </div>
        )}

        {erreur && <p style={lr.erreur} role="alert">{erreur}</p>}

        <div style={lr.actions}>
          <Btn variant="primary" onClick={valider} disabled={enCours} style={st.btn44}>
            {modification ? 'Enregistrer' : 'Ouvrir le ticket'}
          </Btn>
          {!modification && (
            <Btn variant="ghost" onClick={sansNom} disabled={enCours} style={st.btn44}>Continuer sans nom</Btn>
          )}
        </div>
      </div>
    </div>
  );
}

const lr = {
  label: { fontSize: 'var(--t1)', fontWeight: 'var(--g3)', color: 'var(--text2)' },
  rangInter: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 },
  interTexte: { fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--text)' },
  erreur: { margin: 0, fontSize: 'var(--t2)', color: 'var(--danger-text)' },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 },
};

// Les repères d'un ticket de retrait, chacun dans son nœud : le numéro (ou
// « Vente directe » tant qu'il n'est pas posé, si sansNumero est donné), le
// nom saisi (une donnée, jamais traduit), l'heure promise et « À emporter ».
export function ReperesRetrait({ reperes, sansNumero = null, style = null }) {
  if (!reperes || reperes.vide) return null;
  const morceaux = [];
  if (reperes.numero != null) {
    morceaux.push(<span key="n" data-retrait-numero=""><span>Retrait n°</span> <span style={st.num}>{reperes.numero}</span></span>);
  } else if (sansNumero) {
    morceaux.push(<span key="n">{sansNumero}</span>);
  }
  if (reperes.nom) morceaux.push(<span key="nom" data-no-translate="">{reperes.nom}</span>);
  if (reperes.heure) morceaux.push(<span key="h" style={st.num}>{reperes.heure}</span>);
  if (reperes.aEmporter) morceaux.push(<span key="e">À emporter</span>);
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '0 6px', minWidth: 0, ...style }} data-caisse-retrait="">
      {morceaux.map((m, i) => (
        <span key={m.key} style={{ display: 'inline-flex', minWidth: 0, overflowWrap: 'anywhere' }}>
          {m}{i < morceaux.length - 1 && <span aria-hidden="true">,</span>}
        </span>
      ))}
    </span>
  );
}
