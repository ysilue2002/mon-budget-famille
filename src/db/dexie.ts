import Dexie, { type Table } from 'dexie';
import type {
  Advance,
  AppMeta,
  Budget,
  Business,
  Category,
  Debt,
  Family,
  FinancialAccount,
  HouseholdMember,
  Party,
  Product,
  Quote,
  Settlement,
  StockMovement,
  TradeDocument,
  OutboxOperation,
  RateSnapshot,
  RecurringRule,
  SavingsGoal,
  SyncConflict,
  Transaction,
  WealthSnapshot,
} from '@/core/types';

/** Document de taux stocké dans IndexedDB (clé fixe). */
export interface RateDoc extends RateSnapshot {
  key: 'latest';
}

export class BudgetFamilyDB extends Dexie {
  families!: Table<Family, string>;
  members!: Table<HouseholdMember, string>;
  accounts!: Table<FinancialAccount, string>;
  businesses!: Table<Business, string>;
  products!: Table<Product, string>;
  sales!: Table<TradeDocument, string>;
  purchases!: Table<TradeDocument, string>;
  parties!: Table<Party, string>;
  advances!: Table<Advance, string>;
  settlements!: Table<Settlement, string>;
  quotes!: Table<Quote, string>;
  stockMovements!: Table<StockMovement, string>;
  categories!: Table<Category, string>;
  transactions!: Table<Transaction, string>;
  budgets!: Table<Budget, string>;
  goals!: Table<SavingsGoal, string>;
  debts!: Table<Debt, string>;
  recurring!: Table<RecurringRule, string>;
  wealth!: Table<WealthSnapshot, string>;
  rates!: Table<RateDoc, string>;
  outbox!: Table<OutboxOperation, string>;
  conflicts!: Table<SyncConflict, string>;
  meta!: Table<AppMeta, string>;

  constructor() {
    super('mon-budget-famille');
    // Baseline v1 : schéma complet (les variantes intermédiaires en dev n'ont
    // jamais quitté la machine de test). IndexedDB refuse une clé booléenne :
    // jamais d'index sur archived/resolved — filtrage en JS.
    this.version(1).stores({
      families: 'id, name',
      members: 'id, familyId, userId, role',
      accounts: 'id, familyId, currency, type, syncStatus, name',
      categories: 'id, familyId, type',
      transactions:
        'id, familyId, accountId, toAccountId, date, type, categoryId, syncStatus, updatedAt, [familyId+date], [familyId+type]',
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
      transactions:
        'id, familyId, accountId, toAccountId, date, type, categoryId, syncStatus, updatedAt, [familyId+date], [familyId+type]',
      budgets: 'id, familyId, period, categoryId, syncStatus, [familyId+period]',
      goals: 'id, familyId, status, syncStatus, createdAt',
      debts: 'id, familyId, kind, status, syncStatus, createdAt',
      rates: 'key',
      outbox: 'id, entity, entityId, status, createdAt',
      conflicts: 'id, entity, entityId, createdAt',
      meta: 'key',
    });
    // v4 : opérations récurrentes. Pas d'index sur `active` (booléen refusé
    // par IndexedDB) : le filtrage se fait en JS.
    this.version(4).stores({
      recurring: 'id, familyId, nextDueDate, syncStatus',
    });
    // v5 : valorisations du patrimoine (une par jour, id `wealth-<date>`).
    this.version(5).stores({
      wealth: 'id, familyId, date, syncStatus',
    });
    // v6 : activités professionnelles + rattachement des opérations. Pas
    // d'index sur `archived`/`settled` (booléens refusés par IndexedDB).
    this.version(6).stores({
      businesses: 'id, familyId, name, syncStatus',
      transactions:
        'id, familyId, accountId, toAccountId, date, type, categoryId, businessId, syncStatus, updatedAt, [familyId+date], [familyId+type]',
    });
    // v7 : marchandises et stock (assistant Activité).
    this.version(7).stores({
      products: 'id, familyId, name, syncStatus',
    });
    // v8 : ventes et achats à lignes de produits (documents de l'activité).
    this.version(8).stores({
      sales: 'id, familyId, businessId, date, syncStatus',
      purchases: 'id, familyId, businessId, date, syncStatus',
    });
    // v9 : fiches clients et fournisseurs.
    this.version(9).stores({
      parties: 'id, familyId, kind, name, syncStatus',
    });
    // v10 : avances reçues, suivies séparément des ventes.
    this.version(10).stores({
      advances: 'id, familyId, receivedOn, syncStatus',
    });
    // v11 : historique des règlements (encaissements clients, paiements
    // fournisseurs).
    this.version(11).stores({
      settlements: 'id, familyId, date, partyId, documentId, syncStatus',
    });
    // v12 : devis (documents commerciaux, hors chiffre d'affaires).
    this.version(12).stores({
      quotes: 'id, familyId, businessId, date, number, syncStatus',
    });
    // v13 : journal daté du stock (une ligne par entrée/sortie), pour valoriser
    // le stock d'une date passée sans le reconstituer.
    this.version(13).stores({
      stockMovements: 'id, familyId, productId, date, documentId, syncStatus',
    });
  }
}

export const db = new BudgetFamilyDB();
