"""Add physical stock counts and count lines."""

from alembic import op
import sqlalchemy as sa

revision = "b5e61023c001"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "stock_counts",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "warehouse_id", sa.String(),
            sa.ForeignKey("warehouses.id"), nullable=False
        ),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("counted_by", sa.String(), nullable=False),
        sa.Column("approved_by", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
    )

    op.create_table(
        "stock_count_lines",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "count_id", sa.String(),
            sa.ForeignKey("stock_counts.id"), nullable=False
        ),
        sa.Column(
            "product_id", sa.String(),
            sa.ForeignKey("products.id"), nullable=False
        ),
        sa.Column("system_qty", sa.Numeric(12, 2), nullable=False),
        sa.Column("reserved_qty", sa.Numeric(12, 2), nullable=False),
        sa.Column("counted_qty", sa.Numeric(12, 2), nullable=False),
        sa.Column("difference", sa.Numeric(12, 2), nullable=False),
        sa.UniqueConstraint(
            "count_id", "product_id",
            name="uq_stock_count_product"
        ),
    )


def downgrade():
    op.drop_table("stock_count_lines")
    op.drop_table("stock_counts")
