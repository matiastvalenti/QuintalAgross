import os
import traceback

src_dir = r"c:\Users\matia\Cosas\Escritorio\cheques-alerta-app\backend\app"
dest_dir = r"c:\Users\matia\Cosas\Escritorio\Programacion\Quintal Agross\api\app\modules\finance"
os.makedirs(dest_dir, exist_ok=True)

try:
    with open(os.path.join(src_dir, "schemas.py"), "r", encoding="utf-8") as f:
        schemas_content = f.read()
    clean_schemas = schemas_content.split("# Authentication Schemas")[0]
    with open(os.path.join(dest_dir, "cheque_schemas.py"), "w", encoding="utf-8") as f:
        f.write(clean_schemas)

    files_to_copy = ["alerts.py", "excel_export.py", "excel_import.py", "mailer.py", "pdf_export.py", "reports.py", "config.py"]
    for file in files_to_copy:
        src_path = os.path.join(src_dir, file)
        if not os.path.exists(src_path):
            continue
        with open(src_path, "r", encoding="utf-8") as f:
            content = f.read()

        content = content.replace("from .models import", "from app.db.finance_models import")
        content = content.replace("from .schemas import", "from .cheque_schemas import")
        content = content.replace("from .mailer import", "from .mailer import")
        content = content.replace("from .alerts import", "from .alerts import")
        content = content.replace("from .excel_export import", "from .excel_export import")
        content = content.replace("from .pdf_export import", "from .pdf_export import")
        content = content.replace("from .reports import", "from .reports import")
        content = content.replace("from .config import", "from .config import")
        content = content.replace("from .services.notification_service import", "# from .services.notification_service import")

        with open(os.path.join(dest_dir, file), "w", encoding="utf-8") as f:
            f.write(content)
    print("SUCCESS")
except Exception as e:
    print("ERROR:")
    print(traceback.format_exc())
