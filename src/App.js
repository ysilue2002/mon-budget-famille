import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SyncProvider, SyncBadge } from '@/sync/SyncProvider';
import { setLanguage, LANGUAGES } from '@/i18n';
import { clearAuth, getAuth } from '@/lib/api';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import Dashboard from '@/pages/Dashboard';
import Transactions from '@/pages/Transactions';
import Accounts from '@/pages/Accounts';
import Budgets from '@/pages/Budgets';
import Savings from '@/pages/Savings';
import Debts from '@/pages/Debts';
import Converter from '@/pages/Converter';
import Reports from '@/pages/Reports';
import Settings from '@/pages/Settings';
import Conflicts from '@/pages/Conflicts';
import Login from '@/pages/Login';
const NAV_ITEMS = [
    { to: '/', key: 'nav.dashboard', icon: '📊' },
    { to: '/transactions', key: 'nav.transactions', icon: '🧾' },
    { to: '/accounts', key: 'nav.accounts', icon: '🏦' },
    { to: '/budgets', key: 'nav.budgets', icon: '🎯' },
    { to: '/savings', key: 'nav.savings', icon: '💰' },
    { to: '/debts', key: 'nav.debts', icon: '🤝' },
    { to: '/converter', key: 'nav.converter', icon: '💱' },
    { to: '/reports', key: 'nav.reports', icon: '📈' },
    { to: '/settings', key: 'nav.settings', icon: '⚙️' },
];
function LangSwitcher() {
    const { i18n } = useTranslation();
    const current = i18n.language.startsWith('fr') ? 'fr' : 'en';
    return (_jsx("div", { className: "flex overflow-hidden rounded-lg border border-forest-200 bg-white text-xs font-semibold", children: LANGUAGES.map((lng) => (_jsx("button", { type: "button", onClick: () => setLanguage(lng), className: `px-2.5 py-1 ${lng === current ? 'bg-forest-600 text-white' : 'text-forest-700 hover:bg-forest-50'}`, "aria-pressed": lng === current, children: lng === 'fr' ? 'FR' : 'EN' }, lng))) }));
}
function Layout() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const session = getAuth();
    return (_jsxs("div", { className: "flex min-h-screen", children: [_jsxs("aside", { className: "hidden w-60 shrink-0 flex-col border-r border-forest-100 bg-white p-4 lg:flex", children: [_jsxs("div", { className: "mb-6 flex items-center gap-2", children: [_jsx("img", { src: "/icon.svg", alt: "", className: "h-9 w-9 rounded-lg" }), _jsxs("div", { className: "leading-tight", children: [_jsx("p", { className: "text-sm font-bold text-forest-950", children: t('app.title') }), _jsx("p", { className: "text-[11px] text-sage-500", children: "FR \u00B7 EN \u00B7 6 devises" })] })] }), _jsx("nav", { className: "flex flex-1 flex-col gap-1", children: NAV_ITEMS.map((item) => (_jsxs(NavLink, { to: item.to, end: item.to === '/', className: ({ isActive }) => `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-forest-600 text-white' : 'text-forest-800 hover:bg-forest-50'}`, children: [_jsx("span", { "aria-hidden": true, children: item.icon }), t(item.key)] }, item.to))) }), _jsxs("div", { className: "mt-4 flex items-center justify-between", children: [_jsx(SyncBadge, {}), _jsx(LangSwitcher, {})] }), _jsx("button", { type: "button", onClick: () => {
                            if (session) {
                                clearAuth();
                            }
                            else {
                                void navigate('/login');
                            }
                        }, className: "mt-2 text-xs font-medium text-sage-600 hover:text-forest-800", children: session ? t('login.logout') : t('login.tabLogin') })] }), _jsxs("div", { className: "flex min-w-0 flex-1 flex-col", children: [_jsxs("header", { className: "flex items-center justify-between gap-2 border-b border-forest-100 bg-white px-4 py-2 lg:hidden", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("img", { src: "/icon.svg", alt: "", className: "h-8 w-8 rounded-lg" }), _jsx("span", { className: "text-sm font-bold text-forest-950", children: t('app.title') })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(SyncBadge, {}), _jsx(LangSwitcher, {})] })] }), _jsx("main", { className: "flex-1 overflow-y-auto sidebar-nav pb-24 lg:pb-6", children: _jsx(ErrorBoundary, { children: _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(Dashboard, {}) }), _jsx(Route, { path: "/login", element: _jsx(Login, {}) }), _jsx(Route, { path: "/transactions", element: _jsx(Transactions, {}) }), _jsx(Route, { path: "/accounts", element: _jsx(Accounts, {}) }), _jsx(Route, { path: "/budgets", element: _jsx(Budgets, {}) }), _jsx(Route, { path: "/savings", element: _jsx(Savings, {}) }), _jsx(Route, { path: "/debts", element: _jsx(Debts, {}) }), _jsx(Route, { path: "/converter", element: _jsx(Converter, {}) }), _jsx(Route, { path: "/reports", element: _jsx(Reports, {}) }), _jsx(Route, { path: "/settings", element: _jsx(Settings, {}) }), _jsx(Route, { path: "/conflicts", element: _jsx(Conflicts, {}) }), _jsx(Route, { path: "*", element: _jsx(Dashboard, {}) })] }) }) }), _jsx("nav", { className: "fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-forest-100 bg-white/95 px-1 pb-[max(env(safe-area-inset-bottom),0.3rem)] pt-1 backdrop-blur lg:hidden", children: NAV_ITEMS.slice(0, 5).map((item) => (_jsxs(NavLink, { to: item.to, end: item.to === '/', className: ({ isActive }) => `flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-medium ${isActive ? 'bg-forest-50 text-forest-700' : 'text-sage-600'}`, children: [_jsx("span", { "aria-hidden": true, className: "text-base", children: item.icon }), _jsx("span", { className: "max-w-full truncate", children: t(item.key) })] }, item.to))) })] })] }));
}
export default function App() {
    return (_jsx(SyncProvider, { children: _jsx(Layout, {}) }));
}
