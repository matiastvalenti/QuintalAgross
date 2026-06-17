import sqlite3
import os

DB_PATH = "sql_app.db"

def migrate():
    if not os.path.exists(DB_PATH):
        print(f"Database {DB_PATH} not found.")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    print("Migrating 'entities' table...")
    
    # List of new columns to add
    new_columns = [
        ("code", "TEXT"),
        ("tax_id", "TEXT"),
        ("tax_category", "TEXT"),
        ("phone", "TEXT"),
        ("contact_name", "TEXT"),
        ("address", "TEXT"),
        ("city", "TEXT"),
        ("state", "TEXT"),
        ("zip_code", "TEXT"),
        ("country", "TEXT DEFAULT 'Argentina'"),
        ("price_list_id", "TEXT"),
        ("salesperson_id", "TEXT"),
        ("business_unit", "TEXT"),
        ("notes", "TEXT"),
    ]

    # Get existing columns
    cursor.execute("PRAGMA table_info(entities)")
    existing_cols = [info[1] for info in cursor.fetchall()]

    for col_name, col_type in new_columns:
        if col_name not in existing_cols:
            print(f"Adding column {col_name}...")
            try:
                cursor.execute(f"ALTER TABLE entities ADD COLUMN {col_name} {col_type}")
            except Exception as e:
                print(f"Error adding {col_name}: {e}")
        else:
            print(f"Column {col_name} already exists.")

    print("Creating 'entity_perceptions' table...")
    try:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS entity_perceptions (
                id TEXT PRIMARY KEY,
                entity_id TEXT NOT NULL,
                tax_name TEXT NOT NULL,
                category TEXT,
                rate REAL DEFAULT 0.0,
                start_date TIMESTAMP,
                end_date TIMESTAMP,
                FOREIGN KEY(entity_id) REFERENCES entities(id) ON DELETE CASCADE
            )
        """)
        print("Table 'entity_perceptions' ready.")
    except Exception as e:
        print(f"Error creating table: {e}")

    conn.commit()
    conn.close()
    print("Migration complete.")

if __name__ == "__main__":
    migrate()
