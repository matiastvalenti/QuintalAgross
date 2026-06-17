import pandas as pd
import io
import sys

file_path = 'c:/Users/matia/Cosas/Escritorio/Programacion/Quintal Agross/api/excel/Stock.xlsx'
try:
    xl = pd.ExcelFile(file_path)
    sheet_name = xl.sheet_names[0]
    df_full = xl.parse(sheet_name, header=None)
    
    print(f"Sheet Name: {sheet_name}")
    print(f"Total Rows: {len(df_full)}")
    
    # Show first 20 rows to find header
    print("\nFirst 20 rows (raw):")
    for i, row in df_full.head(20).iterrows():
        print(f"Row {i}: {list(row.values)}")

    # Search for Herbicidas
    print("\nSearching for 'Herbicidas' in any cell:")
    found = False
    for i, row in df_full.iterrows():
        row_str = " ".join([str(v) for v in row.values]).lower()
        if 'herbicida' in row_str:
            print(f"Found in Row {i}: {list(row.values)}")
            found = True
            if i > 50: # Don't flood output
                 break
    if not found:
        print("No 'Herbicidas' found in the first sheet.")

except Exception as e:
    print(f"Error: {e}")
