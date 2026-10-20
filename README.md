# Quintal Agross ERP

Sistema ERP agro-contable modular y escalable.

## Estructura del Proyecto

- `backend/`: Backend en Python (FastAPI + SQLAlchemy).
- `frontend/`: Frontend en React (JS + Vite).

## Inicio Rápido

### Backend

1. `cd backend`
2. Crear un entorno: `python -m venv .venv`.
3. Activarlo en Windows: `.venv\Scripts\activate`; en Linux/macOS: `source .venv/bin/activate`.
4. Instalar: `python -m pip install -r requirements.txt`.
5. Solo para una instalación nueva, copiar `.env.example` a `.env` y completar `SECRET_KEY` con una clave aleatoria. Conservar el `.env` existente al actualizar.
6. Iniciar: `python -m uvicorn app.main:app --reload` (o `start_back.bat` en Windows).

El backend usa por defecto `backend/sql_app_v2.db`. Antes de arrancar sobre una base existente, hacer un respaldo: el arranque actual aplica cambios de esquema automáticamente.

### Frontend

1. `cd frontend`
2. `npm ci`
3. `npm run dev`
4. Abrir en Chrome: `http://localhost:5173`

## Objetivo

Este proyecto sirve como base sólida para un sistema contable agrícola, permitiendo la gestión de entidades y movimientos de cuentas con soporte multi-moneda (ARS/USD).

## Configuración y verificación

Para usar otro servidor, copiar `frontend/.env.example` a `frontend/.env` y ajustar `VITE_API_URL`. Reiniciar Vite o recompilar tras cambiarla.

Desde `frontend/`: `npm run build` y `npm test -- --run`.

Para verificar la configuración del backend sin iniciar el servidor ni abrir la base de datos, instalar `backend/requirements-dev.txt` y ejecutar desde la raíz: `python -m pytest checks/ -q`.

No ejecutar la suite histórica `backend/tests/` contra datos de trabajo: su fixture actual usa un archivo fijo y el ciclo de inicio puede ejecutar migraciones y programar alertas. Esa suite requiere aislamiento antes de usarse como criterio de cierre.

Consultar `docs/REVISION_2026-10-20.md` para los cambios de esta entrega y los pendientes de validación funcional.
