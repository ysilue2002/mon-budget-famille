import Dexie from 'dexie';
export class BudgetFamilyDB extends Dexie {
    constructor() {
        super('mon-budget-famille');
        Object.defineProperty(this, "families", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "members", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "accounts", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "categories", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "transactions", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "budgets", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "goals", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "debts", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "rates", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "outbox", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "conflicts", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "meta", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        // Baseline v1 : schéma complet (les variantes intermédiaires en dev n'ont
        // jamais quitté la machine de test). IndexedDB refuse une clé booléenne :
        // jamais d'index sur archived/resolved — filtrage en JS.
        this.version(1).stores({
            families: 'id, name',
            members: 'id, familyId, userId, role',
            accounts: 'id, familyId, currency, type, syncStatus, name',
            categories: 'id, familyId, type',
            transactions: 'id, familyId, accountId, toAccountId, date, type, categoryId, syncStatus, updatedAt, [familyId+date], [familyId+type]',
            budgets: 'id, familyId, period, categoryId, syncStatus, [familyId+period]',
            goals: 'id, familyId, status, syncStatus, createdAt',
            debts: 'id, familyId, kind, status, syncStatus, createdAt',
            rates: 'key',
            outbox: 'id, entity, entityId, status, createdAt',
            conflicts: 'id, entity, entityId, createdAt',
            meta: 'key',
        });
        // v2 : suppression des index booléens ; filtrage en JS à la place.
        // v3 : index requis par les requêtes (orderBy 'name', 'createdAt').
        this.version(3).stores({
            families: 'id, name',
            members: 'id, familyId, userId, role',
            accounts: 'id, familyId, currency, type, syncStatus, name',
            categories: 'id, familyId, type',
            transactions: 'id, familyId, accountId, toAccountId, date, type, categoryId, syncStatus, updatedAt, [familyId+date], [familyId+type]',
            budgets: 'id, familyId, period, categoryId, syncStatus, [familyId+period]',
            goals: 'id, familyId, status, syncStatus, createdAt',
            debts: 'id, familyId, kind, status, syncStatus, createdAt',
            rates: 'key',
            outbox: 'id, entity, entityId, status, createdAt',
            conflicts: 'id, entity, entityId, createdAt',
            meta: 'key',
        });
    }
}
export const db = new BudgetFamilyDB();
