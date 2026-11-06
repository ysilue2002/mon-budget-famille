import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/dexie';
import { bootstrapApp } from '@/db/seed';
import {
  createBusiness,
  createParty,
  createProduct,
  createTrade,
  createTransaction,
  deleteTrade,
  partyDocuments,
  recordPartyPayment,
  updateTrade,
} from '@/core/repo';
import { partyBalance } from '@/core/payments';

/**
 * Intégration de la phase 2 sur la vraie couche de données (IndexedDB simulé) :
 * chaque opération saisie dans l'interface est vérifiée à l'écriture, avec ses
 * conséquences sur le stock, le journal et les fiches clients/fournisseurs.
 */

const DAY = '2026-03-04';
const PRICE = 1_500_000; // prix de vente unitaire, en sous-unités
const COST = 900_000; // prix d'achat unitaire

let businessId = '';
let accountId = '';

beforeAll(() => {
  // Identifiant d'appareil : localStorage minimal (environnement node).
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  });
});

beforeEach(async () => {
  // Aucun réseau : la conversion retombe sur les taux par défaut.
  vi.stubGlobal('fetch', () => Promise.reject(new Error('hors ligne')));
  await db.delete();
  await db.open();
  await bootstrapApp();
  const account = await db.accounts.toCollection().first();
  if (!account) throw new Error('compte de départ manquant');
  accountId = account.id;
  businessId = await createBusiness({ name: 'Boutique Awa', activity: 'commerce' });
});

async function product(stockQty = 10): Promise<string> {
  return createProduct({
    name: 'Sac de riz',
    unit: 'sac',
    buyPrice: COST,
    sellPrice: PRICE,
    stockQty,
    alertQty: 2,
  });
}

function tradeInput(overrides: Partial<Parameters<typeof createTrade>[1]> = {}) {
  return {
    businessId,
    date: DAY,
    partyName: 'Awa',
    lines: [{ productId: '', label: 'Sac de riz', qty: 3, unitPrice: PRICE }],
    paid: 0,
    paymentMethod: 'cash' as const,
    accountId,
    ...overrides,
  };
}

describe('marchandises', () => {
  it('enregistre la marchandise telle qu’elle est saisie', async () => {
    const id = await product(12);
    const saved = await db.products.get(id);
    expect(saved).toMatchObject({
      name: 'Sac de riz',
      unit: 'sac',
      buyPrice: COST,
      sellPrice: PRICE,
      stockQty: 12,
      alertQty: 2,
      archived: false,
    });
    expect(saved?.familyId).toBe((await db.families.toCollection().first())?.id);
    const ops = await db.outbox.where('entity').equals('product').toArray();
    expect(ops.map((op) => op.op)).toEqual(['upsert']);
  });

  it('refuse une quantité négative à la saisie', async () => {
    const id = await createProduct({
      name: 'Huile',
      unit: 'L',
      buyPrice: 100,
      sellPrice: 200,
      stockQty: -5,
      alertQty: -1,
    });
    const saved = await db.products.get(id);
    expect(saved?.stockQty).toBe(0);
    expect(saved?.alertQty).toBe(0);
  });
});

