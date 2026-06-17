import sqlite3
import os

DB_PATH = "c:/Users/matia/Cosas/Escritorio/Programacion/Otro/QuintalAgross_Back/backend/sql_app_v2.db"
LOG_FILE = "c:/Users/matia/Cosas/Escritorio/Programacion/Otro/QuintalAgross_Back/backend/debug_sc.txt"

with open(LOG_FILE, "w") as f:
    f.write(f"Checking DB at: {DB_PATH}\n")
    if not os.path.exists(DB_PATH):
        f.write("DB FILE NOT FOUND\n")
    else:
        try:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # 1. Buscar factura
            cursor.execute("SELECT id, number, sale_condition_id FROM documents WHERE number = '0003-00000001'")
            row = cursor.fetchone()
            if row:
                f.write(f"Doc found: {row[0]}, {row[1]}, SC_ID: {row[2]}\n")
                sc_id = row[2]
                if sc_id:
                    cursor.execute(f"SELECT description FROM sale_conditions WHERE id = ?", (sc_id,))
                    sc_row = cursor.fetchone()
                    if sc_row:
                        f.write(f"SC Description: {sc_row[0]}\n")
                    else:
                        f.write(f"SC ID {sc_id} NOT FOUND in sale_conditions\n")
                else:
                    f.write("SC_ID is NULL\n")
            else:
                f.write("Doc 0003-00000001 NOT FOUND\n")
            
            # 2. Listar todas las facturas recientes
            f.write("\nRecent docs:\n")
            cursor.execute("SELECT number, sale_condition_id FROM documents ORDER BY created_at DESC LIMIT 5")
            for r in cursor.fetchall():
                f.write(f" - {r[0]} | SC_ID: {r[1]}\n")
                
            conn.close()
        except Exception as e:
            f.write(f"Error: {str(e)}\n")

print("Done")
