import os
import json
from dotenv import load_dotenv
load_dotenv()
import google.generativeai as genai

try:
    genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    models = [m.name for m in genai.list_models()]
    with open("models.json", "w") as f:
        json.dump(models, f)
except Exception as e:
    with open("models_err.txt", "w") as f:
        f.write(str(e))
