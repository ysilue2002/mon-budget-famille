import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRates } from '@/hooks/useData';
import { convertMinor, rateBetween } from '@/core/money';
import { formatAmount } from '@/core/currencies';
import { Card, CurrencySelect, Field, MoneyInput, Page, Tag, btnGhost } from '@/components/common';
/**
 * Widget de conversion : saisie unilatérale (from → to) calculée en
 * sous-unités entières, avec dernier taux connu et information sur la
 * fraîcheur des taux (temps réel / cache / repli).
 */
function Converter() {
    const { t, i18n } = useTranslation();
    const { snapshot, source, loading, refresh } = useRates();
    const [amount, setAmount] = useState(1000);
    const [from, setFrom] = useState('XOF');
    const [to, setTo] = useState('USD');
    const swapped = from === to ? null : convertMinor(amount, from, to, snapshot);
    const reverse = from === to ? null : convertMinor(amount, to, from, snapshot);
    const rate = rateBetween(from, to, snapshot);
    const lastUpdate = snapshot && snapshot.fetchedAt > 0 ? new Date(snapshot.fetchedAt) : null;
    return (_jsx(Page, { title: t('converter.title'), actions: _jsxs("button", { type: "button", className: btnGhost, onClick: () => void refresh(), disabled: loading, children: ["\u27F3 ", t('converter.refresh')] }), children: _jsxs(Card, { className: "mx-auto max-w-xl", children: [_jsx("h2", { className: "mb-4 font-semibold text-forest-950", children: t('converter.widget') }), _jsx(MoneyInput, { label: t('converter.amount'), amountMinor: amount, currency: from, onCurrency: (code) => setFrom(code), onMinor: (minor) => setAmount(minor) }), _jsxs("div", { className: "mt-4 grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end", children: [_jsx(Field, { label: t('converter.from'), children: _jsx(CurrencySelect, { value: from, onChange: setFrom }) }), _jsx("button", { type: "button", "aria-label": t('converter.swap'), className: "mx-auto rounded-full border border-forest-200 bg-white p-2 text-lg leading-none shadow-sm transition hover:bg-forest-50", onClick: () => {
                                setFrom(to);
                                setTo(from);
                            }, children: "\u21C4" }), _jsx(Field, { label: t('converter.to'), children: _jsx(CurrencySelect, { value: to, onChange: setTo }) })] }), _jsx("div", { className: "mt-5 rounded-xl bg-forest-50 p-4 text-center", children: swapped === null ? (_jsx("p", { className: "text-sm text-sage-600", children: t('converter.invalidRates') })) : (_jsxs(_Fragment, { children: [_jsx("p", { className: "text-2xl font-bold text-forest-900", children: formatAmount(swapped, to, i18n.language) }), reverse !== null && _jsxs("p", { className: "mt-1 text-xs text-sage-600", children: ["\u21C4 ", formatAmount(reverse, from, i18n.language)] }), rate !== null && _jsx("p", { className: "mt-2 text-xs text-sage-600", children: t('converter.rate', { from, to, rate: rate.toPrecision(6) }) })] })) }), _jsxs("div", { className: "mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-sage-600", children: [_jsxs("span", { children: [source === 'network' && _jsx(Tag, { tone: "green", children: t('sync.online') }), ' ', source === 'cache' && _jsx(Tag, { tone: "amber", children: t('sync.offline') }), ' ', source === 'fallback' && _jsx(Tag, { tone: "red", children: t('sync.offline') })] }), _jsx("span", { children: !snapshot
                                ? '…'
                                : snapshot.stale
                                    ? t('converter.offline')
                                    : lastUpdate
                                        ? t('converter.lastUpdate', { date: lastUpdate.toLocaleString(i18n.language.startsWith('fr') ? 'fr-FR' : 'en-US') })
                                        : '' })] })] }) }));
}
export default Converter;
