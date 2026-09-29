import React from 'react';
import { ClipboardList, MessageSquareText, Thermometer, TriangleAlert, Users, UsersRound } from 'lucide-react';
import { Carte, Ligne, Puce, TONS, t } from './tableauUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// À faire : ce qui attend quelqu'un maintenant, du plus urgent au moins
// urgent (relevés HACCP en retard, groupes à lire ou à préparer, retards de
// pointage, pertes à valider, messages). Chaque ligne mène au module concerné
// quand le rôle y a accès.
// ─────────────────────────────────────────────────────────────────────────────

const ICONES = {
  haccp: Thermometer,
  groupe: UsersRound,
  equipe: Users,
  pertes: ClipboardList,
  messages: MessageSquareText,
};

const MAX = 6;

export default function AFaire({ items, peutOuvrir, ouvrir }) {
  const [tout, setTout] = React.useState(false);
  const urgents = items.filter((i) => i.ton === 'danger').length;
  const visibles = tout ? items : items.slice(0, MAX);

  return (
    <Carte
      ton={urgents ? 'danger' : items.length ? 'warning' : 'success'}
      titre="À faire"
      sousTitre={items.length
        ? `${items.length} point${items.length > 1 ? 's' : ''} à traiter${urgents ? `, dont ${urgents} urgent${urgents > 1 ? 's' : ''}` : ''}`
        : "Rien d'urgent pour l'instant"}
    >
      {!items.length && <div style={t.vide}>Tout est à jour. Bon service !</div>}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {visibles.map((item, i) => {
          const Icone = ICONES[item.icone] || TriangleAlert;
          const c = TONS[item.ton] || TONS.info;
          const cliquable = peutOuvrir(item.page);
          return (
            <Ligne
              key={item.id}
              onClick={cliquable ? () => ouvrir(item.page) : null}
              label={`${item.titre}. ${item.detail}`}
              style={{ borderRadius: 0, paddingInline: 2, ...(i ? { borderTop: '1px solid var(--border)' } : null) }}
            >
              <Icone size={18} strokeWidth={1.9} aria-hidden="true" style={{ color: c.texte, flexShrink: 0 }} />
              <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                <span style={{ ...t.nom, whiteSpace: 'normal' }}>{item.titre}</span>
                <span style={{ ...t.texte2, display: 'block' }}>{item.detail}</span>
              </span>
              {item.ton === 'danger' && <Puce ton="danger">Urgent</Puce>}
            </Ligne>
          );
        })}
      </div>
      {items.length > MAX && (
        <button type="button" onClick={() => setTout((v) => !v)} style={s.plus}>
          {tout ? 'Réduire' : items.length - MAX === 1 ? 'Voir le dernier point' : `Voir les ${items.length - MAX} autres`}
        </button>
      )}
    </Carte>
  );
}

const s = {
  plus: {
    marginTop: 8, minHeight: 40, padding: '8px 12px', borderRadius: 'var(--r-sm)', cursor: 'pointer',
    background: 'transparent', color: 'var(--accent)', border: 'none', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600,
  },
};
