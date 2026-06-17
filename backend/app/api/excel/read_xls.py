import pandas as pd
import os

file_path = r"c:\Users\matia\Cosas\Escritorio\Programacion\Quintal Agross\api\excel\Cuenta corriente Del Castillo.xls"
output_path = r"c:\Users\matia\Cosas\Escritorio\Programacion\Quintal Agross\api\excel\excel_preview.txt"

try:
    df = None
    try:
        # Try as Excel
        df = pd.read_excel(file_path, header=None)
    except Exception as e:
        # Try as HTML table (common for legacy ERP)
        try:
            df_list = pd.read_html(file_path)
            if df_list: df = df_list[0]
        except Exception as e2:
            with open(output_path, "w", encoding='utf-8') as f:
                f.write(f"Error reading Excel: {str(e)}. Error reading HTML: {str(e2)}")
    
    if df is not None:
        with open(output_path, "w", encoding='utf-8') as f:
            f.write(f"COLUMNS (Row 0):\n{str(df.iloc[0].tolist())}\n\n")
            f.write(f"COLUMNS (Row 1):\n{str(df.iloc[1].tolist())}\n\n")
            f.write("FIRST 50 ROWS:\n")
            f.write(df.head(50).to_string())
    else:
        with open(output_path, "w", encoding='utf-8') as f:
            f.write("ERROR: Could not read as Excel or HTML table.")
except Exception as e:
    with open(output_path, "w", encoding='utf-8') as f:
        f.write(f"FATAL ERROR: {str(e)}")
