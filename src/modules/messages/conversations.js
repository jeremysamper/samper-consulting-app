// Messagerie privée : formats et regroupements partagés par la page Messages
// et la messagerie déroulante de la barre du haut. Fonctions pures.
import { normalizeSearch } from '../../utils/searchText.js';

export const MAX_LENGTH = 4000;

export function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
}

export function formatDay(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (d.toDateString() === yesterday.toDateString()) return 'Hier';
  return d.toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' });
}

// Date courte pour la liste : heure si aujourd'hui, sinon jour.
export function formatListDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (d.toDateString() === new Date().toDateString()) return formatTime(iso);
  return d.toLocaleDateString('fr-CH', { day: 'numeric', month: 'short' });
}

export function initialsOf(profile) {
  if (profile?.avatar) return profile.avatar;
  const p = (profile?.prenom || '')[0] || '';
  const n = (profile?.nom || '')[0] || '';
  return (p + n).toUpperCase() || '?';
}

export function fullName(profile) {
  if (!profile) return 'Compte inconnu';
  return `${profile.prenom || ''} ${profile.nom || ''}`.trim() || profile.email || 'Compte inconnu';
}

// Conversations : messages regroupés par interlocuteur, du plus récent au plus ancien.
export function groupConversations(messages, userId) {
  const map = new Map();
  for (const m of messages) {
    const otherId = m.senderId === userId ? m.recipientId : m.senderId;
    if (!map.has(otherId)) map.set(otherId, []);
    map.get(otherId).push(m);
  }
  return map;
}

// Contacts : conversations existantes d'abord (dernier message en tête),
// puis les autres comptes actifs par ordre alphabétique.
export function buildContacts({ conversations, profiles, profileById, userId, search }) {
  const ids = new Set(conversations.keys());
  profiles.forEach((p) => { if (p.id !== userId && p.actif !== false) ids.add(p.id); });
  ids.delete(userId);
  const rows = [...ids].map((id) => {
    const msgs = conversations.get(id) || [];
    const last = msgs[0] || null;
    const unread = msgs.filter((m) => m.recipientId === userId && !m.readAt).length;
    return { id, profile: profileById.get(id) || null, last, unread };
  });
  rows.sort((a, b) => {
    if (a.last && b.last) return new Date(b.last.createdAt) - new Date(a.last.createdAt);
    if (a.last) return -1;
    if (b.last) return 1;
    return fullName(a.profile).localeCompare(fullName(b.profile), 'fr');
  });
  if (!search.trim()) return rows;
  const q = normalizeSearch(search.trim());
  return rows.filter((r) => normalizeSearch(`${fullName(r.profile)} ${r.profile?.email || ''}`).includes(q));
}
