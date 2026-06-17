import sqlite3

c = sqlite3.connect('sql_app_v2.db')
c.execute("UPDATE users SET username='tomas_valenti' WHERE full_name='Tomas Valenti'")
c.commit()

rows = c.execute("SELECT full_name, username FROM users").fetchall()
for r in rows:
    print(f"  {r[0]} -> @{r[1]}")

c.close()
print("Listo!")
