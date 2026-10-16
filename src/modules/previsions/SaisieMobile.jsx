import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, isoDate, parseLocalDate } from '../../utils/dateHelpers.js';

// ═══════════════════════════════════════════════════════════════════════════
// Briques de la saisie d'une réservation au téléphone (ReservationForm en
// présentation mobile) : tout se choisit au doigt, en grandes cases, avant que
// le clavier ne s'ouvre pour le nom.
//
// - BandeJours : les deux prochaines semaines en une bande, un toucher par
//   jour ; « Autre jour » déplie un calendrier pour le reste de l'année.
// - CalendrierMois : les douze prochains mois en raccourcis, puis la grille du
//   mois. Une date de mars se prend en deux touchers, sans la roue d'iOS.
// - GrilleCouverts : 1 à 8 en cases, au-delà au clavier numérique.
// ═══════════════════════════════════════════════════════════════════════════

const JOURS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const NB_JOURS_BANDE = 14;
const NB_MOIS_RACCOURCIS = 12;

// Case tactile commune (jours, heures, couverts). Contour en longhands : l'état
// actif ne change que borderColor (voir `npm run lint:borders`).
export function caseStyle(actif, extra = {}) {
  return {
    minHeight: 44, borderRadius: 10, cursor: 'pointer',
    borderWidth: 1, borderStyle: 'solid',
    borderColor: actif ? 'var(--accent)' : 'var(--border)',
    background: actif ? 'var(--accent)' : 'var(--bg)',
    color: actif ? 'var(--on-accent)' : 'var(--text)',
    fontFamily: 'var(--font)', fontSize: 15, fontWeight: actif ? 700 : 500,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '4px 2px', minWidth: 0,
    ...extra,
  };
}

// « mer. 14 oct. » : le rappel de la barre du bas.
export function dateResumee(iso) {
  const d = parseLocalDate(iso);
  return `${JOURS[d.getDay()]}. ${d.getDate()} ${MOIS_COURTS[d.getMonth()]}`;
}

const debutMois = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const cleMois = (d) => `${d.getFullYear()}-${d.getMonth()}`;

