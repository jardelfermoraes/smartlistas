import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Shield, 
  Check, 
  X,
  Save,
  Users,
  Receipt,
  Store,
  Package,
  DollarSign,
  BarChart3,
  Settings,
  Info
} from 'lucide-react';
import { api } from '../api/client';

interface Permission {
  id: number;
  code: string;
  name: string;
  description: string;
  module: string;
}

interface Role {
  id: number;
  name: string;
  display_name: string;
  description: string;
  level: number;
  is_system: boolean;
  permissions: Permission[];
}

// Ícones por módulo
const moduleIcons: Record<string, React.ElementType> = {
  users: Users,
  receipts: Receipt,
  stores: Store,
  products: Package,
  prices: DollarSign,
  reports: BarChart3,
  system: Settings,
};

// Cores por módulo
const moduleColors: Record<string, string> = {
  users: 'bg-purple-100 text-purple-700',
  receipts: 'bg-blue-100 text-blue-700',
  stores: 'bg-green-100 text-green-700',
  products: 'bg-orange-100 text-orange-700',
  prices: 'bg-yellow-100 text-yellow-700',
  reports: 'bg-pink-100 text-pink-700',
  system: 'bg-gray-100 text-gray-700',
};

export function Roles() {
  const queryClient = useQueryClient();
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [editedPermissions, setEditedPermissions] = useState<Set<number>>(new Set());
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch roles with permissions
  const { data: roles, isLoading: loadingRoles } = useQuery({
    queryKey: ['roles-full'],
    queryFn: () => api.get<Role[]>('/auth/roles/full').then(r => r.data)
  });

  // Fetch all permissions
  const { data: permissions, isLoading: loadingPermissions } = useQuery({
    queryKey: ['permissions'],
    queryFn: () => api.get<Permission[]>('/auth/permissions').then(r => r.data)
  });

  // Update role permissions mutation
  const updateMutation = useMutation({
    mutationFn: ({ roleId, permissionIds }: { roleId: number; permissionIds: number[] }) =>
      api.put(`/auth/roles/${roleId}/permissions`, { permission_ids: permissionIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles-full'] });
      setHasChanges(false);
    }
  });

  const handleSelectRole = (role: Role) => {
    setSelectedRole(role);
    setEditedPermissions(new Set(role.permissions.map(p => p.id)));
    setHasChanges(false);
  };

  const togglePermission = (permissionId: number) => {
    const newSet = new Set(editedPermissions);
    if (newSet.has(permissionId)) {
      newSet.delete(permissionId);
    } else {
      newSet.add(permissionId);
    }
    setEditedPermissions(newSet);
    setHasChanges(true);
  };

  const handleSave = () => {
    if (selectedRole) {
      updateMutation.mutate({
        roleId: selectedRole.id,
        permissionIds: Array.from(editedPermissions)
      });
    }
  };

  // Agrupa permissões por módulo
  const permissionsByModule = permissions?.reduce((acc, perm) => {
    if (!acc[perm.module]) {
      acc[perm.module] = [];
    }
    acc[perm.module].push(perm);
    return acc;
  }, {} as Record<string, Permission[]>) || {};

  const isLoading = loadingRoles || loadingPermissions;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Papéis e Permissões</h1>
        <p className="text-gray-500 mt-1">
          Configure quais módulos cada papel pode acessar
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Lista de Roles */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Papéis</h2>
            <div className="space-y-2">
              {roles?.map((role) => (
                <button
                  key={role.id}
                  onClick={() => handleSelectRole(role)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
                    selectedRole?.id === role.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      role.name === 'super_admin' ? 'bg-purple-100' :
                      role.name === 'admin' ? 'bg-red-100' :
                      role.name === 'manager' ? 'bg-blue-100' : 'bg-gray-100'
                    }`}>
                      <Shield size={20} className={
                        role.name === 'super_admin' ? 'text-purple-600' :
                        role.name === 'admin' ? 'text-red-600' :
                        role.name === 'manager' ? 'text-blue-600' : 'text-gray-600'
                      } />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{role.display_name}</p>
                      <p className="text-sm text-gray-500">{role.permissions.length} permissões</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Permissões do Role selecionado */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200">
            {selectedRole ? (
              <>
                <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      Permissões: {selectedRole.display_name}
                    </h2>
                    <p className="text-sm text-gray-500">{selectedRole.description}</p>
                  </div>
                  {hasChanges && (
                    <button
                      onClick={handleSave}
                      disabled={updateMutation.isPending}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      <Save size={18} />
                      {updateMutation.isPending ? 'Salvando...' : 'Salvar'}
                    </button>
                  )}
                </div>

                <div className="p-4 space-y-6">
                  {Object.entries(permissionsByModule).map(([module, perms]) => {
                    const Icon = moduleIcons[module] || Settings;
                    const colorClass = moduleColors[module] || 'bg-gray-100 text-gray-700';
                    
                    return (
                      <div key={module} className="space-y-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorClass}`}>
                            <Icon size={16} />
                          </div>
                          <h3 className="font-medium text-gray-900 capitalize">{module}</h3>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 ml-10">
                          {perms.map((perm) => {
                            const isEnabled = editedPermissions.has(perm.id);
                            return (
                              <button
                                key={perm.id}
                                onClick={() => togglePermission(perm.id)}
                                className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-colors text-left ${
                                  isEnabled
                                    ? 'border-green-500 bg-green-50'
                                    : 'border-gray-200 hover:border-gray-300'
                                }`}
                              >
                                <div className={`w-6 h-6 rounded flex items-center justify-center ${
                                  isEnabled ? 'bg-green-500' : 'bg-gray-200'
                                }`}>
                                  {isEnabled ? (
                                    <Check size={14} className="text-white" />
                                  ) : (
                                    <X size={14} className="text-gray-400" />
                                  )}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-900">{perm.name}</p>
                                  <p className="text-xs text-gray-500">{perm.description}</p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                <Info size={48} className="mb-4 opacity-50" />
                <p>Selecione um papel para ver suas permissões</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
