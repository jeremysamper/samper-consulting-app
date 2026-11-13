import React from 'react';
import { Anneau, Arc, Barres, BoutonFleche, CarteAvant, carteAvantStyles } from '../../components/ui/index.jsx';
import { couvertsDu, decaler, equipeDu, etatShift, jourRelatif } from './tableauLogique.js';

// ───────────────────────────────────────────────────────────────────────────
// Cartes de mise en avant du tableau de bord (direction Galet) : une carte
// sombre à tuiles et deux cartes pastel, chacune avec un graphique simple
// (primitives Anneau, Barres et Arc, src/components/ui/Graphiques.jsx). Elles
// ne lisent rien de plus que le reste du tableau de bord :
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
        <BoutonFleche onClick={onOuvrir} libelle="Ouvrir le planning" ton="nuit" />
      </div>
      <div className="tdb-tuiles">
        {TUILES.map((t) => (
          <div key={t.id} style={{ ...st.tuile, ...s.tuile }} data-tuile-equipe={t.id}>
            <span style={{ minWidth: 0 }}>
              <span style={{ ...st.chiffre, display: 'block' }} data-no-translate>{comptes[t.id]}</span>
              <span style={{ ...st.libelle, display: 'block', marginTop: 6 }}>{t.label}</span>
            </span>
            <Anneau part={total ? comptes[t.id] / total : 0} couleur={t.couleur} piste="var(--carte-nuit)" />
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
  const total = totaux.reduce((a, n) => a + n, 0);
  const abreges = jours.map((d) => {
    const rel = jourRelatif(d, aujourdhui);
    return rel === "aujourd'hui" ? 'Auj.' : rel === 'demain' ? 'Dem.' : `${rel.charAt(0).toUpperCase()}${rel.slice(1, 3)}.`;
  });
  // Sous 280 px de large (widget petit à la tablette), les abréviations se
  // touchent : le jour du mois prend leur place (tableau.css, .tdb-jour-court).
  const libelles = jours.map((d, i) => (
    <React.Fragment key={d}>
      <span className="tdb-jour-long">{abreges[i]}</span>
      <span className="tdb-jour-court" data-no-translate>{Number(d.slice(8, 10))}</span>
    </React.Fragment>
  ));
  return (
    <CarteAvant ton="soleil" data-carte="semaine">
      <div style={s.tete}>
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          <h2 style={{ ...st.titre, ...s.titre }}>Couverts réservés</h2>
          <p style={{ ...st.libelle, ...s.sous }}>Les sept prochains jours</p>
        </div>
        <BoutonFleche onClick={onOuvrir} libelle="Voir les réservations" ton="soleil" />
      </div>
      <p style={s.ligneChiffre}>
        <span style={st.chiffre} data-no-translate>{total.toLocaleString('fr-CH')}</span>
        <span style={st.libelle}>au total</span>
      </p>
      {/* La barre du jour en aplat sombre ; les totaux jour par jour sont dits
          par les nombres posés sous chaque barre. */}
      <Barres valeurs={totaux} libelles={libelles} fort={0} encre="var(--carte-soleil-texte)" />
    </CarteAvant>
  );
}

const SERVICES = [
  { id: 'brunch', mot: 'au brunch', couleur: 'var(--svc-brunch)' },
  { id: 'midi', mot: 'à midi', couleur: 'var(--svc-midi)' },
  { id: 'soir', mot: 'le soir', couleur: 'var(--svc-soir)' },
];

// compacte (widget moyen, une rangée) : l'arc et les services côte à côte,
// la légende passe dessous quand la carte est trop étroite.
export function CarteCouverts({ couverts, aujourdhui, onOuvrir, compacte = false }) {
  const st = carteAvantStyles('ciel');
  const c = couvertsDu(couverts, aujourdhui);
  const total = c.total || 0;
  const parts = SERVICES.filter((x) => c[x.id] > 0);
  // Demi-cercle : chaque service occupe sa part de l'arc, à sa couleur.
  return (
    <CarteAvant ton="ciel" data-carte="couverts">
      <div style={s.tete}>
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          <h2 style={{ ...st.titre, ...s.titre }}>Réservations</h2>
        </div>
        <BoutonFleche onClick={onOuvrir} libelle="Voir les réservations" ton="ciel" />
      </div>
      <div style={compacte ? s.corpsCompact : s.corps}>
      <div style={compacte ? s.arcCompact : null}>
      <Arc parts={parts.map((x) => ({ valeur: c[x.id], couleur: x.couleur }))} total={total} piste="var(--surface)">
        {total > 0 ? (
          <>
            <span style={{ ...st.chiffre, display: 'block' }} data-no-translate>{total.toLocaleString('fr-CH')}</span>
            <span style={{ ...st.libelle, display: 'block', marginTop: 4 }}>{total === 1 ? "couvert aujourd'hui" : "couverts aujourd'hui"}</span>
          </>
        ) : (
          <span style={{ ...st.libelle, display: 'block' }}>Aucune réservation aujourd&apos;hui</span>
        )}
      </Arc>
      </div>
      {parts.length > 0 && (
        <div style={compacte ? { ...s.services, ...s.servicesCompact } : s.services}>
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
      </div>
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
  services: { display: 'flex', justifyContent: 'space-around', gap: 12, flexWrap: 'wrap', minWidth: 0 },
  service: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 },
  serviceMot: { display: 'inline-flex', alignItems: 'center', gap: 6 },
  point: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  corps: { display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 },
  corpsCompact: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px 20px', minWidth: 0 },
  arcCompact: { flex: '1 1 200px', minWidth: 0, maxWidth: 240 },
  servicesCompact: { flex: '1 1 140px', justifyContent: 'flex-start', gap: 20 },
};
