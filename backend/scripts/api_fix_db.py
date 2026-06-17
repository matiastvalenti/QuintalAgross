import sqlite3
import os
from datetime import datetime

db_path = r"c:\Users\matia\Cosas\Escritorio\Programacion\Otro\QuintalAgross_Back\api\sql_app_v2.db"

def fix_db():
    if not os.path.exists(db_path):
        print(f"DB not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Get existing columns
    cursor.execute("PRAGMA table_info(cheques)")
    existing_cols = [row[1] for row in cursor.fetchall()]
    
    needed_cols = [
        ("entity_id", "VARCHAR"),
        ("source_document_id", "VARCHAR"),
        ("endorsee_id", "VARCHAR"),
        ("endorsement_date", "DATETIME"),
        ("banco", "VARCHAR"),
        ("nro_cheque", "VARCHAR"),
        ("tipo", "VARCHAR"),
        ("importe", "NUMERIC(14,2)"),
        ("moneda", "VARCHAR"),
        ("f_pago", "DATE"),
        ("f_movimiento", "DATE"),
        ("movimiento", "VARCHAR"),
        ("cliente_dador", "VARCHAR"),
        ("cuit_emisor", "VARCHAR"),
        ("beneficiario", "VARCHAR"),
        ("entregado_a", "VARCHAR"),
        ("fecha_entrega", "DATE"),
        ("nro_orden_pago", "VARCHAR"),
        ("rechazado", "BOOLEAN DEFAULT 0"),
        ("nd_realizada", "BOOLEAN DEFAULT 0"),
        ("f_vencimiento", "DATE"),
        ("estado", "VARCHAR DEFAULT 'EN_CARTERA'"),
        ("notas", "VARCHAR"),
        ("created_at", "DATETIME"),
        ("updated_at", "DATETIME")
    ]
    
    for col, col_type in needed_cols:
        if col not in existing_cols:
            print(f"Adding column {col}...")
            try:
                cursor.execute(f"ALTER TABLE cheques ADD COLUMN {col} {col_type}")
            except Exception as e:
                print(f"Failed to add {col}: {e}")
                
    # Fix NULLs for required fields in Pydantic schema
    now = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
    cursor.execute("UPDATE cheques SET cuit_emisor = '' WHERE cuit_emisor IS NULL")
    cursor.execute("UPDATE cheques SET banco = 'S/D' WHERE banco IS NULL")
    cursor.execute("UPDATE cheques SET nro_cheque = 'S/N' WHERE nro_cheque IS NULL")
    cursor.execute("UPDATE cheques SET estado = 'EN_CARTERA' WHERE estado IS NULL")
    cursor.execute("UPDATE cheques SET rechazado = 0 WHERE rechazado IS NULL")
    cursor.execute("UPDATE cheques SET nd_realizada = 0 WHERE nd_realizada IS NULL")
    cursor.execute(f"UPDATE cheques SET updated_at = '{now}' WHERE updated_at IS NULL")
    
    conn.commit()
    conn.close()
    print("Database fix completed.")

if __name__ == "__main__":
    fix_db()
