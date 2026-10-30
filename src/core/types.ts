/**
 * Types métier partagés — Mon Budget Famille / My Family Budget.
 *
 * Tous les montants monétaires sont des **entiers en sous-unités** :
 * cents pour USD/EUR/GBP/CHF, unités entières pour XOF/XAF/NGN.
 */

export const CURRENCY_CODES = ['XOF', 'XAF', 'USD', 'NGN', 'GBP', 'EUR', 'CHF'] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export type Role = 'admin' | 'manager' | 'member' | 'readonly';
export type AccountType = 'cash' | 'bank' | 'mobile' | 'other';
export type MobileProvider =
  | 'wave'
  | 'orange'
  | 'mtn'
  | 'moov'
  | 'paypal'
  | 'other'
  | null;
export type TransactionType = 'income' | 'expense' | 'transfer';
export type DebtKind = 'payable' | 'receivable';
export type DebtStatus = 'open' | 'settled';
export type SavingsStatus = 'active' | 'completed';

/** Statut de synchronisation d'un enregistrement local. */
export type SyncStatus = 'synced' | 'pending' | 'conflict' | 'deleted';

export interface SyncFields {
  /** Révision du serveur sur laquelle l'enregistrement local est basé. */
  baseRev: number;
  /** Révision connue du serveur (0 = jamais synchronisé). */
  rev: number;
  /** Dernière modification locale (epoch ms). */
  updatedAt: number;
  /** Identifiant stable de l'appareil (pour l'attribution des conflits). */
  deviceId: string;
  syncStatus: SyncStatus;
}

export interface Family {
  id: string;
  name: string;
  /** Devise de référence du foyer (consolidation du tableau de bord). */
  primaryCurrency: CurrencyCode;
  createdAt: number;
}

export interface HouseholdMember {
  id: string;
  familyId: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
}

export interface FinancialAccount extends SyncFields {
  id: string;
  familyId: string;
  name: string;
  type: AccountType;
  provider: MobileProvider;
  currency: CurrencyCode;
  /** Solde d'ouverture en sous-unités de `currency`. */
  initialBalance: number;
  /** Couleur d'affichage facultative. */
  color?: string;
  archived: boolean;
}

export interface Category {
  id: string;
  familyId: string;
  nameFr: string;
  nameEn: string;
  type: 'income' | 'expense';
  icon?: string;
}

export interface Transaction extends SyncFields {
  id: string;
  familyId: string;
  accountId: string;
  /** Uniquement pour les transferts. */
  toAccountId?: string;
  authorId: string;
  authorName: string;
  type: TransactionType;
  /** Montant en sous-unités de `currencyOriginal` (toujours positif). */
  amountOriginal: number;
  /** Transfert inter-devises : montant crédité à la destination (sous-unités de la devise du compte cible). */
  toAmount?: number;
  currencyOriginal: CurrencyCode;
  /** Taux appliqué au moment de la saisie (vs devise du foyer), 1 = même devise. */
  exchangeRate: number;
  /** Montant en sous-unités de la devise du foyer. */
  amountInPrimary: number;
  categoryId?: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  note?: string;
}

export interface Budget extends SyncFields {
  id: string;
  familyId: string;
  /** Mois au format YYYY-MM. */
  period: string;
  categoryId: string;
  /** Plafond en sous-unités de la devise du foyer. */
  amountLimit: number;
  currency: CurrencyCode;
  /** Seuil d'alerte en pourcentage (ex. 80). */
  alertThreshold: number;
}

export interface SavingsGoal extends SyncFields {
  id: string;
  familyId: string;
  name: string;
  targetAmount: number;
  currency: CurrencyCode;
  currentAmount: number;
  /** ISO date (YYYY-MM-DD) ou null. */
  targetDate: string | null;
  status: SavingsStatus;
  createdAt: number;
}

export interface DebtPayment {
  id: string;
  /** Montant en sous-unités de la devise de la dette. */
  amount: number;
  date: string;
  accountId?: string;
}

export interface Debt extends SyncFields {
  id: string;
  familyId: string;
  kind: DebtKind;
  partyName: string;
  initialAmount: number;
  currency: CurrencyCode;
  /** Montant restant dû en sous-unités. */
  remainingAmount: number;
  dueDate: string | null;
  status: DebtStatus;
  payments: DebtPayment[];
  createdAt: number;
}

/** Ligne de taux de change (base USD). */
export interface RateSnapshot {
  base: CurrencyCode;
  /** Valeur de 1 USD dans chaque devise. */
  rates: Record<string, number>;
  fetchedAt: number;
  /** true si la valeur provient d'une source de repli (aucun cache disponible). */
  stale?: boolean;
}

/** Opération en file d'attente de synchronisation (idempotente par UUID). */
export type SyncEntity = 'account' | 'transaction' | 'budget' | 'goal' | 'debt' | 'category';

export interface OutboxOperation {
  id: string;
  entity: SyncEntity;
  entityId: string;
  op: 'upsert' | 'delete';
  payload: unknown;
  deviceId: string;
  createdAt: number;
  retryCount: number;
  lastError?: string;
  status: 'queued' | 'inflight' | 'failed';
}

/** Conflit de synchronisation à résoudre par l'utilisateur. */
export interface SyncConflict {
  id: string;
  entity: OutboxOperation['entity'];
  entityId: string;
  /** Champ en conflit -> valeurs locale / serveur. */
  field: string;
  localValue: unknown;
  remoteValue: unknown;
  createdAt: number;
  resolved: boolean;
}

/** Métadonnées locales (paramètres, session, compteurs). */
export interface AppMeta {
  key: string;
  value: unknown;
}
