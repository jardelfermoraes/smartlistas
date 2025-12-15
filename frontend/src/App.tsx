import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Layout } from './components/Layout';
import { ProtectedRoute, AuthProvider } from './modules/auth';
import { Dashboard } from './pages/Dashboard';
import { Stores } from './pages/Stores';
import { Prices } from './pages/Prices';
import { Receipts } from './pages/Receipts';
import { Login } from './pages/Login';
import { Setup } from './pages/Setup';
import { Users } from './pages/Users';
import { Roles } from './pages/Roles';
import { ShoppingLists } from './pages/ShoppingLists';
import { ShoppingListDetail } from './pages/ShoppingListDetail';
import { AppUsers } from './pages/AppUsers';
import { AppReceiptKeys } from './pages/AppReceiptKeys';
import { AppPayments } from './pages/AppPayments';
import { BillingSettingsPage } from './pages/BillingSettings';
import CanonicalProducts from './pages/CanonicalProducts';
import { api } from './api/client';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AppRoutes() {
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);

  useEffect(() => {
    const checkSetup = async () => {
      try {
        const response = await api.get('/auth/setup/status');
        setNeedsSetup(response.data.needs_setup);
      } catch {
        setNeedsSetup(false);
      }
    };
    checkSetup();
  }, []);

  if (needsSetup === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (needsSetup) {
    return (
      <Routes>
        <Route path="*" element={<Setup />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="stores" element={<Stores />} />
        <Route path="canonical" element={<CanonicalProducts />} />
        <Route path="prices" element={<Prices />} />
        <Route path="receipts" element={<Receipts />} />
        <Route path="users" element={<Users />} />
        <Route path="roles" element={<Roles />} />
        <Route path="shopping" element={<ShoppingLists />} />
        <Route path="shopping/:id" element={<ShoppingListDetail />} />
        <Route path="app-users" element={<AppUsers />} />
        <Route path="app-receipt-keys" element={<AppReceiptKeys />} />
        <Route path="app-payments" element={<AppPayments />} />
        <Route path="billing" element={<BillingSettingsPage />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
