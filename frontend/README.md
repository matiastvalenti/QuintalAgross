# Quintal Agross - Web

Interfaz de usuario para el sistema ERP agro-contable.

## Requisitos

- Node.js (v18 o superior)
- npm

## Configuración y Ejecución

1. Navegar a la carpeta `web`:
   ```bash
   cd web
   ```
2. Instalar dependencias:
   ```bash
   npm install
   ```
3. Iniciar el servidor de desarrollo:
   ```bash
   npm start
   ```

## Estructura de Estilos

- `src/styles/tokens.css`: Contiene las variables globales de diseño (colores, sombras, etc.).
- CSS Modules: Cada componente tiene su propio archivo `.module.css` para estilos encapsulados.

## Navegación

- **Entidades**: Gestión de clientes y proveedores.
- **Cuentas**: Visualización del libro mayor (ledger) por entidad.
