import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/dexie';
import { resolveConflict } from '@/core/repo';
import { Card, EmptyState, Page, Tag, btnGhost } from '@/components/common';
const ENTITY_ICONS = {
    account: '🏦',
    transaction: '🧾',
    budget: '🎯',
    goal: '💰',
    debt: '🤝',
    category: '🏷️',
};
function preview(value) {
    if (value === null || value === undefined)
        return '—';
    if (typeof value === 'object')
        return JSON.stringify(value);
    return String(value);
}
function Conflicts() {
    const { t, i18n } = useTranslation();
    const conflicts = useLiveQuery(() => db.conflicts.filter((conflict) => !conflict.resolved).toArray(), []);
    return (_jsx(Page, { title: t('sync.conflictTitle'), children: !conflicts || conflicts.length === 0 ? (_jsx(EmptyState, { label: t('sync.synced'), icon: "\u2714" })) : (_jsxs(_Fragment, { children: [_jsx("p", { className: "mb-4 text-sm text-sage-600", children: t('sync.conflictHint') }), _jsx("div", { className: "flex flex-col gap-3", children: conflicts.map((conflict) => (_jsxs(Card, { children: [_jsxs("div", { className: "mb-2 flex items-center justify-between gap-2", children: [_jsxs("span", { className: "font-semibold text-forest-950", children: [ENTITY_ICONS[conflict.entity], " ", conflict.field, ' ', _jsx("span", { className: "text-xs font-normal text-sage-500", children: conflict.entityId })] }), _jsx(Tag, { tone: "amber", children: new Date(conflict.createdAt).toLocaleString(i18n.language.startsWith('fr') ? 'fr-FR' : 'en-US') })] }), _jsxs("div", { className: "grid gap-3 sm:grid-cols-2", children: [_jsxs("div", { className: "rounded-lg border border-forest-100 bg-forest-50/60 p-3", children: [_jsx("p", { className: "mb-1 text-xs font-semibold uppercase tracking-wide text-sage-600", children: t('sync.local') }), _jsx("p", { className: "text-sm text-forest-900", children: preview(conflict.localValue) })] }), _jsxs("div", { className: "rounded-lg border border-forest-100 bg-white p-3", children: [_jsx("p", { className: "mb-1 text-xs font-semibold uppercase tracking-wide text-sage-600", children: t('sync.remote') }), _jsx("p", { className: "text-sm text-forest-900", children: preview(conflict.remoteValue) })] })] }), _jsxs("div", { className: "mt-3 flex justify-end gap-2", children: [_jsx("button", { type: "button", className: btnGhost, onClick: () => void resolveConflict(conflict.id, 'local'), children: t('sync.keepLocal') }), _jsx("button", { type: "button", className: btnGhost, onClick: () => void resolveConflict(conflict.id, 'remote'), children: t('sync.keepRemote') })] })] }, conflict.id))) })] })) }));
}
export default Conflicts;
