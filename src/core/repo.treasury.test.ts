import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/dexie';
import { bootstrapApp } from '@/db/seed';
import { createBusiness, createParty, createProduct, createTrade, recordPartyPayment } from '@/core/repo';
import { computeAccountBalance } from '@/core/selectors';

/**
 * Trésorerie : chaque encaissement ou paiement doit laisser une trace datée,
 * et l'argent ne doit bouger qu'une seule fois dans le solde du compte.
 */

const DAY = '2026-03-04';
const PRICE = 1_500_000;

let businessId = '';
let accountId = '';

beforeAll(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  });
});

beforeEach(async () => {
  vi.stubGlobal('fetch', () => Promise.reject(new Error('hors ligne')));
  await db.delete();
  await db.open();
  await bootstrapApp();
  const account = await db.accounts.toCollection().first();
  if (!account) throw new Error('compte de départ manquant');
  accountId = account.id;
  businessId = await createBusiness({ name: 'Boutique Awa', activity: 'commerce' });
});

async function creditSale(partyId?: string, partyName = 'Awa') {
  const productId = await createProduct({
    name: 'Sac de riz',
    unit: 'sac',
    buyPrice: 900_000,
    sellPrice: PRICE,
    stockQty: 20,
    alertQty: 2,
  });
  return createTrade('sale', {
    businessId,
    date: DAY,
    partyId,
    partyName,
    lines: [{ productId, label: 'Sac de riz', qty: 3, unitPrice: PRICE }],
    paid: 0,
    paymentMethod: 'cash',
    accountId,
  });
}

async function cashBalance(): Promise<number> {
  const account = await db.accounts.get(accountId);
  if (!account) throw new Error('compte manquant');
  return computeAccountBalance(account, await db.transactions.toArray());
}

describe('historique des règlements', () => {
  it('enregistre un encaissement partiel avec sa date, son moyen et son compte', async () => {
    const partyId = await createParty({ kind: 'client', name: 'Awa' });
    const saleId = await creditSale(partyId);

    const applied = await recordPartyPayment(partyId, 2_000_000, {
      method: 'wave',
      accountId,
      date: '2026-03-10',
      note: 'Acompte',
    });
    expect(applied).toBe(2_000_000);

    const settlements = await db.settlements.toArray();
    expect(settlements).toHaveLength(1);
    expect(settlements[0]).toMatchObject({
      partyId,
      partyName: 'Awa',
      kind: 'client',
      documentId: saleId,
      documentKind: 'sale',
      amount: 2_000_000,
      method: 'wave',
      accountId,
      date: '2026-03-10',
      note: 'Acompte',
    });
    const ops = await db.outbox.where('entity').equals('settlement').toArray();
    expect(ops.map((op) => op.op)).toEqual(['upsert']);
  });

  it('cumule les règlements jusqu’au paiement complet', async () => {
    const partyId = await createParty({ kind: 'client', name: 'Awa' });
    const saleId = await creditSale(partyId);

    await recordPartyPayment(partyId, 2_000_000, { method: 'cash', date: '2026-03-10' });
    await recordPartyPayment(partyId, 2_500_000, { method: 'orange', date: '2026-03-20' });

    const rows = await db.settlements.orderBy('date').toArray();
    expect(rows.map((row) => row.amount)).toEqual([2_000_000, 2_500_000]);
    expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBe(4_500_000);
    expect((await db.sales.get(saleId))?.due).toBe(0);
    expect(await db.transactions.get(`sale-${saleId}`)).toMatchObject({ settled: true, settledAmount: 4_500_000 });
  });

  it('plafonne un encaissement au montant réellement dû', async () => {
    const partyId = await createParty({ kind: 'client', name: 'Awa' });
    const saleId = await creditSale(partyId);

    const applied = await recordPartyPayment(partyId, 9_000_000, { date: '2026-03-10' });
    expect(applied).toBe(4_500_000);
    const rows = await db.settlements.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(4_500_000);
    // Rien de plus au journal : le règlement ne crée pas une seconde recette.
    expect(await db.transactions.count()).toBe(1);
    expect(await cashBalance()).toBe(4_500_000);
    expect((await db.sales.get(saleId))?.paid).toBe(4_500_000);
  });

  it('trace aussi les paiements fournisseurs', async () => {
    const supplierId = await createParty({ kind: 'supplier', name: 'Grossiste' });
    const purchaseId = await createTrade('purchase', {
      businessId,
      date: DAY,
      partyId: supplierId,
      partyName: 'Grossiste',
      lines: [{ label: 'Carton de savon', qty: 10, unitPrice: 500_000 }],
      paid: 0,
      paymentMethod: 'cash',
      accountId,
    });

    const applied = await recordPartyPayment(supplierId, 1_500_000, { method: 'bank', accountId, date: '2026-03-12' });
    expect(applied).toBe(1_500_000);
    const rows = await db.settlements.toArray();
    expect(rows[0]).toMatchObject({
      kind: 'supplier',
      documentKind: 'purchase',
      documentId: purchaseId,
      amount: 1_500_000,
      method: 'bank',
    });
    expect((await db.purchases.get(purchaseId))?.due).toBe(3_500_000);
  });

  it('ne fait bouger l’argent qu’une seule fois', async () => {
    const partyId = await createParty({ kind: 'client', name: 'Awa' });
    await creditSale(partyId);
    expect(await cashBalance()).toBe(0);

    await recordPartyPayment(partyId, 1_000_000, { date: '2026-03-10' });
    expect(await cashBalance()).toBe(1_000_000);

    await recordPartyPayment(partyId, 1_000_000, { date: '2026-03-11' });
    expect(await cashBalance()).toBe(2_000_000);

    // Trois opérations au total : une seule vente, aucune écriture par règlement.
    expect(await db.transactions.count()).toBe(1);
    expect(await db.settlements.count()).toBe(2);
  });
});
