"""Initial schema - create all tables

Revision ID: 001
Revises: 
Create Date: 2024-12-04 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # === Lojas ===
    op.create_table(
        'lojas',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('cnpj', sa.String(20), nullable=False),
        sa.Column('nome', sa.String(255), nullable=True),
        sa.Column('endereco', sa.String(255), nullable=True),
        sa.Column('cidade', sa.String(120), nullable=True),
        sa.Column('uf', sa.String(2), nullable=True),
        sa.Column('cep', sa.String(20), nullable=True),
        sa.Column('lat', sa.Float(), nullable=True),
        sa.Column('lng', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_lojas_id', 'lojas', ['id'], unique=False)
    op.create_index('ix_lojas_cnpj', 'lojas', ['cnpj'], unique=True)
    op.create_index('ix_lojas_cidade_uf', 'lojas', ['cidade', 'uf'], unique=False)

    # === Produtos ===
    op.create_table(
        'produtos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('gtin', sa.String(32), nullable=True),
        sa.Column('descricao_norm', sa.String(255), nullable=False),
        sa.Column('marca', sa.String(120), nullable=True),
        sa.Column('categoria', sa.String(120), nullable=True),
        sa.Column('unidade_base', sa.String(10), nullable=False, server_default='un'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_produtos_id', 'produtos', ['id'], unique=False)
    op.create_index('ix_produtos_gtin', 'produtos', ['gtin'], unique=False)
    op.create_index('ix_produtos_descricao_norm', 'produtos', ['descricao_norm'], unique=False)
    op.create_index('ix_produtos_gtin_descricao', 'produtos', ['gtin', 'descricao_norm'], unique=False)

    # === Cupons ===
    op.create_table(
        'cupons',
        sa.Column('chave_acesso', sa.String(44), nullable=False),
        sa.Column('loja_id', sa.Integer(), nullable=True),
        sa.Column('cnpj_emissor', sa.String(20), nullable=True),
        sa.Column('estado', sa.String(2), nullable=True),
        sa.Column('tipo', sa.String(10), nullable=True, server_default='NFC-e'),
        sa.Column('data_emissao', sa.DateTime(timezone=True), nullable=True),
        sa.Column('total', sa.Float(), nullable=True, server_default='0.0'),
        sa.Column('status', sa.String(20), nullable=True, server_default='pendente'),
        sa.Column('source_url', sa.String(500), nullable=True),
        sa.Column('raw_html', sa.Text(), nullable=True),
        sa.Column('error_message', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['loja_id'], ['lojas.id'], ),
        sa.PrimaryKeyConstraint('chave_acesso')
    )
    op.create_index('ix_cupons_loja_id', 'cupons', ['loja_id'], unique=False)
    op.create_index('ix_cupons_cnpj_emissor', 'cupons', ['cnpj_emissor'], unique=False)
    op.create_index('ix_cupons_estado', 'cupons', ['estado'], unique=False)
    op.create_index('ix_cupons_data_emissao', 'cupons', ['data_emissao'], unique=False)
    op.create_index('ix_cupons_status', 'cupons', ['status'], unique=False)
    op.create_index('ix_cupons_estado_data', 'cupons', ['estado', 'data_emissao'], unique=False)
    op.create_index('ix_cupons_status_created', 'cupons', ['status', 'created_at'], unique=False)

    # === Itens Cupom ===
    op.create_table(
        'itens_cupom',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('cupom_id', sa.String(44), nullable=False),
        sa.Column('produto_id', sa.Integer(), nullable=True),
        sa.Column('seq', sa.Integer(), nullable=True, server_default='1'),
        sa.Column('descricao_raw', sa.String(255), nullable=False),
        sa.Column('qtd', sa.Float(), nullable=True, server_default='1.0'),
        sa.Column('unidade', sa.String(10), nullable=True, server_default='un'),
        sa.Column('preco_unit', sa.Float(), nullable=True, server_default='0.0'),
        sa.Column('preco_total', sa.Float(), nullable=True, server_default='0.0'),
        sa.Column('desconto', sa.Float(), nullable=True, server_default='0.0'),
        sa.Column('gtin_opt', sa.String(32), nullable=True),
        sa.Column('ncm', sa.String(10), nullable=True),
        sa.ForeignKeyConstraint(['cupom_id'], ['cupons.chave_acesso'], ),
        sa.ForeignKeyConstraint(['produto_id'], ['produtos.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('cupom_id', 'seq', name='uq_item_seq_cupom')
    )
    op.create_index('ix_itens_cupom_id', 'itens_cupom', ['id'], unique=False)
    op.create_index('ix_itens_cupom_cupom_id', 'itens_cupom', ['cupom_id'], unique=False)
    op.create_index('ix_itens_cupom_produto_id', 'itens_cupom', ['produto_id'], unique=False)
    op.create_index('ix_itens_cupom_gtin', 'itens_cupom', ['gtin_opt'], unique=False)

    # === Preços ===
    op.create_table(
        'precos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('produto_id', sa.Integer(), nullable=False),
        sa.Column('loja_id', sa.Integer(), nullable=False),
        sa.Column('preco_por_unidade', sa.Float(), nullable=False),
        sa.Column('unidade_base', sa.String(10), nullable=True, server_default='un'),
        sa.Column('data_coleta', sa.DateTime(timezone=True), nullable=True),
        sa.Column('fonte', sa.String(30), nullable=True, server_default='cupom'),
        sa.Column('cupom_id', sa.String(44), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['cupom_id'], ['cupons.chave_acesso'], ),
        sa.ForeignKeyConstraint(['loja_id'], ['lojas.id'], ),
        sa.ForeignKeyConstraint(['produto_id'], ['produtos.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('produto_id', 'loja_id', 'data_coleta', 'fonte', name='uq_preco_por_dia')
    )
    op.create_index('ix_precos_id', 'precos', ['id'], unique=False)
    op.create_index('ix_precos_produto_id', 'precos', ['produto_id'], unique=False)
    op.create_index('ix_precos_loja_id', 'precos', ['loja_id'], unique=False)
    op.create_index('ix_precos_data_coleta', 'precos', ['data_coleta'], unique=False)
    op.create_index('ix_precos_produto_loja', 'precos', ['produto_id', 'loja_id'], unique=False)


def downgrade() -> None:
    op.drop_table('precos')
    op.drop_table('itens_cupom')
    op.drop_table('cupons')
    op.drop_table('produtos')
    op.drop_table('lojas')
