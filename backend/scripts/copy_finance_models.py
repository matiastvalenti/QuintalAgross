import os

source_models = r"c:\Users\matia\Cosas\Escritorio\cheques-alerta-app\backend\app\models.py"
dest_models = r"c:\Users\matia\Cosas\Escritorio\Programacion\Quintal Agross\api\app\db\finance_models.py"

with open(source_models, "r", encoding="utf-8") as f:
    lines = f.readlines()

finance_models_code = """from sqlalchemy import Column, Integer, String, Date, DateTime, Boolean, Numeric, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.session import Base
"""

capture = False
for line in lines:
    if line.startswith("class Cheque(Base):"):
        capture = True
    if line.startswith("class User(Base):"):
        capture = False
        break
    if capture:
        finance_models_code += line

with open(dest_models, "w", encoding="utf-8") as f:
    f.write(finance_models_code)

print("Created finance_models.py")
