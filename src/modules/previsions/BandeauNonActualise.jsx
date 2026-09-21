import { useEffect, useRef, useState } from 'react';
import { Btn } from '../../components/ui/index.jsx';

// ═══════════════════════════════════════════════════════════════════════════
// Relecture en échec alors que des données sont déjà à l'écran.
//
// On les garde : elles étaient valides il y a un instant, et les remplacer
// par une erreur (ou par une liste vide) laisserait l'hôte sans rien au
// moment où il accueille. Mais on ne laisse pas croire qu'elles sont à jour :
// une résa prise entre-temps sur un autre appareil peut y manquer.
//
// Un échec réseau se répare seul (resumeCoordinator rejoue la lecture dès que
// le réseau répond de nouveau) ; le bouton couvre les autres cas.
// ═══════════════════════════════════════════════════════════════════════════

export default function BandeauNonActualise({ onRetry }) {
  // La relecture est silencieuse : sans retour visible, un tap semble ignoré
  // et on retape, ce qui relance à chaque fois toutes les requêtes.
  const [enCours, setEnCours] = useState(false);
  const monteRef = useRef(true);
  useEffect(() => {
    monteRef.current = true;
    return () => { monteRef.current = false; };
  }, []);

  async function reessayer() {
    if (enCours) return;
    setEnCours(true);
    try {
      await onRetry?.();
    } finally {
      // Réussie, la relecture retire le bandeau : plus rien à remettre.
      if (monteRef.current) setEnCours(false);
    }
  }

  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 10, flexWrap: 'wrap',
        padding: '6px 6px 6px 12px', marginBottom: 12, borderRadius: 8,
        borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--warning-bd)',
        background: 'var(--warning-bg-soft)', color: 'var(--warning-text)',
        fontSize: 12, fontFamily: 'var(--font)',
      }}
    >
      <span style={{ flex: '1 1 200px', minWidth: 0 }}>
        Actualisation impossible : dernière version reçue affichée.
      </span>
      <Btn small onClick={reessayer} disabled={enCours}>
        {enCours ? 'Actualisation…' : 'Réessayer'}
      </Btn>
    </div>
  );
}
