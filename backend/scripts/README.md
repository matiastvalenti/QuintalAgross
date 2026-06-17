# Quintal Agross - Backend (API)

Sistema de gestión agro-contable construido con FastAPI.

## Requisitos

- Python 3.9+
- pip

## Configuración y Ejecución

1. Navegar a la carpeta `api`:
   ```bash
   cd api
   ```
2. Instalar dependencias globalmente:
   ```bash
   pip install -r requirements.txt
   ```
3. Ejecutar la aplicación:
   ```bash
   python -m uvicorn app.main:app --reload
   ```

## API Endpoints

- `GET /health`: Verifica que el sistema esté funcionando.
- `GET /entities`: Lista todas las entidades.
- `POST /entities`: Crea una nueva entidad.
- `GET /accounts/{entity_id}/ledger`: Obtiene el libro mayor de una entidad.
- `POST /accounts/{entity_id}/movement`: Registra un movimiento contable.
