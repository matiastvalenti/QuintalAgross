import sys
import os

# Add the project root to sys.path
sys.path.append(os.getcwd())

from sqlalchemy import text
from app.db.session import engine

def reset_data():
    tables = [
        "invoice_delivery_note_links",
        "fx_adjustment_links",
        "applications",
        "document_lines",
        "document_history",
        "document_perceptions",
        "document_retentions",
        "document_vehicle_expenses",
        "payment_items",
        "receipt_document_links",
        "account_movements",
        "journal_lines",
        "journal_entries",
        "documents",
        "delivery_note_lines",
        "delivery_note_history",
        "delivery_notes",
        "sales_order_lines",
        "sales_order_history",
        "sales_orders"
    ]

    with engine.begin() as conn:
        print("Starting data reset...")
        # Disable foreign key checks for the session if possible (SQLite specific or general)
        try:
            conn.execute(text("PRAGMA foreign_keys = OFF;"))
        except:
            pass

        for table in tables:
            try:
                # Check if table exists first to avoid errors
                result = conn.execute(text(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table}';"))
                if result.fetchone():
                    print(f"Deleting data from {table}...")
                    conn.execute(text(f"DELETE FROM {table};"))
                    # Reset sqlite_sequence if it exists
                    try:
                        conn.execute(text(f"DELETE FROM sqlite_sequence WHERE name='{table}';"))
                    except:
                        pass
                else:
                    print(f"Table {table} does not exist, skipping.")
            except Exception as e:
                print(f"Error deleting from {table}: {e}")

        try:
            conn.execute(text("PRAGMA foreign_keys = ON;"))
        except:
            pass
        
        print("Data reset completed successfully.")

if __name__ == "__main__":
    reset_data()

