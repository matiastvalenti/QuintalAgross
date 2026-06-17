
@echo off
cd /d "c:\Users\matia\Cosas\Escritorio\Programacion\Otro\QuintalAgross_Back\backend"
echo Starting >> backend_new.log
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 >> backend_new.log 2>&1
