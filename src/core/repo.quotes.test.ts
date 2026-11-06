import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/dexie';
import { bootstrapApp } from '@/db/seed';
import {
  convertQuoteToSale,
  createBusiness,
  createParty,
  createProduct,
  createQuote,
  deleteQuote,
  setQuoteStatus,
  updateQuote,
} from '@/core/repo';

/**
 * Devis → vente : le devis ne doit rien compter (ni ventes, ni stock), et la
 * transformation ne doit créer qu'une seule vente, une seule fois.
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
  if (!account) throw new Error('compte manquant');
  accountId = account.id;
  businessId = await createBusiness({ name: 'Boutique Awa', activity: 'commerce' });
});

function quoteInput(overrides: Partial<Parameters<typeof createQuote>[0]> = {}) {
  return {
    businessId,
    date: DAY,
    partyName: 'Awa',
    status: 'draft' as const,
    lines: [{ label: 'Sac de riz', qty: 3, unitPrice: PRICE }],
    ...overrides,
  };
}

describe('création et modification d’un devis', () => {
  it('numérote et totalise sans toucher aux ventes ni au stock', async () => {
    const productId = await createProduct({
      name: 'Sac de riz',
      unit: 'sac',
      buyPrice: 900_000,
      sellPrice: PRICE,
      stockQty: 10,
      alertQty: 2,
    });
    const partyId = await createParty({ kind: 'client', name: 'Awa' });
    const id = await createQuote(quoteInput({ partyId, lines: [{ productId, label: 'Sac de riz', qty: 3, unitPrice: PRICE }] }));

    const quote = await db.quotes.get(id);
    expect(quote).toMatchObject({ number: 'DEV-2026-0001', total: 4_500_000, status: 'draft', partyId });
    expect(await db.sales.count()).toBe(0);
    expect(await db.transactions.count()).toBe(0);
    expect((await db.products.get(productId))?.stockQty).toBe(10);
    expect(await db.outbox.where('entity').equals('quote').count()).toBe(1);
  });

  it('incrémente le numéro du devis suivant', async () => {
    await createQuote(quoteInput());
    const second = await createQuote(quoteInput());
    expect((await db.quotes.get(second))?.number).toBe('DEV-2026-0002');
  });

  it('modifie un brouillon en gardant son numéro', async () => {
    const id = await createQuote(quoteInput());
    await updateQuote(id, quoteInput({ lines: [{ label: 'Sac de riz', qty: 5, unitPrice: PRICE }] }));
    const quote = await db.quotes.get(id);
    expect(quote?.total).toBe(7_500_000);
    expect(quote?.number).toBe('DEV-2026-0001');
  });
});

describe('transformation en vente', () => {
  it('crée une vente unique, déplace le stock et fige le devis', async () => {
    const productId = await createProduct({
      name: 'Sac de riz',
      unit: 'sac',
      buyPrice: 900_000,
      sellPrice: PRICE,
      stockQty: 10,
      alertQty: 2,
    });
    const id = await createQuote(
      quoteInput({ lines: [{ productId, label: 'Sac de riz', qty: 3, unitPrice: PRICE }], status: 'accepted' }),
    );

    const saleId = await convertQuoteToSale(id, { accountId, paymentMethod: 'wave', paid: 2_000_000 });

    const sale = await db.sales.get(saleId);
    expect(sale).toMatchObject({ number: 'FAC-2026-0001', total: 4_500_000, paid: 2_000_000, due: 2_500_000 });
    expect((await db.products.get(productId))?.stockQty).toBe(7);
    expect(await db.sales.count()).toBe(1);
    expect(await db.transactions.count()).toBe(1);
    expect(await db.transactions.get(`sale-${saleId}`)).toMatchObject({ settled: false, settledAmount: 2_000_000 });

    const quote = await db.quotes.get(id);
    expect(quote).toMatchObject({ status: 'converted', convertedSaleId: saleId, number: 'DEV-2026-0001' });
  });

  it('refuse une seconde transformation', async () => {
    const id = await createQuote(quoteInput({ status: 'accepted' }));
    await convertQuoteToSale(id, { accountId, paymentMethod: 'cash' });
    await expect(convertQuoteToSale(id, { accountId, paymentMethod: 'cash' })).rejects.toThrow('quote-not-convertible');
    expect(await db.sales.count()).toBe(1);
  });

  it('refuse un devis encore en brouillon', async () => {
    const id = await createQuote(quoteInput({ status: 'draft' }));
    await expect(convertQuoteToSale(id, { accountId, paymentMethod: 'cash' })).rejects.toThrow('quote-not-convertible');
    expect(await db.sales.count()).toBe(0);
  });

  it('fige un devis transformé', async () => {
    const id = await createQuote(quoteInput({ status: 'accepted' }));
    await convertQuoteToSale(id, { accountId, paymentMethod: 'cash' });
    await expect(updateQuote(id, quoteInput())).rejects.toThrow('quote-locked');
  });

  it('permet de marquer un devis accepté puis de le transformer', async () => {
    const id = await createQuote(quoteInput({ status: 'sent' }));
    await setQuoteStatus(id, 'accepted');
    const saleId = await convertQuoteToSale(id, { accountId, paymentMethod: 'cash' });
    expect(await db.sales.get(saleId)).toBeDefined();
  });

  it('supprimer le devis ne touche pas la vente', async () => {
    const id = await createQuote(quoteInput({ status: 'accepted' }));
    const saleId = await convertQuoteToSale(id, { accountId, paymentMethod: 'cash' });
    await deleteQuote(id);
    expect(await db.quotes.get(id)).toBeUndefined();
    expect(await db.sales.get(saleId)).toBeDefined();
  });
});
