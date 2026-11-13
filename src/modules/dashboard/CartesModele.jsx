import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { CarteAvant, carteAvantStyles } from '../../components/ui/index.jsx';
import { couvertsDu, decaler, equipeDu, etatShift, jourRelatif } from './tableauLogique.js';

// ───────────────────────────────────────────────────────────────────────────
// Cartes de mise en avant du tableau de bord (direction Galet) : une carte
// sombre à tuiles et deux cartes pastel, chacune avec un graphique simple
// tracé en SVG. Elles ne lisent rien de plus que le reste du tableau de bord :
// les horaires et les couverts déjà chargés par useDonneesTableau, comptés
// par les fonctions de tableauLogique.js. Une carte sans donnée n'est pas
// rendue par l'appelant ; aucune n'invente un chiffre.
//
//   CarteEquipe (nuit)     l'équipe du jour par état de pointage, en tuiles
//   CarteSemaine (soleil)  les couverts réservés des sept prochains jours
//   CarteCouverts (ciel)   les couverts du jour par service
//
// Traduction : chaque nombre dans son nœud (data-no-translate), chaque texte
// fixe dans le sien ; tous les textes existent déjà ailleurs dans l'app.
// ───────────────────────────────────────────────────────────────────────────

// Bouton rond à flèche, en haut à droite d'une carte : il mène au module,
// pour le rôle qui peut l'ouvrir. Cible de 44 px.
function Fleche({ onClick, libelle, ton }) {
  if (!onClick) return null;
  const nuit = ton === 'nuit';
  return (
    <button
      type="button"
      className="tdb-fleche"
      onClick={onClick}
      aria-label={libelle}
      title={libelle}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, flexShrink: 0,
        padding: 0, border: 'none', borderRadius: '50%', cursor: 'pointer',
        background: nuit ? 'var(--carte-nuit-tuile)' : 'var(--accent)',
        color: nuit ? 'var(--carte-nuit-texte)' : 'var(--on-accent)',
      }}
    >
      <ArrowUpRight size={20} strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}

// Anneau : la part d'une tuile dans le total, de 0 à 1.
function Anneau({ part, couleur }) {
  const p = Math.max(0, Math.min(1, part || 0)) * 100;
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="22" cy="22" r="17" fill="none" strokeWidth="6" style={{ stroke: 'var(--carte-nuit)' }} />
      {p > 0 && (
        <circle
          cx="22" cy="22" r="17" fill="none" strokeWidth="6" strokeLinecap="round" pathLength="100"
          strokeDasharray={`${p} ${100 - p}`} transform="rotate(-90 22 22)" style={{ stroke: couleur }}
        />
      )}
    </svg>
  );
}

// État d'une personne aujourd'hui : son horaire en cours, sinon le prochain,
// sinon le dernier (la règle de « Qui travaille aujourd'hui »). Un horaire
// prévu plus tard dans la journée compte avec « Attendu ».
function etatDeLaPersonne(liste, maintenant) {
  const actif = liste.find((sh) => sh.pointageDebut && !sh.pointageFin)
    || liste.find((sh) => !sh.pointageDebut)
    || liste[liste.length - 1];
  const e = etatShift(actif, maintenant);
  return e === 'prevu' ? 'attendu' : e;
}

const TUILES = [
  { id: 'en_poste', label: 'En poste', couleur: 'var(--carte-nuit-succes)' },
  { id: 'attendu', label: 'Attendu', couleur: 'var(--carte-nuit-info)' },
  { id: 'en_retard', label: 'Pas pointé', couleur: 'var(--carte-nuit-alerte)' },
  { id: 'termine', label: 'Terminé', couleur: 'var(--carte-nuit-doux)' },
];

