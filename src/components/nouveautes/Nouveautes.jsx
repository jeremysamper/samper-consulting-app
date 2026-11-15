import React from 'react';
import { CreditCard } from 'lucide-react';
import { Fenetre, st as fst } from '../ui/Fenetres.jsx';
import { getModuleIcon } from '../../modules/moduleIcons.js';
import { canManageModule } from '../../data/demoData.js';
import { dbService } from '../../services/dbService.js';
import { readJson, writeJson } from '../../utils/storage.js';
import { zurichToday } from '../../utils/zurichTime.js';
import {
  BOUTONS, CLE, cleLocale, composerNote, fusionnerVues, marquerVues, memesVues, normaliserVues, pageExclue,
} from './nouveautesLogique.js';

// ─────────────────────────────────────────────────────────────────────────────
// Note de mise à jour au lancement (lot N1) : une fenêtre, une carte à la fois.
//
// Décidée une seule fois par lancement, quand tout est prêt : hydratation
// après la connexion finie (donneesPretes), établissement connu, état des
// points lu (ou 5 s écoulées : une lecture en échec ne doit pas tout bloquer).
// Jamais si la page de départ ou la page courante est le KDS ou le pointage.
// Vu : copie locale d'abord (sc_nouveautes_vues_<userId>), puis user_settings
// (clé nouveautes_vues) ; une écriture en échec garde la copie locale, qui
// repart au lancement suivant. Fermer, passer ou finir = vu.
// ─────────────────────────────────────────────────────────────────────────────

const ATTENTE_POINTS_MS = 5000;
const SEUIL_GLISSE = 48;

const PICTOS = { caisse: CreditCard };
const pictoDe = (cle) => PICTOS[cle] || getModuleIcon(cle);

function lireVues(userId) {
  const locale = normaliserVues(readJson(cleLocale(userId), null));
  const db = dbService.getDb();
  if (!db?.isUserSettingsCacheReady?.()) return { vues: locale, aRenvoyer: false };
  const compte = normaliserVues(db.getUserSettingSync(CLE, null));
  const vues = fusionnerVues(locale, compte);
  return { vues, aRenvoyer: !memesVues(vues, compte) };
}

function garderVues(userId, vues) {
  writeJson(cleLocale(userId), vues);
  const db = dbService.getDb();
  if (!db?.setUserSetting) return;
  Promise.resolve(db.setUserSetting(CLE, vues)).catch((err) => {
    console.warn('[nouveautes] vues gardées sur ce poste seulement', err?.message || err);
  });
}

