import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { api } from '../api/client';

const REFERRAL_STORAGE_KEY = 'smartlistas.referral_code';

export function ReferralRedirect() {
  const { code } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    const normalized = (code || '').trim().toUpperCase();

    if (normalized) {
      try {
        window.localStorage.setItem(REFERRAL_STORAGE_KEY, normalized);
      } catch {
        // ignore
      }

      void api.post('/app/referrals/open', { referral_code: normalized }).catch(() => null);
    }

    navigate('/cadastro', { replace: true });
  }, [code, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="card max-w-md w-full text-center">
        <div className="w-10 h-10 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <h1 className="text-xl font-semibold text-gray-900">Redirecionando...</h1>
        <p className="text-gray-600 mt-2">Estamos preparando seu cadastro.</p>
      </div>
    </div>
  );
}
