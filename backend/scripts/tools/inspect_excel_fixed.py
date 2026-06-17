import pandas as pd
import io

file_path = 'c:/Users/matia/Cosas/Escritorio/Programacion/Quintal Agross/api/excel/Stock.xlsx'
try:
    xl = pd.ExcelFile(file_path)
    df = xl.parse(xl.sheet_names[0], skiprows=1) # Stock de articulos title is row 0
    
    print("Columns found:", df.columns.tolist())
    print("\nFirst 30 rows of Rubro, Sub Rubro, and Insumos:")
    # Detect the actual column names from the mapping logic
    cols = {}
    keywords = {
        "rubro": ["rubro", "category"],
        "subrubro": ["sub rubro", "subrubro"],
        "nombre": ["insumos", "insumo", "nombre"]
    }
    
    for k, aliases in keywords.items():
        for col in df.columns:
            if any(a in str(col).lower() for a in aliases):
                cols[k] = col
                break
    
    if all(k in cols for k in ["rubro", "nombre"]):
        sample_cols = [cols["rubro"], cols.get("subrubro", "Sub Rubro"), cols["nombre"]]
        print(df[sample_cols].head(50).to_string())
        
        print("\nChecking for Herbicidas specifically:")
        herbicidas_rows = df[df[cols["rubro"]].astype(str).str.contains("Herbicida", case=False, na=False)]
        print(f"Rows with 'Herbicida' in Rubro explicitly: {len(herbicidas_rows)}")
        
        # Check rows where name contains herbicide
        herb_names = df[df[cols["nombre"]].astype(str).str.contains("Glifo|2,4-D|Paraquat", case=False, na=False)]
        print(f"Rows with herbicide-like names: {len(herb_names)}")
        if not herb_names.empty:
            print(herb_names[sample_cols].head(20).to_string())

except Exception as e:
    print(f"Error: {e}")
