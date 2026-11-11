/**
 * Types métier partagés — Mon Budget Famille / My Family Budget.
 *
 * Tous les montants monétaires sont des **entiers en sous-unités** :
 * cents pour USD/EUR/GBP/CHF/EGP/MAD/AED, unités entières pour XOF/XAF/NGN.
 */

import type { ActivityProfile } from './profiles';

export const CURRENCY_CODES = [
  'XOF',
  'XAF',
  'USD',
  'NGN',
  'GBP',
  'EUR',
  'CHF',
  'EGP',
  'MAD',
  'AED',
] as const;
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
export type RecurrenceFrequency = 'weekly' | 'monthly' | 'yearly';
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
  /** Membre du foyer à qui l'opération est attribuée (facultatif). */
  member?: string;
  /** Activité professionnelle à laquelle l'opération se rattache (facultatif). */
  businessId?: string;
  /** Chantier auquel la dépense se rattache (facultatif). */
  projectId?: string;
  /**
   * Règlement d'une opération professionnelle : `false` = facture émise non
   * encaissée (créance) ou facture reçue non payée (dette). Absent = réglée.
   */
  settled?: boolean;
  /**
   * Part déjà réglée d'une opération professionnelle non soldée (paiements
   * partiels). Seul ce montant entre dans l'argent disponible.
   */
  settledAmount?: number;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  note?: string;
}

/**
 * Activité professionnelle suivie à côté du budget du foyer. Les opérations
 * rattachées (`Transaction.businessId`) alimentent son compte de résultat, son
 * bilan simplifié et son tableau de trésorerie.
 */
export interface Business extends SyncFields {
  id: string;
  familyId: string;
  name: string;
  /** Nom de l'entrepreneur (profil affiché sur les documents). */
  ownerName?: string;
  /** Activité exercée (texte libre : vente, prestation, élevage…). */
  activity: string;
  /**
   * Profil retenu (commerce, artisan, services, autre). Absent pour les
   * activités créées avant son arrivée : elles restent traitées comme
   * « autre », donc sans aucune restriction d'écran.
   */
  profile?: ActivityProfile;
  /** Téléphone professionnel. */
  phone?: string;
  /** Adresse e-mail professionnelle. */
  email?: string;
  /** Adresse postale de l'activité. */
  address?: string;
  /** Identifiant fiscal / RCCM (facultatif). */
  taxId?: string;
  notes?: string;
  archived: boolean;
  createdAt: number;
}

/**
 * Chantier (ou dossier) d'une activité : un travail avec son client, ses
 * achats, sa main d'œuvre, ses dépenses et ses acomptes. Ce n'est pas un
 * document comptable : il ne crée aucun mouvement, il regroupe l'existant.
 */
export type ProjectStatus = 'open' | 'done';

export interface Project extends SyncFields {
  id: string;
  familyId: string;
  /** Activité à laquelle le chantier appartient (facultatif). */
  businessId?: string;
  name: string;
  /** Fiche client du chantier (facultatif). */
  partyId?: string;
  /** Nom du client, recopié à la saisie. */
  partyName?: string;
  startDate: string;
  /** Date de fin (vide tant que le chantier est en cours). */
  endDate?: string;
  status: ProjectStatus;
  note?: string;
  archived: boolean;
  createdAt: number;
}

/**
 * Marchandise suivie en stock (boutique, atelier, prestation).
 * Les prix sont en sous-unités de la devise du foyer ; les quantités peuvent
 * être décimales (kg, litre) — c'est le seul champ non entier du modèle.
 */
/**
 * Nature d'une fiche : un article que l'on stocke (marchandise, matière
 * première, pièce) ou une prestation que l'on facture sans stock (main
 * d'œuvre, pose, réparation, location). Absent = article, pour les fiches
 * créées avant l'arrivée des prestations.
 */
export type ProductKind = 'goods' | 'service';

export interface Product extends SyncFields {
  id: string;
  familyId: string;
  name: string;
  /** Article stocké ou prestation facturée (défaut : article). */
  kind?: ProductKind;
  /** Unité de vente : pièce, kg, litre, service… */
  unit: string;
  /** Prix d'achat unitaire en sous-unités de la devise du foyer. */
  buyPrice: number;
  /** Prix de vente unitaire en sous-unités de la devise du foyer. */
  sellPrice: number;
  /** Quantité disponible en stock. */
  stockQty: number;
  /** Seuil d'alerte « presque épuisé » (0 = pas d'alerte). */
  alertQty: number;
  archived: boolean;
  createdAt: number;
}

/** Origine d'un mouvement de stock. */
export type StockMovementReason = 'initial' | 'purchase' | 'sale' | 'inventory';

/**
 * Mouvement de stock daté : la seule source de vérité pour la quantité en
 * stock à une date donnée. Une entrée est positive, une sortie négative. Le
 * stock affiché reste `Product.stockQty`, tenu à jour en même temps.
 */
