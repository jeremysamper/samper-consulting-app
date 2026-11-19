import { RotateCw, TriangleAlert } from 'lucide-react';
import { chaises } from '../salle/planVue.js';
import { hhmm, minutesDe } from '../salle/planTemps.js';

// ─────────────────────────────────────────────────────────────────────────────
// Une table sur le plan de salle de Réservations, à l'échelle k (pixels par
// unité du canevas). Même langue que le plan de la caisse : chaises autour,
// fond et chaises dans la couleur de l'état, numéro en grand, et ce qui tient
// en dessous (le nom, l'heure ou les couverts). Ce qui ne tient pas n'est pas
// rendu plutôt que d'être écrit en trop petit : rien sous 12 px.
//
// États (service) :
//   libre     surface blanche, chaises grises
//   reservee  une réservation attendue maintenant ou plus tard dans le service
//   atable    le client est arrivé (aplat sombre, comme ce qui est en cours)
//   retard    attendue et en retard de plus de 15 minutes
// Une tablée rapprochée se lit comme une seule table : seule la table qui
// porte le numéro parle, les autres prennent la même couleur sans texte.
//
// Repères posés sur les coins, hors du toucher : la tablée suivante de la
// soirée (pastille sombre, son heure) en haut à droite, une allergie en bas à
// gauche.
// ─────────────────────────────────────────────────────────────────────────────

const FOND = {
  libre: { bg: 'var(--surface)', bd: 'var(--border2)', tx: 'var(--text)', doux: 'var(--text3)', chaise: 'var(--border2)' },
  reservee: { bg: 'var(--info-bg-soft)', bd: 'var(--info-bd)', tx: 'var(--info-text)', doux: 'var(--info-text)', chaise: 'var(--info-bd)' },
  atable: { bg: 'var(--accent)', bd: 'var(--accent)', tx: 'var(--on-accent)', doux: 'var(--on-accent)', chaise: 'var(--accent)' },
  retard: { bg: 'var(--warning-bg-soft)', bd: 'var(--warning-bd)', tx: 'var(--warning-text)', doux: 'var(--warning-text)', chaise: 'var(--warning-bd)' },
};

export const COULEUR_ETAT = Object.fromEntries(Object.entries(FOND).map(([k, v]) => [k, v.chaise]));

const allergiesDe = (resa) => (Array.isArray(resa?.reservation_tags) ? resa.reservation_tags : [])
  .filter((t) => t.type_tag === 'allergene' && t.valeur).map((t) => t.valeur);

