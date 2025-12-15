import re

text = '''AGUA MINERAL BELAGUA 1,5L (Código: 23001 )
Qtde.:4UN: UNVl. Unit.:   3,45'''

# Regex original - problema com +? (lazy)
regex_old = r'([A-Z][A-Z0-9\s\-\.\/]+?)\s*\(Código:\s*[\d]+\s*\)\s*\n\s*Qtde\.?:?([\d,]+)\s*UN:\s*\w+\s*Vl\.?\s*Unit\.?:\s*([\d,]+)'

# Regex corrigido - captura tudo até (Código
regex_new = r'([A-Z][A-Z0-9\s\-\.\/,]+)\s*\(Código:\s*[\d]+\s*\)\s*\n\s*Qtde\.?:?([\d,]+)\s*UN:\s*\w+\s*Vl\.?\s*Unit\.?:\s*([\d,]+)'

print("=== REGEX ANTIGO ===")
match = re.search(regex_old, text, re.IGNORECASE)
if match:
    print(f'Descrição: "{match.group(1).strip()}"')
else:
    print('Sem match')

print("\n=== REGEX NOVO ===")
match = re.search(regex_new, text, re.IGNORECASE)
if match:
    print(f'Descrição: "{match.group(1).strip()}"')
else:
    print('Sem match')

# Testar com outro produto
text2 = '''PAO DA HORA PAO INTEGRAL 420G (Código: 040729 )
Qtde.:1UN: UNVl. Unit.:   13,49'''

print("\n=== TESTE COM PAO ===")
match = re.search(regex_new, text2, re.IGNORECASE)
if match:
    print(f'Descrição: "{match.group(1).strip()}"')
else:
    print('Sem match')
