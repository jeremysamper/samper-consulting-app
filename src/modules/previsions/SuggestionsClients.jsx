import { useEffect, useState } from 'react';
import { nomClient } from '../../hooks/useResaClients.js';
import { makeSearchMatcher } from '../../utils/searchText.js';

// ═══════════════════════════════════════════════════════════════════════════
// Clients connus, proposés pendant la saisie d'une réservation.
//
// Un habitué qui rappelle se retrouve dès deux lettres du nom ou trois
// chiffres du téléphone : un toucher remplit nom, téléphone et e-mail, et ce
// que sa fiche dit de ses allergies s'affiche. Le rattachement à la fiche
// reste fait par la base (e-mail ou téléphone, resa_rattacher_client) : la
// suggestion ne fait que remplir les champs.
// ═══════════════════════════════════════════════════════════════════════════

const MAX_SUGGESTIONS = 3;

// Téléphone réduit à ses chiffres significatifs : « +41 79 123 45 67 »,
// « 0041 79 123 45 67 » et « 079 123 45 67 » donnent tous « 791234567 ».
export function cleTelephone(t) {
  return String(t || '').replace(/\D/g, '').replace(/^00/, '').replace(/^41/, '').replace(/^0/, '');
}

const dateCh = (iso) => {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
};

export function detailsClient(c) {
  const venues = c.nbVenues > 0 ? `${c.nbVenues} venue${c.nbVenues > 1 ? 's' : ''}` : 'aucune venue';
  return [
    c.telephone,
    venues,
    c.derniereVenue ? `dernière le ${dateCh(c.derniereVenue)}` : '',
  ].filter(Boolean).join(', ');
}

// Fiches actives de l'établissement, lues une fois à l'ouverture du
// formulaire. Une lecture en échec ne dit rien : la saisie marche sans.
export function useFichesClients(clients, actif) {
  const [fiches, setFiches] = useState([]);
  useEffect(() => {
    if (!actif) return undefined;
    let vivant = true;
    clients.list()
      .then((res) => { if (vivant && !res?.error) setFiches((res?.data || []).filter((c) => !c.archive)); })
      .catch(() => {});
    return () => { vivant = false; };
  }, [clients, actif]);
  return fiches;
}

// Nom et téléphone se cumulent : la personne qui a déjà donné son nom et
// dicte son numéro ne voit plus que les fiches qui ont les deux.
export function fichesCorrespondantes(fiches, { nom, telephone }) {
  const parNom = String(nom || '').trim().length >= 2 ? makeSearchMatcher(nom) : null;
  const cle = cleTelephone(telephone);
  const parTel = String(telephone || '').replace(/\D/g, '').length >= 3 && cle.length >= 2 ? cle : null;
  if (!parNom && !parTel) return [];
  return fiches
    .filter((c) => (!parNom || parNom(c.prenom, c.nom))
      && (!parTel || cleTelephone(c.telephone).includes(parTel)))
    .sort((a, b) => (b.nbVenues - a.nbVenues) || nomClient(a).localeCompare(nomClient(b), 'fr'))
    .slice(0, MAX_SUGGESTIONS);
}

export default function SuggestionsClients({ fiches, onChoisir }) {
  if (!fiches.length) return null;
  return (
    <div role="listbox" aria-label="Clients connus" style={{ marginTop: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)' }}>Clients connus</div>
      {fiches.map((c) => (
        <button
          key={c.id}
          type="button"
          role="option"
          aria-selected="false"
          // Le champ garde le focus au toucher : sans ça il se fermait avant
          // que le choix ne soit pris.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChoisir(c)}
          style={{
            display: 'block', width: '100%', textAlign: 'left', minHeight: 48,
            padding: '9px 2px', background: 'none', cursor: 'pointer',
            borderWidth: '0 0 1px', borderStyle: 'solid', borderColor: 'var(--border)',
            fontFamily: 'var(--font)', color: 'var(--text)',
          }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{nomClient(c)}</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{detailsClient(c)}</div>
          {c.allergies && (
            <div style={{ fontSize: 12, color: 'var(--danger-text)', fontWeight: 600, marginTop: 2 }}>
              Allergies : {c.allergies}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
