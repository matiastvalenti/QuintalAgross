import subprocess
import os
import sys

# Script para correr TODA la suite de tests modulares de la API

tests = [
    "test_entities.py",
    "test_inventory.py",
    "test_sales.py",
    "test_purchases.py",
    "test_accounting_finance.py"
]

current_dir = os.path.dirname(os.path.abspath(__file__))

print("INICIANDO SUITE DE PRUEBAS DE LA API QUINTAL AGROSS...")
print("=" * 60)

for test in tests:
    print(f"\n[RUNNING] EJECUTANDO MODULO: {test} ...")
    test_path = os.path.join(current_dir, test)
    result = subprocess.run([sys.executable, test_path], capture_output=False)
    
    if result.returncode != 0:
        print(f"\n[FAILED] EL MODULO {test} FALLO (Codigo: {result.returncode}). Deteniendo la ejecucion...")
        sys.exit(1)

print("\n" + "=" * 60)
print("[SUCCESS] TODAS LAS PRUEBAS MODULARES FINALIZARON CON EXITO")
print("=" * 60)
