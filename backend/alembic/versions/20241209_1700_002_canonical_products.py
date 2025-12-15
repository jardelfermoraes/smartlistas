"""Add canonical products and aliases tables.

Revision ID: 002_canonical_products
Revises: 001
Create Date: 2024-12-09 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '002_canonical_products'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Criar tabela produtos_canonicos
    op.create_table(
        'produtos_canonicos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('nome', sa.String(255), nullable=False),
        sa.Column('marca', sa.String(120), nullable=True),
        sa.Column('categoria', sa.String(120), nullable=True),
        sa.Column('subcategoria', sa.String(120), nullable=True),
        sa.Column('unidade_padrao', sa.String(10), nullable=False, server_default='un'),
        sa.Column('quantidade_padrao', sa.Float(), nullable=True),
        sa.Column('gtin_principal', sa.String(32), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_produtos_canonicos_id', 'produtos_canonicos', ['id'])
    op.create_index('ix_produtos_canonicos_nome', 'produtos_canonicos', ['nome'])
    op.create_index('ix_produtos_canonicos_marca', 'produtos_canonicos', ['marca'])
    op.create_index('ix_produtos_canonicos_categoria', 'produtos_canonicos', ['categoria'])
    op.create_index('ix_canonicos_nome_marca', 'produtos_canonicos', ['nome', 'marca'])
    op.create_index('ix_canonicos_gtin_principal', 'produtos_canonicos', ['gtin_principal'], unique=True)

    # Criar tabela produtos_aliases
    op.create_table(
        'produtos_aliases',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('canonical_id', sa.Integer(), nullable=False),
        sa.Column('loja_id', sa.Integer(), nullable=True),
        sa.Column('descricao_original', sa.String(255), nullable=False),
        sa.Column('descricao_normalizada', sa.String(255), nullable=False),
        sa.Column('gtin', sa.String(32), nullable=True),
        sa.Column('confianca', sa.Float(), server_default='1.0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['canonical_id'], ['produtos_canonicos.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['loja_id'], ['lojas.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_produtos_aliases_id', 'produtos_aliases', ['id'])
    op.create_index('ix_produtos_aliases_canonical_id', 'produtos_aliases', ['canonical_id'])
    op.create_index('ix_produtos_aliases_loja_id', 'produtos_aliases', ['loja_id'])
    op.create_index('ix_produtos_aliases_descricao_original', 'produtos_aliases', ['descricao_original'])
    op.create_index('ix_produtos_aliases_descricao_normalizada', 'produtos_aliases', ['descricao_normalizada'])
    op.create_index('ix_aliases_descricao_loja', 'produtos_aliases', ['descricao_normalizada', 'loja_id'])
    op.create_index('ix_produtos_aliases_gtin', 'produtos_aliases', ['gtin'])
    op.create_unique_constraint('uq_alias_descricao_loja', 'produtos_aliases', ['descricao_normalizada', 'loja_id'])

    # Adicionar coluna canonical_id na tabela produtos (legado)
    op.add_column('produtos', sa.Column('canonical_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_produtos_canonical', 'produtos', 'produtos_canonicos', ['canonical_id'], ['id'])
    op.create_index('ix_produtos_canonical_id', 'produtos', ['canonical_id'])

    # Adicionar coluna canonical_id na tabela precos
    op.add_column('precos', sa.Column('canonical_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_precos_canonical', 'precos', 'produtos_canonicos', ['canonical_id'], ['id'])
    op.create_index('ix_precos_canonical_id', 'precos', ['canonical_id'])
    op.create_index('ix_precos_canonical_loja', 'precos', ['canonical_id', 'loja_id'])

    # Tornar produto_id nullable em precos (para transição)
    op.alter_column('precos', 'produto_id', nullable=True)


def downgrade() -> None:
    # Reverter alterações em precos
    op.alter_column('precos', 'produto_id', nullable=False)
    op.drop_index('ix_precos_canonical_loja', 'precos')
    op.drop_index('ix_precos_canonical_id', 'precos')
    op.drop_constraint('fk_precos_canonical', 'precos', type_='foreignkey')
    op.drop_column('precos', 'canonical_id')

    # Reverter alterações em produtos
    op.drop_index('ix_produtos_canonical_id', 'produtos')
    op.drop_constraint('fk_produtos_canonical', 'produtos', type_='foreignkey')
    op.drop_column('produtos', 'canonical_id')

    # Remover tabela produtos_aliases
    op.drop_table('produtos_aliases')

    # Remover tabela produtos_canonicos
    op.drop_table('produtos_canonicos')
