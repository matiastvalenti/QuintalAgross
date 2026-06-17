
import sqlite3
import os

DB_PATH = "sql_app.db"

def migrate():
    if not os.path.exists(DB_PATH):
        print(f"Database {DB_PATH} not found.")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # 1. Create New Tables
        tables = [
            """CREATE TABLE IF NOT EXISTS categories (
                id VARCHAR PRIMARY KEY, 
                name VARCHAR NOT NULL UNIQUE, 
                active BOOLEAN DEFAULT 1
            )""",
            """CREATE TABLE IF NOT EXISTS subcategories (
                id VARCHAR PRIMARY KEY, 
                category_id VARCHAR NOT NULL,
                name VARCHAR NOT NULL,
                active BOOLEAN DEFAULT 1,
                FOREIGN KEY(category_id) REFERENCES categories(id)
            )""",
            """CREATE TABLE IF NOT EXISTS units (
                id VARCHAR PRIMARY KEY, 
                name VARCHAR NOT NULL UNIQUE, 
                short_name VARCHAR NOT NULL
            )""",
            """CREATE TABLE IF NOT EXISTS containers (
                id VARCHAR PRIMARY KEY, 
                name VARCHAR NOT NULL UNIQUE, 
                capacity FLOAT NOT NULL DEFAULT 1.0,
                unit_id VARCHAR NOT NULL,
                FOREIGN KEY(unit_id) REFERENCES units(id)
            )""",
            """CREATE TABLE IF NOT EXISTS tax_types (
                id VARCHAR PRIMARY KEY, 
                name VARCHAR NOT NULL UNIQUE, 
                rate FLOAT NOT NULL,
                active BOOLEAN DEFAULT 1
            )"""
        ]
        
        for sql in tables:
            cursor.execute(sql)
        print("New tables created (if not existed).")

        # 2. Update Products Table
        cursor.execute("PRAGMA table_info(products)")
        columns = [info[1] for info in cursor.fetchall()]
        
        cols_to_add = [
            ("subcategory_id", "VARCHAR"),
            ("container_id", "VARCHAR"),
            ("quantity_per_container", "FLOAT DEFAULT 1.0"),
            ("tax_type_id", "VARCHAR"),
            ("active_principle", "VARCHAR"),
            ("concentration", "VARCHAR")
        ]
        
        for col, dtype in cols_to_add:
            if col not in columns:
                print(f"Adding column {col} to products...")
                cursor.execute(f"ALTER TABLE products ADD COLUMN {col} {dtype}")
        
        # 3. Seed Basic Data (Initial Catalogs)
        # Units
        units = [
            ("UNIT-L", "Litro", "L"),
            ("UNIT-KG", "Kilogramo", "KG"),
            ("UNIT-TN", "Tonelada", "TN"),
            ("UNIT-UN", "Unidad", "UN"),
            ("UNIT-M2", "Metro Cuadrado", "M2"),
            ("UNIT-HA", "Hectárea", "HA")
        ]
        for uid, name, short in units:
            cursor.execute("INSERT OR IGNORE INTO units (id, name, short_name) VALUES (?, ?, ?)", (uid, name, short))
            
        # Tax Types
        taxes = [
            ("TAX-21", "IVA 21%", 0.21),
            ("TAX-105", "IVA 10.5%", 0.105),
            ("TAX-27", "IVA 27%", 0.27),
            ("TAX-0", "Exento / 0%", 0.0)
        ]
        for tid, name, rate in taxes:
            cursor.execute("INSERT OR IGNORE INTO tax_types (id, name, rate) VALUES (?, ?, ?)", (tid, name, rate))

        conn.commit()
        print("Migration and Seeding successful.")
            
    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
