// Réglages portés par la coque (AppLayout) : l'ordre du menu et le logo de
// l'établissement. Le consultant seul (RLS d'app_settings et d'etablissements),
// et à l'ordinateur : c'est là que vivent la barre latérale et son logo.
// Rangé à part d'AppLayout pour que la page des réglages lise la même garde.
export const regleLaCoque = (role) => role === 'consultant';
export const peutOrganiserMenu = (role, shellMode) => regleLaCoque(role) && shellMode === 'ordinateur';
export const peutChangerLogo = (role, shellMode) => regleLaCoque(role) && shellMode === 'ordinateur';
