import os
import sys

sys.path.append(os.path.abspath("api"))

from app.db.session import engine
from app.db.models import Base

# Crea las tablas nuevas si no existen
print("Creating new ledger tables...")
Base.metadata.create_all(bind=engine)
print("Done!")
