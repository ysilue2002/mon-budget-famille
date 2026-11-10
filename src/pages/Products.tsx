import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePrimaryCurrency, useProducts, useStockMovements } from '@/hooks/useData';
import { createProduct, deleteProduct, updateProduct } from '@/core/repo';
import { formatAmount } from '@/core/currencies';
import { isLowStock, lowStockProducts, stockValue, totalUnits, isService } from '@/core/stock';
import { todayISO } from '@/lib/date';
import type { Product, ProductKind } from '@/core/types';
import {
  Card,
  ConfirmButton,
  EmptyState,
  Field,
  Modal,
  MoneyInput,
  Page,
  SelectInput,
  StatCard,
  Tag,
  TextInput,
  btnGhost,
  btnPrimary,
} from '@/components/common';

interface ProductForm {
  id?: string;
  kind: ProductKind;
  name: string;
  unit: string;
  buyPrice: number;
  sellPrice: number;
  stockQty: string;
  alertQty: string;
}

const EMPTY_FORM: ProductForm = {
  kind: 'goods',
  name: '',
  unit: 'pcs',
  buyPrice: 0,
  sellPrice: 0,
  stockQty: '0',
  alertQty: '0',
};

function parseQty(value: string): number {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

/**
 * Articles et prestations : biens stockés (marchandises, matières premières,
 * pièces détachées) et prestations facturées sans stock (main d'œuvre, pose,
 * réparation, location). Prix d'achat et de vente, valeur du stock, alertes de
 * réapprovisionnement et journal daté des mouvements.
 * Les prix sont saisis dans la devise du foyer (sous-unités en base).
 */
export default function Products() {
  const { t, i18n } = useTranslation();
  const products = useProducts();
  const primary = usePrimaryCurrency() ?? 'XOF';
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const rows = products ?? [];
  const active = rows.filter((product) => !product.archived);
  const movements = useStockMovements() ?? [];
  const nameOf = (productId: string) => rows.find((product) => product.id === productId)?.name ?? '—';
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle ? active.filter((product) => product.name.toLowerCase().includes(needle)) : active;
  }, [active, search]);

  const alerts = lowStockProducts(rows);
  const fmt = (minor: number) => formatAmount(minor, primary, i18n.language);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM });
    setError(null);
    setOpen(true);
  };

  const openEdit = (product: Product) => {
    setForm({
      id: product.id,
      kind: product.kind ?? 'goods',
      name: product.name,
      unit: product.unit,
      buyPrice: product.buyPrice,
      sellPrice: product.sellPrice,
      stockQty: String(product.stockQty),
      alertQty: String(product.alertQty),
    });
    setError(null);
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      setError(t('products.nameRequired'));
      return;
    }
    const input = {
      name: form.name,
      kind: form.kind,
      unit: form.unit,
      buyPrice: form.buyPrice,
      sellPrice: form.sellPrice,
      stockQty: form.kind === 'service' ? 0 : parseQty(form.stockQty),
      alertQty: form.kind === 'service' ? 0 : parseQty(form.alertQty),
    };
    if (form.id) await updateProduct(form.id, input);
    else await createProduct(input);
    setOpen(false);
    setForm(EMPTY_FORM);
  };

  return (
    <Page
      title={t('products.title')}
      actions={
        <div className="no-print flex flex-wrap gap-2">
          {active.length > 0 && (
            <button type="button" className={btnGhost} onClick={() => window.print()}>
              🖨 {t('products.print')}
            </button>
          )}
          <button type="button" className={btnPrimary} onClick={openCreate}>
            ＋ {t('products.new')}
          </button>
        </div>
      }
    >
      <div className="no-print mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label={t('products.value')} value={fmt(stockValue(rows))} hint={t('products.hint')} />
        <StatCard label={t('products.count', { count: active.length })} value={String(active.length)} />
        <StatCard
          label={t('products.lowStock')}
          value={String(alerts.length)}
          valueClass={alerts.length > 0 ? 'text-amber-600' : undefined}
        />
      </div>

      {alerts.length > 0 && (
        <Card className="no-print mb-4 border-amber-200 bg-amber-50/50">
          <p className="mb-2 text-sm font-semibold text-amber-800">{t('products.lowStockHint')}</p>
          <ul className="flex flex-wrap gap-2 text-sm">
            {alerts.slice(0, 8).map((product) => (
              <li key={product.id} className="rounded-lg border border-amber-200 bg-white px-2 py-1">
                {product.name} · {formatQty(product.stockQty)} {product.unit}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {active.length === 0 ? (
        <EmptyState label={t('products.empty')} icon="📦" />
      ) : (
        <>
          <div className="no-print mb-3">
            <TextInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('products.searchPlaceholder')}
            />
          </div>

          <article className="print-sheet rounded-xl border border-forest-100 bg-white p-4 shadow-sm sm:p-6">
            <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-forest-200 pb-2">
              <h2 className="text-lg font-bold text-forest-950">{t('products.title')}</h2>
              <p className="text-xs text-sage-600">
                {todayISO()} · {primary}
              </p>
            </header>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-forest-200 text-left text-[11px] uppercase text-sage-600">
                    <th className="py-1.5">{t('products.name')}</th>
                    <th className="py-1.5 text-right">{t('products.stockQty')}</th>
                    <th className="py-1.5 text-right">{t('products.buyPrice')}</th>
                    <th className="py-1.5 text-right">{t('products.sellPrice')}</th>
                    <th className="py-1.5 text-right">{t('products.value')}</th>
                    <th className="no-print py-1.5 text-right">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((product) => (
                    <tr key={product.id} className="border-b border-forest-50">
                      <td className="py-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-forest-950">{product.name}</span>
                          {isService(product) && <Tag tone="sage">{t('products.kind.service')}</Tag>}
                          {isLowStock(product) && (
                            <Tag tone="amber">
                              {product.stockQty <= 0 ? t('products.outOfStock') : t('products.lowStock')}
                            </Tag>
                          )}
                        </div>
                        <span className="text-xs text-sage-500">{product.unit}</span>
                      </td>
                      <td className="py-1.5 text-right font-medium">
                        {isService(product) ? '—' : formatQty(product.stockQty)}
                      </td>
                      <td className="py-1.5 text-right">{fmt(product.buyPrice)}</td>
                      <td className="py-1.5 text-right">{fmt(product.sellPrice)}</td>
                      <td className="py-1.5 text-right font-semibold">
                        {isService(product) ? '—' : fmt(Math.round(product.stockQty * product.buyPrice))}
                      </td>
                      <td className="no-print py-1.5 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            className="rounded p-1 text-sm hover:bg-forest-50"
                            onClick={() => openEdit(product)}
                            aria-label={t('common.edit')}
                          >
                            ✎
                          </button>
                          <ConfirmButton
                            label="🗑"
                            confirmLabel={t('products.deleteConfirm')}
                            cancelLabel={t('common.cancel')}
                            onConfirm={() => void deleteProduct(product.id)}
                            danger
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-forest-300 font-semibold">
                    <td className="py-1.5">{t('products.totalUnits')}</td>
                    <td className="py-1.5 text-right">{formatQty(totalUnits(active))}</td>
                    <td />
                    <td />
                    <td className="py-1.5 text-right">{fmt(stockValue(rows))}</td>
                    <td className="no-print" />
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-sage-500">{t('products.hint')}</p>
          </article>

          {movements.length > 0 && (
            <Card className="no-print mt-4">
              <h2 className="mb-1 text-sm font-bold text-forest-950">{t('products.history')}</h2>
              <p className="mb-2 text-xs text-sage-500">{t('products.historyHint')}</p>
              <ul className="divide-y divide-forest-50 text-sm">
                {movements.slice(0, 12).map((movement) => (
                  <li key={movement.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-1.5">
                    <span className="w-24 text-xs text-sage-600">{movement.date}</span>
                    <span className="font-medium text-forest-950">{nameOf(movement.productId)}</span>
                    <span className="text-xs text-sage-500">{t(`products.reason.${movement.reason}`)}</span>
                    <span
                      className={`ml-auto font-semibold ${
                        movement.qty >= 0 ? 'text-forest-700' : 'text-amber-700'
                      }`}
                    >
                      {movement.qty >= 0 ? '+' : '−'}{formatQty(Math.abs(movement.qty))}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      <Modal
        title={form.id ? t('common.edit') : t('products.new')}
        open={open}
        onClose={() => setOpen(false)}
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <SelectInput
            label={t('products.kind.label')}
            value={form.kind}
            onChange={(value) => setForm({ ...form, kind: value === 'service' ? 'service' : 'goods' })}
            options={[
              { value: 'goods', label: t('products.kind.goods') },
              { value: 'service', label: t('products.kind.service') },
            ]}
          />
          <Field label={t('products.name')}>
            <TextInput
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              maxLength={80}
              required
            />
          </Field>
          <Field label={t('products.unit')} hint={t('products.unitPlaceholder')}>
            <TextInput
              value={form.unit}
              onChange={(event) => setForm({ ...form, unit: event.target.value })}
              maxLength={20}
              list="product-units"
              autoComplete="off"
            />
            {/* Unités du bâtiment et des services : proposées d'un clic pour
                éviter la saisie, sans interdire les mots du métier (« sac »,
                « voyage », « bâche »…). */}
            <datalist id="product-units">
              {['pcs', 'h', 'j', 'm²', 'm³', 'kg', 'L', 'sac', 'forfait'].map((unit) => (
                <option key={unit} value={unit} />
              ))}
            </datalist>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <MoneyInput
              label={t('products.buyPrice')}
              amountMinor={form.buyPrice}
              currency={primary}
              onMinor={(minor) => setForm({ ...form, buyPrice: minor })}
            />
            <MoneyInput
              label={t('products.sellPrice')}
              amountMinor={form.sellPrice}
              currency={primary}
              onMinor={(minor) => setForm({ ...form, sellPrice: minor })}
            />
          </div>
          {form.kind === 'service' ? (
            <p className="rounded-lg bg-sage-50 px-3 py-2 text-xs text-sage-700">{t('products.kind.serviceHint')}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('products.stockQty')}>
                <TextInput
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.stockQty}
                  onChange={(event) => setForm({ ...form, stockQty: event.target.value })}
                />
              </Field>
              <Field label={t('products.alertQty')} hint={t('products.alertHint')}>
                <TextInput
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.alertQty}
                  onChange={(event) => setForm({ ...form, alertQty: event.target.value })}
                />
              </Field>
            </div>
          )}
          {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </button>
            <button type="submit" className={btnPrimary}>
              {t('common.save')}
            </button>
          </div>
        </form>
      </Modal>
    </Page>
  );
}

/** Quantité lisible : 2 décimales maximum, séparateur local. */
function formatQty(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}
