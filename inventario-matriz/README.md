# LauStore — Inventario Matriz (MVP voz, release independiente)

## Alcance
- URL del Deploy Preview: /inventario-matriz/
- Solo audio (WAV de hasta 90 segundos): voz → transcripción completa → JSON de campos → revisión humana → guardar.
- Sin fotografías, sin tallas, sin análisis de imágenes.
- No se modifica /inventario/, página comercial ni su Google Apps Script.
- Datos en la pestaña **Inventario Matriz** del Google Sheets existente: https://docs.google.com/spreadsheets/d/12LBYBy6BsIfnlEFMH-NLJPYgddDfO-3JyYhB8K7uj2o/edit#gid=19861023

## Columnas (A:H)
1. Nombre del producto (texto largo)
2. Código de barras (se asigna atómicamente al guardar, LS + diez dígitos, comienza LS0000000001)
3. Categoría (texto)
4. Costo referencia (USD, decimal)
5. Inventario inicial (entero)
6. Precio 1 (USD, decimal)
7. Precio 2 (Precio 1 menos 1 USD)
8. Precio 3 (Precio 1 menos 2 USD)

Se exige Precio 1 >= 2 para no generar precios negativos. Los precios 2 y 3 se recalculan en el backend, no se confían a la IA.

## Conectar el guardado (única configuración pendiente)
1. En https://script.google.com/ crea un **nuevo proyecto** denominado `LauStore Inventario Matriz`. No edites ni reemplaces el Apps Script del inventario anterior.
2. Copia el contenido del archivo `google-apps-script/InventarioMatriz.gs` (en esta rama) al editor del nuevo proyecto.
3. Ve a Configuración del proyecto → Propiedades del script y añade `MATRIZ_API_SECRET` con el **mismo valor** que ya tiene `APPS_SCRIPT_SECRET` en Netlify. Obtén el secreto de tu configuración privada existente; no lo compartas por chat ni lo guardes en GitHub.
4. Implementar → Nueva implementación → Aplicación web → Ejecutar como Yo → Acceso Cualquier persona. Copia su URL /exec.
5. En Netlify, añade la variable `GOOGLE_APPS_SCRIPT_MATRIZ_URL` con esa URL de Apps Script; preferiblemente solo para Deploy Previews si la configuración del plan lo permite.
6. Espera a que Netlify aplique la variable en las funciones serverless de la versión de prueba; puede requerir un nuevo deploy preview.
7. El guardado consulta `?action=matriz-status` antes de enviar datos y **se niega a escribir** en un endpoint no identificado como "LauStore Inventario Matriz".
8. Ingresa con el PIN actual, dicta los datos, revisa los ocho campos y confirma. El guardado retorna código de barras y fila.

Variables reutilizadas: `INVENTORY_PIN`, `GEMINI_API_KEY`, `APPS_SCRIPT_SECRET`.
Variable adicional: `GOOGLE_APPS_SCRIPT_MATRIZ_URL`.

## Seguridad y publicación
- Esta rama `release/inventario-matriz-v1` se mantiene separada de `main` y del PR del inventario anterior.
- No fusionar a main ni cambiar Production deploys hasta autorización expresa.
- Apps Script nuevo comparte únicamente el archivo de Google Sheets, y escribe solo la pestaña "Inventario Matriz".
- El sistema no genera ni guarda imágenes o audio en Drive; la grabación permanece en memoria del móvil durante la sesión.
- LockService y secuencia `MATRIZ_LAST_SEQUENCE` garantizan unicidad incluso con varios operadores.
- La pestaña se creó sin filas de prueba ni modificaciones a las otras hojas.