export function CalendrierMois({ date, aujourdhui, passeAutorise = false, onChoisir }) {
  const premierMois = debutMois(parseLocalDate(aujourdhui));
  const [mois, setMois] = useState(() => {
    const choisi = debutMois(parseLocalDate(date));
    return choisi < premierMois && !passeAutorise ? premierMois : choisi;
  });

  // Raccourcis : ce mois-ci et les onze suivants. L'année n'est écrite qu'en
  // janvier, là où elle change.
  const raccourcis = Array.from({ length: NB_MOIS_RACCOURCIS }, (_, i) => (
    new Date(premierMois.getFullYear(), premierMois.getMonth() + i, 1)
  ));

  const raccourcisRef = useRef(null);
  useEffect(() => {
    const bande = raccourcisRef.current;
    const actif = bande?.querySelector('[aria-pressed="true"]');
    if (bande && actif) bande.scrollLeft = Math.max(0, actif.offsetLeft - 8);
  }, [mois]);

  const reculerPossible = passeAutorise || mois > premierMois;
  const decaler = (n) => setMois((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));

  // Grille du lundi au dimanche : cases vides avant le 1er.
  const decalage = (mois.getDay() + 6) % 7;
  const nbJours = new Date(mois.getFullYear(), mois.getMonth() + 1, 0).getDate();
  const cases = [
    ...Array.from({ length: decalage }, () => null),
    ...Array.from({ length: nbJours }, (_, i) => isoDate(new Date(mois.getFullYear(), mois.getMonth(), i + 1))),
  ];

  const fleche = {
    width: 44, height: 44, borderRadius: 10, borderWidth: 0, background: 'var(--surface2)',
    color: 'var(--accent)', fontSize: 20, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)',
  };

  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div ref={raccourcisRef}
        style={{ display: 'flex', gap: 6, overflowX: 'auto', position: 'relative', minWidth: 0, scrollbarWidth: 'none', paddingBottom: 2 }}>
        {raccourcis.map((m) => {
          const actif = cleMois(m) === cleMois(mois);
          return (
            <button key={cleMois(m)} type="button" aria-pressed={actif} onClick={() => setMois(m)}
              style={caseStyle(actif, { flexShrink: 0, padding: '4px 12px', fontSize: 14 })}>
              {m.getMonth() === 0 ? `${MOIS_COURTS[0]} ${m.getFullYear()}` : MOIS_COURTS[m.getMonth()]}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button type="button" aria-label="Mois précédent" disabled={!reculerPossible} onClick={() => decaler(-1)}
          style={{ ...fleche, opacity: reculerPossible ? 1 : 0.3, cursor: reculerPossible ? 'pointer' : 'default' }}>
          ‹
        </button>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font)' }}>
          {MOIS_LONGS[mois.getMonth()]} {mois.getFullYear()}
        </div>
        <button type="button" aria-label="Mois suivant" onClick={() => decaler(1)} style={fleche}>
          ›
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
        {['lu', 'ma', 'me', 'je', 've', 'sa', 'di'].map((j) => (
          <div key={j} style={{ textAlign: 'center', fontSize: 12, color: 'var(--text3)', fontWeight: 500, paddingBottom: 2 }}>{j}</div>
        ))}
        {cases.map((iso, i) => {
          if (!iso) return <div key={`vide-${i}`} />;
          const passe = iso < aujourdhui;
          const bloque = passe && !passeAutorise;
          const actif = iso === date;
          const estAujourdhui = iso === aujourdhui;
          return (
            <button key={iso} type="button" disabled={bloque} aria-pressed={actif}
              aria-label={`${parseLocalDate(iso).getDate()} ${MOIS_LONGS[mois.getMonth()]}`}
              onClick={() => onChoisir(iso)}
              style={caseStyle(actif, {
                fontSize: 15, padding: 0,
                borderColor: actif || estAujourdhui ? 'var(--accent)' : 'transparent',
                background: actif ? 'var(--accent)' : 'transparent',
                opacity: bloque ? 0.3 : 1, cursor: bloque ? 'default' : 'pointer',
              })}>
              {parseLocalDate(iso).getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function BandeJours({ date, aujourdhui, passeAutorise = false, onChange }) {
  const [calendrier, setCalendrier] = useState(false);
  const jours = useMemo(() => {
    const base = parseLocalDate(aujourdhui);
    return Array.from({ length: NB_JOURS_BANDE }, (_, i) => isoDate(addDays(base, i)));
  }, [aujourdhui]);
  // Jour pris au calendrier (ou résa existante) hors des deux semaines : il
  // s'affiche en tête de bande, sélectionné, pour rester sous les yeux.
  const horsBande = date && !jours.includes(date);

  // À l'ouverture, la bande se place sur le jour retenu (jour consulté dans le
  // planning, résa existante) au lieu de rester sur aujourd'hui.
  const bandeRef = useRef(null);
  useEffect(() => {
    const bande = bandeRef.current;
    const actif = bande?.querySelector('[aria-pressed="true"]');
    if (bande && actif) bande.scrollLeft = Math.max(0, actif.offsetLeft - 8);
  }, []);

  function choisirAuCalendrier(iso) {
    onChange(iso);
    setCalendrier(false);
    if (bandeRef.current) bandeRef.current.scrollLeft = 0;
  }

  const petit = (actif) => ({ fontSize: 11, fontWeight: 500, color: actif ? 'var(--on-accent)' : 'var(--text2)', lineHeight: 1.2 });

  return (
    <div>
      <div ref={bandeRef}
        style={{ display: 'flex', gap: 6, overflowX: 'auto', position: 'relative', minWidth: 0, scrollbarWidth: 'none', paddingBottom: 2 }}>
        {horsBande && (
          <button type="button" aria-pressed="true" onClick={() => setCalendrier(true)}
            style={caseStyle(true, { flexShrink: 0, minWidth: 68, minHeight: 56, padding: '4px 8px' })}>
            <span style={petit(true)}>{JOURS[parseLocalDate(date).getDay()]}</span>
            <span>{parseLocalDate(date).getDate()} {MOIS_COURTS[parseLocalDate(date).getMonth()]}</span>
          </button>
        )}
        {jours.map((iso, i) => {
          const d = parseLocalDate(iso);
          const actif = iso === date;
          const etiquette = i === 0 ? 'auj.' : i === 1 ? 'demain' : JOURS[d.getDay()];
          return (
            <button key={iso} type="button" aria-pressed={actif} onClick={() => onChange(iso)}
              style={caseStyle(actif, { flexShrink: 0, minWidth: i < 2 ? 62 : 52, minHeight: 56 })}>
              <span style={petit(actif)}>{etiquette}</span>
              <span>{d.getDate() === 1 ? `1 ${MOIS_COURTS[d.getMonth()]}` : d.getDate()}</span>
            </button>
          );
        })}
        <button type="button" aria-expanded={calendrier} onClick={() => setCalendrier((o) => !o)}
          style={caseStyle(calendrier, { flexShrink: 0, minWidth: 64, minHeight: 56, padding: '4px 8px', fontSize: 13 })}>
          <span>Autre</span>
          <span>jour</span>
        </button>
      </div>
      {calendrier && (
        <CalendrierMois date={date} aujourdhui={aujourdhui} passeAutorise={passeAutorise} onChoisir={choisirAuCalendrier} />
      )}
    </div>
  );
}

// Au-delà de 8, la tablée se tape : le champ ouvre le pavé numérique d'un
// toucher. Pendant la frappe il montre ce qui est tapé (« 1 » avant « 12 »).
export function GrilleCouverts({ value, onChange }) {
  const [saisie, setSaisie] = useState(null);
  const n = Number(value) || 0;
  const grand = n > 8;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6 }}>
      {[1, 2, 3, 4, 5, 6, 7, 8].map((k) => (
        <button key={k} type="button" aria-pressed={n === k} onClick={() => onChange(k)}
          style={caseStyle(n === k, { fontFamily: 'var(--font-num)', fontSize: 17 })}>
          {k}
        </button>
      ))}
      <input
        type="text" inputMode="numeric" pattern="[0-9]*" enterKeyHint="done"
        aria-label="Autre nombre de couverts" placeholder="9 et +"
        value={saisie ?? (grand ? String(n) : '')}
        onFocus={(e) => { setSaisie(grand ? String(n) : ''); e.target.select(); }}
        onChange={(e) => {
          const chiffres = e.target.value.replace(/\D/g, '').slice(0, 2);
          setSaisie(chiffres);
          if (chiffres) onChange(Number(chiffres));
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        onBlur={() => { setSaisie(null); if (n < 1) onChange(1); }}
        style={{
          gridColumn: 'span 2', minWidth: 0, width: '100%', boxSizing: 'border-box',
          minHeight: 44, borderRadius: 10, textAlign: 'center',
          borderWidth: grand ? 2 : 1, borderStyle: 'solid',
          borderColor: grand ? 'var(--accent)' : 'var(--border)',
          background: 'var(--bg)', color: 'var(--text)',
          fontFamily: 'var(--font-num)', fontSize: 17, fontWeight: grand ? 700 : 700,
        }}
      />
    </div>
  );
}
