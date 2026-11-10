import { useSyncExternalStore } from 'react';
import { navPrefsSnapshot, subscribeNavPrefs, type NavPrefs } from '@/lib/navPrefs';

/** Préférences de menu de l'appareil, partagées entre les réglages et la barre. */
export function useNavPrefs(): NavPrefs {
  return useSyncExternalStore(subscribeNavPrefs, navPrefsSnapshot, navPrefsSnapshot);
}
