import re

text = '''BANANA DA TERRA KG (Código: 1313 )
Qtde.:0,83UN: KGVl. Unit.:   12,59
Vl. Total
10,45
CR LEITE ITALAC TP 200G (Código: 19072 )
Qtde.:1UN: UNVl. Unit.:   3,69
Vl. Total
3,69
SARDINHA GOMES COSTA MOLHO TOM TEMP 125G (Código: 22930 )
Qtde.:1UN: UNVl. Unit.:   6,75
Vl. Total
6,75
AGUA MINERAL BELAGUA 1,5L (Código: 23001 )
Qtde.:4UN: UNVl. Unit.:   3,45'''

# Solução: descrição NÃO pode conter quebra de linha
# Usar [^\n] para capturar qualquer coisa exceto quebra de linha
regex_final = r'([A-Z][^\n]+?)\s*\(Código:\s*\d+\s*\)\s*\nQtde\.?:?([\d,]+)\s*UN:\s*\w+\s*Vl\.?\s*Unit\.?:\s*([\d,]+)'

print("=== REGEX FINAL ===")
matches = re.findall(regex_final, text, re.IGNORECASE)
for m in matches:
    print(f'  Desc: "{m[0].strip()}"')
    print(f'  Qtd: {m[1]}, Preço: {m[2]}')
    print()
