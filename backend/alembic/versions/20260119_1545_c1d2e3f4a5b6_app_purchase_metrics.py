"""app purchase metrics

Revision ID: c1d2e3f4a5b6
Revises: b3c4d5e6f7g8
Create Date: 2026-01-19 15:45:00.000000+00:00

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, None] = "b3c4d5e6f7g8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Idempotent operations (works even if applied manually before)
    op.execute("ALTER TABLE app_purchases ADD COLUMN IF NOT EXISTS items_total INTEGER")
    op.execute("ALTER TABLE app_purchases ADD COLUMN IF NOT EXISTS items_checked INTEGER")
    op.execute("ALTER TABLE app_purchases ADD COLUMN IF NOT EXISTS has_optimization BOOLEAN")
    op.execute("ALTER TABLE app_purchases ADD COLUMN IF NOT EXISTS max_stores INTEGER")
    op.execute("ALTER TABLE app_purchases ADD COLUMN IF NOT EXISTS stores_count INTEGER")
    op.execute("ALTER TABLE app_purchases ADD COLUMN IF NOT EXISTS optimized_total DOUBLE PRECISION")
    op.execute("ALTER TABLE app_purchases ADD COLUMN IF NOT EXISTS baseline_total DOUBLE PRECISION")
    op.execute("ALTER TABLE app_purchases ADD COLUMN IF NOT EXISTS savings_amount DOUBLE PRECISION")
    op.execute("ALTER TABLE app_purchases ADD COLUMN IF NOT EXISTS savings_percent DOUBLE PRECISION")

    op.execute("ALTER TABLE app_purchases ADD COLUMN IF NOT EXISTS client_platform VARCHAR(20)")
    op.execute("ALTER TABLE app_purchases ADD COLUMN IF NOT EXISTS client_app_version VARCHAR(50)")
    op.execute("ALTER TABLE app_purchases ADD COLUMN IF NOT EXISTS client_os_version VARCHAR(50)")
    op.execute("ALTER TABLE app_purchases ADD COLUMN IF NOT EXISTS client_device_model VARCHAR(100)")
    op.execute("ALTER TABLE app_purchases ADD COLUMN IF NOT EXISTS client_locale VARCHAR(30)")
    op.execute("ALTER TABLE app_purchases ADD COLUMN IF NOT EXISTS client_time_zone VARCHAR(60)")
    op.execute("ALTER TABLE app_purchases ADD COLUMN IF NOT EXISTS client_timezone_offset_min INTEGER")

    # Unique index for idempotency (local_list_id may be null)
    op.execute(
        """
        WITH d AS (
            SELECT user_id, local_list_id, array_agg(id ORDER BY id) AS ids
            FROM app_purchases
            WHERE local_list_id IS NOT NULL
            GROUP BY user_id, local_list_id
            HAVING COUNT(*) > 1
        ), to_fix AS (
            SELECT unnest(ids[2:array_length(ids, 1)]) AS id
            FROM d
        )
        UPDATE app_purchases p
        SET local_list_id = NULL
        FROM to_fix f
        WHERE p.id = f.id
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_app_purchases_user_local_list "
        "ON app_purchases (user_id, local_list_id) "
        "WHERE local_list_id IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_app_purchases_user_local_list")

    # Best-effort rollback
    op.execute("ALTER TABLE app_purchases DROP COLUMN IF EXISTS client_timezone_offset_min")
    op.execute("ALTER TABLE app_purchases DROP COLUMN IF EXISTS client_time_zone")
    op.execute("ALTER TABLE app_purchases DROP COLUMN IF EXISTS client_locale")
    op.execute("ALTER TABLE app_purchases DROP COLUMN IF EXISTS client_device_model")
    op.execute("ALTER TABLE app_purchases DROP COLUMN IF EXISTS client_os_version")
    op.execute("ALTER TABLE app_purchases DROP COLUMN IF EXISTS client_app_version")
    op.execute("ALTER TABLE app_purchases DROP COLUMN IF EXISTS client_platform")

    op.execute("ALTER TABLE app_purchases DROP COLUMN IF EXISTS savings_percent")
    op.execute("ALTER TABLE app_purchases DROP COLUMN IF EXISTS savings_amount")
    op.execute("ALTER TABLE app_purchases DROP COLUMN IF EXISTS baseline_total")
    op.execute("ALTER TABLE app_purchases DROP COLUMN IF EXISTS optimized_total")
    op.execute("ALTER TABLE app_purchases DROP COLUMN IF EXISTS stores_count")
    op.execute("ALTER TABLE app_purchases DROP COLUMN IF EXISTS max_stores")
    op.execute("ALTER TABLE app_purchases DROP COLUMN IF EXISTS has_optimization")
    op.execute("ALTER TABLE app_purchases DROP COLUMN IF EXISTS items_checked")
    op.execute("ALTER TABLE app_purchases DROP COLUMN IF EXISTS items_total")
