# Auditoría transversal — Quintal Agross ERP (26/10/2026)

## Alcance
Revisión de rutas principales de React/Vite, configuración FastAPI, autenticación, gestor de ventanas, plantillas PDF, workflows de prueba e inventario de archivos versionados.
La revisión es estática: no se modificó ninguna base de datos ni se ejecutaron documentos comerciales reales.

## Corregido en esta entrega
1. **Navegación**: Entidades, Flota, Usuarios, Auditoría y Cuenta corriente usan ventanas del escritorio interno del ERP cuando se abren desde su acceso lateral.
2. **Registro de usuarios**: `POST /auth/register` requiere sesión y permiso de alta; el permiso de usuarios no basta para concederse rol admin/owner.
3. **Instalación inicial**: se eliminó el bootstrap por GET con usuario/clave predecibles. Ahora es POST con `QUINTAL_SETUP_TOKEN` temporal y contraseña inicial de al menos 12 caracteres.
4. **Roles**: las modificaciones administrativas no pueden alterar cuentas owner/admin desde roles insuficientes; permisos explícitos solo los modifica administración.
5. **Sesiones**: un usuario deshabilitado ya no conserva acceso mediante su token.
6. **Errores**: los errores internos no devuelven trazas Python al cliente; se registran en el servidor.
7. **Plantillas**: el directorio de ejemplos comerciales deja de estar montado públicamente. Solo se permiten las dos plantillas existentes usadas por el generador PDF y requieren token.
8. **Contraseña olvidada**: no revela la existencia de correos ni promete envíos que todavía no están implementados.

## Atención inmediata: repositorio y datos
El repositorio **es público**. Su historial contiene configuraciones `.env`, copias de bases `.db`, archivos `.pyc`, logs y documentos comerciales reales. `.gitignore` no protege archivos ya versionados ni borra su historial.

1. Cambiar la visibilidad a privada desde la configuración de GitHub **lo antes posible**.
2. Rotar `SECRET_KEY`, claves API y credenciales expuestas (sin compartirlas por chat ni introducirlas en el repositorio). Al cambiar `SECRET_KEY` las sesiones JWT existentes quedan invalidadas.
3. Planificar una limpieza controlada del repositorio/historial, con respaldo y verificación de las bases locales, antes de cualquier publicación o distribución. No ejecutar `git clean`, resets destructivos ni borrar el `.env` o la base local.
4. Dejar fuera de control de versiones los datos reales y configurar migraciones/seeds de demostración.

## Pendientes prioritarios
| Prioridad | Área | Próximo trabajo |
|---|---|---|
| Crítica | Archivos adjuntos | Sustituir `/uploads` público por descargas autenticadas y actualizar los consumidores sin romper vistas. |
| Alta | Configuración | Restringir CORS por entorno, validar `SECRET_KEY` robusta y separar configuración desarrollo/producción. |
| Alta | Recuperación de cuenta | Implementar correo real o flujo administrativo con auditoría y token de un solo uso. |
| Alta | Ventas/Compras | Completar pruebas end-to-end OV/OC → remito → factura → cuenta corriente → stock, incluyendo devoluciones y parciales. |
| Alta | UI comercial | Migrar progresivamente otros formularios aún abiertos en ventanas Chrome al gestor interno, validando parámetros y contexto. |
| Alta | Entidades | Paginación real desde backend, validación de duplicados CUIT, rendimiento de carga con padrones grandes. |
| Alta | Inventario | Consistencia envase↔litro/kg, costos y reservas entre depósitos, pruebas de operaciones concurrentes. |
| Media | Calidad | Aislar suite histórica de backend en bases temporales; auditar migraciones automáticas de inicio. |
| Media | Diseño | Homogeneizar formularios, barras de herramientas, errores y responsive en todo el ERP. |

**No considerar el proyecto listo para comercializar sin atender los pendientes críticos y ejecutar pruebas integrales con datos de prueba aislados.**
