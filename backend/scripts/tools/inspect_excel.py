import pandas as pd
import sys

file_path = 'excel/Stock.xlsx'
try:
    # Read first few rows of all sheets to find where the data is
    xl = pd.ExcelFile(file_path)
    print(f"Sheets: {xl.sheet_names}")
    for sheet_name in xl.sheet_names:
        df = pd.read_excel(file_path, sheet_name=sheet_name, nrows=5)
        print(f"\nSheet: {sheet_name}")
        print(f"Columns: {df.columns.tolist()}")
        print("First 2 rows:")
        print(df.head(2).to_string())
except Exception as e:
    print(f"Error: {e}")
