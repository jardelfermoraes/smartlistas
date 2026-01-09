import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { 
  Home, 
  Store, 
  Package, 
  DollarSign, 
  Receipt, 
  Bell,
  CreditCard,
  Menu,
  X,
  LogOut,
  User,
  Users,
  ChevronDown,
  Shield,
  ShoppingCart,
  Smartphone
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../modules/auth';

type NavItem = { path: string; label: string; icon: any; requiresPermission?: string };
type NavSection = { title: string; items: NavItem[] };

const navSections: NavSection[] = [
  {
    title: 'Principal',
    items: [
      { path: '/', label: 'Dashboard', icon: Home },
      { path: '/stores', label: 'Lojas', icon: Store },
      { path: '/receipts', label: 'Cupons', icon: Receipt },
    ],
  },
  {
    title: 'Cadastro & Operação',
    items: [
      { path: '/shopping', label: 'Listas de Compras', icon: ShoppingCart },
      { path: '/canonical', label: 'Catálogo', icon: Package },
      { path: '/prices', label: 'Preços', icon: DollarSign },
    ],
  },
  {
    title: 'App',
    items: [
      { path: '/app-receipt-keys', label: 'Chaves do App', icon: Smartphone },
      { path: '/app-users', label: 'Usuários App', icon: Users, requiresPermission: 'users.view' },
      { path: '/app-payments', label: 'Pagamentos App', icon: CreditCard },
    ],
  },
  {
    title: 'Administração',
    items: [
      { path: '/notifications', label: 'Notificações', icon: Bell },
      { path: '/billing', label: 'Promoções', icon: CreditCard },
      { path: '/users', label: 'Usuários', icon: User, requiresPermission: 'users.view' },
      { path: '/roles', label: 'Papéis', icon: Shield, requiresPermission: 'users.manage_roles' },
    ],
  },
];

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, hasPermission } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 md:flex md:gap-6">
      {/* Mobile menu button */}
      <div className="md:hidden fixed top-4 left-4 z-50">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 bg-white rounded-lg shadow-md"
        >
          {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed md:sticky md:top-0 md:h-screen inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-200/60 shadow-sm flex flex-col transform transition-transform duration-200 ease-out md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 border-b border-gray-200/60 flex items-center px-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-600 flex items-center justify-center text-white font-bold">
              S
            </div>
            <div className="leading-tight">
              <div className="text-sm font-bold text-gray-900">SmartListas</div>
              <div className="text-xs text-gray-500">Admin</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 mt-4 px-4 overflow-y-auto">
          {navSections.map((section, sectionIdx) => (
            <div
              key={section.title}
              className={sectionIdx === 0 ? '' : 'mt-4 pt-4 border-t border-gray-200/60'}
            >
              <div className="px-4 mb-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                {section.title}
              </div>
              {section.items.map((item) => {
                if (item.requiresPermission && !hasPermission(item.requiresPermission)) return null;

                const Icon = item.icon;
                const isActive = item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path);

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={`group mx-2 flex items-center gap-2 px-3 py-2.5 mb-1 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-green-50 text-green-800'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <Icon size={18} className={isActive ? 'text-green-700' : 'text-gray-400 group-hover:text-gray-600'} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User info at bottom */}
        <div className="border-t border-gray-200/60 p-4">
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <User size={20} className="text-green-600" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-gray-900 truncate">{user?.nome}</p>
                <p className="text-xs text-gray-500 truncate">{user?.role?.display_name}</p>
              </div>
              <ChevronDown size={16} className={`text-gray-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* User dropdown menu */}
            {userMenuOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-lg shadow-lg border border-gray-200 py-1">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut size={16} />
                  Sair
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="min-h-screen flex-1 min-w-0">
        <div className="p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
