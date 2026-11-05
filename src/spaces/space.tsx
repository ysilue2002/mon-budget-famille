import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Espaces de travail de l'application :
 * - `family`   : assistant de gestion du budget familial ;
 * - `business` : assistant de gestion d'activité (recettes, charges, états).
 *
 * Le choix est mémorisé sur l'appareil ; il ne touche ni à la session ni aux
 * données : la même connexion (identifiant + mot de passe) sert aux deux
 * assistants, seul l'écran d'entrée et la navigation changent.
 */
export type Space = 'family' | 'business';

const STORAGE_KEY = 'mbf.space';

function readStoredSpace(): Space | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'family' || value === 'business' ? value : null;
  } catch {
    return null;
  }
}

interface SpaceContextValue {
  space: Space | null;
  setSpace: (space: Space) => void;
  clearSpace: () => void;
}

const SpaceContext = createContext<SpaceContextValue | null>(null);

export function SpaceProvider({ children }: { children: ReactNode }) {
  const [space, setSpaceState] = useState<Space | null>(readStoredSpace);

  const setSpace = useCallback((next: Space) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // stockage indisponible : la sélection reste valable pour la session
    }
    setSpaceState(next);
  }, []);

  const clearSpace = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // idem
    }
    setSpaceState(null);
  }, []);

  const value = useMemo(() => ({ space, setSpace, clearSpace }), [space, setSpace, clearSpace]);
  return <SpaceContext.Provider value={value}>{children}</SpaceContext.Provider>;
}

export function useSpace(): SpaceContextValue {
  const context = useContext(SpaceContext);
  if (!context) throw new Error('useSpace doit être utilisé dans SpaceProvider');
  return context;
}
