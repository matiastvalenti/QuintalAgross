# 🧩 Contribuyendo como IA (Quintal Agross)

Este documento define el protocolo de actuación para agentes de IA que trabajen en este repositorio.

## 🛠 Procedimiento Operativo Estándar (SOP)

1.  **Exploración**: Lee `TASKS.md` para entender el contexto global y las fases pendientes.
2.  **Selección**: Identifica la primera tarea con estado `TODO` en `TASKS_STATE.json` que no tenga dependencias pendientes.
3.  **Estado**: Actualiza la tarea a `DOING` en `TASKS_STATE.json` antes de escribir código.
4.  **Implementación**: Realiza los cambios respetando las reglas técnicas (ver abajo).
5.  **Validación**: Verifica que el código corra (Backend + Frontend).
6.  **Finalización**: Marca la tarea como `DONE` tanto en `TASKS.md` (checkbox [x]) como en `TASKS_STATE.json`.

## 📐 Reglas Técnicas Obligatorias

### Backend (Python / FastAPI)

- Mantener la modularidad en `api/app/modules/`.
- Usar Pydantic para validación.
- Documentar endpoints con docstrings básicos para que Swagger sea útil.

### Frontend (React / Vite)

- **CSS Modules**: Cada archivo `.jsx` debe tener su `.module.css`.
- **Tokens**: No usar colores "hardcoded". Usar las variables de `src/styles/tokens.css`.
- **Modularidad**: Seguir la estructura de carpetas `src/modules/{feature}/`.

## 📜 Consistencia de Archivos

Es CRÍTICO que el archivo `TASKS.md` y `TASKS_STATE.json` estén siempre sincronizados. Si agregas una subtarea no prevista, regístrala en ambos lugares.
