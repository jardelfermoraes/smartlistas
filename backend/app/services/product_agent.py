"""
Agente especializado em normalização de produtos de supermercado.
Usa regras heurísticas + IA para identificar e padronizar produtos.
"""

import json
import logging
import re
from typing import Optional, Dict, List, Tuple

from openai import OpenAI
from sqlalchemy.orm import Session

from ..config import settings
from ..models import CanonicalProduct, ProductAlias

logger = logging.getLogger(__name__)


# =============================================================================
# DICIONÁRIO DE ABREVIAÇÕES E CORREÇÕES
# =============================================================================

ABREVIACOES = {
    # Tipos de produto
    r'\bAG\b': 'AGUA',
    r'\bAZ\b': 'AGUA',
    r'\bAGUA\s*MIN\b': 'AGUA MINERAL',
    r'\bALC\b': 'ALCOOL',
    r'\bALC\s*\d+\b': 'ALCOOL',  # ALC 46, ALC 70, etc
    r'\bREF\b': 'REFRIGERANTE',
    r'\bREFRI\b': 'REFRIGERANTE',
    r'\bDET\b': 'DETERGENTE',
    r'\bSAB\b': 'SABONETE',
    r'\bSABON\b': 'SABONETE',
    r'\bDESINF\b': 'DESINFETANTE',
    r'\bLIMP\b': 'LIMPADOR',
    r'\bHIGI\b': 'HIGIENICO',
    r'\bPAP\b': 'PAPEL',
    r'\bPAP\s*HIG\b': 'PAPEL HIGIENICO',
    r'\bACUC\b': 'ACUCAR',
    r'\bARR\b': 'ARROZ',
    r'\bFEIJ\b': 'FEIJAO',
    r'\bMAC\b': 'MACARRAO',
    r'\bBISC\b': 'BISCOITO',
    r'\bBOL\b': 'BOLACHA',
    r'\bCHOC\b': 'CHOCOLATE',
    r'\bLT\b': 'LEITE',
    r'\bIOG\b': 'IOGURTE',
    r'\bMARG\b': 'MARGARINA',
    r'\bMANT\b': 'MANTEIGA',
    r'\bQUEIJ\b': 'QUEIJO',
    r'\bPRES\b': 'PRESUNTO',
    r'\bMORT\b': 'MORTADELA',
    r'\bSAL\b': 'SALSICHA',
    r'\bLING\b': 'LINGUICA',
    r'\bFRG\b': 'FRANGO',
    r'\bCRN\b': 'CARNE',
    r'\bBOV\b': 'BOVINA',
    r'\bSUI\b': 'SUINA',
    r'\bCERV\b': 'CERVEJA',
    r'\bVIN\b': 'VINHO',
    r'\bSUC\b': 'SUCO',
    r'\bNEC\b': 'NECTAR',
    r'\bOL\b': 'OLEO',
    r'\bAZT\b': 'AZEITE',
    r'\bCAF\b': 'CAFE',
    r'\bCHA\b': 'CHA',
    r'\bACH\b': 'ACHOCOLATADO',
    r'\bCER\b': 'CEREAL',
    r'\bAVEIA\b': 'AVEIA',
    r'\bGRAN\b': 'GRANOLA',
    r'\bPAO\b': 'PAO',
    r'\bINTEG\b': 'INTEGRAL',
    r'\bDESC\b': 'DESNATADO',
    r'\bSEMI\b': 'SEMI',
    r'\bS/\b': 'SEM',
    r'\bC/\b': 'COM',
    r'\bTRAD\b': 'TRADICIONAL',
    r'\bNAT\b': 'NATURAL',
    r'\bORG\b': 'ORGANICO',
    r'\bLIGHT\b': 'LIGHT',
    r'\bZERO\b': 'ZERO',
    r'\bPEQ\b': 'PEQUENO',
    r'\bMED\b': 'MEDIO',
    r'\bGDE\b': 'GRANDE',
    r'\bGRD\b': 'GRANDE',
    r'\bEMB\b': 'EMBALAGEM',
    r'\bPCT\b': 'PACOTE',
    r'\bCX\b': 'CAIXA',
    r'\bUN\b': 'UNIDADE',
    r'\bKG\b': 'KG',
    r'\bGR?\b': 'G',
    r'\bML\b': 'ML',
    r'\bLT?\b': 'L',
    # Remover ruídos comuns
    r'\bE\s*V\b': '',  # "E V" geralmente é ruído
    r'\bPT\b': '',
    r'\bTP\b': '',
    r'\bSC\b': '',
}

