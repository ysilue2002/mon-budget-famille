import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SyncProvider, SyncBadge } from '@/sync/SyncProvider';
import { setLanguage, LANGUAGES, type Language } from '@/i18n';
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
] as const;

function LangSwitcher() {
  const { i18n } = useTranslation();
  const current = i18n.language.startsWith('fr') ? 'fr' : 'en';
  return (
    <div className="flex overflow-hidden rounded-lg border border-forest-200 bg-white text-xs font-semibold">
      {LANGUAGES.map((lng: Language) => (
        <button
          key={lng}
          type="button"
          onClick={() => setLanguage(lng)}
          className={`px-2.5 py-1 ${lng === current ? 'bg-forest-600 text-white' : 'text-forest-700 hover:bg-forest-50'}`}
          aria-pressed={lng === current}
        >
          {lng === 'fr' ? 'FR' : 'EN'}
        </button>
      ))}
    </div>
  );
}

function Layout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const session = getAuth();
  return (
    <div className="flex min-h-screen">
      {/* Barre latérale — écrans larges */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-forest-100 bg-white p-4 lg:flex">
        <div className="mb-6 flex items-center gap-2">
          <img src="/icon.svg" alt="" className="h-9 w-9 rounded-lg" />
          <div className="leading-tight">
            <p className="text-sm font-bold text-forest-950">{t('app.title')}</p>
            <p className="text-[11px] text-sage-500">FR · EN · 6 devises</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive ? 'bg-forest-600 text-white' : 'text-forest-800 hover:bg-forest-50'
                }`
              }
            >
              <span aria-hidden>{item.icon}</span>
              {t(item.key)}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 flex items-center justify-between">
          <SyncBadge />
          <LangSwitcher />
        </div>
        <button
          type="button"
          onClick={() => {
            if (session) {
              clearAuth();
            } else {
              void navigate('/login');
            }
          }}
          className="mt-2 text-xs font-medium text-sage-600 hover:text-forest-800"
        >
          {session ? t('login.logout') : t('login.tabLogin')}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Entête mobile */}
        <header className="flex items-center justify-between gap-2 border-b border-forest-100 bg-white px-4 py-2 lg:hidden">
          <div className="flex items-center gap-2">
            <img src="/icon.svg" alt="" className="h-8 w-8 rounded-lg" />
            <span className="text-sm font-bold text-forest-950">{t('app.title')}</span>
          </div>
          <div className="flex items-center gap-2">
            <SyncBadge />
            <LangSwitcher />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto sidebar-nav pb-24 lg:pb-6">
          <ErrorBoundary>
            <Routes>
                <Route path="/" element={<Dashboard />} />
              <Route path="/login" element={<Login />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/budgets" element={<Budgets />} />
              <Route path="/savings" element={<Savings />} />
              <Route path="/debts" element={<Debts />} />
              <Route path="/converter" element={<Converter />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/conflicts" element={<Conflicts />} />
              <Route path="*" element={<Dashboard />} />
            </Routes>
          </ErrorBoundary>
        </main>

        {/* Barre de navigation — mobile */}
        <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-forest-100 bg-white/95 px-1 pb-[max(env(safe-area-inset-bottom),0.3rem)] pt-1 backdrop-blur lg:hidden">
          {NAV_ITEMS.slice(0, 5).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-medium ${
                  isActive ? 'bg-forest-50 text-forest-700' : 'text-sage-600'
                }`
              }
            >
              <span aria-hidden className="text-base">{item.icon}</span>
              <span className="max-w-full truncate">{t(item.key)}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <SyncProvider>
      <Layout />
    </SyncProvider>
  );
}
