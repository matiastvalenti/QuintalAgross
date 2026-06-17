import pandas as pd

data = {
    "Rubro": ["Herbicidas", "Herbicidas", "Fertilizantes", "Semillas"],
    "Subrubro": ["Glifosatos", "Graminicidas", "Foliares", "Maíz"],
    "Nombre de Producto": ["Glifosato Premium 20L", "Select 24%", "YaraVera", "Maíz Pionner 3972"],
    "Contenedor": ["Bidón 20L", "Bidón 10L", "Bolsa 50KG", "Bolsa 20KG"],
    "Medida": ["Litro", "Litro", "Kilo", "Kilo"],
    "Cantidad en el contenedor": [20, 10, 50, 20],
    "IVA": ["21%", "21%", "10.5%", "21%"]
}

df = pd.DataFrame(data)
df.to_excel("test_import_articulos.xlsx", index=False)
print("Archivo test_import_articulos.xlsx generado con éxito.")
