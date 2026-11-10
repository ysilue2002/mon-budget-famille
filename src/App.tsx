import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SyncProvider, SyncBadge } from '@/sync/SyncProvider';
import { LANGUAGES } from '@/i18n';
import { SUPPORTED_CURRENCIES } from '@/core/currencies';
import { SpaceProvider, useSpace } from '@/spaces/space';
import { RecoveryReminder } from '@/components/RecoveryReminder';
// Applique le mode d'affichage mémorisé sur l'appareil dès le démarrage.
import '@/lib/displayPrefs';
import { LangSwitcher } from '@/components/LangSwitcher';
import { clearAuth, getAuth } from '@/lib/api';
import { clearOfflineMode, isOfflineMode } from '@/lib/session';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { WealthTracker } from '@/components/WealthTracker';
import { StockLedgerTracker } from '@/components/StockLedgerTracker';
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
import { NAV_FAMILY, businessNav, hiddenScreens, mobileBarItems, type NavItem } from '@/navigation';
import { useBusinesses } from '@/hooks/useData';
import { useNavPrefs } from '@/hooks/useNavPrefs';
import { HiddenScreensBanner } from '@/components/HiddenScreensBanner';
import ActivityHome from '@/pages/ActivityHome';
import Products from '@/pages/Products';
import Projects from '@/pages/Projects';
import Trades from '@/pages/Trades';
import Parties from '@/pages/Parties';
import Advances from '@/pages/Advances';
import ProfilePage from '@/pages/Profile';
import Expenses from '@/pages/Expenses';
import Balances from '@/pages/Balances';
import Income from '@/pages/Income';
import Treasury from '@/pages/Treasury';
import Quotes from '@/pages/Quotes';
import Invoices from '@/pages/Invoices';
import ActivityDocs from '@/pages/ActivityDocs';
import Settings from '@/pages/Settings';
import Conflicts from '@/pages/Conflicts';
import Login from '@/pages/Login';
import Join from '@/pages/Join';
import Reset from '@/pages/Reset';
import SpaceSelect from '@/pages/SpaceSelect';


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
  const location = useLocation();
  const session = getAuth();
  const businesses = useBusinesses();
  const prefs = useNavPrefs();
  const [moreOpen, setMoreOpen] = useState(false);
  // Sans session ni choix explicite « sans compte », l'espace choisi impose la
  // connexion : les écrans de compte restent évidemment accessibles.
  const publicPaths = ['/login', '/join', '/reset'];
  const needsLogin = !session && !isOfflineMode() && !publicPaths.includes(location.pathname);
  const business = space === 'business';
  // Le menu de l'activité suit le profil des activités en cours : une activité
  // sans profil (créée avant son arrivée) compte comme « tout afficher ».
  const profiles = (businesses ?? [])
    .filter((row) => !row.archived)
    .map((row) => row.profile ?? 'other');
  const navItems: readonly NavItem[] = business ? businessNav(profiles, prefs) : NAV_FAMILY;
  // Sur téléphone : quatre entrées selon le métier, « Plus » ouvre le reste.
  const barItems = business ? mobileBarItems(navItems, profiles) : navItems;
  const moreItems = business ? navItems.filter((item) => !barItems.includes(item)) : [];
  const moreActive = moreItems.some((item) => item.to === location.pathname);
  // Le bandeau ne signale que les écrans masqués que l'utilisateur n'a pas réaffichés.
  const hidden = business ? hiddenScreens(profiles, prefs) : [];
  const spaceLabel = business ? t('spaces.businessShort') : t('spaces.familyShort');
  const meta = t('app.meta', { languages: LANGUAGES.length, currencies: SUPPORTED_CURRENCIES.length });

  const changeSpace = () => {
    clearSpace();
    void navigate('/', { replace: true });
  };

  // Un changement d'écran referme toujours le panneau « Plus ».
  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

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
        <div className="mt-4 flex flex-col gap-2">
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
              clearOfflineMode();
              void navigate('/login', { replace: true });
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
        <header className="app-chrome flex flex-wrap items-center justify-between gap-2 border-b border-forest-100 bg-white px-4 py-2 lg:hidden">
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
          {needsLogin ? (
            <Login />
          ) : (
          <>
            {business && (
              <div className="px-4 pt-3 lg:px-6 lg:pt-4">
                <HiddenScreensBanner hidden={hidden} />
              </div>
            )}
            <RecoveryReminder />
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={business ? <ActivityHome /> : <Dashboard />} />
              <Route path="/products" element={<Products />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/sales" element={<Trades kind="sale" />} />
              <Route path="/purchases" element={<Trades kind="purchase" />} />
              <Route path="/expenses" element={<Expenses />} />
              <Route path="/balances" element={<Balances />} />
              <Route path="/income" element={<Income />} />
              <Route path="/treasury" element={<Treasury />} />
              <Route path="/quotes" element={<Quotes />} />
              <Route path="/invoices" element={<Invoices />} />
              <Route path="/states" element={<ActivityDocs />} />
              <Route path="/advances" element={<Advances />} />
              <Route path="/profile" element={<ProfilePage />} />
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
              <Route path="/settings" element={<Settings />} />
              <Route path="/conflicts" element={<Conflicts />} />
              <Route path="*" element={business ? <ActivityHome /> : <Dashboard />} />
            </Routes>
          </ErrorBoundary>
          </>
          )}
        </main>

        {/* Barre de navigation — mobile */}
        {moreOpen && (
          <>
            <button
              type="button"
              aria-label={t('common.close')}
              className="fixed inset-0 z-30 cursor-default bg-forest-950/20 lg:hidden"
              onClick={() => setMoreOpen(false)}
            />
            <div
              role="dialog"
              aria-label={t('nav.moreTitle')}
              className="fixed inset-x-2 bottom-16 z-50 max-h-[55vh] overflow-y-auto rounded-xl border border-forest-100 bg-white p-2 shadow-xl lg:hidden"
            >
              <div className="flex items-center justify-between px-2 py-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-sage-600">
                  {t('nav.moreTitle')}
                </p>
                <button
                  type="button"
                  className="text-xs font-semibold text-forest-700 underline"
                  onClick={() => setMoreOpen(false)}
                >
                  {t('common.close')}
                </button>
              </div>
              {moreItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium ${
                      isActive ? 'bg-forest-600 text-white' : 'text-forest-800 hover:bg-forest-50'
                    }`
                  }
                >
                  <span aria-hidden>{item.icon}</span>
                  {t(item.key)}
                </NavLink>
              ))}
            </div>
          </>
        )}

        <nav className="app-chrome no-scrollbar fixed inset-x-0 bottom-0 z-40 flex items-stretch gap-0.5 overflow-x-auto border-t border-forest-100 bg-white/95 px-1 pb-[max(env(safe-area-inset-bottom),0.3rem)] pt-1 backdrop-blur lg:hidden">
          {barItems.map((item) => (
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
          {moreItems.length > 0 && (
            <button
              type="button"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((open) => !open)}
              className={`flex min-w-[4.5rem] shrink-0 flex-col items-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-medium ${
                moreOpen || moreActive ? 'bg-forest-50 text-forest-700' : 'text-sage-600'
              }`}
            >
              <span aria-hidden className="text-base">
                ⋯
              </span>
              <span className="max-w-full truncate">{t('nav.more')}</span>
            </button>
          )}
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
        <StockLedgerTracker />
        <Shell />
      </SyncProvider>
    </SpaceProvider>
  );
}
