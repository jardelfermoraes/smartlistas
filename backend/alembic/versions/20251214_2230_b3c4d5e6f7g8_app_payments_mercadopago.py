"""app payments mercadopago

Revision ID: b3c4d5e6f7g8
Revises: a1b2c3d4e5f6
Create Date: 2025-12-14 22:30:00.000000+00:00

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "b3c4d5e6f7g8"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "CREATE TABLE IF NOT EXISTS app_payments ("
        "id SERIAL PRIMARY KEY,"
        "user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,"
        "provider VARCHAR(30) NOT NULL,"
        "provider_payment_id VARCHAR(80) NULL,"
        "status VARCHAR(30) NOT NULL,"
        "amount_cents INTEGER NOT NULL,"
        "credits_applied_cents INTEGER NOT NULL DEFAULT 0,"
        "currency VARCHAR(10) NOT NULL DEFAULT 'BRL',"
        "description VARCHAR(255) NULL,"
        "period_start TIMESTAMPTZ NULL,"
        "period_end TIMESTAMPTZ NULL,"
        "approved_at TIMESTAMPTZ NULL,"
        "created_at TIMESTAMPTZ DEFAULT NOW(),"
        "updated_at TIMESTAMPTZ DEFAULT NOW(),"
        "raw_payload TEXT NULL"
        ")"
    )

    op.execute(
        "DO $$ BEGIN "
        "IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_app_payments_provider_payment') THEN "
        "ALTER TABLE app_payments ADD CONSTRAINT uq_app_payments_provider_payment "
        "UNIQUE (provider, provider_payment_id); "
        "END IF; "
        "END $$;"
    )

    op.execute("CREATE INDEX IF NOT EXISTS ix_app_payments_user ON app_payments (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_app_payments_provider ON app_payments (provider)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_app_payments_provider_payment_id ON app_payments (provider_payment_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_app_payments_status ON app_payments (status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_app_payments_period_start ON app_payments (period_start)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_app_payments_period_end ON app_payments (period_end)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_app_payments_approved_at ON app_payments (approved_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_app_payments_created_at ON app_payments (created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_app_payments_user_created ON app_payments (user_id, created_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS app_payments")
