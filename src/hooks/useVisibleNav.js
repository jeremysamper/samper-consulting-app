import React from 'react';
import { navItems as NAV_ITEMS, isModuleActiveForEtab } from '../modules/moduleConfig.js';
import { getDemoData } from '../data/demoData.js';
import { applyNavOrder, useNavOrder } from './useNavOrder.js';
import { useUnreadPrivateMessages } from './useUnreadPrivateMessages.js';
import { useGroupesAlerte } from './useGroupesAlerte.js';

// ─────────────────────────────────────────────────────────────────────────────
// Modules visibles par l'utilisateur dans l'établissement courant, rangés par
// rubrique, avec leurs badges : la seule source de la barre latérale
// (ordinateur) et de la page d'accueil (tablette, téléphone). Un module qui
// manque à l'un manquerait à l'autre.
//
// Filtre : on cache TOUT module dont la permission est explicitement false.
// Permission absente (undefined) : valeur par défaut du rôle dans DEMO_DATA ;
// absente aussi : affiché (nouveau module ajouté côté code).
// Ordre : celui choisi par le consultant (app_settings.nav_order), partagé par
// tous les comptes.
// ─────────────────────────────────────────────────────────────────────────────

const AUCUN_DEFAUT = {};

export function useVisibleNav({ user, etablissement, perms }) {
  const DEMO_DATA = getDemoData();
  const { order: navOrder, save: saveNavOrder } = useNavOrder();
  const role = user?.role;
  // Défauts du rôle (DEMO_DATA, hydraté depuis Supabase) : même objet d'un
  // rendu à l'autre tant que rien n'est rechargé, la mémo tient.
  const defautsRole = (DEMO_DATA.permissions && DEMO_DATA.permissions[role]) || AUCUN_DEFAUT;

  const visibleNav = React.useMemo(() => applyNavOrder(NAV_ITEMS, navOrder).filter((item) => {
    // IA / assistant / outils consultant : réservés au consultant culinaire,
    // même si la table permissions accorde le module à un autre rôle.
    if ((item.id === 'faq' || item.id === 'consultant_tools') && role !== 'consultant') return false;
    // KDS : rôles cuisine uniquement (miroir de la RLS kds_orders), la clé kds
    // n'existant pas encore dans la table permissions en BDD.
    if (item.id === 'kds' && !['consultant', 'resp_cuisine', 'cuisinier'].includes(role)) return false;
    // Journal d'activité : consultant et patron (miroir de la RLS journal_activite).
    if (item.id === 'journal' && !['consultant', 'patron'].includes(role)) return false;
    // Modules choisis pour l'établissement courant (Paramètres), pour tous les
    // rôles consultant compris : le menu montre ce que l'équipe utilise.
    if (!isModuleActiveForEtab(etablissement, item.permKey)) return false;
    const permVal = perms[item.permKey];
    if (permVal === false) return false;
    if (permVal === true) return true;
    // permVal undefined : fallback sur les défauts du rôle
    if (defautsRole[item.permKey] === false) return false;
    return true;
  }), [perms, role, navOrder, etablissement, defautsRole]);

  const groupedNav = React.useMemo(() => visibleNav.reduce((groups, item) => {
    const groupName = item.group || 'Modules';
    const group = groups.find((entry) => entry.label === groupName);
    if (group) {
      group.items.push(item);
    } else {
      groups.push({ label: groupName, items: [item] });
    }
    return groups;
  }, []), [visibleNav]);

  // Badge messages privés non lus (reçus, tous expéditeurs).
  const unreadMessages = useUnreadPrivateMessages(user?.id);
  // Groupes des 14 prochains jours pas encore prêts : l'alerte d'anticipation
  // doit se voir depuis n'importe quel module, sinon elle ne prévient personne.
  // Aucune requête pour un rôle qui n'a pas le module dans son menu.
  const groupesAPreparer = useGroupesAlerte(etablissement?.id, {
    enabled: visibleNav.some((item) => item.id === 'groupes'),
  });
  const badges = React.useMemo(() => ({ messages: unreadMessages, groupes: groupesAPreparer }), [unreadMessages, groupesAPreparer]);

  return { visibleNav, groupedNav, navOrder, saveNavOrder, badges };
}