# Marcas conhecidas (para identificação)
MARCAS_CONHECIDAS = [
    # Águas
    'GALLO', 'MINALBA', 'CRYSTAL', 'BONAFONT', 'LINDOYA', 'OURO FINO', 'INDAIA',
    # Refrigerantes
    'COCA COLA', 'COCA-COLA', 'PEPSI', 'GUARANA ANTARCTICA', 'FANTA', 'SPRITE', 'KUAT',
    # Cervejas
    'BRAHMA', 'SKOL', 'ANTARCTICA', 'HEINEKEN', 'BUDWEISER', 'STELLA ARTOIS',
    # Laticínios
    'NESTLE', 'DANONE', 'ITAMBE', 'PARMALAT', 'PIRACANJUBA', 'ELEGÊ', 'VIGOR',
    'BATAVO', 'TIROL', 'LACTALIS', 'QUATÁ',
    # Padaria/Biscoitos
    'BAUDUCCO', 'PANCO', 'PULLMAN', 'WICKBOLD', 'VISCONTI', 'MARILAN', 'PIRAQUE',
    'OREO', 'TRAKINAS', 'PASSATEMPO', 'BONO', 'NEGRESCO',
    # Limpeza
    'YPE', 'BRILUX', 'VEJA', 'OMO', 'ARIEL', 'ACE', 'COMFORT', 'DOWNY',
    'PINHO SOL', 'LYSOL', 'AJAX', 'CIF', 'LIMPOL', 'MINUANO',
    # Higiene
    'DOVE', 'LUX', 'PROTEX', 'PALMOLIVE', 'NIVEA', 'REXONA', 'COLGATE',
    'ORAL-B', 'SENSODYNE', 'CLOSEUP', 'SORRISO', 'SEMPRE LIVRE', 'INTIMUS',
    # Mercearia
    'CAMIL', 'TIO JOAO', 'KICALDO', 'SADIA', 'PERDIGAO', 'SEARA', 'AURORA',
    'LIZA', 'SOYA', 'GALLO', 'ANDORINHA', 'BORGES',
    'NESCAFE', 'PILAO', 'MELITTA', '3 CORACOES', 'CAFE DO PONTO',
    'MAGGI', 'KNORR', 'SAZON', 'KITANO',
    # Doces/Snacks
    'GAROTO', 'LACTA', 'NESTLE', 'ARCOR', 'FERRERO', 'KINDER',
    'ELMA CHIPS', 'RUFFLES', 'DORITOS', 'CHEETOS', 'FANDANGOS',
    # Hortifruti processado
    'DEL VALLE', 'SUFRESH', 'TANG', 'CLIGHT', 'MAGUARY',
    # Outros
    'QUAKER', 'KELLOGGS', 'TODDY', 'NESCAU', 'OVOMALTINE',
    'HELLMANNS', 'HEINZ', 'FUGINI',
    'FINI', 'HARIBO', 'RICLAN', 'DOCILE',
    'BELLESA', 'START', 'BELAGUA', 'PETTIZ', 'BAUD', 'BENEVI', 'SC', 'BAG ROL',
]

