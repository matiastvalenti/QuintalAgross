# Auditoría de Entidades e Implementación de Entidades Mixtas

Este informe detalla el estado actual del manejo de entidades comerciales (Clientes, Proveedores, Mixtas y Empleados) en Quintal Agross, con el objetivo de planificar de forma segura el soporte de entidades mixtas y evitar la duplicación de registros por CUIT (identificación fiscal).

---

## 1. Cómo se crea actualmente una entidad

### Frontend
El flujo se inicia en [EntitiesManager.jsx](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/frontend/src/modules/entities/EntitiesManager.jsx), el cual instancia a [EntityEditor.jsx](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/frontend/src/modules/entities/components/EntityEditor.jsx).
1. El usuario completa el formulario en `EntityEditor.jsx`. Al presionar **Guardar**, se ejecuta la función `handleSubmit` (líneas 145-178).
2. Se envía una petición `POST` al endpoint `/entities/` de la API de backend con los datos recolectados en el estado `formData`.
3. Si el usuario está creando una nueva entidad y selecciona la opción **"Habilitar también como Proveedor"** (o Cliente), se incluye la bandera `create_linked: true` en el payload.

### Backend
En [router.py](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/backend/app/modules/entities/router.py), el endpoint `POST /` (línea 120):
1. **Autogeneración del código interno:** Si no se especifica un `code`, se llama a `_get_next_code` (líneas 107-117), asignando un prefijo `"C-"` para `CLIENT` o `"P-"` para los demás tipos.
2. **Validación de Código:** Verifica si el código interno ya existe (`Entity.code`). Si existe, lanza un error HTTP 400.
3. **Creación del Registro Principal:** Se guarda la entidad con el tipo asignado (`client`, `provider`, `employee` o `mixed`).
4. **Manejo de `create_linked`:** Si `create_linked` es `True`, el backend crea automáticamente un **segundo registro** con el tipo opuesto (`CLIENT` o `PROVIDER`), asignándole recíprocamente el identificador de la otra ficha en el campo `linked_entity_id`.

---

## 2. Cómo se edita actualmente una entidad

### Frontend
1. En [EntitiesManager.jsx](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/frontend/src/modules/entities/EntitiesManager.jsx), al seleccionar una entidad de la tabla, se abre [EntityEditor.jsx](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/frontend/src/modules/entities/components/EntityEditor.jsx) en modo edición pasándole el objeto `entity` mediante props.
2. Al guardar, `handleSubmit` detecta que existe un objeto de entidad y realiza una llamada `PUT` al endpoint `/entities/{entity_id}`.

### Backend
En [router.py](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/backend/app/modules/entities/router.py), el endpoint `PUT /{entity_id}` (línea 159):
1. Busca la entidad por su ID en la base de datos.
2. Sobrescribe directamente los atributos que se envían en el cuerpo de la petición (`model_dump(exclude_unset=True)`) sin realizar validaciones de unicidad sobre otros campos como el `tax_id` o `code`.

---

## 3. Campos manejados por la entidad

