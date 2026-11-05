import { useEffect } from 'react';
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SyncProvider, SyncBadge } from '@/sync/SyncProvider';
import { LANGUAGES } from '@/i18n';
import { SUPPORTED_CURRENCIES } from '@/core/currencies';
import { SpaceProvider, useSpace } from '@/spaces/space';
import { LangSwitcher } from '@/components/LangSwitcher';
import { clearAuth, getAuth } from '@/lib/api';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { WealthTracker } from '@/components/WealthTracker';
import { materializeDueRecurrences } from '@/core/recurring';
import Dashboard from '@/pages/Dashboard';
import Transactions from '@/pages/Transactions';
import Accounts from '@/pages/Accounts';
import Members from '@/pages/Members';
import Budgets from '@/pages/Budgets';
import Savings from '@/pages/Savings';
import Debts from '@/pages/Debts';
import Recurring from '@/pages/Recurring';
import Converter from '@/pages/Converter';
import Reports from '@/pages/Reports';
import Statements from '@/pages/Statements';
import BusinessPage from '@/pages/Business';
import ActivityHome from '@/pages/ActivityHome';
import Products from '@/pages/Products';
import Trades from '@/pages/Trades';
import Parties from '@/pages/Parties';
import Advances from '@/pages/Advances';
import Settings from '@/pages/Settings';
import Conflicts from '@/pages/Conflicts';
import Login from '@/pages/Login';
import Join from '@/pages/Join';
import Reset from '@/pages/Reset';
import SpaceSelect from '@/pages/SpaceSelect';

/** Navigation de l'assistant « budget familial ». */
const NAV_FAMILY = [
  { to: '/', key: 'nav.dashboard', icon: '📊' },
  { to: '/transactions', key: 'nav.transactions', icon: '🧾' },
  { to: '/accounts', key: 'nav.accounts', icon: '🏦' },
  { to: '/members', key: 'nav.members', icon: '👥' },
  { to: '/budgets', key: 'nav.budgets', icon: '🎯' },
  { to: '/savings', key: 'nav.savings', icon: '💰' },
  { to: '/debts', key: 'nav.debts', icon: '🤝' },
  { to: '/recurring', key: 'nav.recurring', icon: '🔁' },
  { to: '/converter', key: 'nav.converter', icon: '💱' },
  { to: '/reports', key: 'nav.reports', icon: '📈' },
  { to: '/statements', key: 'nav.statements', icon: '📄' },
  { to: '/settings', key: 'nav.settings', icon: '⚙️' },
] as const;

/** Navigation de l'assistant « activité » : accueil, stock, ventes, bilans, documents. */
const NAV_BUSINESS = [
  { to: '/', key: 'nav.home', icon: '🏠' },
  { to: '/sales', key: 'nav.sales', icon: '🛒' },
  { to: '/purchases', key: 'nav.purchases', icon: '📥' },
  { to: '/advances', key: 'nav.advances', icon: '💵' },
  { to: '/clients', key: 'nav.clients', icon: '👤' },
  { to: '/suppliers', key: 'nav.suppliers', icon: '🏭' },
  { to: '/products', key: 'nav.products', icon: '📦' },
  { to: '/transactions', key: 'nav.transactions', icon: '🧾' },
  { to: '/business', key: 'nav.business', icon: '📊' },
  { to: '/reports', key: 'nav.reports', icon: '📄' },
  { to: '/converter', key: 'nav.converter', icon: '💱' },
  { to: '/settings', key: 'nav.settings', icon: '⚙️' },
] as const;

/**
 * Génère les échéances récurrentes dues : au montage, chaque minute (échéance
 * atteinte pendant que l'app reste ouverte) et au retour de l'onglet au premier plan.
 */