# Categorias e suas palavras-chave
CATEGORIAS = {
    'Bebidas': {
        'keywords': ['AGUA', 'REFRIGERANTE', 'SUCO', 'CERVEJA', 'VINHO', 'ENERGETICO', 'CHA', 'CAFE', 'NECTAR'],
        'subcategorias': {
            'Águas': ['AGUA', 'MINERAL'],
            'Refrigerantes': ['REFRIGERANTE', 'COCA', 'PEPSI', 'GUARANA', 'FANTA'],
            'Sucos': ['SUCO', 'NECTAR'],
            'Cervejas': ['CERVEJA'],
            'Vinhos': ['VINHO'],
            'Cafés': ['CAFE', 'NESCAFE'],
            'Chás': ['CHA'],
        }
    },
    'Padaria': {
        'keywords': ['PAO', 'BOLO', 'BISCOITO', 'BOLACHA', 'ROSCA', 'TORRADA'],
        'subcategorias': {
            'Pães': ['PAO'],
            'Bolos': ['BOLO'],
            'Biscoitos': ['BISCOITO', 'BOLACHA', 'COOKIE'],
            'Torradas': ['TORRADA', 'ROSCA'],
        }
    },
    'Laticínios': {
        'keywords': ['LEITE', 'QUEIJO', 'IOGURTE', 'MANTEIGA', 'MARGARINA', 'REQUEIJAO', 'CREME', 'NATA'],
        'subcategorias': {
            'Leites': ['LEITE'],
            'Queijos': ['QUEIJO'],
            'Iogurtes': ['IOGURTE'],
            'Manteigas': ['MANTEIGA', 'MARGARINA'],
        }
    },
    'Hortifruti': {
        'keywords': ['BANANA', 'MACA', 'LARANJA', 'LIMAO', 'TOMATE', 'CEBOLA', 'ALFACE', 'BATATA', 
                     'CENOURA', 'ABACAXI', 'MELANCIA', 'MAMAO', 'UVA', 'MORANGO', 'MANGA'],
        'subcategorias': {
            'Frutas': ['BANANA', 'MACA', 'LARANJA', 'ABACAXI', 'MELANCIA', 'MAMAO', 'UVA', 'MORANGO', 'MANGA'],
            'Verduras': ['ALFACE', 'COUVE', 'RUCULA', 'ESPINAFRE'],
            'Legumes': ['TOMATE', 'CEBOLA', 'BATATA', 'CENOURA', 'BETERRABA'],
        }
    },
    'Limpeza': {
        'keywords': ['DETERGENTE', 'DESINFETANTE', 'AGUA SANITARIA', 'LIMPADOR', 'SABAO', 'AMACIANTE', 
                     'ALVEJANTE', 'MULTIUSO', 'ESPONJA', 'PANO', 'VASSOURA', 'RODO', 'ALCOOL', 'ALC'],
        'subcategorias': {
            'Detergentes': ['DETERGENTE'],
            'Desinfetantes': ['DESINFETANTE', 'AGUA SANITARIA', 'ALCOOL'],
            'Limpadores': ['LIMPADOR', 'MULTIUSO'],
            'Sabões': ['SABAO', 'SABAO EM PO'],
            'Amaciantes': ['AMACIANTE', 'COMFORT'],
        }
    },
    'Higiene': {
        'keywords': ['SABONETE', 'SHAMPOO', 'CONDICIONADOR', 'PAPEL HIGIENICO', 'CREME DENTAL', 
                     'ESCOVA', 'DESODORANTE', 'ABSORVENTE', 'FRALDA'],
        'subcategorias': {
            'Sabonetes': ['SABONETE'],
            'Cabelos': ['SHAMPOO', 'CONDICIONADOR'],
            'Papel Higiênico': ['PAPEL HIGIENICO'],
            'Higiene Bucal': ['CREME DENTAL', 'ESCOVA DENTAL', 'ENXAGUANTE'],
            'Desodorantes': ['DESODORANTE'],
        }
    },
    'Mercearia': {
        'keywords': ['ARROZ', 'FEIJAO', 'MACARRAO', 'OLEO', 'AZEITE', 'ACUCAR', 'SAL', 'FARINHA',
                     'MOLHO', 'TEMPERO', 'EXTRATO', 'CONSERVA', 'SARDINHA', 'ATUM'],
        'subcategorias': {
            'Arroz': ['ARROZ'],
            'Feijão': ['FEIJAO'],
            'Massas': ['MACARRAO', 'ESPAGUETE', 'LASANHA'],
            'Óleos': ['OLEO', 'AZEITE'],
            'Açúcar': ['ACUCAR'],
            'Temperos': ['TEMPERO', 'SAL', 'PIMENTA'],
        }
    },
    'Carnes': {
        'keywords': ['CARNE', 'FRANGO', 'PEIXE', 'BOVINA', 'SUINA', 'FILE', 'COSTELA', 'PICANHA', 'ALCATRA'],
        'subcategorias': {
            'Bovina': ['BOVINA', 'PICANHA', 'ALCATRA', 'FILE', 'COSTELA', 'PATINHO', 'ACÉM'],
            'Suína': ['SUINA', 'PERNIL', 'LOMBO', 'BACON'],
            'Aves': ['FRANGO', 'PERU', 'CHESTER'],
            'Peixes': ['PEIXE', 'TILAPIA', 'SALMAO', 'BACALHAU'],
        }
    },
    'Frios': {
        'keywords': ['PRESUNTO', 'MORTADELA', 'SALAME', 'PEITO DE PERU', 'APRESUNTADO', 'SALSICHA', 'LINGUICA'],
        'subcategorias': {
            'Presuntos': ['PRESUNTO', 'APRESUNTADO'],
            'Embutidos': ['MORTADELA', 'SALAME', 'SALSICHA', 'LINGUICA'],
        }
    },
    'Congelados': {
        'keywords': ['PIZZA', 'LASANHA', 'HAMBURGUER', 'NUGGETS', 'SORVETE', 'PICOLE', 'EMPANADO'],
        'subcategorias': {
            'Pizzas': ['PIZZA'],
            'Pratos Prontos': ['LASANHA'],
            'Empanados': ['NUGGETS', 'EMPANADO', 'HAMBURGUER'],
            'Sorvetes': ['SORVETE', 'PICOLE'],
        }
    },
}


# =============================================================================
# FUNÇÕES DE PRÉ-PROCESSAMENTO
# =============================================================================

def expand_abbreviations(text: str) -> str:
    """Expande abreviações conhecidas."""
    text = text.upper()
    for pattern, replacement in ABREVIACOES.items():
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    # Remove espaços extras
    return ' '.join(text.split())


def extract_quantity(text: str) -> Tuple[Optional[float], Optional[str]]:
    """Extrai quantidade e unidade do texto."""
    # Padrões: 500ML, 1.5L, 500G, 1KG, 12UN
    patterns = [
        (r'(\d+(?:[.,]\d+)?)\s*(ML|L|G|KG|UN|UNID|UNIDADE)', lambda m: (float(m.group(1).replace(',', '.')), m.group(2))),
    ]
    
    text = text.upper()
    for pattern, extractor in patterns:
        match = re.search(pattern, text)
        if match:
            qty, unit = extractor(match)
            # Normaliza unidade
            unit_map = {'UNID': 'un', 'UNIDADE': 'un', 'UN': 'un', 'ML': 'ml', 'L': 'l', 'G': 'g', 'KG': 'kg'}
            return qty, unit_map.get(unit, unit.lower())
    
    return None, None


def identify_variation(text: str, categoria: Optional[str] = None, subcategoria: Optional[str] = None) -> Optional[str]:
    """Identifica variações relevantes (ex: com/sem gás) quando presentes no texto."""
    t = text.upper()

    # Água: com/sem gás é essencial para diferenciar produtos canônicos
    if (categoria == 'Bebidas' and subcategoria == 'Águas') or ('AGUA' in t and 'MINERAL' in t):
        # Normaliza padrões comuns de cupom
        if re.search(r'\bSEM\s+GAS\b', t) or re.search(r'\bS\s*/\s*GAS\b', t) or re.search(r'\bS\s*GAS\b', t):
            return 'Sem Gás'
        if re.search(r'\bCOM\s+GAS\b', t) or re.search(r'\bC\s*/\s*GAS\b', t) or re.search(r'\bC\s*GAS\b', t):
            return 'Com Gás'
        if 'GASEIFICADA' in t:
            return 'Com Gás'

    return None


