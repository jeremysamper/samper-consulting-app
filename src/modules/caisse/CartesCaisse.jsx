import React from 'react';
import { CalendarClock, ClipboardCheck, ReceiptText } from 'lucide-react';
import { Anneau, BoutonFleche, CarteAvant, CarteRepere, carteAvantStyles } from '../../components/ui/index.jsx';
import { partServies } from './resumeService.js';

// ─────────────────────────────────────────────────────────────────────────────
// Accueil de la Caisse (direction Galet) : la rangée de repères et la carte
// nuit « Tables ouvertes ». Rien n'est lu en plus : les repères redisent, en
// grand, les nombres que les tuiles portent déjà ; la carte compte les tickets
// ouverts et le plan que l'accueil charge (resumeService.js). La mise en page
// suit la largeur du conteneur (caisse.css) : au téléphone, ni repères ni
// carte, les tuiles suffisent.
// ─────────────────────────────────────────────────────────────────────────────

const chf = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);

// Crochets du banc : data-caisse-reperes, data-repere.
export function ReperesCaisse({ ouverts, totalOuvert, sansTicket, etatJour, montrerSansTicket, montrerCloture }) {
  const nb = 1 + (montrerSansTicket ? 1 : 0) + (montrerCloture ? 1 : 0);
  return (
    <div className="caisse-reperes" data-caisse-reperes="" style={{ '--caisse-n': nb }}>
      <CarteRepere
        data-repere="tickets"
        Icone={ReceiptText}
        valeur={ouverts}
        libelle="Tickets ouverts"
        detail={<><span style={st.num} data-no-translate>{chf(totalOuvert)}</span> <span>CHF</span></>}
      />
      {montrerSansTicket && (
        <CarteRepere data-repere="sans-ticket" Icone={CalendarClock} valeur={sansTicket} libelle="Réservations sans ticket" />
      )}
      {montrerCloture && (etatJour?.cloture ? (
        <CarteRepere data-repere="cloture" Icone={ClipboardCheck} texte="La caisse d'aujourd'hui est clôturée" />
      ) : (
        <CarteRepere data-repere="cloture" Icone={ClipboardCheck} valeur={etatJour?.tickets_du_jour ?? 0} libelle="tickets à clôturer aujourd'hui" />
      ))}
    </div>
  );
}

// La carte nuit : ce qui se passe maintenant à la caisse. Sa couleur ne dit
// pas un état ; l'anneau dit la part des tables servies, son compte est écrit
// à côté. Le bouton flèche mène aux tickets ouverts.
export function CarteTablesOuvertes({ resume, onVoir }) {
  const cs = carteAvantStyles('nuit');
  const tuiles = [
    {
      id: 'servies',
      chiffre: <><span data-no-translate>{resume.servies}</span> <span style={st.sur}>sur</span> <span data-no-translate>{resume.actives}</span></>,
      libelle: 'tables servies',
      anneau: partServies(resume),
    },
    { id: 'prets', chiffre: <span data-no-translate>{resume.prets}</span>, libelle: resume.prets > 1 ? 'prêts en cuisine' : 'prêt en cuisine' },
    { id: 'suivre', chiffre: <span data-no-translate>{resume.aSuivre}</span>, libelle: 'à suivre en attente' },
  ];
  return (
    <CarteAvant
      ton="nuit"
      titre="Tables ouvertes"
      action={<BoutonFleche ton="nuit" onClick={onVoir} libelle="Tickets ouverts" />}
      className="caisse-nuit"
      data-caisse-service=""
    >
      <div className="caisse-nuit-tuiles">
        {tuiles.map((t) => (
          <div key={t.id} data-caisse-tuile={t.id} style={{ ...cs.tuile, ...st.tuile }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ ...cs.chiffre, ...st.chiffre }}>{t.chiffre}</span>
              <span style={{ ...cs.libelle, ...st.libelle }}>{t.libelle}</span>
            </span>
            {t.anneau != null && <Anneau part={t.anneau} couleur="var(--carte-nuit-info)" piste="var(--carte-nuit)" />}
          </div>
        ))}
      </div>
    </CarteAvant>
  );
}

const st = {
  num: { fontFamily: 'var(--font-num)' },
  tuile: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  chiffre: { display: 'block', fontSize: 'var(--t5)' },
  sur: { fontFamily: 'var(--font)', fontSize: 'var(--t2)' },
  libelle: { display: 'block', marginTop: 4, fontSize: 'var(--t2)', overflowWrap: 'anywhere' },
};