describe('ventes', () => {
  it('calcule le total, déplace le stock et crée l’opération de journal', async () => {
    const productId = await product(10);
    const id = await createTrade('sale', tradeInput({ lines: [{ productId, label: 'Sac de riz', qty: 3, unitPrice: PRICE }], paid: 2_000_000 }));

    const sale = await db.sales.get(id);
    expect(sale).toMatchObject({ businessId, total: 4_500_000, paid: 2_000_000, due: 2_500_000, kind: 'sale' });
    expect(sale?.lines).toHaveLength(1);
    expect(sale?.lines[0]).toMatchObject({ productId, qty: 3, unitPrice: PRICE, lineTotal: 4_500_000 });

    // Stock : 10 − 3 = 7.
    expect((await db.products.get(productId))?.stockQty).toBe(7);

    // Journal : revenu du montant total, non soldé, part reçue conservée.
    const tx = await db.transactions.get(`sale-${id}`);
    expect(tx).toMatchObject({
      type: 'income',
      amountOriginal: 4_500_000,
      amountInPrimary: 4_500_000,
      businessId,
      accountId,
      settled: false,
      settledAmount: 2_000_000,
      date: DAY,
    });
  });

  it('marque la vente soldée quand tout est payé', async () => {
    const productId = await product();
    const id = await createTrade(
      'sale',
      tradeInput({ lines: [{ productId, label: 'Sac de riz', qty: 2, unitPrice: PRICE }], paid: 3_000_000 }),
    );
    const tx = await db.transactions.get(`sale-${id}`);
    expect(tx?.settled).toBe(true);
    expect((await db.sales.get(id))?.due).toBe(0);
  });

  it('plafonne un paiement supérieur au total', async () => {
    const id = await createTrade('sale', tradeInput({ paid: 99_000_000 }));
    const sale = await db.sales.get(id);
    expect(sale?.paid).toBe(4_500_000);
    expect(sale?.due).toBe(0);
  });

  it('recalcule le stock par différence lors d’une correction', async () => {
    const productId = await product(10);
    const id = await createTrade('sale', tradeInput({ lines: [{ productId, label: 'Sac de riz', qty: 3, unitPrice: PRICE }], paid: 0 }));
    expect((await db.products.get(productId))?.stockQty).toBe(7);

    await updateTrade('sale', id, tradeInput({ lines: [{ productId, label: 'Sac de riz', qty: 5, unitPrice: PRICE }], paid: 1_000_000 }));
    expect((await db.products.get(productId))?.stockQty).toBe(5);
    const sale = await db.sales.get(id);
    expect(sale?.total).toBe(7_500_000);
    expect((await db.transactions.get(`sale-${id}`))?.amountOriginal).toBe(7_500_000);
  });

  it('rétablit le stock et retire l’opération à la suppression', async () => {
    const productId = await product(10);
    const id = await createTrade('sale', tradeInput({ lines: [{ productId, label: 'Sac de riz', qty: 4, unitPrice: PRICE }] }));
    await deleteTrade('sale', id);
    expect(await db.sales.get(id)).toBeUndefined();
    expect(await db.transactions.get(`sale-${id}`)).toBeUndefined();
    expect((await db.products.get(productId))?.stockQty).toBe(10);
  });
});

describe('achats', () => {
  it('augmente le stock et crée une dépense de l’activité', async () => {
    const productId = await product(4);
    const id = await createTrade(
      'purchase',
      tradeInput({
        partyName: 'Grossiste',
        lines: [{ productId, label: 'Sac de riz', qty: 6, unitPrice: COST }],
        paid: 2_000_000,
      }),
    );
    expect((await db.products.get(productId))?.stockQty).toBe(10);
    const purchase = await db.purchases.get(id);
    expect(purchase).toMatchObject({ kind: 'purchase', total: 5_400_000, paid: 2_000_000, due: 3_400_000 });
    const tx = await db.transactions.get(`purchase-${id}`);
    expect(tx).toMatchObject({ type: 'expense', amountOriginal: 5_400_000, businessId, settled: false, settledAmount: 2_000_000 });
  });

  it('n’écrit rien dans la table des ventes', async () => {
    const id = await createTrade('purchase', tradeInput({ paid: 0 }));
    expect(await db.sales.get(id)).toBeUndefined();
    expect(await db.purchases.get(id)).toBeDefined();
  });
});

