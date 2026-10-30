import React from 'react';
import { typeHoraire } from './planningModeles.js';
import { jourCourt } from './planningGlisser.js';

// ─────────────────────────────────────────────────────────────────────────────
// Bandeau du dernier geste de la grille : ce qui vient d'être fait, et le
// retour arrière (« Annuler », « Copier plutôt », « Copier ici »). Fixe en bas
// à gauche, sous les fenêtres ; les toasts restent en bas à droite. Il reste
// 8 s (« Annulé. » 2 s), disparaît au geste suivant ou par « Fermer ». Fermer
// un refus (chevauche, pointe) rend le bandeau du geste d'avant (fermerMessage).
// Pendant un glisser, il laisse passer le pointeur (la case dessous reste
// visable).
//
// bandeau : { seq, type: 'deplace' | 'copie' | 'pointe' | 'chevauche' |
// 'duplication' | 'annule', horaire?, absence?, n?, occupe? }
// ─────────────────────────────────────────────────────────────────────────────

const DUREE = 8000;
const DUREE_ANNULE = 2000;

function Detail({ horaire, nomDe }) {
  const t = typeHoraire(horaire.typeShift);
  return (
    <> <span>{t.label}</span> <span>{horaire.debut}-{horaire.fin}</span>, <span data-no-translate>{nomDe(horaire.userId)}</span>, <span>{jourCourt(horaire.date)}</span></>
  );
}

export default function BandeauAnnuler({ bandeau, nomDe, pendantGlisser = false, onAnnuler, onCopierPlutot, onCopierIci, onFermer }) {
  const fermerRef = React.useRef(onFermer);
  fermerRef.current = onFermer;
  const seq = bandeau ? bandeau.seq : null;
  const occupe = Boolean(bandeau && bandeau.occupe);
  const type = bandeau ? bandeau.type : null;
  React.useEffect(() => {
    if (seq == null || occupe) return undefined;
    const t = setTimeout(() => fermerRef.current(), type === 'annule' ? DUREE_ANNULE : DUREE);
    return () => clearTimeout(t);
  }, [seq, occupe, type]);
  if (!bandeau) return null;

  let texte;
  let boutons = [];
  const fermerX = { cle: 'x', label: '×', aria: 'Fermer le message', onClick: onFermer, croix: true };
  if (type === 'deplace') {
    texte = bandeau.absence
      ? <><strong>Déplacé sur un jour d'absence (<span>{bandeau.absence}</span>).</strong><Detail horaire={bandeau.horaire} nomDe={nomDe} /></>
      : <><strong>Déplacé.</strong><Detail horaire={bandeau.horaire} nomDe={nomDe} /></>;
    boutons = [{ cle: 'annuler', label: 'Annuler', onClick: onAnnuler }, { cle: 'plutot', label: 'Copier plutôt', onClick: onCopierPlutot }, fermerX];
  } else if (type === 'copie') {
    texte = <><strong>Copié.</strong><Detail horaire={bandeau.horaire} nomDe={nomDe} /></>;
    boutons = [{ cle: 'annuler', label: 'Annuler', onClick: onAnnuler }, fermerX];
  } else if (type === 'duplication') {
    texte = <strong><span>{bandeau.n}</span> {bandeau.n > 1 ? 'horaires copiés.' : 'horaire copié.'}</strong>;
    boutons = [{ cle: 'annuler', label: 'Annuler', onClick: onAnnuler }, fermerX];
  } else if (type === 'pointe') {
    texte = <strong>Un horaire déjà pointé ne se déplace pas.</strong>;
    boutons = [{ cle: 'ici', label: 'Copier ici', onClick: onCopierIci }, { cle: 'fermer', label: 'Fermer', onClick: onFermer }];
  } else if (type === 'chevauche') {
    texte = <strong>Ce créneau chevauche un horaire déjà prévu ce jour-là.</strong>;
    boutons = [{ cle: 'fermer', label: 'Fermer', onClick: onFermer }];
  } else {
    texte = <strong>Annulé.</strong>;
  }

  return (
    <div
      className="no-print"
      role="status"
      aria-live="polite"
      data-bandeau-planning={type}
      style={{ ...s.bandeau, ...(pendantGlisser ? s.traversable : null) }}
    >
      <div style={s.texte}>{texte}</div>
      {boutons.length > 0 && (
        <div style={s.boutons}>
          {boutons.map(b => (
            <button
              key={b.cle}
              type="button"
              onClick={b.onClick}
              disabled={occupe && !b.croix}
              aria-label={b.aria}
              style={{ ...(b.croix ? s.croix : s.action), ...(occupe && !b.croix ? s.inactif : null) }}
            >{b.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

const s = {
  bandeau: {
    position: 'fixed', left: 16, bottom: 'calc(16px + env(safe-area-inset-bottom))', zIndex: 900,
    width: 'min(480px, calc(100vw - 32px))', boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
    padding: '8px 8px 8px 14px', background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 12, boxShadow: 'var(--sh)', fontFamily: 'var(--font)', color: 'var(--text)',
  },
  traversable: { pointerEvents: 'none', opacity: 0.4 },
  texte: { flex: '1 1 220px', minWidth: 0, fontSize: 13, lineHeight: 1.4 },
  boutons: { display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, marginLeft: 'auto' },
  action: { minHeight: 44, padding: '0 14px', borderRadius: 8, border: 'none', background: 'var(--accent-light)', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
  croix: { minHeight: 44, minWidth: 44, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text2)', fontSize: 22, lineHeight: 1, cursor: 'pointer', fontFamily: 'var(--font)' },
  inactif: { opacity: 0.5, cursor: 'default' },
};
