import re
with open('C:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/frontend/src/modules/purchases/PurchaseOrderForm.jsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

open_count = 0
close_count = 0

for i in range(813, 1267): # lines 814 to 1267
    line = lines[i]
    opens = len(re.findall(r'<div\b[^>]*>', line))
    closes = len(re.findall(r'</div\s*>', line))
    open_count += opens
    close_count += closes

print(f"Open: {open_count}, Close: {close_count}")