export default function PlanTable({
  t, k, mode = 'service', etat = 'libre', role = null, info = null, places = 0,
  deplacable = false, touchable = true,
  cible = false, convient = false, proposee = false, choisie = false, enGlisse = false,
  onPointerDown, onClick, onDoubleClick, onTourner = null,
}) {
  const tabouret = t.forme === 'tabouret';
  const ronde = t.forme === 'ronde' || tabouret;
  const w = Math.max(tabouret ? 30 : 40, Number(t.largeur) * k);
  const h = Math.max(tabouret ? 30 : 40, Number(t.hauteur) * k);
  const inactive = t.actif === false;
  const service = mode === 'service';
  const e = service ? etat : 'libre';
  const c = FOND[e] || FOND.libre;
  const parle = role !== 'secondaire';
  const r = info?.affichee || null;

  // Tailles : le numéro grandit avec la table, le texte reste entre 12 et 14.
  const cote = Math.min(w, h);
  const fNum = Math.round(Math.max(13, Math.min(22, 11 + cote * 0.085)));
  const fTxt = cote >= 110 ? 14 : 12;
  const utile = (ronde ? w * 0.74 : w) - 10;
  const tient = (texte, f) => String(texte).length * f * 0.56 <= utile;
  const lignesPossibles = Math.max(0, Math.floor((h - 8 - fNum * 1.15) / (fTxt * 1.3)));
  // Une ligne est faite de morceaux : les nombres et les noms (données) ne
  // partent pas au traducteur, les mots autour passent au glossaire.
  const lignes = [];
  const ligne = (cle, morceaux, extra = {}) => ({ cle, morceaux, texte: morceaux.map((m) => m.t).join(' '), ...extra });
  const donnee = (v) => ({ t: String(v), data: true });
  const mot = (v) => ({ t: v });
  if (parle && !tabouret) {
    if (service && r) {
      const nomComplet = `${r.nom || ''}${info.autres ? ` +${info.autres}` : ''}`;
      const prenom = String(r.nom || '').split(' ')[0];
      if (tient(nomComplet, fTxt)) lignes.push(ligne('nom', [donnee(nomComplet)], { fort: true }));
      else if (tient(prenom, fTxt)) lignes.push(ligne('nom', [donnee(prenom)], { fort: true }));
      const heure = hhmm(minutesDe(r.heure_arrivee) ?? 0);
      const avecCouverts = [donnee(heure), donnee(r.nb_couverts), mot('couv.')];
      let detail;
      if (e === 'retard') detail = ligne('detail', [donnee(heure), mot('en retard')]);
      else if (e === 'atable') detail = ligne('detail', [donnee(r.nb_couverts), mot('couv.')]);
      else detail = tient(avecCouverts.map((m) => m.t).join('  '), fTxt) ? ligne('detail', avecCouverts) : ligne('detail', [donnee(heure)]);
      if (tient(detail.texte, fTxt)) lignes.push(detail);
      else if (tient(heure, fTxt)) lignes.push(ligne('detail', [donnee(heure)]));
    } else if (places && tient(`${places} places`, fTxt)) {
      lignes.push(ligne('places', [donnee(places), mot('places')], { doux: true }));
    }
  }
  const deborde = service && r && Number(r.nb_couverts) > places && places > 0;

  // Contour d'attention : glisser au-dessus, table proposée ou choisie, puis
  // tables qui conviennent (en pointillés).
  let outline = null;
  if (cible || choisie) outline = { outlineWidth: 3, outlineStyle: 'solid', outlineColor: 'var(--onglet)', outlineOffset: 3 };
  else if (proposee) outline = { outlineWidth: 3, outlineStyle: 'solid', outlineColor: 'var(--accent)', outlineOffset: 3 };
  else if (convient) outline = { outlineWidth: 2, outlineStyle: 'dashed', outlineColor: 'var(--accent)', outlineOffset: 4 };

  const titre = (() => {
    if (mode === 'plan') return `Table ${t.nom}, ${t.nb_places || 0} places`;
    if (mode === 'ajuster') return `Table ${t.nom} : glisser pour déplacer, lâcher sur une autre pour les rapprocher`;
    if (r) return `${r.nom}, ${r.nb_couverts} couverts, ${hhmm(minutesDe(r.heure_arrivee) ?? 0)}`;
    return `Table ${t.nom}, ${places} places`;
  })();
  const allergies = service && parle ? allergiesDe(r) : [];
  const suivante = service && parle ? info?.suivante : null;

  return (
    <div
      data-plan-table={t.id}
      style={{
        position: 'absolute', left: Number(t.pos_x) * k, top: Number(t.pos_y) * k, width: w, height: h,
        zIndex: enGlisse ? 6 : choisie || cible ? 4 : 2,
      }}
    >
      {chaises(t, w, h, k).map((ch, i) => (
        <span
          key={i}
          aria-hidden="true"
          style={{
            position: 'absolute', borderRadius: 'var(--r-full)', pointerEvents: 'none',
            left: ch.left, top: ch.top, width: ch.width, height: ch.height,
            transform: ch.rot ? `rotate(${ch.rot}deg)` : undefined,
            background: c.chaise, opacity: inactive ? 0.65 : 1,
          }}
        />
      ))}
      <button
        type="button"
        title={titre}
        aria-label={parle ? undefined : `Table ${t.nom}`}
        data-plan-etat={service ? e : undefined}
        data-no-translate={parle ? undefined : ''}
        onPointerDown={onPointerDown}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%', boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
          padding: '2px 4px', overflow: 'hidden', fontFamily: 'var(--font)', lineHeight: 1.2,
          background: c.bg, color: c.tx,
          borderWidth: 1, borderStyle: inactive ? 'dashed' : 'solid',
          borderColor: deborde ? 'var(--danger-bd)' : c.bd,
          borderRadius: ronde ? '50%' : (cote < 70 ? 'var(--r-sm)' : 'var(--r)'),
          boxShadow: enGlisse ? 'var(--sh-lg)' : 'var(--sh)',
          opacity: inactive ? 0.65 : 1,
          cursor: deplacable ? 'grab' : touchable ? 'pointer' : 'default',
          touchAction: deplacable ? 'none' : 'manipulation',
          userSelect: 'none', WebkitUserSelect: 'none', WebkitTapHighlightColor: 'transparent',
          transition: 'background-color 0.15s, border-color 0.15s',
          ...outline,
        }}
      >
        {parle && (
          <span data-no-translate="" style={{ fontSize: tabouret ? 12 : fNum, fontWeight: 'var(--g3)', fontFamily: 'var(--font-num)', maxWidth: '100%', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {t.nom}
          </span>
        )}
        {lignes.slice(0, lignesPossibles).map((l) => (
          <span
            key={l.cle}
            style={{
              fontSize: fTxt, fontWeight: l.fort ? 'var(--g2)' : 'var(--g1)',
              color: l.doux ? c.doux : (deborde && l.cle === 'detail' ? 'var(--danger-text)' : c.tx),
              maxWidth: '100%', overflow: 'hidden', whiteSpace: 'nowrap', fontFamily: l.cle === 'detail' ? 'var(--font-num)' : 'var(--font)',
            }}
          >
            {l.morceaux.map((m, i) => (
              <span key={i} data-no-translate={m.data ? '' : undefined}>{i ? ' ' : ''}{m.t}</span>
            ))}
          </span>
        ))}
      </button>
      {suivante && (
        <span
          title={`Puis ${suivante.nom} à ${hhmm(minutesDe(suivante.heure_arrivee) ?? 0)}`}
          data-no-translate=""
          style={{
            position: 'absolute', right: -6, top: 0, transform: 'translateY(-60%)', zIndex: 3, pointerEvents: 'none',
            padding: '1px 8px', borderRadius: 'var(--r-full)', background: 'var(--accent)', color: 'var(--on-accent)',
            fontSize: 'var(--t1)', fontWeight: 'var(--g2)', fontFamily: 'var(--font-num)', lineHeight: 1.4, whiteSpace: 'nowrap',
            boxShadow: 'var(--sh)', outlineWidth: 2, outlineStyle: 'solid', outlineColor: 'var(--surface)',
          }}
        >
          {hhmm(minutesDe(suivante.heure_arrivee) ?? 0)}
        </span>
      )}
      {allergies.length > 0 && (
        <span
          title={`Allergies : ${allergies.join(', ')}`}
          aria-label={`Allergies : ${allergies.join(', ')}`}
          style={{
            position: 'absolute', left: -6, bottom: 0, transform: 'translateY(50%)', zIndex: 3, pointerEvents: 'none',
            width: 22, height: 22, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--danger-bg-soft)', color: 'var(--danger-text)',
            borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--danger-bd)', boxShadow: 'var(--sh)',
          }}
        >
          <TriangleAlert size={13} strokeWidth={2.25} aria-hidden="true" />
        </span>
      )}
      {onTourner && (
        <button
          type="button"
          aria-label="Tourner la table"
          title={Number(t.largeur) >= Number(t.hauteur) ? 'Mettre à la verticale' : 'Mettre à l’horizontale'}
          onPointerDown={(ev) => ev.stopPropagation()}
          onDoubleClick={(ev) => ev.stopPropagation()}
          onClick={(ev) => { ev.stopPropagation(); onTourner(t.id); }}
          style={{
            position: 'absolute', top: -14, right: -14, zIndex: 5,
            width: 32, height: 32, minHeight: 0, padding: 0, borderRadius: '50%',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)',
            background: 'var(--btn-fond)', color: 'var(--btn-texte)', boxShadow: 'var(--sh)',
            cursor: 'pointer', touchAction: 'manipulation',
          }}
        >
          <RotateCw size={15} strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export { allergiesDe };