Los campos principales se definen en el modelo `Entity` de [models.py](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/backend/app/db/models/models.py#L135-L193):

* **`name`**: Razón Social o Nombre. En frontend se fuerza automáticamente a mayúsculas (`value.toUpperCase()`).
* **`type`**: Rol principal (`client`, `provider`, `mixed`, `employee`) a través del enumerador `EntityType`.
* **`tax_id / CUIT`**: Identificación fiscal de la entidad. En frontend se formatea de forma visual como `XX-XXXXXXXX-X` pero se guarda como string sin validar contra duplicados.
* **`code`**: Código interno único. Se autogenera y valida únicamente su unicidad en la creación.
* **`linked_entity_id`**: Clave foránea autorreferencial (`ForeignKey("entities.id")`) para asociar dos registros independientes (Cliente y Proveedor) correspondientes a una misma razón social.
* **`salesperson_id`**: Clave foránea que asocia la entidad (cuando es un Cliente) con un vendedor (`Entity.is_salesperson == True`).
* **`is_salesperson`**: Bandera booleana que identifica si un Empleado actúa como vendedor para el cálculo y liquidación de comisiones.

---

## 4. Selección de CLIENT / PROVIDER / MIXED en el Frontend

**Sí.** En [EntityEditor.jsx](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/frontend/src/modules/entities/components/EntityEditor.jsx#L302-L314), el selector de **Tipo de Entidad** permite seleccionar las siguientes opciones mapeadas:
* **Cliente** (`client`)
* **Proveedor** (`provider`)
* **Empleado** (`employee`)
* **Mixto** (`mixed`)

Esto significa que el frontend ya permite de forma nativa categorizar a una entidad como `mixed` (MIXED).

---

## 5. Validación de CUIT duplicado en el Backend

**No.** El backend no realiza ninguna validación de duplicados para el CUIT (`tax_id`) ni al crear (`POST /`) ni al editar (`PUT /{entity_id}`). A nivel de esquema de base de datos en [models.py](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/backend/app/db/models/models.py#L144), la columna está indexada pero no cuenta con la restricción de unicidad:
```python
tax_id = Column(String, index=True, nullable=True) # CUIT
```

---

## 6. Advertencia en el Frontend sobre CUIT existente

**No.** En el frontend no se realiza ninguna petición de validación ni se emite advertencia de ningún tipo si el usuario ingresa un CUIT que ya está registrado para otra entidad.

---

## 7. Comportamiento ante la creación de dos entidades con el mismo CUIT

Actualmente, el sistema **crea ambas entidades de forma exitosa**, resultando en registros totalmente duplicados e independientes en la base de datos (con IDs y códigos autogenerados diferentes). 
Esto genera problemas en la consolidación contable y balances, ya que la misma razón social/persona física tiene cuentas separadas imposibles de consolidar automáticamente sin una intervención manual.

---

## 8. Uso de `linked_entity_id`

El campo `linked_entity_id` quedó principalmente como un **campo histórico**. 
* Fue concebido inicialmente para conectar fichas separadas de un mismo sujeto que actuaba como cliente y proveedor en un esquema anterior al soporte nativo de la entidad `MIXED`.
* Actualmente, el único lugar operativo donde se lee es al eliminar una entidad en [router.py](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/backend/app/modules/entities/router.py#L446-L448) para limpiar el puntero de la entidad vinculada. 
* Con la adopción completa del tipo `MIXED`, este esquema de dos fichas vinculadas deja de ser necesario, promoviendo una ficha única para la entidad comercial.

---

## 9. Cambios mínimos recomendados

### A. Evitar duplicados por CUIT
1. **Validación en Backend:**
   * En `router.py`, dentro de `create_entity` y `update_entity`, normalizar el `tax_id` recibido (removiendo guiones y espacios).
   * Buscar si existe otra entidad activa con el mismo `tax_id`.
   * Si existe, responder con un error de negocio controlado (ej. `HTTP 409 Conflict`), devolviendo los datos de la entidad existente (ID, Nombre y Tipo).
2. **Advertencia en Frontend:**
   * Al recibir la respuesta HTTP 409 en `EntityEditor.jsx`, interceptar el error y mostrar un modal emergente de advertencia: *"Ya existe una entidad registrada con el CUIT [CUIT]: [Nombre Entidad] ([Tipo]). ¿Desea convertirla a entidad Mixta o prefiere ver su ficha actual?"*.

### B. Convertir CLIENT o PROVIDER a MIXED
1. **Lógica de conversión:**
   * Al detectar la duplicidad y confirmar la unificación, realizar una petición para actualizar el `type` de la entidad existente a `mixed`.
   * En caso de que se intente unificar dos entidades preexistentes con movimientos en ambas fichas, proveer un script/función que reasigne los documentos vinculados (`Document.entity_id`) de la entidad secundaria a la principal antes de eliminar la secundaria.

### C. Permitir usar una entidad mixta en ventas y compras
1. **Filtros en el Backend:**
   * El backend ya tiene resuelto esto en `read_entities` de `router.py` (líneas 66-73): cuando se pide `type=client` o `type=provider`, incluye automáticamente los registros con `type=mixed`.
2. **Formularios del Frontend:**
   * Asegurarse de que los selectores de entidades en formularios de ventas (Orden de Venta, Remito, Factura, Recibo) soliciten las entidades usando el parámetro `type=client` de forma que cargue clientes y entidades mixtas.
   * Del mismo modo, en compras (Orden de Compra, Remito, Factura de Compra, Orden de Pago) se debe solicitar `type=provider`.

---

## 10. Archivos a modificar en la primera implementación

* **[router.py](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/backend/app/modules/entities/router.py):** Agregar la lógica de verificación de duplicados de `tax_id` (CUIT) normalizado en los endpoints de creación y edición de entidades.
* **[EntityEditor.jsx](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/frontend/src/modules/entities/components/EntityEditor.jsx):** Manejar la advertencia ante CUIT duplicado capturando el código de estado de error del backend e interactuando con el usuario para ofrecer la unificación/conversión a MIXED.

---

## 11. Archivos que NO conviene tocar todavía

* **[models.py](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/backend/app/db/models/models.py):** No añadir la restricción `unique=True` a nivel de base de datos en la columna `tax_id`, ya que esto rompería las bases de datos de producción que tengan CUITs duplicados históricos hasta que se ejecute una migración de limpieza de datos exhaustiva.
* **Módulos de transacciones contables / facturación (`backend/app/modules/accounting/document_router.py`):** Evitar modificar el procesamiento de facturas; la unificación a nivel entidad (`entity_id`) es suficiente y transparente para los documentos.
