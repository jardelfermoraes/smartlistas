"""app user gender and receipt submission purchase

Revision ID: 9c2a1c3d4e5f
Revises: b72cf3abff76
Create Date: 2025-12-14 15:33:00.000000+00:00

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9c2a1c3d4e5f'
down_revision: Union[str, None] = 'b72cf3abff76'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Idempotent operations (works even if applied manually before)
    op.execute("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS gender VARCHAR(20)")

    op.execute(
        "ALTER TABLE app_receipt_key_submissions "
        "ADD COLUMN IF NOT EXISTS purchase_id INTEGER"
    )

    # Add FK only if missing
    op.execute(
        "DO $$ BEGIN "
        "IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_app_receipt_key_submissions_purchase_id') THEN "
        "ALTER TABLE app_receipt_key_submissions "
        "ADD CONSTRAINT fk_app_receipt_key_submissions_purchase_id "
        "FOREIGN KEY (purchase_id) REFERENCES app_purchases(id) ON DELETE SET NULL; "
        "END IF; "
        "END $$;"
    )

    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_app_receipt_keys_purchase "
        "ON app_receipt_key_submissions (purchase_id)"
    )


def downgrade() -> None:
    # Best-effort rollback
    op.execute("DROP INDEX IF EXISTS ix_app_receipt_keys_purchase")
    op.execute(
        "ALTER TABLE app_receipt_key_submissions "
        "DROP CONSTRAINT IF EXISTS fk_app_receipt_key_submissions_purchase_id"
    )
    op.execute(
        "ALTER TABLE app_receipt_key_submissions "
        "DROP COLUMN IF EXISTS purchase_id"
    )
    op.execute("ALTER TABLE app_users DROP COLUMN IF EXISTS gender")
