/**
 * Affichage « mode simple » : gros boutons, texte plus grand, détails
 * secondaires masqués. Le choix est gardé sur l'appareil et jamais synchronisé :
 * le téléphone de l'atelier peut rester en mode simple pendant que l'ordinateur
 * du bureau garde la version détaillée.
 *
 * Le mode s'applique par une classe sur <html> : la feuille de style s'occupe du
 * reste, aucun écran n'a besoin d'être réécrit.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'mbf.display.simple';
const CLASS = 'display-simple';

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === 'true';
  } catch {
    return false;
  }
}

function apply(simple: boolean): void {
  try {
    document.documentElement.classList.toggle(CLASS, simple);
  } catch {
    // pas de document (tests unitaires) : rien à appliquer
  }
}

let current = read();
apply(current);

const listeners = new Set<() => void>();

export function setSimpleDisplay(simple: boolean): void {
  if (simple === current) return;
  current = simple;
  try {
    localStorage.setItem(KEY, String(simple));
  } catch {
    // stockage indisponible : le réglage vaut pour la session
  }
  apply(simple);
  for (const listener of listeners) listener();
}

export function simpleDisplaySnapshot(): boolean {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Réglage et bascule, pour la carte des réglages. */
export function useSimpleDisplay(): { simple: boolean; setSimple: (value: boolean) => void } {
  const simple = useSyncExternalStore(subscribe, simpleDisplaySnapshot, () => false);
  return { simple, setSimple: setSimpleDisplay };
}