export default function Nouveautes({ user, etablissement, donneesPretes, page, modules, points, pointsAttendus }) {
  const userId = user?.id;
  const pageDepart = React.useRef(page);
  const decide = React.useRef(false);
  const [delaiEcoule, setDelaiEcoule] = React.useState(false);
  const [note, setNote] = React.useState(null); // { cartes, marquer }
  const [rang, setRang] = React.useState(0);

  const etabPret = Boolean(etablissement?.id);
  React.useEffect(() => {
    if (!donneesPretes || !etabPret) return undefined;
    const t = setTimeout(() => setDelaiEcoule(true), ATTENTE_POINTS_MS);
    return () => clearTimeout(t);
  }, [donneesPretes, etabPret]);

  const pointsDecides = !pointsAttendus || points?.pret || delaiEcoule;

  React.useEffect(() => {
    if (decide.current || !userId || !donneesPretes || !etabPret || !pointsDecides) return;
    decide.current = true;
    if (pageExclue(pageDepart.current) || pageExclue(page)) return;
    const { vues, aRenvoyer } = lireVues(userId);
    if (aRenvoyer) garderVues(userId, vues);
    const droits = new Set((modules || []).map((m) => m.permKey).filter(Boolean));
    const resultat = composerNote({
      jour: zurichToday(),
      vues,
      droits,
      gereFacturesAchat: canManageModule(user?.role, 'factures_achat'),
      points: { actif: points?.actif, participant: points?.participant, gere: points?.gere },
    });
    if (resultat.cartes.length) setNote(resultat);
  }, [userId, user?.role, donneesPretes, etabPret, pointsDecides, page, modules, points]);

  const noteRef = React.useRef(null);
  noteRef.current = note;
  const fermer = React.useCallback(() => {
    const courante = noteRef.current;
    if (!courante) return;
    noteRef.current = null;
    const { vues } = lireVues(userId);
    garderVues(userId, marquerVues(vues, courante.marquer, new Date().toISOString()));
    setNote(null);
  }, [userId]);

  const total = note?.cartes.length || 0;
  const aller = React.useCallback((sens) => {
    setRang((r) => Math.min(Math.max(r + sens, 0), Math.max(total - 1, 0)));
  }, [total]);

  // Flèches du clavier : carte suivante ou précédente (Échap ferme, géré par Fenetre).
  React.useEffect(() => {
    if (!note) return undefined;
    const touche = (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); aller(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); aller(-1); }
    };
    document.addEventListener('keydown', touche);
    return () => document.removeEventListener('keydown', touche);
  }, [note, aller]);

  // Glisser au doigt (ou à la souris) : vers la gauche, carte suivante.
  const depart = React.useRef(null);
  const surDebut = (e) => { depart.current = { x: e.clientX, y: e.clientY }; };
  const surFin = (e) => {
    const d = depart.current;
    depart.current = null;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) < SEUIL_GLISSE || Math.abs(dx) < Math.abs(dy)) return;
    aller(dx < 0 ? 1 : -1);
  };

  if (!note) return null;
  const carte = note.cartes[Math.min(rang, total - 1)];
  const derniere = rang >= total - 1;
  const Picto = pictoDe(carte.picto);

  return (
    <Fenetre
      id="nouveautes"
      titre={carte.titre}
      titreMasque
      onClose={fermer}
      largeur={440}
      pied={(
        <>
          {!derniere && <button type="button" onClick={fermer} style={fst.secondaire}>{BOUTONS.passer}</button>}
          <button type="button" data-nouveautes-suite="" onClick={derniere ? fermer : () => aller(1)} style={fst.primaire}>
            {derniere ? BOUTONS.fin : BOUTONS.suivant}
          </button>
        </>
      )}
    >
      <div
        data-nouveautes-carte={carte.id}
        aria-live="polite"
        style={s.carte}
        onPointerDown={surDebut}
        onPointerUp={surFin}
        onPointerCancel={() => { depart.current = null; }}
      >
        <span style={s.picto} aria-hidden="true"><Picto size={26} strokeWidth={1.9} /></span>
        <h2 style={s.titre}>{carte.titre}</h2>
        <ul style={s.liste}>
          {carte.lignes.map((ligne, i) => (
            <li key={i} style={s.ligne}>
              <span style={s.puce} aria-hidden="true" />
              <span>
                {ligne.map((morceau, j) => (
                  <React.Fragment key={j}>
                    {/* Après un nombre, espace insécable : « 2 points » ne se coupe pas. */}
                    {j > 0 && (typeof ligne[j - 1] === 'string' ? ' ' : ' ')}
                    {typeof morceau === 'string'
                      ? <span>{morceau}</span>
                      : <span data-no-translate style={s.nombre}>{morceau.n}</span>}
                  </React.Fragment>
                ))}
              </span>
            </li>
          ))}
        </ul>
        {total > 1 && (
          <div style={s.points} aria-hidden="true">
            {note.cartes.map((c, i) => <span key={c.id} style={i === rang ? s.pointActif : s.point} />)}
          </div>
        )}
      </div>
    </Fenetre>
  );
}

const s = {
  carte: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 14, touchAction: 'pan-y', userSelect: 'none', paddingTop: 4 },
  picto: {
    width: 56, height: 56, borderRadius: 'var(--r-full)', background: 'var(--piste)', color: 'var(--text)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  titre: { margin: 0, fontSize: 'var(--t5)', fontWeight: 'var(--g2)', color: 'var(--text)', fontFamily: 'var(--font)', lineHeight: 1.2, paddingRight: 32 },
  // Hauteur de cinq lignes : les boutons ne sautent pas d'une carte à l'autre.
  liste: {
    margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10,
    fontSize: 'var(--t3)', lineHeight: 1.35, minHeight: 'calc(5 * 1.35em + 40px)', width: '100%',
  },
  ligne: { display: 'flex', alignItems: 'baseline', gap: 10, color: 'var(--text)', fontFamily: 'var(--font)' },
  puce: { width: 6, height: 6, borderRadius: 'var(--r-full)', background: 'var(--text3)', flexShrink: 0, transform: 'translateY(-3px)' },
  nombre: { fontFamily: 'var(--font-num)', whiteSpace: 'nowrap' },
  points: { display: 'flex', gap: 6, alignSelf: 'center', paddingTop: 2 },
  point: { width: 8, height: 8, borderRadius: 'var(--r-full)', background: 'var(--border2)' },
  pointActif: { width: 20, height: 8, borderRadius: 'var(--r-full)', background: 'var(--accent)' },
};
