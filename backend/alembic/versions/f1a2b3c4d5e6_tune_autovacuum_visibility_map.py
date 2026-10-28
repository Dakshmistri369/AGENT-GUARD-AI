"""Tune autovacuum scale factors on findings and scans for PostgreSQL Visibility Map maintenance

Revision ID: f1a2b3c4d5e6
Revises: e7f1a2b3c4d5
Create Date: 2026-10-28
"""
from alembic import op
import sqlalchemy as sa

revision = 'f1a2b3c4d5e6'
down_revision = 'e7f1a2b3c4d5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        op.execute("""
            ALTER TABLE findings SET (
                autovacuum_vacuum_scale_factor = 0.02,
                autovacuum_analyze_scale_factor = 0.01
            );
        """)
        op.execute("""
            ALTER TABLE scans SET (
                autovacuum_vacuum_scale_factor = 0.05,
                autovacuum_analyze_scale_factor = 0.02
            );
        """)


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        op.execute("ALTER TABLE findings RESET (autovacuum_vacuum_scale_factor, autovacuum_analyze_scale_factor);")
        op.execute("ALTER TABLE scans RESET (autovacuum_vacuum_scale_factor, autovacuum_analyze_scale_factor);")
