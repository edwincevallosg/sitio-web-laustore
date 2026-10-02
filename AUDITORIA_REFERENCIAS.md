# Auditoría de fuente — LauStore

## Registro original
- **Alumno:** Edwin Cevallos
- **Correo:** edwincevallosg@gmail.com
- **Tipo:** pagina_web
- **Estilo solicitado:** ["Corporativo","Elegante","Minimalista","Profesional","Premium","Comercial"]
- **Sensación solicitada:** Elegancia y estilo 
- **Descripción del negocio:** LauStore es una tienda de ropa femenina con tienda física y ventas por WhatsApp. Ofrece vestidos y prendas de estilo casual chic. Queremos una página web para mostrar nuestros productos, atraer nuevos clientes y facilitar las consultas y compras.
- **Detalles técnicos:** Diseño elegante, moderno y adaptable a celulares, inspirado en Mango, Zara y De Prati. Incluir inicio, catálogo, novedades, ubicación de la tienda y contacto. El catálogo tendrá más de 200 productos, con fotografías, precio final, tallas, colores y disponibilidad; filtros por categoría, talla, color, precio y disponibilidad; y un botón de WhatsApp en cada producto. Las compras virtuales se pagan mediante transferencia y los envíos nacionales se realizan por Servientrega. Permitir actualizar fácilmente productos, inventario y precios de temporada.

## Logotipo, imágenes y archivos
El Excel no contiene imágenes, archivos incrustados, dibujos, relaciones de hipervínculos ni logotipos. El logotipo, favicon, portada social e ilustraciones de este prototipo son **originales y provisionales**. Los logos y fotografías de las páginas de referencia no se copiaron porque pertenecen a terceros y no identifican al alumno.

## Auditoría de referencias
| Referencia | Estado | Hallazgo |
|---|---|---|
| `https://shop.mango.com/ec/es/h/mujer` | verificado | Sitio accesible; referencia de taxonomía de categorías y navegación de moda. |
| `https://www.deprati.com.ec/es/mujeres/c/01` | verificado_con_limitaciones | El sitio depende de JavaScript, pero su catálogo y propuesta comercial fueron confirmados por resultados públicos. |
| `https://www.zara.com/ec/es/mujer-vestidos-fiesta` | verificado_con_redireccion | La ruta indicada cambió; se verificaron las rutas actuales de vestidos y vestidos de fiesta para Ecuador. |

## Supuestos explícitos
- No se proporcionó logo, fotografías, teléfono, dirección ni inventario real.
- Los productos, precios y fotografías vectoriales son demostrativos para mostrar la experiencia completa.
- El botón de WhatsApp queda preparado para reemplazar por el número comercial real.

## Arquitectura entregada
- `index.html` — **Inicio** (home)
- `catalogo.html` — **Catálogo** (catalog)
- `novedades.html` — **Novedades** (catalog)
- `lookbook.html` — **Lookbook** (gallery)
- `como-comprar.html` — **Cómo comprar** (method)
- `tienda.html` — **Tienda física** (about)
- `gestion-inventario.html` — **Gestión** (dashboard)
- `contacto.html` — **Contacto** (contact)
- `privacidad.html` — política base para adaptar
- `accesibilidad.html` — declaración de accesibilidad
- `404.html` — página de error no indexable
- `robots.txt`, `sitemap.xml`, `sitemap.template.xml`, `llms.txt`, `knowledge.json`, `manifest.webmanifest`

## Integraciones no simuladas como reales
La interfaz puede demostrar búsquedas, dashboards, formularios, catálogos, chat o calculadoras; no se conectaron pagos, autenticación, bases de datos, WhatsApp, CRM, LMS, IAM, Oracle ni modelos de IA porque el registro no incluye credenciales, infraestructura ni reglas operativas aprobadas.
