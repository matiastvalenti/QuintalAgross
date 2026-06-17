import os

whitelist = [
    ".cursorrules", "CONTRIBUTING_AI.md", "README.md", "TASKS.md", 
    "TASKS_STATE.json", "iniciar.txt", "api", "docs", "scripts", "web"
]

for item in os.listdir("."):
    if os.path.isfile(item):
        if item not in whitelist and item != "root_cleanup.py":
            try:
                os.remove(item)
                print(f"Deleted {item}")
            except Exception as e:
                print(f"Failed to delete {item}: {e}")
