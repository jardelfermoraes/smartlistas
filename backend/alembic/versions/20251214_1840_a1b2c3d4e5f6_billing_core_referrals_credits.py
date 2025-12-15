"""billing core referrals credits

Revision ID: a1b2c3d4e5f6
Revises: 9c2a1c3d4e5f
Create Date: 2025-12-14 18:40:00.000000+00:00

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '9c2a1c3d4e5f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # app_users: referral + trial/subscription
    op.execute("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20)")
    op.execute("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS referred_by_user_id INTEGER")
    op.execute("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ")
    op.execute("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ")

    op.execute(
        "DO $$ BEGIN "
        "IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_app_users_referred_by') THEN "
        "ALTER TABLE app_users ADD CONSTRAINT fk_app_users_referred_by "
        "FOREIGN KEY (referred_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL; "
        "END IF; "
        "END $$;"
    )

    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_app_users_referral_code ON app_users (referral_code)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_app_users_referred_by ON app_users (referred_by_user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_app_users_trial_ends ON app_users (trial_ends_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_app_users_sub_ends ON app_users (subscription_ends_at)")

    # billing settings
    op.execute(
        "CREATE TABLE IF NOT EXISTS app_billing_settings ("
        "id SERIAL PRIMARY KEY,"
        "is_active BOOLEAN DEFAULT TRUE,"
        "trial_days INTEGER DEFAULT 30,"
        "monthly_price_cents INTEGER DEFAULT 1500,"
        "referral_credit_cents INTEGER DEFAULT 200,"
        "receipt_credit_cents INTEGER DEFAULT 100,"
        "referral_credit_limit_per_month INTEGER DEFAULT 5,"
        "receipt_credit_limit_per_month INTEGER DEFAULT 5,"
        "created_at TIMESTAMPTZ DEFAULT NOW(),"
        "updated_at TIMESTAMPTZ DEFAULT NOW()"
        ")"
    )

    # credit ledger
    op.execute(
        "CREATE TABLE IF NOT EXISTS app_credit_ledger ("
        "id SERIAL PRIMARY KEY,"
        "user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,"
        "entry_type VARCHAR(30) NOT NULL,"
        "amount_cents INTEGER NOT NULL,"
        "source_id INTEGER NULL,"
        "notes VARCHAR(255) NULL,"
        "created_at TIMESTAMPTZ DEFAULT NOW()"
        ")"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_app_credit_ledger_user ON app_credit_ledger (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_app_credit_ledger_type ON app_credit_ledger (entry_type)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_app_credit_ledger_user_type_created "
        "ON app_credit_ledger (user_id, entry_type, created_at)"
    )

    # receipt submissions credit mark
    op.execute("ALTER TABLE app_receipt_key_submissions ADD COLUMN IF NOT EXISTS credited_at TIMESTAMPTZ")
    op.execute("CREATE INDEX IF NOT EXISTS ix_app_receipt_keys_credited ON app_receipt_key_submissions (credited_at)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_app_receipt_keys_credited")
    op.execute("ALTER TABLE app_receipt_key_submissions DROP COLUMN IF EXISTS credited_at")

    op.execute("DROP INDEX IF EXISTS ix_app_credit_ledger_user_type_created")
    op.execute("DROP INDEX IF EXISTS ix_app_credit_ledger_type")
    op.execute("DROP INDEX IF EXISTS ix_app_credit_ledger_user")
    op.execute("DROP TABLE IF EXISTS app_credit_ledger")

    op.execute("DROP TABLE IF EXISTS app_billing_settings")

    op.execute("DROP INDEX IF EXISTS ix_app_users_sub_ends")
    op.execute("DROP INDEX IF EXISTS ix_app_users_trial_ends")
    op.execute("DROP INDEX IF EXISTS ix_app_users_referred_by")
    op.execute("DROP INDEX IF EXISTS uq_app_users_referral_code")
    op.execute("ALTER TABLE app_users DROP CONSTRAINT IF EXISTS fk_app_users_referred_by")

    op.execute("ALTER TABLE app_users DROP COLUMN IF EXISTS subscription_ends_at")
    op.execute("ALTER TABLE app_users DROP COLUMN IF EXISTS trial_ends_at")
    op.execute("ALTER TABLE app_users DROP COLUMN IF EXISTS referred_by_user_id")
    op.execute("ALTER TABLE app_users DROP COLUMN IF EXISTS referral_code")
