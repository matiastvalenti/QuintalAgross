import os
import glob

whitelist = ["root_cleanup.py"]

for item in glob.glob("*.py"):
    if item not in whitelist:
        os.remove(item)

for item in glob.glob("*.bat"):
    os.remove(item)

for item in glob.glob("*.css"):
    os.remove(item)

for txt in glob.glob("*.txt"):
    if txt not in ["iniciar.txt"]:
        os.remove(txt)

if os.path.exists("test_error.js"):
    os.remove("test_error.js")