describe('fiches clients et fournisseurs', () => {
  it('calcule le solde dû et impute un encaissement partiel', async () => {
    const productId = await product(20);
    const partyId = await createParty({ kind: 'client', name: 'Awa', phone: '+225 07 00 00 00' });
    const id = await createTrade(
      'sale',
      tradeInput({ partyId, partyName: 'Awa', lines: [{ productId, label: 'Sac de riz', qty: 3, unitPrice: PRICE }], paid: 0 }),
    );

    expect(partyBalance(await partyDocuments(partyId))).toBe(4_500_000);

    const applied = await recordPartyPayment(partyId, 2_000_000);
    expect(applied).toBe(2_000_000);
    const afterPartial = await db.sales.get(id);
    expect(afterPartial).toMatchObject({ paid: 2_000_000, due: 2_500_000 });
    expect(await db.transactions.get(`sale-${id}`)).toMatchObject({ settled: false, settledAmount: 2_000_000 });
    expect(partyBalance(await partyDocuments(partyId))).toBe(2_500_000);

    const rest = await recordPartyPayment(partyId, 2_500_000);
    expect(rest).toBe(2_500_000);
    expect(await db.transactions.get(`sale-${id}`)).toMatchObject({ settled: true, settledAmount: 4_500_000 });
    expect(partyBalance(await partyDocuments(partyId))).toBe(0);
    expect((await db.products.get(productId))?.stockQty).toBe(17);
  });

  it('n’impute jamais plus que le dû', async () => {
    const partyId = await createParty({ kind: 'client', name: 'Koffi' });
    await createTrade('sale', tradeInput({ partyId, partyName: 'Koffi', paid: 0 }));
    const applied = await recordPartyPayment(partyId, 9_000_000);
    expect(applied).toBe(4_500_000);
    expect(partyBalance(await partyDocuments(partyId))).toBe(0);
  });

  it('suit les achats à crédit côté fournisseur', async () => {
    const supplierId = await createParty({ kind: 'supplier', name: 'Grossiste' });
    const id = await createTrade('purchase', tradeInput({ partyId: supplierId, partyName: 'Grossiste', paid: 0 }));
    expect(partyBalance(await partyDocuments(supplierId))).toBe(4_500_000);

    const applied = await recordPartyPayment(supplierId, 1_500_000);
    expect(applied).toBe(1_500_000);
    expect((await db.purchases.get(id))?.due).toBe(3_000_000);
    expect(await db.transactions.get(`purchase-${id}`)).toMatchObject({ settled: false, settledAmount: 1_500_000 });
  });

  it('archive une fiche sans effacer son historique', async () => {
    const partyId = await createParty({ kind: 'client', name: 'Awa' });
    const id = await createTrade('sale', tradeInput({ partyId, partyName: 'Awa' }));
    const { archiveParty } = await import('@/core/repo');
    await archiveParty(partyId);
    expect((await db.parties.get(partyId))?.archived).toBe(true);
    expect(await db.sales.get(id)).toBeDefined();
  });
});

describe('dépenses de l’activité', () => {
  it('enregistre une dépense payée', async () => {
    const id = await createTransaction({
      type: 'expense',
      accountId,
      amountOriginal: 5_000_000,
      currencyOriginal: 'XOF',
      categoryId: 'cat-logement',
      businessId,
      settled: true,
      date: DAY,
      note: 'Loyer boutique',
    });
    expect(await db.transactions.get(id)).toMatchObject({
      type: 'expense',
      amountInPrimary: 5_000_000,
      businessId,
      settled: true,
      note: 'Loyer boutique',
    });
  });

  it('garde une dépense à crédit en attente de règlement', async () => {
    const id = await createTransaction({
      type: 'expense',
      accountId,
      amountOriginal: 2_000_000,
      currencyOriginal: 'XOF',
      businessId,
      settled: false,
      date: DAY,
    });
    const tx = await db.transactions.get(id);
    expect(tx?.settled).toBe(false);
    expect(tx?.settledAmount).toBeUndefined();
    expect(tx?.businessId).toBe(businessId);
  });
});

describe('conservation des données', () => {
  it('retrouve les écritures après fermeture et réouverture de la base', async () => {
    const productId = await product(8);
    const partyId = await createParty({ kind: 'client', name: 'Awa' });
    await createTrade('sale', tradeInput({ partyId, partyName: 'Awa', lines: [{ productId, label: 'Sac de riz', qty: 2, unitPrice: PRICE }], paid: 1_000_000 }));
    await createTrade('purchase', tradeInput({ lines: [{ productId, label: 'Sac de riz', qty: 5, unitPrice: COST }], paid: 0 }));

    db.close();
    await db.open();

    expect(await db.sales.count()).toBe(1);
    expect(await db.purchases.count()).toBe(1);
    expect(await db.parties.count()).toBe(1);
    expect((await db.products.get(productId))?.stockQty).toBe(11);
  });
});
