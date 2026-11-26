import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { Fenetre, st as fen } from '../../components/ui/Fenetres.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Lot 12 du panel (26.11.2026) : disponibilité d'un produit de la caisse.
// Quatre choix exclusifs, posés par la RPC caisse_poser_disponibilite : en
// vente, rupture aujourd'hui, épuisé jusqu'à nouvel arrivage, ou « il en
// reste N » aujourd'hui (1 à 999). Ouverte par l'appui long sur une case et
// par la fiche de la case (BoutonFiche), pour les rôles de ROLES_RUPTURE.
//
// La fermeture n'est jamais désactivée pendant l'écriture ; le verrou contre
// la double écriture vit chez l'appelant (verrouRupture de TicketEcran).
// ─────────────────────────────────────────────────────────────────────────────

const CHOIX = [
  { id: 'en_vente', titre: 'En vente', aide: 'Le produit se commande normalement sur toutes les caisses.' },
  { id: 'rupture_jour', titre: 'Rupture aujourd\'hui', aide: 'La case est grisée jusqu\'à demain matin. Le produit revient en vente tout seul.' },
  { id: 'epuise', titre: 'Épuisé jusqu\'à nouvel arrivage', aide: 'La case reste grisée les jours suivants, jusqu\'à ce que vous le remettiez en vente.' },
  { id: 'portions', titre: 'Il en reste', aide: 'Chaque vente retire une portion. À zéro, le produit passe en rupture jusqu\'à demain matin.' },
];

// État de la règle pure (etatDisponibilite) vers le choix de la feuille.
function choixDepuisEtat(etat) {
  if (etat === 'rupture') return 'rupture_jour';
  if (etat === 'epuise') return 'epuise';
  if (etat === 'compte') return 'portions';
  return 'en_vente';
}

const borner = (n) => Math.min(999, Math.max(1, Math.round(Number(n) || 1)));

export default function FeuilleDisponibilite({
  nom, etat, restant = null, enCours = false, onPoser, onClose, piedSecondaire = null, zIndex = null,
}) {
  const [choix, setChoix] = React.useState(() => choixDepuisEtat(etat));
  const [portions, setPortions] = React.useState(() => (etat === 'compte' && restant > 0 ? restant : 10));
  const [saisie, setSaisie] = React.useState(() => String(etat === 'compte' && restant > 0 ? restant : 10));

  function changerPortions(n) {
    const b = borner(n);
    setPortions(b);
    setSaisie(String(b));
  }

  const inchange = choix === choixDepuisEtat(etat) && (choix !== 'portions' || portions === restant);

  return (
    <Fenetre
      id="caisse-disponibilite"
      titre="Disponibilité du produit"
      titreMasque
      onClose={onClose}
      largeur={440}
      zIndex={zIndex}
      pied={(
        <>
          {piedSecondaire || <button type="button" style={fen.secondaire} onClick={onClose}>Fermer</button>}
          <button
            type="button"
            style={fen.primaire}
            disabled={enCours || inchange}
            data-caisse-disponibilite-poser={choix}
            onClick={() => onPoser(choix, choix === 'portions' ? portions : null)}
          >
            Enregistrer
          </button>
        </>
      )}
    >
      <div style={fen.titre} data-no-translate>{nom}</div>
      <div style={s.liste} role="radiogroup" aria-label="Disponibilité du produit" data-caisse-disponibilite="">
        {CHOIX.map((c) => {
          const actif = choix === c.id;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={actif}
              data-choix={c.id}
              style={{ ...s.choix, ...(actif ? s.choixActif : null) }}
              onClick={() => setChoix(c.id)}
            >
              <span style={s.choixTitre}>{c.titre}</span>
              <span style={{ ...s.choixAide, ...(actif ? s.choixAideActif : null) }}>{c.aide}</span>
            </button>
          );
        })}
      </div>
      {choix === 'portions' && (
        <div style={s.compteur} data-caisse-portions="">
          <span style={fen.label}>Portions restantes aujourd&apos;hui</span>
          <div style={s.compteurRang}>
            <button
              type="button"
              style={s.pas}
              aria-label="Une portion de moins"
              disabled={portions <= 1}
              onClick={() => changerPortions(portions - 1)}
            >
              <Minus size={20} strokeWidth={2} aria-hidden="true" />
            </button>
            <input
              type="text"
              inputMode="numeric"
              aria-label="Portions restantes aujourd'hui"
              value={saisie}
              onChange={(e) => {
                const brut = e.target.value.replace(/\D/g, '').slice(0, 3);
                setSaisie(brut);
                if (brut) setPortions(borner(brut));
              }}
              onBlur={() => changerPortions(saisie || portions)}
              style={s.nombre}
              data-no-translate
            />
            <button
              type="button"
              style={s.pas}
              aria-label="Une portion de plus"
              disabled={portions >= 999}
              onClick={() => changerPortions(portions + 1)}
            >
              <Plus size={20} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </Fenetre>
  );
}

const s = {
  liste: { display: 'flex', flexDirection: 'column', gap: 8 },
  choix: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3, width: '100%', minHeight: 52,
    padding: '10px 14px', textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font)', boxSizing: 'border-box',
    background: 'var(--piste)', color: 'var(--text)', borderWidth: 1, borderStyle: 'solid', borderColor: 'transparent',
    borderRadius: 'var(--r)',
  },
  choixActif: { background: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'var(--accent)' },
  choixTitre: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)' },
  choixAide: { fontSize: 'var(--t1)', lineHeight: 1.4, color: 'var(--text2)', whiteSpace: 'normal' },
  choixAideActif: { color: 'var(--on-accent)' },
  compteur: { display: 'flex', flexDirection: 'column', gap: 6 },
  compteurRang: { display: 'flex', alignItems: 'center', gap: 10 },
  pas: {
    width: 44, height: 44, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--btn-fond)', color: 'var(--btn-texte)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)',
    borderRadius: 'var(--r-full)', cursor: 'pointer',
  },
  nombre: {
    width: 88, minHeight: 44, textAlign: 'center', boxSizing: 'border-box', padding: '8px 10px',
    fontFamily: 'var(--font-num)', fontWeight: 'var(--g-chiffre)', fontSize: 'var(--t4)', color: 'var(--text)',
    background: 'var(--surface)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r)',
  },
};
