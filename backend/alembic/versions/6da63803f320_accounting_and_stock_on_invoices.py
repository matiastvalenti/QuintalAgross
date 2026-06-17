"""accounting and stock on invoices

Revision ID: 6da63803f320
Revises: 
Create Date: 2026-06-08 01:15:47.958928

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6da63803f320'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('document_lines', schema=None) as batch_op:
        batch_op.add_column(sa.Column('accounting_account_id', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('stock_movement_id', sa.String(), nullable=True))
        batch_op.drop_column('account_code')

    with op.batch_alter_table('documents', schema=None) as batch_op:
        batch_op.add_column(sa.Column('warehouse_id', sa.String(), nullable=True))

    with op.batch_alter_table('products', schema=None) as batch_op:
        batch_op.add_column(sa.Column('sales_account_id', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('purchase_account_id', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('stock_account_id', sa.String(), nullable=True))
        batch_op.drop_column('stock_account_code')
        batch_op.drop_column('sales_account_code')
        batch_op.drop_column('purchase_account_code')


def downgrade() -> None:
    with op.batch_alter_table('products', schema=None) as batch_op:
        batch_op.add_column(sa.Column('purchase_account_code', sa.VARCHAR(), nullable=True))
        batch_op.add_column(sa.Column('sales_account_code', sa.VARCHAR(), nullable=True))
        batch_op.add_column(sa.Column('stock_account_code', sa.VARCHAR(), nullable=True))
        batch_op.drop_column('stock_account_id')
        batch_op.drop_column('purchase_account_id')
        batch_op.drop_column('sales_account_id')

    with op.batch_alter_table('documents', schema=None) as batch_op:
        batch_op.drop_column('warehouse_id')

    with op.batch_alter_table('document_lines', schema=None) as batch_op:
        batch_op.add_column(sa.Column('account_code', sa.VARCHAR(), nullable=True))
        batch_op.drop_column('stock_movement_id')
        batch_op.drop_column('accounting_account_id')
