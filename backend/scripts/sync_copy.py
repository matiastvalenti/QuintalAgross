import os

src_dir = r"c:/Users/matia/Cosas/Escritorio/cheques-alerta-app/backend/app"
dest_dir = r"c:/Users/matia/Cosas/Escritorio/Programacion/Quintal Agross/api/app/modules/finance"

def copy_file(filename, is_schema=False):
    src_path = os.path.join(src_dir, filename)
    if not os.path.exists(src_path):
        return
    with open(src_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Replacements
    content = content.replace("from .models import", "from app.db.finance_models import")
    content = content.replace("from .schemas import", "from .cheque_schemas import")
    content = content.replace("from .mailer import", "from .mailer import")
    content = content.replace("from .alerts import", "from .alerts import")
    content = content.replace("from .excel_export import", "from .excel_export import")
    content = content.replace("from .pdf_export import", "from .pdf_export import")
    content = content.replace("from .reports import", "from .reports import")
    content = content.replace("from .config import", "from .config import")
    content = content.replace("from .services.notification_service import", "# from .services.notification_service import")
    content = content.replace("from .models import User", "# from .models import User")

    if is_schema:
        content = content.split("# Authentication Schemas")[0]
        dest_path = os.path.join(dest_dir, "cheque_schemas.py")
    else:
        dest_path = os.path.join(dest_dir, filename)
        
    with open(dest_path, "w", encoding="utf-8") as f:
        f.write(content)

copy_file("schemas.py", is_schema=True)
for f in ["alerts.py", "excel_export.py", "excel_import.py", "mailer.py", "pdf_export.py", "reports.py"]:
    copy_file(f)

print("Copy complete.")
