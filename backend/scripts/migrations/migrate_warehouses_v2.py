import sqlite3
import os

DB_PATH = "sql_app_v2.db"

def migrate():
    if not os.path.exists(DB_PATH):
        print(f"Error: No se encontró la base de datos en {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    print("Iniciando migración de la tabla 'warehouses'...")

    try:
        # Agregar columna ownership
        try:
            cursor.execute("ALTER TABLE warehouses ADD COLUMN ownership VARCHAR(20) DEFAULT 'PROPIO'")
            print("- Columna 'ownership' agregada.")
        except sqlite3.OperationalError:
            print("- Columna 'ownership' ya existe.")

        # Agregar columna low_stock_control
        try:
            cursor.execute("ALTER TABLE warehouses ADD COLUMN low_stock_control VARCHAR(20) DEFAULT 'WARNING'")
            print("- Columna 'low_stock_control' agregada.")
        except sqlite3.OperationalError:
            print("- Columna 'low_stock_control' ya existe.")

        # Agregar columna no_stock_control
        try:
            cursor.execute("ALTER TABLE warehouses ADD COLUMN no_stock_control VARCHAR(20) DEFAULT 'STRICT'")
            print("- Columna 'no_stock_control' agregada.")
        except sqlite3.OperationalError:
            print("- Columna 'no_stock_control' ya existe.")

        conn.commit()
        print("Migración completada con éxito.")

    except Exception as e:
        print(f"Error durante la migración: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