def _format_quantity(quantidade: Optional[float], unidade: Optional[str]) -> Optional[str]:
    if quantidade is None or not unidade:
        return None
    if quantidade == int(quantidade):
        qty_str = str(int(quantidade))
    else:
        qty_str = str(quantidade).replace('.', ',')
    # unidade já vem normalizada (ml, l, g, kg, un)
    return f"{qty_str}{unidade}"


def _contains_any(haystack: str, needles: List[str]) -> bool:
    h = haystack.lower()
    return any(n.lower() in h for n in needles)


def _tokenize_for_overlap(text: str) -> List[str]:
    """Tokenização simples para checar coerência lexical entre descrição e nome."""
    t = re.sub(r'[^\w\sÁÉÍÓÚÂÊÎÔÛÃÕÇáéíóúâêîôûãõç]', ' ', text)
    tokens = [w.lower() for w in t.split() if len(w) >= 3]

    stop = {
        'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'com', 'sem', 'para', 'tipo',
        'un', 'unid', 'unidade', 'ml', 'l', 'g', 'kg',
        'pct', 'pacote', 'cx', 'caixa', 'embalagem',
    }

    cleaned: List[str] = []
    for w in tokens:
        if w in stop:
            continue
        # Palavras genéricas que não ajudam a validar coerência
        if w in {'produto', 'item', 'itens', 'diversos', 'geral', 'generico', 'genérico'}:
            continue
        # Remove números puros/curtos
        if re.fullmatch(r'\d+(?:[.,]\d+)?', w):
            continue
        cleaned.append(w)

    return cleaned


def _ai_result_is_consistent(
    expanded: str,
    categoria: Optional[str],
    subcategoria: Optional[str],
    variacao: Optional[str],
    quantidade: Optional[float],
    unidade: Optional[str],
    ai_result: Dict,
) -> bool:
    """Valida saída da IA para evitar normalizações incoerentes."""
    nome = (ai_result.get('nome') or '').strip()
    if not nome:
        return False

    expanded_up = expanded.upper()
    nome_low = nome.lower()

    # Bloqueia nomes genéricos da IA quando o texto não contém isso
    generic_words = {'produto', 'item', 'itens', 'diversos', 'geral'}
    if any(g in nome_low for g in generic_words):
        if not any(g in expanded.lower() for g in generic_words):
            return False

    # Guardrail forte para água: se o texto fala de água mineral, o nome precisa falar de água
    if 'AGUA' in expanded_up and ('MINERAL' in expanded_up or categoria == 'Bebidas'):
        if not _contains_any(nome, ['agua', 'água']):
            return False

    # Se o texto contém palavras-chave muito específicas, não aceitar troca grosseira de tipo
    keyword_groups = [
        (['AZEITE'], ['azeite']),
        (['OLEO', 'ÓLEO'], ['óleo', 'oleo']),
        (['ARROZ'], ['arroz']),
        (['FEIJAO', 'FEIJÃO'], ['feijão', 'feijao']),
        (['LEITE'], ['leite']),
        (['PAPEL HIGIENICO', 'HIGIENICO'], ['papel', 'higiênico', 'higienico']),
        (['DETERGENTE'], ['detergente']),
        (['REFRIGERANTE'], ['refrigerante']),
    ]

    for expected_tokens, expected_name_tokens in keyword_groups:
        if any(tok in expanded_up for tok in expected_tokens):
            if not _contains_any(nome, expected_name_tokens):
                return False

    # Se variação foi detectada, o nome da IA deve respeitar (principalmente em água)
    if variacao and (categoria == 'Bebidas' and subcategoria == 'Águas'):
        if variacao.lower() not in nome_low:
            return False

    # Se temos quantidade/unidade, o nome da IA deve conter o tamanho (evita "Água Mineral" genérico)
    qty = _format_quantity(quantidade, unidade)
    if qty and qty.lower() not in nome_low:
        return False

    # Se a heurística tem categoria/subcategoria, não permitir IA trocar por algo completamente diferente
    ai_categoria = ai_result.get('categoria')
    ai_subcategoria = ai_result.get('subcategoria')
    if categoria and ai_categoria and ai_categoria != categoria:
        return False
    if subcategoria and ai_subcategoria and ai_subcategoria != subcategoria:
        # Subcategoria pode ser menos precisa, mas em Águas é importante
        if categoria == 'Bebidas' and subcategoria == 'Águas':
            return False

    # Guardrail geral: precisa existir alguma sobreposição de termos relevantes
    # Evita casos tipo "Prestobarba" virar "Detergente" quando a categoria não foi detectada.
    expanded_tokens = set(_tokenize_for_overlap(expanded))
    name_tokens = set(_tokenize_for_overlap(nome))
    # Remover tokens que são só variação (para não passar por acidente)
    for noisy in {'gas', 'gás'}:
        expanded_tokens.discard(noisy)
        name_tokens.discard(noisy)

    overlap = expanded_tokens.intersection(name_tokens)
    if len(overlap) == 0:
        return False

    return True


