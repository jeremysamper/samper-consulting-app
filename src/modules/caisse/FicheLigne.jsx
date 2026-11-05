import React from 'react';
import { Btn, Input } from '../../components/ui/index.jsx';
import { useBackLayer } from '../../hooks/useBackLayer.js';
import { CUISSONS, libelleOption, basculerCuisson, basculerSans, ajouterMessage, retirerOption } from './options.js';

// ─────────────────────────────────────────────────────────────────────────────
// Fiche d'une ligne du ticket (feuille refermable par le geste retour) :
// quantité, suite, cuisson, « sans ... » (derniers utilisés + saisie libre),
// message pour la cuisine ou le bar, suppression. Chaque tap écrit tout de
// suite (onChange) : rien à enregistrer, la feuille se referme quand on veut.
// Réservée aux lignes en_attente (une ligne envoyée est figée en base).
// Les valeurs saisies et les noms sont des données : data-no-translate.
// ─────────────────────────────────────────────────────────────────────────────

const chf = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);

export default function FicheLigne({ ligne, sansRecents, onChange, onSupprimer, onClose }) {
  const [sansLibre, setSansLibre] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [cibleMessage, setCibleMessage] = React.useState('cuisine');

  useBackLayer(true, onClose, 'caisse-fiche-ligne');

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

  if (!ligne) return null;
  const options = ligne.options || [];
  const cuissonActive = options.find((o) => o.type === 'cuisson')?.valeur || null;
  const sansActifs = options.filter((o) => o.type === 'sans').map((o) => o.valeur);
  const messages = options.filter((o) => o.type === 'message');
  // Derniers « sans » de la maison, plus ceux déjà posés sur la ligne.
  const chipsSans = [...new Set([...(sansRecents || []), ...sansActifs])].slice(0, 10);

  const majOptions = (next) => onChange({ options: next });

  function ajouterSansLibre() {
    const v = sansLibre.trim();
    if (!v) return;
    majOptions(basculerSans(options, v));
    setSansLibre('');
  }

  function ajouterLeMessage() {
    const v = message.trim();
    if (!v) return;
    majOptions(ajouterMessage(options, v, cibleMessage));
    setMessage('');
  }

  return (
    <div className="modal-sheet-overlay" data-fenetre="" style={st.overlay} onClick={onClose}>
      <div className="modal-sheet" role="region" aria-label="Fiche de la ligne" style={st.feuille} onClick={(e) => e.stopPropagation()}>
        <div style={st.enTete}>
          <div style={{ minWidth: 0 }}>
            <div style={st.titre} data-no-translate>{ligne.libelle}</div>
            <div style={st.sousTitre}><span>{chf(Number(ligne.quantite) * Number(ligne.prix_unitaire))}</span> <span>CHF</span></div>
          </div>
          <Btn variant="ghost" onClick={onClose} style={st.btn44}>Fermer</Btn>
        </div>

        <div style={st.rangTitre}>Quantité</div>
        <div style={st.rang}>
          <Btn variant="ghost" onClick={() => onChange({ quantite: Math.max(1, Number(ligne.quantite) - 1) })} style={st.btn44} aria-label="Réduire la quantité">-1</Btn>
          <span style={st.qte}>{Number(ligne.quantite)}</span>
          <Btn variant="ghost" onClick={() => onChange({ quantite: Number(ligne.quantite) + 1 })} style={st.btn44} aria-label="Augmenter la quantité">+1</Btn>
        </div>

        <div style={st.rangTitre}>Suite</div>
        <div style={st.rang}>
          {[1, 2, 3].map((s) => (
            <Btn key={s} variant={ligne.suite === s ? 'primary' : 'ghost'} onClick={() => onChange({ suite: s })} style={st.btn44}>
              <span>{s}</span>
            </Btn>
          ))}
        </div>

        <div style={st.rangTitre}>Cuisson</div>
        <div style={st.rang}>
          {CUISSONS.map((c) => (
            <Btn key={c} variant={cuissonActive === c ? 'primary' : 'ghost'} onClick={() => majOptions(basculerCuisson(options, c))} style={st.btn44}>
              {c}
            </Btn>
          ))}
        </div>

        <div style={st.rangTitre}>Sans</div>
        {chipsSans.length > 0 && (
          <div style={st.rang}>
            {chipsSans.map((v) => (
              <Btn key={v} variant={sansActifs.includes(v) ? 'primary' : 'ghost'} onClick={() => majOptions(basculerSans(options, v))} style={st.btn44}>
                <span data-no-translate>{v}</span>
              </Btn>
            ))}
          </div>
        )}
        <div style={st.rang}>
          <Input value={sansLibre} onChange={(e) => setSansLibre(e.target.value)} placeholder="Sans quoi ? (gluten, oignon...)" style={{ flex: 1, minWidth: 150, minHeight: 44 }} />
          <Btn variant="ghost" onClick={ajouterSansLibre} style={st.btn44}>Ajouter</Btn>
        </div>

        <div style={st.rangTitre}>Message</div>
        {messages.map((o, i) => (
          <div key={i} style={st.messageRang}>
            <span style={st.messageTexte} data-no-translate>{libelleOption(o)}</span>
            <Btn variant="ghost" onClick={() => majOptions(retirerOption(options, o))} style={st.btn44}>Retirer</Btn>
          </div>
        ))}
        <div style={st.rang}>
          <Btn variant={cibleMessage === 'cuisine' ? 'primary' : 'ghost'} onClick={() => setCibleMessage('cuisine')} style={st.btn44}>Cuisine</Btn>
          <Btn variant={cibleMessage === 'bar' ? 'primary' : 'ghost'} onClick={() => setCibleMessage('bar')} style={st.btn44}>Bar</Btn>
        </div>
        <div style={st.rang}>
          <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message libre" style={{ flex: 1, minWidth: 150, minHeight: 44 }} />
          <Btn variant="ghost" onClick={ajouterLeMessage} style={st.btn44}>Ajouter</Btn>
        </div>

        <div style={st.pied}>
          <Btn variant="danger" onClick={onSupprimer} style={st.btn44}>Supprimer la ligne</Btn>
          <Btn variant="primary" onClick={onClose} style={st.btn44}>Fermer</Btn>
        </div>
      </div>
    </div>
  );
}

const st = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1200, padding: 16,
  },
  feuille: {
    background: 'var(--surface)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
    borderRadius: 'var(--r-lg)', padding: '20px 22px', width: 560, maxWidth: '100%',
    maxHeight: '90vh', overflowY: 'auto',
    boxShadow: 'var(--sh-lg)', boxSizing: 'border-box',
  },
  enTete: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 6 },
  titre: { fontSize: 18, fontWeight: 500, fontFamily: 'var(--font-serif)', color: 'var(--text)', lineHeight: 1.2 },
  sousTitre: { fontSize: 13, color: 'var(--text2)', fontFamily: 'var(--font-num)', marginTop: 2 },
  rangTitre: { fontSize: 12, fontWeight: 600, color: 'var(--text3)', margin: '14px 0 6px' },
  rang: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  qte: { fontFamily: 'var(--font-num)', fontSize: 18, fontWeight: 600, minWidth: 36, textAlign: 'center' },
  messageRang: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' },
  messageTexte: { flex: 1, minWidth: 0, fontSize: 14, color: 'var(--text)' },
  pied: { display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 18 },
  btn44: { minHeight: 44, flexShrink: 0 },
};
