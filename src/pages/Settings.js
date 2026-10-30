import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFamily, useRates } from '@/hooks/useData';
import { useSync } from '@/sync/SyncProvider';
import { updateFamilyProfile } from '@/core/repo';
import { setLanguage, LANGUAGES } from '@/i18n';
import { currencyLabel } from '@/core/currencies';
import { RATES_API_URL } from '@/core/exchange';
import { Card, CurrencySelect, Field, Page, Tag, TextInput, btnPrimary } from '@/components/common';
function Settings() {
    const { t, i18n } = useTranslation();
    const family = useFamily();
    const rates = useRates();
    const { online, pending, lastSyncAt, syncNow } = useSync();
    const [name, setName] = useState('');
    const [primary, setPrimary] = useState('XOF');
    const [saved, setSaved] = useState(false);
    useEffect(() => {
        if (family) {
            setName(family.name);
            setPrimary(family.primaryCurrency);
        }
    }, [family]);
    const save = async () => {
        if (!family)
            return;
        await updateFamilyProfile({ name: name.trim() || family.name, primaryCurrency: primary });
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
    };
    return (_jsx(Page, { title: t('settings.title'), children: _jsxs("div", { className: "grid gap-4 lg:grid-cols-2", children: [_jsxs(Card, { children: [_jsx("h2", { className: "mb-4 font-semibold text-forest-950", children: t('settings.family') }), _jsxs("form", { className: "flex flex-col gap-3", onSubmit: (e) => {
                                e.preventDefault();
                                void save();
                            }, children: [_jsx(Field, { label: t('settings.familyName'), children: _jsx(TextInput, { value: name, onChange: (e) => setName(e.target.value), required: true }) }), _jsx(Field, { label: t('settings.primaryCurrency'), hint: t('settings.primaryCurrencyHint'), children: _jsxs("div", { className: "flex gap-2", children: [_jsx(CurrencySelect, { value: primary, onChange: setPrimary }), _jsx("span", { className: "flex items-center text-sm text-sage-600", children: currencyLabel(primary, i18n.language) })] }) }), _jsxs("div", { className: "flex items-center justify-between", children: [_jsx("button", { type: "submit", className: btnPrimary, children: t('common.save') }), saved && (_jsxs("span", { className: "text-sm font-medium text-forest-600", role: "status", children: ["\u2714 ", t('settings.saved')] }))] })] })] }), _jsxs(Card, { children: [_jsx("h2", { className: "mb-4 font-semibold text-forest-950", children: t('settings.language') }), _jsx("div", { className: "flex gap-2", children: LANGUAGES.map((lng) => (_jsx("button", { type: "button", onClick: () => setLanguage(lng), className: `rounded-lg border px-4 py-2 text-sm font-semibold transition ${i18n.language.startsWith(lng)
                                    ? 'border-forest-600 bg-forest-600 text-white'
                                    : 'border-forest-200 bg-white text-forest-800 hover:bg-forest-50'}`, "aria-pressed": i18n.language.startsWith(lng), children: lng === 'fr' ? '🇫🇷 Français' : '🇬🇧 English' }, lng))) }), _jsx("h2", { className: "mb-2 mt-6 font-semibold text-forest-950", children: t('settings.rateApi') }), _jsx("p", { className: "break-all text-xs text-sage-600", children: RATES_API_URL }), _jsxs("p", { className: "mt-2 text-sm text-sage-600", children: [!rates.snapshot
                                    ? t('common.loading')
                                    : rates.snapshot.fetchedAt > 0
                                        ? t('converter.lastUpdate', {
                                            date: new Date(rates.snapshot.fetchedAt).toLocaleString(i18n.language.startsWith('fr') ? 'fr-FR' : 'en-US'),
                                        })
                                        : t('converter.offline'), ' ', rates.snapshot && (_jsxs("span", { className: "ml-1 inline-flex gap-1 align-middle", children: [rates.source === 'network' && _jsx(Tag, { tone: "green", children: t('sync.online') }), rates.source === 'cache' && _jsx(Tag, { tone: "amber", children: t('sync.offline') }), rates.source === 'fallback' && _jsx(Tag, { tone: "red", children: t('sync.offline') })] }))] }), _jsx("h2", { className: "mb-2 mt-6 font-semibold text-forest-950", children: t('settings.sync') }), _jsxs("p", { className: "text-sm text-sage-600", children: [online ? _jsx(Tag, { tone: "green", children: t('sync.online') }) : _jsx(Tag, { tone: "amber", children: t('sync.offline') }), ' ', pending > 0 ? t('sync.pending', { count: pending }) : t('sync.synced'), lastSyncAt && (_jsxs(_Fragment, { children: [' ', "\u00B7 ", t('sync.lastSync', { date: new Date(lastSyncAt).toLocaleString(i18n.language.startsWith('fr') ? 'fr-FR' : 'en-US') })] }))] }), _jsxs("button", { type: "button", className: `${btnPrimary} mt-3`, onClick: () => void syncNow(), children: ["\u27F3 ", t('sync.syncNow')] })] })] }) }));
}
export default Settings;
