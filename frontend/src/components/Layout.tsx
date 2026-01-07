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

const navItems = [
  { path: '/', label: 'Dashboard', icon: Home },
  { path: '/shopping', label: 'Listas de Compras', icon: ShoppingCart },
  { path: '/stores', label: 'Lojas', icon: Store },
  { path: '/canonical', label: 'Catálogo', icon: Package },
  { path: '/prices', label: 'Preços', icon: DollarSign },
  { path: '/receipts', label: 'Cupons', icon: Receipt },
  { path: '/app-receipt-keys', label: 'Chaves do App', icon: Smartphone },
  { path: '/app-payments', label: 'Pagamentos App', icon: CreditCard },
  { path: '/billing', label: 'Promoções', icon: CreditCard },
  { path: '/notifications', label: 'Notificações', icon: Bell },
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
    <div className="min-h-screen bg-gray-50">
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
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-200/60 shadow-sm flex flex-col transform transition-transform duration-200 ease-out md:translate-x-0 ${
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
        <nav className="flex-1 mt-4 px-3 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`group flex items-center gap-3 px-3 py-2.5 mb-1 rounded-lg text-sm font-medium transition-colors ${
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
          
          {/* Link para Usuários (apenas para quem tem permissão) */}
          {hasPermission('users.view') && (
            <Link
              to="/users"
              onClick={() => setSidebarOpen(false)}
              className={`group flex items-center gap-3 px-3 py-2.5 mb-1 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === '/users'
                  ? 'bg-green-50 text-green-800'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <Users size={18} className={location.pathname === '/users' ? 'text-green-700' : 'text-gray-400 group-hover:text-gray-600'} />
              Usuários
            </Link>
          )}
          
          {/* Link para Papéis (apenas para quem pode gerenciar roles) */}
          {hasPermission('users.manage_roles') && (
            <Link
              to="/roles"
              onClick={() => setSidebarOpen(false)}
              className={`group flex items-center gap-3 px-3 py-2.5 mb-1 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === '/roles'
                  ? 'bg-green-50 text-green-800'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <Shield size={18} className={location.pathname === '/roles' ? 'text-green-700' : 'text-gray-400 group-hover:text-gray-600'} />
              Papéis
            </Link>
          )}
          
          {/* Link para Usuários do App */}
          {hasPermission('users.view') && (
            <Link
              to="/app-users"
              onClick={() => setSidebarOpen(false)}
              className={`group flex items-center gap-3 px-3 py-2.5 mb-1 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === '/app-users'
                  ? 'bg-green-50 text-green-800'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <Smartphone size={18} className={location.pathname === '/app-users' ? 'text-green-700' : 'text-gray-400 group-hover:text-gray-600'} />
              Usuários App
            </Link>
          )}
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
      <main className="min-h-screen md:ml-64">
        <div className="p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
