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
        # Check if column exists
        cursor.execute("PRAGMA table_info(entities)")
        columns = [info[1] for info in cursor.fetchall()]
        
        if "linked_entity_id" not in columns:
            print("Adding linked_entity_id column to entities table...")
            cursor.execute("ALTER TABLE entities ADD COLUMN linked_entity_id VARCHAR")
            conn.commit()
            print("Migration successful.")
        else:
            print("Column linked_entity_id already exists.")
            
    except Exception as e:
        print(f"Migration failed: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
