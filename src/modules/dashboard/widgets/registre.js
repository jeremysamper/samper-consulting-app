import { CalendarDays, LayoutGrid, ListTodo, MessageSquareQuote } from 'lucide-react';
import { getModuleIcon } from '../../moduleIcons.js';
import { CATALOGUE } from './catalogue.js';
import {
  WidgetAbsences, WidgetAFaire, WidgetAVenir, WidgetChiffre, WidgetEquipe, WidgetGroupes, WidgetHotel, WidgetMessages,
  WidgetMot, WidgetPertesSemaines, WidgetPointage, WidgetQuiTravaille, WidgetRaccourcis, WidgetRegularite, WidgetReleves,
  WidgetRepere, WidgetReservations, WidgetSemaine,
} from './Widgets.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Registre des widgets : le catalogue (catalogue.js : id, nom, famille,
// tailles, taille d'origine, garde) et, pour chacun, son picto et son
// composant. Tout widget passe par ce registre : TableauDeBord.jsx ne nomme
// aucune carte.
// ─────────────────────────────────────────────────────────────────────────────

const COMPOSANTS = {
  'repere-couverts': WidgetRepere,
  'repere-groupes': WidgetRepere,
  'repere-equipe': WidgetRepere,
  'pointage': WidgetPointage,
  'a-faire': WidgetAFaire,
  'equipe': WidgetEquipe,
  'semaine': WidgetSemaine,
  'reservations': WidgetReservations,
  'qui-travaille': WidgetQuiTravaille,
  'hotel': WidgetHotel,
  'mot-consultant': WidgetMot,
  'a-venir': WidgetAVenir,
  'chiffre-couverts': WidgetChiffre,
  'chiffre-heures': WidgetChiffre,
  'chiffre-pertes': WidgetChiffre,
  'chiffre-stock': WidgetChiffre,
  'regularite': WidgetRegularite,
  'haccp-releves': WidgetReleves,
  'pertes-semaines': WidgetPertesSemaines,
  'groupes': WidgetGroupes,
  'absences': WidgetAbsences,
  'messages': WidgetMessages,
  'raccourcis': WidgetRaccourcis,
};

// Picto des widgets qui n'ouvrent pas un module (leurs lignes le font).
const PICTOS = { 'a-faire': ListTodo, 'mot-consultant': MessageSquareQuote, 'a-venir': CalendarDays, 'raccourcis': LayoutGrid };

export const REGISTRE = CATALOGUE.map((w) => ({
  ...w,
  picto: PICTOS[w.id] || getModuleIcon(w.page),
  Composant: COMPOSANTS[w.id],
}));

export const REGISTRE_PAR_ID = new Map(REGISTRE.map((w) => [w.id, w]));
