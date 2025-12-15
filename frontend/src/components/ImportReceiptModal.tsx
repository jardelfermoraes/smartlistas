import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { receiptsApi } from '../api/client';
import { FileText, CheckCircle, X, Loader2 } from 'lucide-react';

interface ImportReceiptModalProps {
  onClose: () => void;
}

export function ImportReceiptModal({ onClose }: ImportReceiptModalProps) {
  const queryClient = useQueryClient();
  const [chave, setChave] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [status, setStatus] = useState<'idle' | 'importing' | 'processing'>('idle');
  const [registeredOnly, setRegisteredOnly] = useState(false);

  // Mutation para processar o cupom (consulta SEFAZ)
  const processMutation = useMutation({
    mutationFn: (chaveAcesso: string) => receiptsApi.process(chaveAcesso),
    onSuccess: () => {
      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setTimeout(onClose, 2000);
    },
    onError: (err: any) => {
      const detail = err.response?.data?.detail;
      if (typeof detail === 'string') {
        if (detail.includes('Timeout') || detail.includes('timeout')) {
          setError('SEFAZ PA está lenta. Tente novamente em alguns minutos.');
        } else if (detail.includes('não encontrada') || detail.includes('not found')) {
          setError('Chave não encontrada na SEFAZ. Verifique se a chave está correta.');
        } else {
          setError(detail);
        }
      } else {
        setError('Erro ao processar cupom na SEFAZ. Tente novamente.');
      }
      setStatus('idle');
    },
  });

  // Mutation para importar (registrar) o cupom
  const importMutation = useMutation({
    mutationFn: (chaveAcesso: string) => receiptsApi.import(chaveAcesso),
    onSuccess: (_data, chaveAcesso) => {
      // Após registrar, tenta processar automaticamente
      setStatus('processing');
      processMutation.mutate(chaveAcesso);
    },
    onError: (err: any) => {
      const detail = err.response?.data?.detail;
      if (typeof detail === 'string') {
        // Se já existe, tenta processar direto
        if (detail.includes('já existe') || detail.includes('already')) {
          setStatus('processing');
          processMutation.mutate(chave.replace(/\D/g, ''));
          return;
        }
        setError(detail);
      } else if (Array.isArray(detail)) {
        setError(detail.map((e: any) => e.msg || e.message || JSON.stringify(e)).join(', '));
      } else {
        setError('Erro ao importar cupom');
      }
      setStatus('idle');
    },
  });

  // Apenas registrar sem processar
  const handleRegisterOnly = () => {
    setError('');
    const cleanChave = chave.replace(/\D/g, '');
    if (cleanChave.length !== 44) {
      setError('Chave deve ter 44 dígitos');
      return;
    }
    setStatus('importing');
    setRegisteredOnly(true);
    // Registra e fecha sem processar
    receiptsApi.import(cleanChave)
      .then(() => {
        setSuccess(true);
        queryClient.invalidateQueries({ queryKey: ['receipts'] });
        setTimeout(onClose, 1500);
      })
      .catch(() => {
        // Se já existe, considera sucesso
        setSuccess(true);
        queryClient.invalidateQueries({ queryKey: ['receipts'] });
        setTimeout(onClose, 1500);
      });
  };

  const handleImport = () => {
    setError('');
    const cleanChave = chave.replace(/\D/g, '');
    if (cleanChave.length !== 44) {
      setError('Chave deve ter 44 dígitos');
      return;
    }
    setStatus('importing');
    importMutation.mutate(cleanChave);
  };

  const isLoading = status !== 'idle';

  const digitCount = chave.replace(/\D/g, '').length;

  if (success) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-8 text-center">
          <CheckCircle className="mx-auto text-green-500 mb-4" size={48} />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {registeredOnly ? 'Cupom registrado!' : 'Cupom importado com sucesso!'}
          </h3>
          <p className="text-gray-500">
            {registeredOnly 
              ? 'Clique no botão ▷ na lista para processar quando a SEFAZ estiver disponível.'
              : 'Loja, produtos e preços foram salvos.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Importar Cupom Fiscal</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mx-4 mt-4 bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
            <div className="mt-2 flex flex-col gap-1">
              {(error.includes('lenta') || error.includes('Timeout') || error.includes('extrair') || error.includes('indisponível')) && (
                <>
                  <button
                    onClick={handleRegisterOnly}
                    className="text-center text-sm text-blue-600 hover:text-blue-800 underline"
                  >
                    Apenas registrar (processar depois)
                  </button>
                  <button
                    onClick={() => onClose()}
                    className="text-center text-sm text-green-600 hover:text-green-800 underline"
                  >
                    Usar entrada manual (copiar dados do portal)
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        <div className="p-4 space-y-4">
          <div className="text-center mb-2">
            <FileText size={40} className="mx-auto text-green-600 mb-2" />
            <p className="text-sm text-gray-500">
              Informe a chave de acesso do cupom fiscal (44 dígitos)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Chave de Acesso
            </label>
            <textarea
              value={chave}
              onChange={(e) => setChave(e.target.value)}
              className="input font-mono text-sm"
              rows={2}
              placeholder="Cole aqui a chave de acesso (44 dígitos)..."
            />
            <p className={`text-xs mt-1 ${digitCount === 44 ? 'text-green-600' : 'text-gray-400'}`}>
              {digitCount}/44 dígitos
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleImport}
              className="btn-primary flex-1"
              disabled={isLoading || digitCount !== 44}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 size={18} className="animate-spin" />
                  {status === 'importing' ? 'Registrando...' : 'Consultando SEFAZ...'}
                </span>
              ) : (
                'Importar'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
