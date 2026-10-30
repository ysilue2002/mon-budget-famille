import { describe, expect, it } from 'vitest';
import { decideMerge, diffFields } from './protocol';
describe('protocol — diffFields', () => {
    it('liste les champs modifiés entre base et courant', () => {
        const base = { name: 'A', amountLimit: 100, rev: 3, updatedAt: 1 };
        const current = { name: 'B', amountLimit: 100, rev: 4, updatedAt: 2 };
        expect(diffFields(base, current)).toEqual(['name']);
    });
    it('sans base : tous les champs sont considérés modifiés', () => {
        expect(diffFields(null, { name: 'A', rev: 1 })).toEqual(['name']);
    });
    it('ignore les métadonnées de synchronisation', () => {
        const base = { name: 'A', syncStatus: 'synced' };
        const current = { name: 'A', syncStatus: 'pending' };
        expect(diffFields(base, current)).toEqual([]);
    });
});
describe('protocol — decideMerge (fusion à trois composantes)', () => {
    const base = { name: 'Famille', note: 'x', amountLimit: 100 };
    it('fusionne quand les champs modifiés sont disjoints du serveur', () => {
        const serverCurrent = { ...base, note: 'y' };
        const clientPayload = { ...base, name: 'Famille Dan' };
        const outcome = decideMerge(['name'], base, serverCurrent, clientPayload);
        expect(outcome.conflicts).toEqual([]);
        expect(outcome.merge).toEqual({ ...base, name: 'Famille Dan', note: 'y' });
    });
    it('signale un conflit explicite quand le champ est modifié des deux côtés', () => {
        const serverCurrent = { ...base, name: 'Famille Server' };
        const clientPayload = { ...base, name: 'Famille Client' };
        const outcome = decideMerge(['name'], base, serverCurrent, clientPayload);
        expect(outcome.merge).toBeNull();
        expect(outcome.conflicts).toEqual([{ field: 'name', remoteValue: 'Famille Server', baseValue: 'Famille' }]);
    });
    it('descend jusqu’aux valeurs identiques sans conflit', () => {
        const serverCurrent = { ...base, name: 'Famille Client' };
        const clientPayload = { ...base, name: 'Famille Client' };
        const outcome = decideMerge(['name'], base, serverCurrent, clientPayload);
        expect(outcome.conflicts).toEqual([]);
        expect(outcome.merge).toEqual({ ...base, name: 'Famille Client' });
    });
});
