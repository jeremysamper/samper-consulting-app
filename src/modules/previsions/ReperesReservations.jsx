import React from 'react';
import { CalendarCheck, Moon, Sun } from 'lucide-react';
import { Anneau, CarteAvant, CarteRepere, carteAvantStyles } from '../../components/ui/index.jsx';
import { SERVICE_META, SERVICES_AFFICHES } from './statutsReservation.js';
import './reservations.css';

// ─────────────────────────────────────────────────────────────────────────────
// Accueil des Réservations (direction Galet) : la rangée de repères et la
// carte du service du jour, posées par AccueilReservations autour des tuiles.
// Rien n'est lu en plus : tout vient des réservations du jour que l'accueil
// charge déjà (chiffresDuJour, accueilReservations.js). Tant que la lecture n'a pas abouti, rien n'est
// rendu.
//
//   repères      couverts à midi ; couverts le soir ; réservations du jour,
//                et celles de groupe
//   carte nuit   les couverts du jour, une tuile par service (couverts, à
//                table, anneau des couverts arrivés)
//
// La carte se lit sans toucher : le service se joue ensuite dans la Caisse.
// Au téléphone (reservations.css), les repères du midi et du soir ne sont pas
// rendus : la carte les dit déjà. Sans réservation aujourd'hui, la carte n'est
// pas rendue. Nombres dans leurs propres nœuds : la phrase autour reste une
// entrée du glossaire. Crochets du banc : data-resa-reperes, data-repere,
// data-resa-carte, data-resa-service.
// ─────────────────────────────────────────────────────────────────────────────

const N = ({ children }) => <span data-no-translate="">{children}</span>;
const pluriel = (n, un, plusieurs) => (n > 1 ? plusieurs : un);

export default function ReperesReservations({ chiffres }) {
  if (!chiffres) return null;
  const { jour, services } = chiffres;
  return (
    <div className="resa-reperes" data-resa-reperes="">
      <CarteRepere
        data-repere="midi"
        Icone={Sun}
        valeur={services.midi.couverts}
        libelle={pluriel(services.midi.couverts, 'couvert à midi', 'couverts à midi')}
      />
      <CarteRepere
        data-repere="soir"
        Icone={Moon}
        valeur={services.soir.couverts}
        libelle={pluriel(services.soir.couverts, 'couvert le soir', 'couverts le soir')}
      />
      {jour.reservations ? (
        <CarteRepere
          data-repere="reservations"
          Icone={CalendarCheck}
          valeur={jour.reservations}
          libelle={pluriel(jour.reservations, 'réservation aujourd\'hui', 'réservations aujourd\'hui')}
          detail={jour.groupes ? <><N>{jour.groupes}</N> {pluriel(jour.groupes, 'réservation de groupe', 'réservations de groupe')}</> : null}
        />
      ) : (
        <CarteRepere data-repere="reservations" Icone={CalendarCheck} texte="aucune réservation aujourd'hui" />
      )}
    </div>
  );
}

const cs = carteAvantStyles('nuit');

export function CarteServiceDuJour({ chiffres }) {
  if (!chiffres || !chiffres.jour.reservations) return null;
  const { jour, services } = chiffres;
  return (
    <CarteAvant ton="nuit" className="resa-carte-nuit" data-resa-carte="">
      <div style={st.tete}>
        <h2 style={{ ...cs.titre, ...st.titre }}>Aujourd&apos;hui</h2>
      </div>
      <span style={st.total}>
        <span style={{ ...cs.chiffre, ...st.totalChiffre }} data-no-translate="">{jour.couverts}</span>
        <span style={cs.libelle}>{pluriel(jour.couverts, 'couvert', 'couverts')}</span>
      </span>
      <div className="resa-services">
        {SERVICES_AFFICHES.map(id => {
          const s = services[id];
          const fini = s.couverts > 0 && s.arrives === s.couverts;
          const encre = fini ? 'var(--carte-nuit-succes)' : 'var(--carte-nuit-info)';
          return (
            <div key={id} data-resa-service={id} style={{ ...cs.tuile, ...st.tuile }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ ...cs.chiffre, ...st.tuileChiffre }} data-no-translate="">{s.couverts}</span>
                <span style={{ ...cs.libelle, ...st.tuileNom }}>{SERVICE_META[id].label}</span>
                <span style={{ ...st.tuileEtat, color: encre }}><N>{s.attables}</N> à table</span>
              </span>
              <Anneau part={s.couverts ? s.arrives / s.couverts : 0} couleur={encre} piste="var(--carte-nuit)" />
            </div>
          );
        })}
      </div>
    </CarteAvant>
  );
}

const st = {
  tete: { display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 },
  titre: { flex: '1 1 auto', margin: 0, fontSize: 'var(--t4)', lineHeight: 1.2 },
  total: { display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0, marginTop: -6 },
  totalChiffre: { fontSize: 'var(--t5)' },
  tuile: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  tuileChiffre: { display: 'block', fontSize: 'var(--t5)' },
  tuileNom: { display: 'block', marginTop: 4, fontSize: 'var(--t2)', color: 'var(--carte-nuit-texte)' },
  tuileEtat: { display: 'block', marginTop: 2, fontSize: 'var(--t1)', fontWeight: 'var(--g3)' },
};
