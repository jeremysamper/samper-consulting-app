import React from 'react';
import { ArrowRight, TrendingDown, TrendingUp } from 'lucide-react';
import { hs } from './HACCP.styles.js';
import ActionsCorrectives, { Mesure, PlageTexte } from './ActionsCorrectives.jsx';
import { verdictReleve } from './haccpJour.js';

// ─────────────────────────────────────────────────────────────────────────────
// Une zone (frigo ou appareil) sur l'accueil : son nom, sa plage en clair, son
// dernier chiffre, son état en mots (« Bon, à 07:00 », « Trop chaud, à 11:21 »,
// « Pas encore relevé aujourd'hui »), et « Relever » pour la relever seule.
//
// Plus de règle « relevé il y a plus de 4 h » : elle contredisait les heures
// de relevé (cinq frigos « en retard » à 11:20 avant la tournée de 11:30).
// Le retard se lit sur la carte « Maintenant » et le programme du jour.
//
// Relever : le chiffre tapé est jugé avant d'enregistrer ; hors plage, le
// verdict, la plage et les actions proposées (ActionsCorrectives), au choix.
// « ✓ » enregistre à l'heure réelle, avec les actions choisies.
// Crochet du banc : data-haccp-zone.
// ─────────────────────────────────────────────────────────────────────────────

const N = ({ children }) => <span data-no-translate="">{children}</span>;

function DernierJour({ date, today }) {
  const [y, m, d] = String(date).split('-').map(Number);
  const hier = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10) === today;
  if (hier) return <>hier</>;
  return <N>{`${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.`}</N>;
}

