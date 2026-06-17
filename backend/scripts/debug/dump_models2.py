import os
import json
import sys
from dotenv import load_dotenv
load_dotenv()
import google.generativeai as genai

with open("C:/Users/matia/Cosas/Escritorio/Programacion/Quintal Agross/api/dump_err_pre.txt", "w") as f:
    f.write(sys.executable + "\n")

try:
    genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    models = [m.name for m in genai.list_models()]
    with open("C:/Users/matia/Cosas/Escritorio/Programacion/Quintal Agross/api/models.json", "w") as f:
        json.dump(models, f)
except Exception as e:
    with open("C:/Users/matia/Cosas/Escritorio/Programacion/Quintal Agross/api/models_err.txt", "w") as f:
        f.write(str(e))