export interface StockMovement extends SyncFields {
  id: string;
  familyId: string;
  productId: string;
  /** Date du mouvement (YYYY-MM-DD) : celle du document quand il y en a un. */
  date: string;
  /** Quantité signée (entrée positive, sortie négative), en unités du produit. */
  qty: number;
  reason: StockMovementReason;
  /** Document d'origine (vente ou achat) : ses mouvements suivent sa vie. */
  documentId?: string;
  createdAt: number;
}

/** Moyens de paiement proposés à la saisie (indépendants des comptes). */
export type PaymentMethod = 'cash' | 'wave' | 'orange' | 'mtn' | 'moov' | 'bank' | 'other';

/**
 * Fiche client ou fournisseur. Le nom est repris (copié) dans chaque document
 * au moment de la saisie : renommer une fiche ne réécrit pas l'historique.
 */
export interface Party extends SyncFields {
  id: string;
  familyId: string;
  kind: 'client' | 'supplier';
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
  archived: boolean;
  createdAt: number;
}

/** Ligne d'une vente ou d'un achat. Montants en sous-unités du foyer. */
export interface TradeLine {
  id: string;
  /** Marchandise concernée (facultatif : ligne libre).

   *  Renseigné, il déclenche le mouvement de stock.
   */
  productId?: string;
  label: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

/**
 * Vente (ou achat) : document à lignes qui alimente le journal de l'activité
 * et déplace le stock. Une seule opération de trésorerie est créée par
 * document (identifiant déterministe `sale-<id>` / `purchase-<id>`), marquée
 * non réglée tant que le reste à payer n'est pas nul (crédit client/fournisseur).
 */
export interface TradeDocument extends SyncFields {
  id: string;
  familyId: string;
  businessId: string;
  /** Vente = entrée d'argent, achat = sortie. */
  kind: 'sale' | 'purchase';
  date: string;
  /** Fiche client/fournisseur rattachée (facultatif). */
  partyId?: string;
  /** Nom du client ou fournisseur, recopié à la saisie. */
  partyName?: string;
  /** Chantier auquel le document se rattache (facultatif). */
  projectId?: string;
  lines: TradeLine[];
  /** Numéro du document : FAC-2026-0001 pour une vente, ACH-… pour un achat. */
  number?: string;
  /** Échéance de paiement (factures à crédit). */
  dueDate?: string;
  /**
   * Taux de TVA en pourcentage (0 ou absent = aucune taxe). Les prix des
   * lignes sont hors taxe ; `total` est le montant TTC facturé et compté.
   */
  taxRate?: number;
  total: number;
  paid: number;
  due: number;
  paymentMethod: PaymentMethod;
  /** Compte où l'argent entre (vente) ou sort (achat). */
  accountId: string;
  /**
   * Acompte déjà facturé sur le devis d'origine, déduit du total : la facture
   * de solde ne réclame que le reste. Absent ou 0 = facture ordinaire.
   */
  deduct?: number;
  /** Devis d'origine d'une facture d'acompte (facultatif). */
  quoteId?: string;
  /** Part du devis facturée en acompte, en pourcentage (absent = pas un acompte). */
  depositPercent?: number;
  note?: string;
  createdAt: number;
}

/**
 * Avance reçue d'un client avant livraison d'un produit ou d'un service.
 * Ce n'est **pas** une vente : elle est suivie à part jusqu'à la livraison
 * (ou le remboursement) et n'entre pas dans le chiffre d'affaires.
 */
export interface Advance extends SyncFields {
  id: string;
  familyId: string;
  partyId?: string;
  partyName?: string;
  /** Chantier auquel l'avance se rattache (facultatif). */
  projectId?: string;
  /** Objet de l'avance (commande, prestation…). */
  subject: string;
  /** Montant effectivement reçu, en sous-unités du foyer. */
  amount: number;
  /** Montant total attendu (facultatif) : le reste à recevoir en découle. */
  expected?: number;
  /** Date de réception ou du versement (YYYY-MM-DD). */
  receivedOn: string;
  /**
   * Sens de l'acompte : reçu d'un client (`received`, par défaut) ou versé à
   * un fournisseur (`paid`). Les avances anciennes n'ont pas ce champ.
   */
  direction?: 'received' | 'paid';
  status: 'open' | 'delivered' | 'refunded';
  note?: string;
  createdAt: number;
}

/**
 * Règlement d'un document : trace datée d'un encaissement (client) ou d'un
 * paiement (fournisseur). C'est un journal, pas un mouvement d'argent
 * supplémentaire : l'argent est déjà compté par l'opération du document.
 */
export interface Settlement extends SyncFields {
  id: string;
  familyId: string;
  /** Fiche concernée (facultatif : vente saisie sans fiche). */
  partyId?: string;
  /** Nom recopié au moment du règlement. */
  partyName?: string;
  kind: 'client' | 'supplier';
  /** Document réglé (vente pour un client, achat pour un fournisseur). */
  documentId?: string;
  documentKind?: 'sale' | 'purchase';
  /** Montant imputé, en sous-unités du foyer. */
  amount: number;
  method: PaymentMethod;
  /** Compte qui a reçu (client) ou versé (fournisseur) l'argent. */
  accountId?: string;
  /** Date du règlement (YYYY-MM-DD). */
  date: string;
  note?: string;
  createdAt: number;
}

/**
 * Devis : proposition de prix envoyée à un client. Ce n'est **pas** une vente :
 * aucun chiffre d'affaires, aucun mouvement de stock. Un devis accepté peut
 * être transformé en vente, qui devient alors le seul document compté.
 */
/** Acompte déjà facturé sur un devis (une facture ACO-… par acompte). */
export interface QuoteDeposit {
  /** Vente (facture) émise pour cet acompte. */
  saleId: string;
  /** Numéro de la facture d'acompte : ACO-2026-0001. */
  number: string;
  /** Part du devis facturée, en pourcentage. */
  percent: number;
  /** Montant facturé, taxes comprises, en sous-unités du foyer. */
  amount: number;
  date: string;
}

export interface Quote extends SyncFields {
  id: string;
  familyId: string;
  businessId: string;
  /** Numéro du devis : DEV-2026-0001. */
  number: string;
  /**
   * Nature du document : un devis (absent) ou un avenant à un devis. Un avenant
   * porte ses propres lignes et s'ajoute au devis initial.
   */
  kind?: 'quote' | 'amendment';
  /** Devis modifié par cet avenant. */
  parentQuoteId?: string;
  /** Acomptes déjà facturés sur ce devis (déduits du solde à la transformation). */
  deposits?: QuoteDeposit[];
  date: string;
  /** Date de validité de l'offre (facultative). */
  validUntil?: string;
  partyId?: string;
  partyName?: string;
  /** Chantier prévu pour les travaux du devis (facultatif). */
  projectId?: string;
  lines: TradeLine[];
  /** Taux de TVA du devis (prix HT, total TTC). */
  taxRate?: number;
  total: number;
  status: 'draft' | 'sent' | 'accepted' | 'refused' | 'converted';
  note?: string;
  /** Vente issue de la transformation (le devis n'est alors plus modifiable). */
  convertedSaleId?: string;
  createdAt: number;
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

/**
 * Règle d'opération récurrente (loyer, salaire, abonnement…).
 * À chaque échéance due, une opération est générée puis `nextDueDate` avance.
 * L'identifiant de l'opération générée est déterministe : `rec-<ruleId>-<date>`,
 * ce qui rend la génération idempotente (aucun doublon, même entre appareils).
 */
export interface RecurringRule extends SyncFields {
  id: string;
  familyId: string;
  /** Libellé lisible (« Loyer », « Salaire »…). */
  name: string;
  type: 'income' | 'expense';
  accountId: string;
  categoryId: string;
  /** Montant en sous-unités de `currency` (toujours positif). */
  amountOriginal: number;
  currency: CurrencyCode;
  note?: string;
  frequency: RecurrenceFrequency;
  /** Toutes les N semaines / mois / années (>= 1). */
  interval: number;
  /** Première échéance (YYYY-MM-DD) ; son jour sert d'ancre aux échéances suivantes. */
  startDate: string;
  /** Prochaine échéance non encore générée (YYYY-MM-DD). */
  nextDueDate: string;
  /** Dernière échéance générée (YYYY-MM-DD). */
  lastGeneratedDate?: string;
  /** Fin de récurrence (YYYY-MM-DD) ou null. */
  endDate: string | null;
  active: boolean;
  createdAt: number;
}

/**
 * Valorisation du patrimoine à une date donnée (une par jour, id déterministe
 * `wealth-<date>`). L'épargne et les dettes ne portent que leur montant courant :
 * ces relevés permettent de reconstituer le patrimoine d'un bilan passé.
 * Les montants sont déjà consolidés dans `primary`.
 */
export interface WealthSnapshot extends SyncFields {
  id: string;
  familyId: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  primary: CurrencyCode;
  savings: number;
  receivables: number;
  payables: number;
  /** true si la valeur est une estimation (aucun relevé antérieur à reporter). */
  estimated?: boolean;
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
export type SyncEntity =
  | 'account'
  | 'transaction'
  | 'budget'
  | 'goal'
  | 'debt'
  | 'category'
  | 'recurring'
  | 'wealth'
  | 'business'
  | 'product'
  | 'sale'
  | 'purchase'
  | 'party'
  | 'advance'
  | 'settlement'
  | 'quote'
  | 'project'
  | 'stockMovement';

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
  /** Horodatage du prochain essai (repli exponentiel après refus). */
  nextAttemptAt?: number;
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
