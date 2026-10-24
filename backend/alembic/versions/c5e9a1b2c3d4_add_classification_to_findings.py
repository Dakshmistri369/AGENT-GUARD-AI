"""add classification classification_reason secret_redacted_preview to findings

Revision ID: c5e9a1b2c3d4
Revises: d7bc793eac73
Create Date: 2026-10-25

"""
# revision identifiers, used by Alembic.
revision = 'c5e9a1b2c3d4'
down_revision = 'd7bc793eac73'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.add_column('findings', sa.Column('classification', sa.String(32), nullable=True))
    op.add_column('findings', sa.Column('classification_reason', sa.Text(), nullable=True))
    op.add_column('findings', sa.Column('secret_redacted_preview', sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column('findings', 'secret_redacted_preview')
    op.drop_column('findings', 'classification_reason')
    op.drop_column('findings', 'classification')
