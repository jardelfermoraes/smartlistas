import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { receiptsApi, ReceiptManualInput, ReceiptItem } from '../api/client';
import { CheckCircle, X, Loader2, Plus, Trash2 } from 'lucide-react';

interface ManualReceiptModalProps {
  onClose: () => void;
  initialChave?: string;
}

export function ManualReceiptModal({ onClose, initialChave = '' }: ManualReceiptModalProps) {
  const queryClient = useQueryClient();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  
  // Dados do cupom
  const [chave, setChave] = useState(initialChave);
  const [cnpj, setCnpj] = useState('');
  const [nomeEmissor, setNomeEmissor] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('PA');
  const [total, setTotal] = useState('');
  
  // Itens (usamos Partial para permitir campos opcionais durante edição)
  const [itens, setItens] = useState<Partial<ReceiptItem>[]>([
    { descricao: '', qtd: 1, unidade: 'UN', preco_unit: 0 }
  ]);

  const createMutation = useMutation({
    mutationFn: (data: ReceiptManualInput) => receiptsApi.createManual(data),
    onSuccess: () => {
      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setTimeout(onClose, 2000);
    },
    onError: (err: any) => {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Erro ao salvar cupom');
    },
  });

  const addItem = () => {
    setItens([...itens, { descricao: '', qtd: 1, unidade: 'UN', preco_unit: 0 } as Partial<ReceiptItem>]);
  };

  const removeItem = (index: number) => {
    if (itens.length > 1) {
      setItens(itens.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof ReceiptItem, value: string | number) => {
    const newItens = [...itens];
    newItens[index] = { ...newItens[index], [field]: value } as Partial<ReceiptItem>;
    setItens(newItens);
  };

  const handleSubmit = () => {
    setError('');
    
    const cleanChave = chave.replace(/\D/g, '');
    if (cleanChave.length !== 44) {
      setError('Chave deve ter 44 dígitos');
      return;
    }
    
    const cleanCnpj = cnpj.replace(/\D/g, '');
    if (cleanCnpj.length !== 14) {
      setError('CNPJ deve ter 14 dígitos');
      return;
    }
    
    const totalNum = parseFloat(total.replace(',', '.'));
    if (isNaN(totalNum) || totalNum <= 0) {
      setError('Total inválido');
      return;
    }
    
    const validItens = itens.filter(i => i.descricao?.trim() && (i.preco_unit ?? 0) > 0);
    if (validItens.length === 0) {
      setError('Adicione pelo menos um item');
      return;
    }

    const data: ReceiptManualInput = {
      chave_acesso: cleanChave,
      cnpj_emissor: cleanCnpj,
      nome_emissor: nomeEmissor || undefined,
      cidade_emissor: cidade || undefined,
      uf_emissor: uf || undefined,
      total: totalNum,
      itens: validItens.map((i, idx) => ({
        seq: idx + 1,
        descricao: i.descricao || '',
        qtd: typeof i.qtd === 'string' ? parseFloat(i.qtd as string) : (i.qtd || 1),
        unidade: i.unidade || 'UN',
        preco_unit: typeof i.preco_unit === 'string' 
          ? parseFloat((i.preco_unit as string).replace(',', '.')) 
          : (i.preco_unit || 0),
        preco_total: (i.qtd || 1) * (typeof i.preco_unit === 'string' 
          ? parseFloat((i.preco_unit as string).replace(',', '.')) 
          : (i.preco_unit || 0)),
      })),
    };

    createMutation.mutate(data);
  };

  // Função para parsear texto colado do portal SEFAZ PA
  const handlePasteData = (text: string) => {
    console.log('Texto recebido para parsing:', text);
    
    // 1. Extrair chave de acesso (44 dígitos, pode ter espaços)
    // Formato: "1525 1209 6340 8900 0201 6501 4000 1932 3194 0163 3787"
    const chaveMatch = text.match(/Chave\s*de\s*acesso[:\s]*\n?([\d\s]{44,60})/i);
    if (chaveMatch) {
      const chave = chaveMatch[1].replace(/\s/g, '');
      if (chave.length === 44) {
        setChave(chave);
        console.log('Chave encontrada:', chave);
      }
    }
    
    // 2. Extrair CNPJ
    const cnpjMatch = text.match(/CNPJ[:\s]*([\d./-]+)/i);
    if (cnpjMatch) {
      setCnpj(cnpjMatch[1]);
      console.log('CNPJ encontrado:', cnpjMatch[1]);
    }
    
    // 3. Extrair Razão Social - linha após "ELETRÔNICA" e antes de "CNPJ"
    // Formato: "I S CAMPOS ATACADISTA E DISTRIBUIDORA LT"
    const razaoMatch = text.match(/ELETR[OÔ]NICA\s*\n+([^\n]+)\s*\n+CNPJ/i);
    if (razaoMatch && razaoMatch[1].trim().length > 3) {
      setNomeEmissor(razaoMatch[1].trim());
      console.log('Razão Social encontrada:', razaoMatch[1].trim());
    }
    
    // 4. Extrair Cidade do endereço
    // Formato: "AV. RIO BRANCO SN , 0 , , CENTRO , CANAA DOS CARAJAS , PA"
    const enderecoMatch = text.match(/CNPJ[:\s]*[\d./-]+\s*\n([^\n]+,\s*PA)/i);
    if (enderecoMatch) {
      // Pega a penúltima parte antes de ", PA"
      const partes = enderecoMatch[1].split(',');
      if (partes.length >= 2) {
        const cidade = partes[partes.length - 2].trim();
        if (cidade.length > 2) {
          setCidade(cidade);
          console.log('Cidade encontrada:', cidade);
        }
      }
    }
    
    // 5. Extrair UF do endereço
    const ufMatch = text.match(/,\s*(PA|AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\s*\n/i);
    if (ufMatch) {
      setUf(ufMatch[1].toUpperCase());
      console.log('UF encontrada:', ufMatch[1]);
    }
    
    // 6. Extrair produtos - formato SEFAZ PA
    // Formato: "PAO DA HORA PAO INTEGRAL 420G (Código: 040729 )\nQtde.:1UN: UNVl. Unit.:   13,49"
    const produtos: Partial<ReceiptItem>[] = [];
    
    // Regex ajustado para o formato exato
    // Usa [^\n]+? para capturar descrição sem incluir quebras de linha
    const produtoRegex = /([A-Z][^\n]+?)\s*\(Código:\s*\d+\s*\)\s*\nQtde\.?:?([\d,]+)\s*UN:\s*\w+\s*Vl\.?\s*Unit\.?:\s*([\d,]+)/gi;
    
    let match;
    while ((match = produtoRegex.exec(text)) !== null) {
      const descricao = match[1].trim();
      const qtdStr = match[2].replace(',', '.');
      const precoStr = match[3].replace(',', '.');
      
      if (descricao.length > 3) {
        produtos.push({
          descricao: descricao,
          qtd: parseFloat(qtdStr),
          unidade: 'UN',
          preco_unit: parseFloat(precoStr),
        });
        console.log('Produto encontrado:', descricao, qtdStr, precoStr);
      }
    }
    
    if (produtos.length > 0) {
      setItens(produtos);
      // Calcula o total somando todos os itens (qtd * preco_unit)
      const totalCalculado = produtos.reduce((sum, p) => {
        const qtd = p.qtd || 1;
        const preco = p.preco_unit || 0;
        return sum + (qtd * preco);
      }, 0);
      if (totalCalculado > 0) {
        setTotal(totalCalculado.toFixed(2).replace('.', ','));
        console.log('Total calculado:', totalCalculado);
      }
    }
    
    // 7. Extrair total do texto
    const totalMatch = text.match(/Valor\s*a\s*pagar\s*R?\$?:?\s*([\d.,]+)/i);
    if (totalMatch) {
      setTotal(totalMatch[1].replace('.', ','));
      console.log('Total do texto:', totalMatch[1]);
    }
  };

  if (success) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-8 text-center">
          <CheckCircle className="mx-auto text-green-500 mb-4" size={48} />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Cupom salvo com sucesso!</h3>
          <p className="text-gray-500">Loja, produtos e preços foram registrados.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white rounded-t-xl">
          <h2 className="text-lg font-semibold">Entrada Manual de Cupom</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mx-4 mt-4 bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Área para colar dados */}
          <div className="bg-blue-50 p-3 rounded-lg">
            <p className="text-sm text-blue-700 mb-2">
              <strong>Dica:</strong> Cole o texto do portal da SEFAZ aqui para preencher automaticamente:
            </p>
            <textarea
              className="input text-sm"
              rows={3}
              placeholder="Cole aqui o texto copiado do portal da SEFAZ..."
              onChange={(e) => handlePasteData(e.target.value)}
            />
          </div>

          {/* Dados do emissor */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Chave de Acesso (44 dígitos)
              </label>
              <input
                type="text"
                value={chave}
                onChange={(e) => setChave(e.target.value)}
                className="input font-mono text-sm"
                placeholder="1525..."
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                CNPJ do Emissor
              </label>
              <input
                type="text"
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
                className="input"
                placeholder="00.000.000/0000-00"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nome/Razão Social
              </label>
              <input
                type="text"
                value={nomeEmissor}
                onChange={(e) => setNomeEmissor(e.target.value)}
                className="input"
                placeholder="Nome da loja"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cidade
              </label>
              <input
                type="text"
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
                className="input"
                placeholder="Cidade"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                UF
              </label>
              <select
                value={uf}
                onChange={(e) => setUf(e.target.value)}
                className="input"
              >
                <option value="PA">PA</option>
                <option value="AC">AC</option>
                <option value="AM">AM</option>
                <option value="AP">AP</option>
                <option value="BA">BA</option>
                <option value="CE">CE</option>
                <option value="DF">DF</option>
                <option value="ES">ES</option>
                <option value="GO">GO</option>
                <option value="MA">MA</option>
                <option value="MG">MG</option>
                <option value="MS">MS</option>
                <option value="MT">MT</option>
                <option value="PB">PB</option>
                <option value="PE">PE</option>
                <option value="PI">PI</option>
                <option value="PR">PR</option>
                <option value="RJ">RJ</option>
                <option value="RN">RN</option>
                <option value="RO">RO</option>
                <option value="RR">RR</option>
                <option value="RS">RS</option>
                <option value="SC">SC</option>
                <option value="SE">SE</option>
                <option value="SP">SP</option>
                <option value="TO">TO</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Valor Total (R$)
              </label>
              <input
                type="text"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                className="input"
                placeholder="0,00"
              />
            </div>
          </div>

          {/* Itens */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Itens do Cupom
              </label>
              <button
                type="button"
                onClick={addItem}
                className="text-sm text-green-600 hover:text-green-700 flex items-center gap-1"
              >
                <Plus size={16} /> Adicionar item
              </button>
            </div>
            
            <div className="space-y-2">
              {itens.map((item, index) => (
                <div key={index} className="flex gap-2 items-start bg-gray-50 p-2 rounded">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={item.descricao}
                      onChange={(e) => updateItem(index, 'descricao', e.target.value)}
                      className="input text-sm"
                      placeholder="Descrição do produto"
                    />
                  </div>
                  <div className="w-16">
                    <input
                      type="number"
                      value={item.qtd}
                      onChange={(e) => updateItem(index, 'qtd', parseFloat(e.target.value) || 0)}
                      className="input text-sm text-center"
                      placeholder="Qtd"
                      min="1"
                    />
                  </div>
                  <div className="w-24">
                    <input
                      type="text"
                      value={item.preco_unit}
                      onChange={(e) => updateItem(index, 'preco_unit', e.target.value)}
                      className="input text-sm text-right"
                      placeholder="Preço"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded"
                    disabled={itens.length === 1}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 p-4 border-t sticky bottom-0 bg-white rounded-b-xl">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="btn-primary flex-1"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 size={18} className="animate-spin" />
                Salvando...
              </span>
            ) : (
              'Salvar Cupom'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
