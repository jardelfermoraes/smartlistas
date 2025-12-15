/**
 * Componente de menu do usuário
 * @module auth/components
 */

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, User, ChevronDown, Settings } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface UserMenuProps {
  /** Mostra em modo compacto (apenas avatar) */
  compact?: boolean;
  /** Classes CSS adicionais */
  className?: string;
}

/**
 * Menu dropdown com informações e ações do usuário
 */
export function UserMenu({ compact = false, className = '' }: UserMenuProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Fecha menu ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (!user) return null;

  const initials = user.nome
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div ref={menuRef} className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 transition-colors w-full"
      >
        {/* Avatar */}
        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
          {user.avatar_url ? (
            <img 
              src={user.avatar_url} 
              alt={user.nome} 
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <span className="text-green-600 font-medium">{initials}</span>
          )}
        </div>

        {/* Info (hidden in compact mode) */}
        {!compact && (
          <>
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user.nome}</p>
              <p className="text-xs text-gray-500 truncate">{user.role?.display_name}</p>
            </div>
            <ChevronDown 
              size={16} 
              className={`text-gray-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} 
            />
          </>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
          {/* User info header */}
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-900">{user.nome}</p>
            <p className="text-xs text-gray-500">{user.email}</p>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <button
              onClick={() => {
                setIsOpen(false);
                navigate('/profile');
              }}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <User size={16} />
              Meu Perfil
            </button>

            <button
              onClick={() => {
                setIsOpen(false);
                navigate('/settings');
              }}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Settings size={16} />
              Configurações
            </button>
          </div>

          {/* Logout */}
          <div className="border-t border-gray-100 py-1">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut size={16} />
              Sair
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
