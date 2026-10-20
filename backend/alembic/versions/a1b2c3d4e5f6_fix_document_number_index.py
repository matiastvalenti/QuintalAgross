"""fix document number index: remove global unique, add composite unique per doc_type+COALESCE(line,'')+number

Revision ID: a1b2c3d4e5f6
Revises: 6da63803f320
Create Date: 2026-06-29

Background:
  The 'documents' table previously had a global UNIQUE index on 'number' alone.
  This prevented sharing the same numeric sequence across document types, which
  is required (e.g. INVOICE 0003-00000001 and DEBIT_NOTE 0003-00000001 are valid).

  The correct uniqueness rule is: doc_type + COALESCE(line, '') + number
  - 'number' already includes the sales point prefix (e.g. '0003-00000001'),
    so a separate sales_point column is not needed in the constraint.
  - 'line' is the fiscal letter (A, B, C, M). In Argentine fiscal rules, each
    letter has its own correlative sequence, so two INVOICE-A documents cannot
    share a number, but INVOICE-A and INVOICE-B can share '0003-00000001'.
  - Usamos COALESCE(line, '') para que documentos sin letra fiscal, como 
    RECEIPT/PAYMENT, también queden protegidos contra duplicados, ya que en 
    SQLite NULL != NULL en índices únicos.

Downgrade reverts to the old global unique on number (not recommended).
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '6da63803f320'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    dialect = conn.dialect.name

    if dialect == 'sqlite':
        # 1. Drop any existing unique indexes on 'number' alone or old composites
        index_rows = conn.execute(sa.text("PRAGMA index_list('documents')")).fetchall()
        for row in index_rows:
            idx_name = row[1]
            idx_unique = row[2]
            if not idx_unique:
                continue
            col_rows = conn.execute(sa.text(f"PRAGMA index_info('{idx_name}')")).fetchall()
            col_names = [c[2] for c in col_rows]
            if col_names == ['number']:
                print(f"[MIGRATION] Dropping global unique index '{idx_name}' on documents.number")
                conn.execute(sa.text(f'DROP INDEX IF EXISTS "{idx_name}"'))
            if idx_name in ('uq_documents_type_number', 'uq_documents_type_line_number'):
                print(f"[MIGRATION] Dropping old composite index '{idx_name}'")
                conn.execute(sa.text(f'DROP INDEX IF EXISTS "{idx_name}"'))

        # 2. Check for duplicates on the new composite key
        dup_rows = conn.execute(sa.text("""
            SELECT doc_type, COALESCE(line,''), number, COUNT(*) as cnt
            FROM documents
            GROUP BY doc_type, COALESCE(line,''), number
            HAVING COUNT(*) > 1
        """)).fetchall()
        if dup_rows:
            msg = "MIGRATION ABORTED - duplicates found in (doc_type, COALESCE(line,''), number):\n"
            for r in dup_rows:
                msg += f"  doc_type={r[0]}, line={r[1]}, number={r[2]}, count={r[3]}\n"
            raise ValueError(msg)

        # 3. Create composite unique index with COALESCE
        conn.execute(sa.text("""
            CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_type_line_number
            ON documents (doc_type, COALESCE(line, ''), number)
        """))
        print("[MIGRATION] Created composite unique index uq_documents_type_line_number with COALESCE(line,'')")

        # 4. Ensure a non-unique lookup index on number still exists
        existing = [r[1] for r in conn.execute(sa.text("PRAGMA index_list('documents')")).fetchall()]
        if 'ix_documents_number' not in existing:
            conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_documents_number ON documents (number)"))
            print("[MIGRATION] Created lookup index ix_documents_number")

    elif dialect == 'postgresql':
        conn.execute(sa.text("""
            DO  BEGIN
                DROP INDEX IF EXISTS ix_documents_number;
                DROP INDEX IF EXISTS uq_documents_type_number;
                DROP INDEX IF EXISTS uq_documents_type_line_number;
            EXCEPTION WHEN OTHERS THEN NULL;
            END ;
        """))
        dup_rows = conn.execute(sa.text("""
            SELECT doc_type, COALESCE(line,''), number, COUNT(*)
            FROM documents
            GROUP BY doc_type, COALESCE(line,''), number
            HAVING COUNT(*) > 1
        """)).fetchall()
        if dup_rows:
            raise ValueError("MIGRATION ABORTED - duplicates found in (doc_type, COALESCE(line,''), number)")
        conn.execute(sa.text("""
            CREATE UNIQUE INDEX uq_documents_type_line_number
            ON documents (doc_type, COALESCE(line, ''), number)
        """))
        conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_documents_number ON documents (number)"))
        print("[MIGRATION] PostgreSQL: created composite unique index with COALESCE and lookup index")


def downgrade() -> None:
    conn = op.get_bind()
    dialect = conn.dialect.name
    if dialect == 'sqlite':
        conn.execute(sa.text("DROP INDEX IF EXISTS uq_documents_type_line_number"))
        conn.execute(sa.text("DROP INDEX IF EXISTS uq_documents_type_number"))
        conn.execute(sa.text("CREATE UNIQUE INDEX IF NOT EXISTS ix_documents_number ON documents (number)"))
    elif dialect == 'postgresql':
        conn.execute(sa.text("DROP INDEX IF EXISTS uq_documents_type_line_number"))
        conn.execute(sa.text("CREATE UNIQUE INDEX IF NOT EXISTS ix_documents_number ON documents (number)"))
