
import os
import sys
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Configurar el path para importar los modelos
sys.path.append(os.path.abspath(os.getcwd()))

# Obtener URL de la base de datos (ajustar según app/db/session.py si es necesario)
# Usando valor por defecto común en el proyecto
DATABASE_URL = "sqlite:///./sql_app.db" # O la que use el proyecto

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def check_dn():
    db = SessionLocal()
    try:
        # 1. Buscar el Remito 0001-00000008
        dn = db.execute(text("SELECT id, number, sales_order_id, entity_id FROM delivery_notes WHERE number = '0001-00000008'")).fetchone()
        if not dn:
            print("Remito 0001-00000008 no encontrado en la BD.")
            return

        print(f"--- INFO REMITO ---")
        print(f"ID: {dn.id}")
        print(f"Número: {dn.number}")
        print(f"OV ID: {dn.sales_order_id}")
        print(f"---")

        # 2. Buscar vínculos en manual_link u otras tablas directas
        links = db.execute(text(f"SELECT * FROM invoice_delivery_note_links WHERE delivery_note_id = '{dn.id}'")).fetchall()
        print(f"Vínculos encontrados en 'invoice_delivery_note_links': {len(links)}")
        for l in links:
            print(f" - Vinculado a Documento ID: {l.document_id}")
            # Ver datos del documento
            doc = db.execute(text(f"SELECT number, doc_type, status, total_amount FROM documents WHERE id = '{l.document_id}'")).fetchone()
            if doc:
                print(f"   Documento: {doc.doc_type} {doc.number} | Estado: {doc.status} | Total: {doc.total_amount}")

        # 3. Buscar si hay facturas de la misma entidad que NO estén vinculadas
        print(f"\nBusqueda de facturas de la misma entidad ({dn.entity_id}) NO vinculadas:")
        other_invs = db.execute(text(f"SELECT id, number, doc_type, status, total_amount FROM documents WHERE entity_id = '{dn.entity_id}' AND doc_type IN ('FA', 'FB', 'FC') LIMIT 5")).fetchall()
        for inv in other_invs:
            # Ver si el id está en links
            linked = any(l.document_id == inv.id for l in links)
            if not linked:
                print(f" - [DISPONIBLE] {inv.doc_type} {inv.number} | Estado: {inv.status} | Total: {inv.total_amount}")

    finally:
        db.close()

if __name__ == "__main__":
    check_dn()
