"""add city_locations

Revision ID: b72cf3abff76
Revises: 002_canonical_products
Create Date: 2025-12-14 12:43:58.817073+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'b72cf3abff76'
down_revision: Union[str, None] = '002_canonical_products'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'city_locations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('uf', sa.String(length=2), nullable=False),
        sa.Column('city', sa.String(length=120), nullable=False),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('uf', 'city', name='uq_city_locations_uf_city'),
    )
    op.create_index('ix_city_locations_uf_city', 'city_locations', ['uf', 'city'], unique=False)
    op.create_index(op.f('ix_city_locations_id'), 'city_locations', ['id'], unique=False)
    op.create_index(op.f('ix_city_locations_uf'), 'city_locations', ['uf'], unique=False)
    op.create_index(op.f('ix_city_locations_city'), 'city_locations', ['city'], unique=False)



def downgrade() -> None:
    op.drop_index(op.f('ix_city_locations_city'), table_name='city_locations')
    op.drop_index(op.f('ix_city_locations_uf'), table_name='city_locations')
    op.drop_index(op.f('ix_city_locations_id'), table_name='city_locations')
    op.drop_index('ix_city_locations_uf_city', table_name='city_locations')
    op.drop_table('city_locations')

