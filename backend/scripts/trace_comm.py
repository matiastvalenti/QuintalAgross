import sys
import os

# Add api directory to sys.path
sys.path.append(os.path.join(os.getcwd(), 'api'))

from app.db.session import SessionLocal
from app.modules.sales import commission_router
from app.db import models

db = SessionLocal()
try:
    print("Testing get_commission_summary...")
    result = commission_router.get_commission_summary(db=db)
    print("Success!")
    print(result)
except Exception as e:
    import traceback
    traceback.print_exc()
finally:
    db.close()