export function CarteEquipe({ shifts, aujourdhui, maintenant, onOuvrir }) {
  const st = carteAvantStyles('nuit');
  const equipe = equipeDu(shifts, aujourdhui);
  const comptes = { en_poste: 0, attendu: 0, en_retard: 0, termine: 0 };
  equipe.forEach((p) => { const e = etatDeLaPersonne(p.shifts, maintenant); if (e in comptes) comptes[e] += 1; });
  const total = equipe.length;
  return (
    <CarteAvant ton="nuit" data-carte="equipe">
      <div style={s.tete}>
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          <h2 style={{ ...st.titre, ...s.titre }}>L&apos;équipe aujourd&apos;hui</h2>
        </div>
        <div style={s.total}>
          <span style={{ ...st.chiffre, ...s.totalValeur }} data-no-translate>{total}</span>
          <span style={st.libelle}>{total > 1 ? 'personnes au planning' : 'personne au planning'}</span>
        </div>
        <Fleche onClick={onOuvrir} libelle="Ouvrir le planning" ton="nuit" />
      </div>
      <div className="tdb-tuiles">
        {TUILES.map((t) => (
          <div key={t.id} style={{ ...st.tuile, ...s.tuile }} data-tuile-equipe={t.id}>
            <span style={{ minWidth: 0 }}>
              <span style={{ ...st.chiffre, display: 'block' }} data-no-translate>{comptes[t.id]}</span>
              <span style={{ ...st.libelle, display: 'block', marginTop: 6 }}>{t.label}</span>
            </span>
            <Anneau part={total ? comptes[t.id] / total : 0} couleur={t.couleur} />
          </div>
        ))}
      </div>
    </CarteAvant>
  );
}

