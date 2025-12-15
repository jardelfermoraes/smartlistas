// Teste do parser com o texto da SEFAZ PA

const text = `DOCUMENTO AUXILIAR DA NOTA FISCAL DE CONSUMIDOR ELETRÔNICA

I S CAMPOS ATACADISTA E DISTRIBUIDORA LT
CNPJ: 09.634.089/0002-01
AV. RIO BRANCO SN , 0 , , CENTRO , CANAA DOS CARAJAS , PA
PAO DA HORA PAO INTEGRAL 420G (Código: 040729 )
Qtde.:1UN: UNVl. Unit.:   13,49
Vl. Total
13,49
BANANA PRATA KG (Código: 036933 )
Qtde.:0,904UN: KGVl. Unit.:   5,99
Vl. Total
5,41
DANTEX PANO PRATO SARJA C/ VIE (Código: 000803 )
Qtde.:1UN: UNVl. Unit.:   6,89
Vl. Total
6,89
NISSIN CUP NOODLES GALINHA CAI (Código: 9991037896 )
Qtde.:1UN: UNVl. Unit.:   5,03
Vl. Total
5,03
Qtd. total de itens:14
Valor a pagar R$:86,04`;

// Normaliza
const normalizedText = text.replace(/\n+/g, ' ').replace(/\s+/g, ' ');

// Extrai CNPJ
const cnpjMatch = text.match(/CNPJ[:\s]*(\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2})/i);
const cnpj = cnpjMatch ? cnpjMatch[1].replace(/\D/g, '') : '';
console.log('CNPJ:', cnpj);

// Extrai nome da loja
const lojaMatch = text.match(/([A-Z][A-Z\s]+(?:LTDA|ME|EPP|EIRELI|S\.?A\.?|LT)?)\s*\n*CNPJ/im);
const nomeLoja = lojaMatch ? lojaMatch[1].trim() : '';
console.log('Loja:', nomeLoja);

// Extrai itens
const pattern1 = /([A-Z][A-Z0-9\s\.\-\/]+?)\s*\(Código[:\s]*[\d\s]+\)\s*Qtde\.?[:\s]*([\d,\.]+)\s*UN[:\s]*(\w+)\s*Vl\.?\s*Unit\.?[:\s]*([\d,\.]+)\s*Vl\.?\s*Total\s*([\d,\.]+)/gi;
let match;
let seq = 1;
const itens = [];

while ((match = pattern1.exec(normalizedText)) !== null) {
  itens.push({
    seq: seq++,
    descricao: match[1].trim(),
    qtd: parseFloat(match[2].replace(',', '.')) || 1,
    unidade: match[3] || 'UN',
    preco_unit: parseFloat(match[4].replace(',', '.')) || 0,
    preco_total: parseFloat(match[5].replace(',', '.')) || 0,
  });
}

console.log('Itens encontrados:', itens.length);
itens.forEach(i => console.log(`  ${i.seq}. ${i.descricao} - R$ ${i.preco_total}`));

// Total
const totalMatch = text.match(/Valor\s*a\s*pagar\s*R\$[:\s]*([\d,\.]+)/i);
const total = totalMatch ? parseFloat(totalMatch[1].replace(',', '.')) : 0;
console.log('Total:', total);