def identify_brand(text: str) -> Optional[str]:
    """Identifica a marca no texto."""
    text_upper = text.upper()
    for marca in MARCAS_CONHECIDAS:
        if marca in text_upper:
            # Retorna com capitalização correta
            return marca.title()
    return None


def identify_category(text: str) -> Tuple[Optional[str], Optional[str]]:
    """Identifica categoria e subcategoria."""
    text_upper = text.upper()
    
    for categoria, info in CATEGORIAS.items():
        for keyword in info['keywords']:
            if keyword in text_upper:
                # Tenta identificar subcategoria
                for subcat, subkeywords in info.get('subcategorias', {}).items():
                    for subkw in subkeywords:
                        if subkw in text_upper:
                            return categoria, subcat
                return categoria, None
    
    return None, None


def clean_product_name(text: str, marca: Optional[str] = None, quantidade: Optional[float] = None, unidade: Optional[str] = None) -> str:
    """Limpa e formata o nome do produto, incluindo tamanho."""
    # Remove quantidade/unidade do texto (será adicionada no final)
    text = re.sub(r'\d+(?:[.,]\d+)?\s*(ML|L|G|KG|UN|UNID|UNIDADE)\b', '', text, flags=re.IGNORECASE)
    
    # Remove marca se identificada (será adicionada separadamente)
    if marca:
        text = re.sub(re.escape(marca), '', text, flags=re.IGNORECASE)
    
    # Remove caracteres especiais e números soltos
    text = re.sub(r'[^\w\s]', ' ', text)
    text = re.sub(r'\b\d+\b', '', text)
    
    # Remove espaços extras e capitaliza
    words = text.split()
    # Remove palavras muito curtas (provavelmente ruído)
    words = [w for w in words if len(w) > 1]
    
    if not words:
        nome = text.strip().title()
    else:
        nome = ' '.join(words).strip().title()
    
    # Adiciona quantidade/tamanho ao nome canônico
    if quantidade and unidade:
        # Formata quantidade (remove .0 se for inteiro)
        if quantidade == int(quantidade):
            qty_str = str(int(quantidade))
        else:
            qty_str = str(quantidade)
        nome = f"{nome} {qty_str}{unidade}"
    
    return nome


# =============================================================================
# AGENTE DE NORMALIZAÇÃO
# =============================================================================

