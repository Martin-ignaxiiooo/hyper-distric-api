# Hyper Distric API

Backend de Hyper Distric, una tienda de ropa streetwear. Está dividido en tres servicios hechos con Node.js y Express: usuarios, productos y ventas.

Los servicios usan Supabase para guardar la información. El servicio de ventas también se conecta con Mercado Pago para crear preferencias de pago.

El frontend del proyecto está en hyper-distric.

## Estructura actual
```text
hyper-distric-api/
├── productos/        Catálogo, imágenes y stock
├── usuarios/         Registro, login y consulta de usuarios
├── ventas/           Pedidos, estados y Mercado Pago
├── config/           Configuración de la versión anterior
├── routes/           Rutas de la versión anterior
└── *-service.js      Servicios anteriores conservados en la raíz
```
La implementación utilizada para los microservicios está dentro de las carpetas `productos`, `usuarios` y `ventas`. Cada carpeta tiene sus propias dependencias, configuración y archivo `index.js`.

## Tecnologías
- Node.js
- Express
- Supabase
- Mercado Pago SDK
- Render

## Puertos locales
| Servicio | Carpeta | Puerto |
|----------|----------|--------|
| Usuarios | `usuarios/` | 3001 |
| Productos| `productos/` | 3002 |
| Ventas   | `ventas/`   | 3003 |

## Variables de entorno
Crea un archivo `.env` dentro de cada microservicio.

Para `productos/` y `usuarios/`:
```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_KEY=tu_clave_de_supabase
```

Para `ventas/`:
```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_KEY=tu_clave_de_supabase
MERCADOPAGO_ACCESS_TOKEN=tu_token_de_prueba
BASE_URL_FRONTEND=http://localhost:5500
```
Los archivos `.env` no deben subirse al repositorio.

## Ejecutar un servicio
Entra en la carpeta que quieras iniciar, instala las dependencias y ejecuta el servidor. Por ejemplo:
```bash
cd productos
npm install
npm start
```
El mismo proceso se aplica a `usuarios` y `ventas`. Para trabajar con toda la aplicación deben estar activos los tres servicios.

## Rutas principales

### Usuarios — puerto 3001
| Método | Ruta | Uso |
|--------|------|-----|
| POST   | `/auth/login` | Iniciar sesión |
| POST   | `/usuarios` | Registrar un usuario |
| GET    | `/usuarios` | Listar usuarios |
| GET    | `/usuarios/:id` | Obtener un usuario |

### Productos — puerto 3002
| Método | Ruta | Uso |
|--------|------|-----|
| GET    | `/productos` | Listar el catálogo |
| GET    | `/productos/:id` | Obtener un producto |
| POST   | `/productos` | Crear un producto |
| PUT    | `/productos/:id` | Editar un producto |
| DELETE | `/productos/:id` | Eliminar un producto |
| PUT    | `/productos/:id/stock` | Definir el stock |
| PUT    | `/productos/:id/reduce-stock` | Descontar unidades del stock |

### Ventas — puerto 3003
| Método | Ruta | Uso |
|--------|------|-----|
| POST   | `/ventas` | Registrar una venta |
| GET    | `/ventas` | Listar pedidos |
| GET    | `/ventas/usuario/:id` | Consultar pedidos de un usuario |
| PUT    | `/ventas/:id/estado` | Cambiar el estado de un pedido |
| POST   | `/mercadopago/create` | Crear una preferencia de pago |
| POST   | `/mercadopago/success` | Confirmar el pedido y actualizar stock |

## Flujo de Mercado Pago
El frontend envía el usuario y el carrito a `/mercadopago/create`. El servicio valida los productos, crea el pedido en Supabase y devuelve la dirección de pago generada por Mercado Pago.

En la versión actual, la confirmación final se realiza mediante `/mercadopago/success` después del retorno al frontend. Para un entorno de producción conviene validar el pago directamente con Mercado Pago mediante notificaciones o webhooks antes de marcar el pedido como pagado.

## Despliegue
Cada carpeta puede desplegarse como un servicio separado en Render:
- `usuarios/` con `npm start`
- `productos/` con `npm start`
- `ventas/` con `npm start`

Las variables de entorno se configuran desde el panel de cada servicio.

## Uso del proyecto
Proyecto desarrollado con fines académicos y de portafolio.
