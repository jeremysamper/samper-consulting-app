import { useEffect, useRef, useState } from 'react';
import { authService } from '../../services/supabase.js';
import { readText, UI_STORAGE_KEYS, writeText } from '../../utils/storage.js';
import { zurichAjouterJours, zurichToday } from '../../utils/zurichTime.js';

// ─────────────────────────────────────────────────────────────────────────────
// Rappel d'activation du code à usage unique (double authentification) pour
// les consultants dont le compte n'a aucun facteur TOTP vérifié. Une ligne
// dans la rangée des bandeaux de la coque (hors-ligne, icône iOS), jamais une
// fenêtre : rien ne capte le focus, aucune tâche ne coûte un geste de plus.
// « Activer » ouvre Mon compte, le même geste que le nom en pied de barre ;
// « Plus tard » le cache jusqu'au lendemain 06:00 à Zurich. Les autres rôles
// ne le voient pas : un compte d'appareil partagé par une brigade se fermerait
// à tous dès qu'une personne y lie son téléphone (décision du 29.10.2026).
// ─────────────────────────────────────────────────────────────────────────────

const TEXTE = 'Protégez votre compte consultant avec un code à usage unique.';

// Verdict gardé le temps de la session, par compte : la lecture des facteurs
// (une requête) se fait une fois, pas à chaque remontage de la coque.
// true = un facteur vérifié existe, false = aucun.
const verdicts = new Map();

async function lireVerdict(userId) {
  const { verified } = await authService.listTotpFactors();
  const protege = verified.length > 0;
  verdicts.set(userId, protege);
  return protege;
}

function partiesZurich(instant) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant).map((p) => [p.type, p.value]));
}

// Instant ISO du lendemain à 06:00, heure de Zurich. Deux passes absorbent le
// passage à l'heure d'été (même méthode que zurichMinuitIso).
export function demainSixHeuresIso() {
  const [y, m, d] = zurichAjouterJours(zurichToday(), 1).split('-').map(Number);
  const cible = Date.UTC(y, m - 1, d, 6);
  let t = cible;
  for (let i = 0; i < 2; i += 1) {
    const p = partiesZurich(new Date(t));
    t += cible - Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  }
  return new Date(t).toISOString();
}

function estReporte() {
  const jusqua = Date.parse(readText(UI_STORAGE_KEYS.totpRappelJusqua, ''));
  return Number.isFinite(jusqua) && jusqua > Date.now();
}

export default function TotpRappel({ user, onActiver, compteOuvert = false }) {
  const consultant = user?.role === 'consultant';
  const userId = user?.id;
  const [sansFacteur, setSansFacteur] = useState(() => verdicts.get(userId) === false);
  const [reporte, setReporte] = useState(estReporte);
  const compteEtaitOuvert = useRef(false);

  // Première lecture, une par session et par compte. Erreur réseau : pas de
  // bandeau, jamais de blocage.
  useEffect(() => {
    if (!consultant || !userId || verdicts.has(userId)) return undefined;
    let actif = true;
    lireVerdict(userId)
      .then((protege) => { if (actif) setSansFacteur(!protege); })
      .catch((err) => console.warn('[TOTP] facteurs illisibles, rappel tu', err));
    return () => { actif = false; };
  }, [consultant, userId]);

  // Mon compte vient de se fermer : l'activation (ou le retrait) a pu s'y
  // faire, on relit une fois.
  useEffect(() => {
    if (compteOuvert) { compteEtaitOuvert.current = true; return undefined; }
    if (!compteEtaitOuvert.current || !consultant || !userId) return undefined;
    compteEtaitOuvert.current = false;
    let actif = true;
    lireVerdict(userId)
      .then((protege) => { if (actif) setSansFacteur(!protege); })
      .catch(() => {});
    return () => { actif = false; };
  }, [compteOuvert, consultant, userId]);

  if (!consultant || !sansFacteur || reporte) return null;

  const plusTard = () => {
    writeText(UI_STORAGE_KEYS.totpRappelJusqua, demainSixHeuresIso());
    setReporte(true);
  };

  return (
    <div role="status" className="sc-totp-rappel" style={s.band}>
      <span style={s.text}>{TEXTE}</span>
      <span style={s.actions}>
        <button type="button" style={s.activer} onClick={onActiver}>Activer</button>
        <button type="button" style={s.plusTard} onClick={plusTard}>Plus tard</button>
      </span>
    </div>
  );
}

// Mêmes tons que les bandeaux d'état (OfflineBanner, HomeScreenIconBanner) :
// fond info doux, filet, texte info ; les boutons restent sur fond transparent
// (jamais un token -text en fond sous un texte clair).
const s = {
  band: {
    display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center',
    gap: '2px 14px', padding: '4px 12px',
    background: 'var(--info-bg-soft, var(--info-bg))',
    borderBottom: '1.5px solid var(--info-bd, var(--info-text))',
    flexShrink: 0,
  },
  text: {
    fontSize: 12, fontWeight: 500, color: 'var(--info-text)', fontFamily: 'var(--font)',
    lineHeight: 1.4, textAlign: 'center',
  },
  actions: { display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 },
  activer: {
    padding: '0 14px', minHeight: 32, borderRadius: 8, border: '1px solid var(--info-text)',
    background: 'transparent', color: 'var(--info-text)', fontSize: 12, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap',
  },
  plusTard: {
    padding: '0 12px', minHeight: 32, borderRadius: 8, border: '1px solid transparent',
    background: 'transparent', color: 'var(--info-text)', fontSize: 12, fontWeight: 500,
    cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap',
  },
};
