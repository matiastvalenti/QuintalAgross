from app.db.session import SessionLocal
from app.db.models.models import Document
from app.db.models.commercial_models import SaleCondition

db = SessionLocal()
try:
    doc = db.query(Document).filter(Document.number == '0003-00000001').first()
    if doc:
        print(f"Document ID: {doc.id}")
        print(f"Sale Condition ID: {doc.sale_condition_id}")
        if doc.sale_condition:
            print(f"Sale Condition Description: {doc.sale_condition.description}")
        else:
            print("Sale Condition relationship is NONE")
            # Try to fetch it manually
            if doc.sale_condition_id:
                sc = db.query(SaleCondition).filter(SaleCondition.id == doc.sale_condition_id).first()
                if sc:
                    print(f"Manually fetched Sale Condition: {sc.description}")
                else:
                    print("Sale Condition NOT FOUND in sale_conditions table")
    else:
        print("Document NOT FOUND")
finally:
    db.close()
