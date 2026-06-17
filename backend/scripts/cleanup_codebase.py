import os
import shutil

root = r"c:\Users\matia\Cosas\Escritorio\Programacion\Quintal Agross"
api = os.path.join(root, "api")

# API Cleanup
api_scripts = os.path.join(api, "scripts")
api_map = {
    "migrations": ["migrate_articles_module.py", "migrate_clients.py", "migrate_linked_entities.py", "migrate_warehouses_v2.py"],
    "debug": ["check_warehouses.py", "debug_entities.py", "debug_load.py", "diagnose_db.py", "diagnose_schema.py", "dump_models.py", "dump_models2.py"],
    "tools": ["deep_inspect_excel.py", "generate_test_excel.py", "inspect_excel.py", "inspect_excel_fixed.py", "inspect_excel_light.py"],
    "tests": ["test_gemini.py", "test_genai.py", "test_rest.py", "simulate_import.py"],
    "seeds": ["seed_geo.py"]
}

for folder, files in api_map.items():
    dest_dir = os.path.join(api_scripts, folder)
    os.makedirs(dest_dir, exist_ok=True)
    for f in files:
        src = os.path.join(api, f)
        if os.path.exists(src):
            try:
                shutil.move(src, os.path.join(dest_dir, f))
                print(f"Moved {f} to api/scripts/{folder}")
            except Exception as e:
                print(f"Error moving {f}: {e}")

# Delete garbage in API
api_garbage = ["simple_debug.py", "test_simple.py", "fix_back.py", "package-lock.json", "run_and_log.py", "runner.py"]
for f in api_garbage:
    src = os.path.join(api, f)
    if os.path.exists(src):
        try:
            os.remove(src)
            print(f"Deleted {f}")
        except Exception as e:
            print(f"Error deleting {f}: {e}")

# Root Cleanup
root_scripts = os.path.join(root, "scripts")
root_map = {
    "debug": ["check_integrity.py", "check_pdf_text.py", "check_router.py", "check_states.py", "debug_check.py", "debug_live.py", "debug_regex.py", "debug_simple.py", "diag.py", "diag_v2.py", "verify_geo_db.py", "verify_invoice.py", "verify_v2.py"],
    "migrations": ["fix_migration.py", "fix_taxes.py", "migrate_geo_columns.py", "safe_migrate.py", "migrate.bat"],
    "tools": ["export_catalog.py", "get_catalog.py", "get_catalog_sample.py"],
    "tests": ["test_cities.py", "test_cities_v2.py", "test_endpoint.py", "test_endpoint_process.py", "test_georef.py", "test_re.py", "test_re_dump.py", "test_regex_items.py", "test_rubros_api.py", "test_rubros_v2.py", "test_tax.py"],
    "data": ["catalog_full.json", "entity.json", "invoice.json", "response_process.json"]
}

for folder, files in root_map.items():
    dest_dir = os.path.join(root_scripts, folder)
    os.makedirs(dest_dir, exist_ok=True)
    for f in files:
        src = os.path.join(root, f)
        if os.path.exists(src):
            try:
                shutil.move(src, os.path.join(dest_dir, f))
                print(f"Moved {f} to scripts/{folder}")
            except Exception as e:
                print(f"Error moving {f}: {e}")

# Delete root garbage
root_garbage = ["test_run.py", "seed.log"]
for f in root_garbage:
    src = os.path.join(root, f)
    if os.path.exists(src):
        try:
            os.remove(src)
            print(f"Deleted {f}")
        except Exception as e:
            print(f"Error deleting {f}: {e}")
