import React from 'react';

// Vrai quand la page du module est celle qu'on voit. Les modules restent
// montés quand une autre page passe devant (keep-alive d'App.jsx) : leur
// conteneur est masqué, mais pas ce qu'ils posent en portail sur <body>, ni
// leurs écouteurs du document. Ce contexte le leur dit (LegacyModuleHost le
// fournit) : le mode service s'efface, Échap ne ramène plus à l'accueil un
// écran qu'on ne voit pas. Sans fournisseur, la page est tenue pour visible.
export const PageActive = React.createContext(true);
export const usePageActive = () => React.useContext(PageActive);
