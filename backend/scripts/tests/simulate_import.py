import pandas as pd
import io
import re

file_path = 'c:/Users/matia/Cosas/Escritorio/Programacion/Quintal Agross/api/excel/Stock.xlsx'

def find_col(df, aliases):
    for col in df.columns:
        col_clean = str(col).lower().strip()
        if "unnamed" in col_clean: continue
        if col_clean in aliases: return col
    
    for col in df.columns:
        col_clean = str(col).lower().strip()
        if "unnamed" in col_clean: continue
        for alias in aliases:
            if len(alias) < 3: continue
            if re.search(r'\b' + re.escape(alias) + r'\b', col_clean):
                return col
    return None

try:
    xl = pd.ExcelFile(file_path)
    print(f"Sheets: {xl.sheet_names}")
    
    column_map = {
        "rubro": ["rubro", "category", "categoria", "clasificación", "linea"],
        "nombre": ["insumos", "insumo", "nombre", "producto", "name", "nombre de producto", "descripcion", "artículo", "detalle"],
    }

    for sheet_name in xl.sheet_names:
        print(f"\nAnalyzing sheet: {sheet_name}")
        df_full = xl.parse(sheet_name, header=None)
        
        header_row_index = 0
        found_header = False
        keywords = ["rubro", "insumo", "nombre", "categoria", "clasificación"]
        
        for i, row in df_full.iterrows():
            row_values = [str(val).lower() for val in row.values if pd.notna(val)]
            if any(any(kw in val for kw in keywords) for val in row_values):
                header_row_index = i
                found_header = True
                print(f"  Header found at row {i}: {row_values}")
                break
        
        if not found_header:
            print("  Header NOT found")
            continue
            
        df = xl.parse(sheet_name, skiprows=header_row_index)
        cols = {k: find_col(df, v) for k, v in column_map.items()}
        print(f"  Detected columns: {cols}")
        
        if not cols["rubro"] or not cols["nombre"]:
            print("  SKIPPING: Missing Rubro or Nombre columns")
            continue
            
        print(f"  Processing {len(df)} rows...")
        count = 0
        for index, row in df.iterrows():
            product_name = str(row[cols["nombre"]]).strip() if pd.notna(row[cols["nombre"]]) else ""
            if product_name and product_name.lower() not in ['nan', 'none', '-']:
                count += 1
        print(f"  Valid articles in this sheet: {count}")

except Exception as e:
    print(f"Error: {e}")
