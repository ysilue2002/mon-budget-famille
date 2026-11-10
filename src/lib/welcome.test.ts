import { describe, expect, it } from 'vitest';
import { shouldShowWelcome } from './welcome';
import type { ActivityProfile } from '@/core/profiles';

const profile = (value: ActivityProfile | undefined) => value;

describe('parcours de bienvenue', () => {
  it('se montre à la première ouverture, sans activité', () => {
    expect(shouldShowWelcome({ seen: false, activeProfiles: [] })).toBe(true);
  });

  it('se montre tant qu’une activité n’a pas de profil', () => {
    expect(shouldShowWelcome({ seen: false, activeProfiles: [undefined] })).toBe(true);
    expect(
      shouldShowWelcome({ seen: false, activeProfiles: [profile('commerce'), undefined] }),
    ).toBe(true);
  });

  it('ne se montre plus dès que le profil est choisi ou la question écartée', () => {
    expect(shouldShowWelcome({ seen: false, activeProfiles: ['commerce'] })).toBe(false);
    expect(shouldShowWelcome({ seen: true, activeProfiles: [] })).toBe(false);
    expect(shouldShowWelcome({ seen: true, activeProfiles: [undefined] })).toBe(false);
  });
});