function RecurringScheduler() {
  useEffect(() => {
    const run = () => {
      void materializeDueRecurrences().catch((error) => console.error('recurring generation error', error));
    };
    run();
    const timer = window.setInterval(run, 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return null;
}

function Layout() {
  const { t } = useTranslation();
  const { space, clearSpace } = useSpace();
  const navigate = useNavigate();
  const session = getAuth();
  const business = space === 'business';
  const navItems = business ? NAV_BUSINESS : NAV_FAMILY;
  const spaceLabel = business ? t('spaces.businessShort') : t('spaces.familyShort');
  const meta = t('app.meta', { languages: LANGUAGES.length, currencies: SUPPORTED_CURRENCIES.length });

  const changeSpace = () => {
    clearSpace();
    void navigate('/', { replace: true });
  };

  return (
    <div className="flex min-h-screen">
      {/* Barre latérale — écrans larges */}
      <aside className="app-chrome hidden w-60 shrink-0 flex-col border-r border-forest-100 bg-white p-4 lg:flex">
        <div className="mb-6 flex items-center gap-2">
          <img src="/icon.svg" alt="" className="h-9 w-9 rounded-lg" />
          <div className="leading-tight">
            <p className="text-sm font-bold text-forest-950">{spaceLabel}</p>
            <p className="text-[11px] text-sage-500">{meta}</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
          {navItems.map((item) => (
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
          onClick={changeSpace}
          className="mt-2 text-left text-xs font-medium text-forest-700 underline hover:text-forest-900"
        >
          ⇄ {t('spaces.switch')}
        </button>
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
        <header className="app-chrome flex items-center justify-between gap-2 border-b border-forest-100 bg-white px-4 py-2 lg:hidden">
          <div className="flex items-center gap-2">
            <img src="/icon.svg" alt="" className="h-8 w-8 rounded-lg" />
            <span className="text-sm font-bold text-forest-950">{spaceLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <SyncBadge />
            <LangSwitcher />
          </div>
        </header>

        <main className="app-main flex-1 overflow-y-auto sidebar-nav pb-24 lg:pb-6">
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={business ? <ActivityHome /> : <Dashboard />} />
              <Route path="/products" element={<Products />} />
              <Route path="/sales" element={<Trades kind="sale" />} />
              <Route path="/purchases" element={<Trades kind="purchase" />} />
              <Route path="/advances" element={<Advances />} />
              <Route path="/clients" element={<Parties kind="client" />} />
              <Route path="/suppliers" element={<Parties kind="supplier" />} />
              <Route path="/login" element={<Login />} />
              <Route path="/join" element={<Join />} />
              <Route path="/reset" element={<Reset />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/members" element={<Members />} />
              <Route path="/budgets" element={<Budgets />} />
              <Route path="/savings" element={<Savings />} />
              <Route path="/debts" element={<Debts />} />
              <Route path="/recurring" element={<Recurring />} />
              <Route path="/converter" element={<Converter />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/statements" element={<Statements />} />
              <Route path="/business" element={<BusinessPage />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/conflicts" element={<Conflicts />} />
              <Route path="*" element={business ? <ActivityHome /> : <Dashboard />} />
            </Routes>
          </ErrorBoundary>
        </main>

        {/* Barre de navigation — mobile */}
        <nav className="app-chrome fixed inset-x-0 bottom-0 z-40 flex items-stretch gap-0.5 overflow-x-auto border-t border-forest-100 bg-white/95 px-1 pb-[max(env(safe-area-inset-bottom),0.3rem)] pt-1 backdrop-blur lg:hidden">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex min-w-[4.5rem] shrink-0 flex-col items-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-medium ${
                  isActive ? 'bg-forest-50 text-forest-700' : 'text-sage-600'
                }`
              }
            >
              <span aria-hidden className="text-base">
                {item.icon}
              </span>
              <span className="max-w-full truncate">{t(item.key)}</span>
            </NavLink>
          ))}
          <button
            type="button"
            onClick={changeSpace}
            className="flex min-w-[4.5rem] shrink-0 flex-col items-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-medium text-sage-600"
          >
            <span aria-hidden className="text-base">
              ⇄
            </span>
            <span className="max-w-full truncate">{t('spaces.switch')}</span>
          </button>
        </nav>
      </div>
    </div>
  );
}

/** Sans espace choisi, l'application ouvre l'écran d'accueil des deux assistants. */
function Shell() {
  const { space } = useSpace();
  return space ? <Layout /> : <SpaceSelect />;
}

export default function App() {
  return (
    <SpaceProvider>
      <SyncProvider>
        <RecurringScheduler />
        <WealthTracker />
        <Shell />
      </SyncProvider>
    </SpaceProvider>
  );
}
