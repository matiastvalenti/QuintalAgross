# Asistente Gemini de Quintal Agross (nivel gratuito)

La estrella del encabezado permite escribir o dictar operaciones. Gemini interpreta
el texto y prepara una vista previa. El backend busca clientes, proveedores y
productos **en la base local** del ERP. Nunca registra documentos automáticamente.

## Configuración local

1. Entrá en https://aistudio.google.com/apikey y generá una clave nueva, en un
   proyecto de **nivel gratuito, sin facturación habilitada**. Rotá las claves
   que se hayan compartido en chats u otros mensajes.
2. Abrí el archivo local `backend/.env` (no se sube a GitHub).
3. Agregá las líneas siguientes, reemplazando el marcador por la clave nueva:

   ```dotenv
   GEMINI_API_KEY=PEGAR_CLAVE_NUEVA_AQUI
   GEMINI_MODEL=gemini-3.5-flash-lite
   ```

4. Reiniciá FastAPI/Uvicorn. Luego abrí el Asistente de Quintal desde la cabecera.
5. Probá con datos ficticios: «Orden de venta para Cliente de Prueba,
   500 litros de Producto de Prueba a USD 12,5».

El endpoint autenticado `GET /api/ai/status` permite ver si la clave está configurada.

## Alcance

- Orden de venta y compra: se interpretan varias líneas y se abre un formulario
  con los datos sugeridos; no se guarda automáticamente.
- Si se pide factura/remito, se abre la orden previa del circuito comercial.
- Recibo/pago: se abre el formulario con la entidad identificada. Los medios
  de pago, cheques e imputaciones siguen siendo manuales.
- Los productos y personas se vinculan solamente con coincidencias seguras de
  la base local. Los valores faltantes se muestran como pendientes.

## Presupuesto y privacidad

- El modelo por defecto tiene nivel gratuito, sujeto a cuotas. La aplicación
  **no puede garantizar que Google no facture si habilitaste facturación** en
  tu proyecto. Mantené el proyecto sin facturación y revisá Google AI Studio.
- El backend permite únicamente modelos con nivel gratuito y no realiza
  reintentos con modelos pagos.
- La clave viaja del backend a Google por HTTPS en el encabezado
  `x-goog-api-key`; no se envía al navegador ni queda en el repositorio.
- En el nivel gratuito Google puede usar solicitudes para mejorar sus productos.
  No envíes información comercial/personal confidencial mientras estás probando.
- Error 429: cuota gratuita agotada. Error 503: clave o modelo sin acceso.
- El dictado es una función del navegador, no del modelo Gemini.

Documentación oficial:
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/api-key