const ZoneTile = ({ zone, last, today, trend, actif, valeur, choix, canWrite, enCours, onOuvrir, onFermer, onValeur, onChoix, onEnregistrer }) => {
  const unite = zone.unite || '°C';
  const duJour = last && last.date === today;
  const verdictDernier = last ? verdictReleve(zone, last.valeur) : null;
  // Le dernier chiffre du jour garde la couleur de son résultat enregistré ;
  // un chiffre d'un autre jour reste neutre.
  const couleur = !duJour ? 'var(--text2)' : last.conforme ? 'var(--success-text)' : 'var(--danger-strong)';

  // ─── Indicateur de tendance (par rapport aux 7 jours précédents) ───
  // Icône seule (hausse, baisse, stable) avec un nom accessible fixe : le
  // libellé ne porte pas l'écart chiffré, sinon chaque valeur partirait à la
  // traduction. Pour une zone froide, la hausse est mauvaise ; pour une zone
  // chaude, la baisse.
  let TrendIcon = null, trendColor = null, trendLabel = null;
  if (trend) {
    if (trend.direction === 'up') {
      TrendIcon = TrendingUp;
      trendColor = zone.type === 'froid' ? 'var(--danger-strong)' : 'var(--warning-strong)';
      trendLabel = 'En hausse par rapport à la semaine précédente';
    } else if (trend.direction === 'down') {
      TrendIcon = TrendingDown;
      trendColor = zone.type === 'chaud' ? 'var(--danger-strong)' : 'var(--success-strong)';
      trendLabel = 'En baisse par rapport à la semaine précédente';
    } else {
      TrendIcon = ArrowRight;
      trendColor = 'var(--text2)';
      trendLabel = 'Stable par rapport à la semaine précédente';
    }
  }

  // État en mots, à droite.
  let etat;
  if (!last) etat = <span style={{ color: 'var(--text2)' }}>Pas encore relevé aujourd'hui</span>;
  else if (!duJour) etat = <span style={{ color: 'var(--text2)' }}>Dernier relevé <DernierJour date={last.date} today={today} /> à <N>{String(last.heure).slice(0, 5)}</N></span>;
  else {
    const mot = last.conforme ? 'Bon' : (verdictDernier?.ton === 'danger' ? verdictDernier.mot : 'À surveiller');
    etat = <span style={{ color: last.conforme ? 'var(--success-text)' : 'var(--danger-strong)', fontWeight: 600 }}>{mot}, à <N>{String(last.heure).slice(0, 5)}</N></span>;
  }

  const verdictSaisie = actif ? verdictReleve(zone, valeur) : null;

  return (
    <div data-haccp-zone={zone.id} style={st.zone}>
      {/* Le nom, la plage et l'état à gauche ; le chiffre et « Relever » à
          droite : une zone tient en une rangée sur téléphone. */}
      <div style={st.haut}>
        <div style={{ minWidth: 0, flex: '1 1 160px' }}>
          <div style={st.nom}>{zone.nom}</div>
          <div style={st.plage}><PlageTexte zone={zone} /></div>
          <div style={st.etat}>{etat}</div>
        </div>
        <div style={st.droite}>
          {last && (
            <div style={{ ...st.valeur, color: couleur }}>
              <Mesure valeur={last.valeur} unite={unite} />
              {TrendIcon && (
                <span role="img" aria-label={trendLabel} title={trendLabel} style={{ display: 'inline-flex', alignSelf: 'center', color: trendColor }}>
                  <TrendIcon size={16} strokeWidth={2.2} aria-hidden="true" />
                </span>
              )}
            </div>
          )}
          {canWrite && !actif && <button type="button" style={st.relever} onClick={onOuvrir}>Relever</button>}
        </div>
      </div>

      {actif && (
        <div style={{ paddingTop: 8 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              autoFocus type="number" step="0.1" enterKeyHint="done"
              value={valeur}
              aria-label={`${zone.nom}`}
              onChange={e => onValeur(e.target.value)}
              placeholder={zone.cible != null ? String(zone.cible) : ''}
              disabled={enCours}
              style={{ ...st.champ, ...(verdictSaisie?.ton === 'danger' ? st.champAlerte : {}) }}
              onKeyDown={e => {
                if (e.key === 'Enter') onEnregistrer();
                if (e.key === 'Escape') onFermer();
              }}
            />
            <span data-no-translate="" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text2)', flexShrink: 0 }}>{unite}</span>
            <button type="button" aria-label="Enregistrer" disabled={enCours} style={st.valider} onClick={onEnregistrer}>✓</button>
            <button type="button" aria-label="Annuler le relevé" style={st.annuler} onClick={onFermer}>×</button>
          </div>
          {verdictSaisie?.ton === 'ok' && <div style={{ marginTop: 6, fontSize: 14, fontWeight: 600, color: 'var(--success-text)' }}>Bon</div>}
          <ActionsCorrectives zone={zone} valeur={valeur} choix={choix} onChoix={onChoix} rappelPlage desactive={enCours} />
        </div>
      )}
    </div>
  );
};

const st = {
  zone: { ...hs.zoneTile, borderRadius: 0, borderBottom: '1px solid var(--border)', flexDirection: 'column', alignItems: 'stretch', gap: 0, padding: '10px 0', minWidth: 0 },
  haut: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  nom: { fontSize: 15, fontWeight: 600, color: 'var(--text)' },
  plage: { fontSize: 12, color: 'var(--text2)', marginTop: 2, lineHeight: 1.35 },
  valeur: { fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-num)', display: 'flex', alignItems: 'baseline', gap: 4, justifyContent: 'flex-end' },
  etat: { fontSize: 13, marginTop: 4, lineHeight: 1.35 },
  droite: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 },
  relever: {
    minHeight: 44, padding: '8px 18px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 'var(--r)',
    cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 14, fontWeight: 600,
  },
  champ: {
    flex: '1 1 50px', minWidth: 0, height: 44, boxSizing: 'border-box', padding: '0 10px', borderRadius: 'var(--r-sm)',
    borderWidth: 2, borderStyle: 'solid', borderColor: 'var(--accent)',
    fontSize: 18, fontWeight: 700, textAlign: 'center', fontFamily: 'var(--font-num)', background: 'var(--bg)', color: 'var(--text)',
  },
  champAlerte: { borderColor: 'var(--danger-strong)', color: 'var(--danger-text)' },
  valider: { flexShrink: 0, width: 44, height: 44, background: 'var(--success-fill)', color: 'var(--on-success)', border: 'none', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontSize: 18, fontWeight: 700 },
  annuler: { flexShrink: 0, width: 44, height: 44, background: 'var(--bg)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontSize: 18 },
};

export default ZoneTile;
