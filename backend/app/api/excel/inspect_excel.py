import pandas as pd
import sys

try:
    file_path = r"c:\Users\matia\Cosas\Escritorio\Programacion\Quintal Agross\api\excel\Cuenta corriente Del Castillo.xls"
    df = pd.read_excel(file_path)
    print("COLUMNS:")
    print(df.columns.tolist())
    print("\nFIRST 5 ROWS:")
    print(df.head().to_string())
except Exception as e:
    print(f"ERROR: {str(e)}")