export function CarteSemaine({ couverts, aujourdhui, onOuvrir }) {
  const st = carteAvantStyles('soleil');
  const jours = Array.from({ length: 7 }, (_, i) => decaler(aujourdhui, i));
  const totaux = jours.map((d) => couvertsDu(couverts, d).total);
  const max = Math.max(1, ...totaux);
  const total = totaux.reduce((a, n) => a + n, 0);
  const abreges = jours.map((d) => {
    const rel = jourRelatif(d, aujourdhui);
    return rel === "aujourd'hui" ? 'Auj.' : rel === 'demain' ? 'Dem.' : `${rel.charAt(0).toUpperCase()}${rel.slice(1, 3)}.`;
  });
  // Barres en SVG, muettes pour un lecteur d'écran : les totaux jour par jour
  // sont dits par les nombres posés sous chaque barre.
  const L = 280; const H = 84; const pas = L / 7; const largeur = 22;
  return (
    <CarteAvant ton="soleil" data-carte="semaine">
      <div style={s.tete}>
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          <h2 style={{ ...st.titre, ...s.titre }}>Couverts réservés</h2>
          <p style={{ ...st.libelle, ...s.sous }}>Les sept prochains jours</p>
        </div>
        <Fleche onClick={onOuvrir} libelle="Voir les réservations" ton="soleil" />
      </div>
      <p style={s.ligneChiffre}>
        <span style={st.chiffre} data-no-translate>{total.toLocaleString('fr-CH')}</span>
        <span style={st.libelle}>au total</span>
      </p>
      <div style={{ minWidth: 0 }}>
        <svg viewBox={`0 0 ${L} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden="true" style={{ display: 'block' }}>
          {totaux.map((n, i) => {
            const h = Math.max(3, (n / max) * (H - 4));
            return (
              <rect
                key={jours[i]} x={i * pas + (pas - largeur) / 2} y={H - h} width={largeur} height={h} rx="5"
                style={{ fill: i === 0 ? 'var(--accent)' : 'var(--carte-soleil-texte)', opacity: n ? 1 : 0.3 }}
              />
            );
          })}
        </svg>
        <div style={s.jours}>
          {jours.map((d, i) => (
            <span key={d} style={s.jour}>
              <span style={{ ...s.jourValeur, color: 'var(--carte-soleil-texte)' }} data-no-translate>{totaux[i]}</span>
              <span style={{ ...st.libelle, fontWeight: i === 0 ? 'var(--g3)' : 'var(--g1)' }}>{abreges[i]}</span>
            </span>
          ))}
        </div>
      </div>
    </CarteAvant>
  );
}

const SERVICES = [
  { id: 'brunch', mot: 'au brunch', couleur: 'var(--svc-brunch)' },
  { id: 'midi', mot: 'à midi', couleur: 'var(--svc-midi)' },
  { id: 'soir', mot: 'le soir', couleur: 'var(--svc-soir)' },
];

export function CarteCouverts({ couverts, aujourdhui, onOuvrir }) {
  const st = carteAvantStyles('ciel');
  const c = couvertsDu(couverts, aujourdhui);
  const total = c.total || 0;
  const parts = SERVICES.filter((x) => c[x.id] > 0);
  // Demi-cercle : chaque service occupe sa part de l'arc, à sa couleur.
  const arc = 'M 14 92 A 76 76 0 0 1 166 92';
  let cumul = 0;
  return (
    <CarteAvant ton="ciel" data-carte="couverts">
      <div style={s.tete}>
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          <h2 style={{ ...st.titre, ...s.titre }}>Réservations</h2>
        </div>
        <Fleche onClick={onOuvrir} libelle="Voir les réservations" ton="ciel" />
      </div>
      <div style={s.jauge}>
        <svg viewBox="0 0 180 100" width="100%" style={{ display: 'block', maxWidth: 240, margin: '0 auto' }} aria-hidden="true">
          <path d={arc} fill="none" strokeWidth="12" style={{ stroke: 'var(--surface)' }} />
          {total > 0 && parts.map((x) => {
            const p = (c[x.id] / total) * 100;
            const trace = (
              <path
                key={x.id} d={arc} fill="none" strokeWidth="12" pathLength="100"
                strokeDasharray={`${p} ${100 - p}`} strokeDashoffset={-cumul} style={{ stroke: x.couleur }}
              />
            );
            cumul += p;
            return trace;
          })}
        </svg>
        <div style={s.jaugeCentre}>
          {total > 0 ? (
            <>
              <span style={{ ...st.chiffre, display: 'block' }} data-no-translate>{total.toLocaleString('fr-CH')}</span>
              <span style={{ ...st.libelle, display: 'block', marginTop: 4 }}>{total === 1 ? "couvert aujourd'hui" : "couverts aujourd'hui"}</span>
            </>
          ) : (
            <span style={{ ...st.libelle, display: 'block' }}>Aucune réservation aujourd&apos;hui</span>
          )}
        </div>
      </div>
      {parts.length > 0 && (
        <div style={s.services}>
          {parts.map((x) => (
            <span key={x.id} style={s.service}>
              <span style={{ ...st.chiffre, fontSize: 'var(--t5)' }} data-no-translate>{c[x.id]}</span>
              <span style={s.serviceMot}>
                <span aria-hidden="true" style={{ ...s.point, background: x.couleur }} />
                <span style={st.libelle}>{x.mot}</span>
              </span>
            </span>
          ))}
        </div>
      )}
    </CarteAvant>
  );
}

const s = {
  tete: { display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 },
  titre: { margin: 0, fontSize: 'var(--t3)', lineHeight: 1.25 },
  sous: { margin: '2px 0 0' },
  total: { display: 'flex', alignItems: 'baseline', gap: 8, flexShrink: 0 },
  totalValeur: { fontSize: 'var(--t5)' },
  tuile: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  ligneChiffre: { display: 'flex', alignItems: 'baseline', gap: 8, margin: 0 },
  jours: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', marginTop: 6 },
  jour: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, minWidth: 0 },
  jourValeur: { fontFamily: 'var(--font-num)', fontSize: 'var(--t2)', fontVariantNumeric: 'tabular-nums' },
  jauge: { position: 'relative', minWidth: 0 },
  jaugeCentre: { position: 'absolute', left: 0, right: 0, bottom: 0, textAlign: 'center' },
  services: { display: 'flex', justifyContent: 'space-around', gap: 12, flexWrap: 'wrap', minWidth: 0 },
  service: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 },
  serviceMot: { display: 'inline-flex', alignItems: 'center', gap: 6 },
  point: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
};
