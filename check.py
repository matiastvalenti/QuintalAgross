import re

with open('C:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/frontend/src/modules/purchases/PurchaseOrderForm.jsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

div_open = 0
for i, line in enumerate(lines):
    open_count = len(re.findall(r'<div\b[^>]*>', line))
    close_count = len(re.findall(r'</div\s*>', line))
    div_open += (open_count - close_count)
    if div_open < 0:
        print(f"Unbalanced at line {i+1}: {line.strip()}")
        break
print(f"Final balance: {div_open}")
