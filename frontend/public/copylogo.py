import shutil
import os

src = r"C:\Users\matia\Cosas\Escritorio\Programacion\Otro\QuintalAgross_Back\web\public\logo quintal.jpg"
dst = r"C:\Users\matia\Cosas\Escritorio\Programacion\Otro\QuintalAgross_Back\web\public\logo.jpg"

if os.path.exists(src):
    shutil.copy(src, dst)
    print("Copied successfully!")
else:
    print("Source doesn't exist.")
