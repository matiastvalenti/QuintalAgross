import os
import sys

sys.path.append(os.path.abspath("api"))

from app.db.session import SessionLocal
from app.db.models import JournalEntry, JournalLine

db = SessionLocal()
entries = db.query(JournalEntry).all()

with open("ledger_dump.txt", "w") as f:
    f.write(f"Total Entries: {len(entries)}\n")
    for e in entries:
        f.write("-" * 40 + "\n")
        f.write(f"Entry: {e.description}\n")
        f.write(f"Date: {e.date}\n")
        f.write(f"Total: {e.total_amount}\n")
        f.write("Lines:\n")
        for l in e.lines:
            f.write(f"  [{l.account_code}] D: {l.debit} | H: {l.credit} | {l.description}\n")

db.close()
print("Dump created in ledger_dump.txt")