class ProductNormalizationAgent:
    """Agente inteligente para normalização de produtos."""
    
    def __init__(self, db: Session, use_ai: bool = True):
        self.db = db
        self.use_ai = use_ai and bool(settings.openai_api_key)
        self.client = OpenAI(api_key=settings.openai_api_key) if self.use_ai else None
    
    def normalize(self, descricao_original: str) -> Dict:
        """
        Normaliza uma descrição de produto.
        
        Retorna dict com: nome, marca, categoria, subcategoria, unidade, quantidade
        """
        logger.info(f"Normalizando: {descricao_original}")
        
        # 1. Expande abreviações
        expanded = expand_abbreviations(descricao_original)
        logger.debug(f"Expandido: {expanded}")
        
        # 2. Extrai quantidade e unidade
        quantidade, unidade = extract_quantity(expanded)
        
        # 3. Identifica marca
        marca = identify_brand(expanded)
        
        # 4. Identifica categoria
        categoria, subcategoria = identify_category(expanded)

        # 4.1 Identifica variações relevantes (ex: água com/sem gás)
        variacao = identify_variation(expanded, categoria, subcategoria)
        
        # 5. Limpa nome do produto (inclui quantidade)
        nome = clean_product_name(expanded, marca, quantidade, unidade)

        # 5.1 Injeta variação no nome heurístico quando aplicável
        if variacao:
            # Evita duplicar se já vier no nome
            if variacao.lower() not in nome.lower():
                nome_base = re.sub(r'\s+\d+(?:[.,]\d+)?\s*(ml|l|g|kg|un)\b', '', nome, flags=re.IGNORECASE).strip()
                qty = _format_quantity(quantidade, unidade)
                if qty:
                    nome = f"{nome_base} {variacao} {qty}".strip()
                else:
                    nome = f"{nome_base} {variacao}".strip()
        
        # 6. SEMPRE usa IA para garantir nome descritivo
        # A IA é mais inteligente para interpretar descrições truncadas
        if self.use_ai:
            ai_result = self._normalize_with_ai(descricao_original, expanded)
            if ai_result and ai_result.get('nome'):
                # Valida a saída da IA para evitar trocas grosseiras (ex: Água -> Azeite)
                if _ai_result_is_consistent(expanded, categoria, subcategoria, variacao, quantidade, unidade, ai_result):
                    # IA tem prioridade total para o nome
                    nome = ai_result.get('nome')
                    # Usa marca da IA se não identificamos
                    marca = ai_result.get('marca') or marca
                    # Usa categoria da IA se não identificamos
                    categoria = ai_result.get('categoria') or categoria
                    subcategoria = ai_result.get('subcategoria') or subcategoria
                    # Usa quantidade da IA se não extraímos
                    if not quantidade and ai_result.get('quantidade'):
                        quantidade = ai_result.get('quantidade')
                        unidade = ai_result.get('unidade')
                else:
                    logger.warning(
                        "IA inconsistente para '%s' (expanded='%s') -> nome='%s'. Usando heurística.",
                        descricao_original,
                        expanded,
                        ai_result.get('nome'),
                    )

        # 6.1 Pós-processamento: garante que nome não fique genérico quando temos dados
        # Ex: não permitir "Água Mineral" se temos volume ou variação no texto
        nome_lower = (nome or '').lower().strip()
        qty = _format_quantity(quantidade, unidade)
        if categoria == 'Bebidas' and subcategoria == 'Águas':
            if nome_lower in {'agua', 'água', 'agua mineral', 'água mineral'}:
                base = 'Água Mineral'
                if variacao:
                    base = f"{base} {variacao}"
                if qty:
                    nome = f"{base} {qty}".strip()
                else:
                    # Sem tamanho: adiciona marcador para evitar agrupar indevidamente com tamanhos específicos
                    nome = base.strip() + " (Sem Volume)"
            else:
                # Se tem quantidade mas o nome não contém, força anexar
                if qty and qty.lower() not in nome_lower:
                    nome = f"{nome} {qty}".strip()
                # Se variação existe mas não apareceu no nome, força anexar
                if variacao and variacao.lower() not in nome.lower():
                    nome = re.sub(r'\s+\d+(?:[.,]\d+)?\s*(ml|l|g|kg|un)\b', '', nome, flags=re.IGNORECASE).strip()
                    if qty:
                        nome = f"{nome} {variacao} {qty}".strip()
                    else:
                        nome = f"{nome} {variacao}".strip()
        
        # 7. Garante que temos um nome válido
        if not nome or len(nome) < 3:
            nome = expanded[:50].title()

        # 7.1 Remove duplicação acidental de quantidade (ex: "1.5l 1,5l")
        qty = _format_quantity(quantidade, unidade)
        if qty:
            # remove ocorrências repetidas de tamanhos no final
            nome = re.sub(rf'(\b{re.escape(qty)}\b)(?:\s+\b{re.escape(qty)}\b)+', r'\1', nome, flags=re.IGNORECASE).strip()
        
        result = {
            'nome': nome,
            'marca': marca,
            'categoria': categoria,
            'subcategoria': subcategoria,
            'unidade': unidade or 'un',
            'quantidade': quantidade,
        }
        
        logger.info(f"Resultado: {result}")
        return result
    
    def _normalize_with_ai(self, original: str, expanded: str) -> Optional[Dict]:
        """Usa IA para normalização avançada."""
        if not self.client:
            return None
        
        prompt = f"""Você é um especialista em produtos de supermercado brasileiro. Sua tarefa é criar um NOME CANÔNICO para produtos, que será usado para agrupar produtos iguais de marcas diferentes.

DESCRIÇÃO DO CUPOM FISCAL: "{original}"

CONCEITO IMPORTANTE:
- Um "produto canônico" agrupa produtos IGUAIS de MARCAS DIFERENTES
- O nome deve ser: TIPO DO PRODUTO + VARIAÇÃO + TAMANHO
- A MARCA NÃO deve aparecer no nome canônico

EXEMPLOS:
- "AG GALLO S/GAS 500ML" → nome: "Água Mineral Sem Gás 500ml", marca: "Gallo"
- "AGUA MINERAL BONAFONT C/GAS 500ML" → nome: "Água Mineral Com Gás 500ml", marca: "Bonafont"
- "AGUA MINERAL BONAFONT 500ML" → nome: "Água Mineral 500ml", marca: "Bonafont"
- "DET YPE NEUTRO 500ML" → nome: "Detergente Neutro 500ml", marca: "Ypê"
- "DETERGENTE LIMPOL 500ML" → nome: "Detergente Neutro 500ml", marca: "Limpol"
- "PAO PULLMAN INTEGRAL 400G" → nome: "Pão de Forma Integral 400g", marca: "Pullman"
- "LEITE INTEGRAL PARMALAT 1L" → nome: "Leite Integral 1L", marca: "Parmalat"
- "ARROZ BRANCO CAMIL 5KG" → nome: "Arroz Branco Tipo 1 5kg", marca: "Camil"

REGRAS:
1. O nome NUNCA deve conter a marca
2. O nome DEVE incluir o tamanho/quantidade quando disponível
3. Produtos iguais de marcas diferentes devem ter o MESMO nome canônico
4. Interprete abreviações: AG=Água, DET=Detergente, SAB=Sabonete, REF=Refrigerante, INTEG=Integral
5. Para ÁGUA MINERAL, se o texto indicar COM GÁS / SEM GÁS, isso DEVE aparecer no nome
6. Evite nomes genéricos demais: não retorne apenas "Água" ou "Água Mineral" se existir volume no texto

Categorias: Bebidas, Padaria, Laticínios, Hortifruti, Limpeza, Higiene, Mercearia, Carnes, Frios, Congelados

Retorne JSON com:
- nome: TIPO + VARIAÇÃO + TAMANHO (sem marca!)
- marca: marca identificada ou null
- categoria: categoria do produto
- subcategoria: tipo específico
- unidade: un, kg, g, ml ou l
- quantidade: número ou null

Retorne APENAS JSON válido, sem markdown."""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",  # Modelo mais inteligente
                messages=[
                    {"role": "system", "content": "Responda apenas com JSON válido, sem markdown."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                max_tokens=200
            )
            
            content = response.choices[0].message.content.strip()
            # Remove marcadores de código se houver
            if '```' in content:
                content = re.sub(r'```json?\s*', '', content)
                content = re.sub(r'```\s*', '', content)
            
            return json.loads(content)
        except Exception as e:
            logger.error(f"Erro na IA: {e}")
            return None
    
    def find_or_create_canonical(
        self,
        descricao_original: str,
        loja_id: Optional[int] = None,
        gtin: Optional[str] = None
    ) -> Tuple[CanonicalProduct, ProductAlias, bool]:
        """
        Encontra ou cria um produto canônico.
        
        Retorna: (CanonicalProduct, ProductAlias, is_new)
        """
        from .product_normalizer import normalize_text
        
        descricao_norm = normalize_text(descricao_original)
        
        # 1. Busca alias existente
        alias = self.db.query(ProductAlias).filter(
            ProductAlias.descricao_normalizada == descricao_norm,
            ProductAlias.loja_id == loja_id
        ).first()
        
        if alias:
            return alias.canonical_product, alias, False
        
        # 2. Busca por GTIN
        if gtin:
            canonical = self.db.query(CanonicalProduct).filter(
                CanonicalProduct.gtin_principal == gtin
            ).first()
            if canonical:
                alias = self._create_alias(canonical, descricao_original, descricao_norm, loja_id, gtin, 1.0)
                return canonical, alias, False
        
        # 3. Normaliza com o agente
        info = self.normalize(descricao_original)
        
        # 4. Busca produto similar
        canonical = self._find_similar(info)
        
        if canonical:
            alias = self._create_alias(canonical, descricao_original, descricao_norm, loja_id, gtin, 0.8)
            return canonical, alias, False
        
        # 5. Cria novo produto canônico
        canonical = CanonicalProduct(
            nome=info['nome'],
            marca=info.get('marca'),
            categoria=info.get('categoria'),
            subcategoria=info.get('subcategoria'),
            unidade_padrao=info.get('unidade', 'un'),
            quantidade_padrao=info.get('quantidade'),
            gtin_principal=gtin
        )
        self.db.add(canonical)
        self.db.flush()
        
        alias = self._create_alias(canonical, descricao_original, descricao_norm, loja_id, gtin, 0.9)
        
        logger.info(f"Novo produto canônico: {canonical.nome} (id={canonical.id})")
        return canonical, alias, True
    
    def _find_similar(self, info: Dict) -> Optional[CanonicalProduct]:
        """
        Busca produto canônico similar.
        Prioriza encontrar produto com mesmo tipo E tamanho (independente da marca).
        """
        nome = info.get('nome', '')
        quantidade = info.get('quantidade')
        unidade = info.get('unidade')
        
        if not nome:
            return None
        
        # Remove tamanho do nome para busca (ex: "Água Mineral 500ml" -> "Água Mineral")
        nome_base = re.sub(r'\d+(?:[.,]\d+)?\s*(ml|l|g|kg|un)\b', '', nome, flags=re.IGNORECASE).strip()
        
        # Normaliza nome para busca
        nome_norm = nome_base.lower()
        nome_norm = nome_norm.replace('á', 'a').replace('é', 'e').replace('í', 'i').replace('ó', 'o').replace('ú', 'u')
        nome_norm = nome_norm.replace('ã', 'a').replace('õ', 'o').replace('ç', 'c')
        
        # Busca produtos com nome similar
        candidates = self.db.query(CanonicalProduct).filter(
            CanonicalProduct.nome.ilike(f"%{nome_base}%")
        ).all()
        
        # Prioriza produto com mesmo tamanho
        if quantidade and unidade:
            for p in candidates:
                p_qty = p.quantidade_padrao or 0
                p_unit = (p.unidade_padrao or 'un').lower()
                
                # Normaliza unidades para comparação
                if p_unit == 'ml' and p_qty >= 1000:
                    p_qty = p_qty / 1000
                    p_unit = 'l'
                elif p_unit == 'g' and p_qty >= 1000:
                    p_qty = p_qty / 1000
                    p_unit = 'kg'
                
                q_qty = quantidade
                q_unit = unidade.lower()
                if q_unit == 'ml' and q_qty >= 1000:
                    q_qty = q_qty / 1000
                    q_unit = 'l'
                elif q_unit == 'g' and q_qty >= 1000:
                    q_qty = q_qty / 1000
                    q_unit = 'kg'
                
                # Se encontrou produto com mesmo tamanho, retorna ele
                if abs(p_qty - q_qty) < 0.01 and p_unit == q_unit:
                    logger.info(f"Encontrado produto canônico existente: {p.nome} (mesmo tamanho)")
                    return p
        
        # Se não encontrou com mesmo tamanho, não retorna nenhum
        # (melhor criar um novo do que associar ao tamanho errado)
        return None
    
    def _create_alias(
        self,
        canonical: CanonicalProduct,
        descricao_original: str,
        descricao_norm: str,
        loja_id: Optional[int],
        gtin: Optional[str],
        confianca: float
    ) -> ProductAlias:
        """Cria um alias para o produto canônico."""
        alias = ProductAlias(
            canonical_id=canonical.id,
            loja_id=loja_id,
            descricao_original=descricao_original,
            descricao_normalizada=descricao_norm,
            gtin=gtin,
            confianca=confianca
        )
        self.db.add(alias)
        self.db.flush()
        return alias


def find_duplicate_canonicals(db: Session) -> List[Dict]:
    """
    Encontra produtos canônicos que parecem ser duplicados.
    Duplicados são produtos com mesmo tipo E MESMO TAMANHO mas marcas diferentes.
    """
    # Busca todos os produtos
    products = db.query(CanonicalProduct).all()
    
    # Agrupa por nome normalizado + quantidade + unidade
    groups = {}
    for p in products:
        # Normaliza o nome para comparação
        nome_norm = p.nome.lower().strip()
        # Remove variações de acentuação
        nome_norm = nome_norm.replace('á', 'a').replace('é', 'e').replace('í', 'i').replace('ó', 'o').replace('ú', 'u')
        nome_norm = nome_norm.replace('ã', 'a').replace('õ', 'o').replace('ç', 'c')
        
        # Cria chave única: nome + quantidade + unidade
        qty = p.quantidade_padrao or 0
        unit = (p.unidade_padrao or 'un').lower()
        
        # Normaliza unidades (1000ml = 1l, 1000g = 1kg)
        if unit == 'ml' and qty >= 1000:
            qty = qty / 1000
            unit = 'l'
        elif unit == 'g' and qty >= 1000:
            qty = qty / 1000
            unit = 'kg'
        
        key = f"{nome_norm}|{qty}|{unit}"
        
        if key not in groups:
            groups[key] = []
        groups[key].append({
            'id': p.id,
            'nome': p.nome,
            'marca': p.marca,
            'quantidade': p.quantidade_padrao,
            'unidade': p.unidade_padrao
        })
    
    # Retorna apenas grupos com mais de um produto (duplicados reais)
    duplicates = []
    for key, items in groups.items():
        if len(items) > 1:
            nome_base = key.split('|')[0]
            duplicates.append({
                'nome_base': nome_base,
                'tamanho': f"{items[0]['quantidade']}{items[0]['unidade']}",
                'count': len(items),
                'products': items
            })
    
    return sorted(duplicates, key=lambda x: -x['count'])


def merge_canonical_products(db: Session, keep_id: int, merge_ids: List[int]) -> Dict:
    """
    Mescla produtos canônicos duplicados.
    Mantém o produto keep_id e move todos os aliases dos merge_ids para ele.
    """
    keep_product = db.get(CanonicalProduct, keep_id)
    if not keep_product:
        return {"error": f"Produto {keep_id} não encontrado"}
    
    merged_count = 0
    for merge_id in merge_ids:
        if merge_id == keep_id:
            continue
            
        merge_product = db.get(CanonicalProduct, merge_id)
        if not merge_product:
            continue
        
        # Move todos os aliases para o produto principal
        aliases = db.query(ProductAlias).filter(ProductAlias.canonical_id == merge_id).all()
        for alias in aliases:
            alias.canonical_id = keep_id
        
        # Remove o produto duplicado
        db.delete(merge_product)
        merged_count += 1
    
    db.commit()
    
    return {
        "success": True,
        "kept_id": keep_id,
        "merged_count": merged_count,
        "kept_product": keep_product.nome
    }


def auto_merge_duplicates(db: Session) -> Dict:
    """
    Automaticamente mescla produtos canônicos duplicados.
    """
    duplicates = find_duplicate_canonicals(db)
    
    stats = {"groups_processed": 0, "products_merged": 0, "details": []}
    
    for group in duplicates:
        if group['count'] < 2:
            continue
        
        # Mantém o produto com mais aliases ou o primeiro
        products = group['products']
        
        # Conta aliases de cada produto
        for p in products:
            alias_count = db.query(ProductAlias).filter(ProductAlias.canonical_id == p['id']).count()
            p['alias_count'] = alias_count
        
        # Ordena por quantidade de aliases (mantém o que tem mais)
        products.sort(key=lambda x: -x['alias_count'])
        
        keep = products[0]
        merge_ids = [p['id'] for p in products[1:]]
        
        if merge_ids:
            result = merge_canonical_products(db, keep['id'], merge_ids)
            if result.get('success'):
                stats["groups_processed"] += 1
                stats["products_merged"] += result['merged_count']
                stats["details"].append({
                    "kept": keep['nome'],
                    "merged": [p['nome'] for p in products[1:]]
                })
    
    return stats


def renormalize_canonical_product(db: Session, canonical_id: int) -> Dict:
    """Renormaliza um produto canônico existente."""
    product = db.get(CanonicalProduct, canonical_id)
    if not product:
        return {"error": "Produto não encontrado"}
    
    # Busca alias para contexto
    alias = db.query(ProductAlias).filter(
        ProductAlias.canonical_id == canonical_id
    ).first()
    
    if not alias:
        return {"error": "Produto não tem aliases"}
    
    # Usa o agente para renormalizar
    agent = ProductNormalizationAgent(db, use_ai=True)
    info = agent.normalize(alias.descricao_original)
    
    old_nome = product.nome
    
    # Atualiza produto
    product.nome = info['nome']
    product.marca = info.get('marca') or product.marca
    product.categoria = info.get('categoria') or product.categoria
    product.subcategoria = info.get('subcategoria') or product.subcategoria
    product.unidade_padrao = info.get('unidade') or product.unidade_padrao
    product.quantidade_padrao = info.get('quantidade') or product.quantidade_padrao
    
    db.commit()
    
    return {
        "success": True,
        "old_nome": old_nome,
        "new_nome": product.nome,
        "info": info
    }
