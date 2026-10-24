"""add line_end code_snippet location_type to findings

Revision ID: d7bc793eac73
Revises: 
Create Date: 2026-10-24

"""
# revision identifiers, used by Alembic.
revision = 'd7bc793eac73'
down_revision = None
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.add_column('findings', sa.Column('line_end', sa.Integer(), nullable=True))
    op.add_column('findings', sa.Column('code_snippet', sa.Text(), nullable=True))
    op.add_column('findings', sa.Column('location_type', sa.String(32), nullable=True))


def downgrade() -> None:
    op.drop_column('findings', 'location_type')
    op.drop_column('findings', 'code_snippet')
    op.drop_column('findings', 'line_end')

