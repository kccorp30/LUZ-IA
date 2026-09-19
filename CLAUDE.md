# CLAUDE.md — HOLA LUZ V2

## 1. Propósito de este archivo

Este archivo define las reglas permanentes de trabajo para **Hola Luz V2**.

Claude debe leer y respetar este documento antes de realizar cualquier cambio en el proyecto.

Estas reglas son de arquitectura, seguridad, producto, experiencia de usuario, datos, agentes de IA, despliegue y operación. No son sugerencias opcionales.

---

# 2. Visión del producto

**Hola Luz** es una plataforma SaaS modular e inteligente para negocios de alimentos y atención presencial.

Verticales iniciales:

- Restaurantes
- Heladerías
- Salsamentarias
- CHARR Tower / IoT
- Negocios futuros compatibles con el mismo núcleo modular

Hola Luz no debe construirse como una aplicación rígida para restaurantes. Debe construirse como una plataforma configurable por organización.

Cada negocio puede activar o desactivar módulos según sus necesidades.

Ejemplos de módulos:

- Menú web
- Pedidos
- Cocina
- Meseros
- Domicilios
- Tracking
- WhatsApp / mensajería
- CRM
- Fidelidad
- Promociones
- Reservas
- Pagos
- Comprobantes
- CHARR Tower
- Voz
- Agentes de IA
- Reportes
- Analytics
- Administración

La aplicación debe adaptarse al tipo de negocio y a los módulos habilitados.

---

# 3. Regla máxima del sistema

> **Lo que Luz promete, Luz ejecuta.  
> Y lo que Luz ejecuta, el sistema lo registra.**

Claude nunca debe implementar comportamientos donde Luz confirme al usuario que una acción ocurrió si esa acción no fue confirmada por el backend.

Ejemplos:

- Si Luz dice que agregó un producto, el pedido debe haberse modificado realmente.
- Si Luz dice que asignó un domiciliario, la asignación debe existir en base de datos.
- Si Luz dice que confirmó un pago, debe existir una fuente autorizada que lo confirme.
- Si Luz dice que creó una promoción, la promoción debe haberse persistido correctamente.
- Si Luz dice que cambió un estado, la transición debe haber sido validada y registrada.

La IA nunca es la fuente de verdad operacional.

---

# 4. Separación absoluta entre V1 y V2

La versión actual de Luz opera en producción para **La Curva**.

## Reglas no negociables

- NO modificar la producción actual de La Curva.
- NO reutilizar automáticamente su proyecto Supabase.
- NO ejecutar migraciones sobre la base de datos V1.
- NO copiar secretos de V1 a V2.
- NO usar La Curva como ambiente de pruebas.
- NO cambiar endpoints de producción existentes salvo instrucción explícita.
- NO migrar datos reales hasta que exista un plan formal de migración.

Hola Luz V2 debe tener:

- repositorio o rama claramente separada;
- proyecto Supabase independiente;
- variables de entorno independientes;
- staging independiente;
- almacenamiento independiente;
- credenciales independientes.

---

# 5. Proyecto Supabase V2

Claude debe trabajar con un proyecto Supabase nuevo para:

**Hola Luz V2**

No se debe usar el proyecto existente de La Curva como backend de V2.

## Reglas Supabase

- Toda modificación de esquema debe hacerse mediante migraciones.
- No realizar cambios manuales no documentados.
- Toda tabla multi-tenant debe estar protegida con RLS.
- No confiar en `organization_id` enviado por el navegador como autorización.
- La organización válida debe derivarse de la sesión/autorización del usuario.
- `service_role` nunca debe exponerse al frontend.
- Todos los buckets sensibles deben ser privados.
- Usar signed URLs para archivos privados.
- Realtime debe usarse solo donde aporte valor operacional.
- No usar localStorage como fuente de verdad para datos del negocio.
- No hardcodear IDs de restaurante, organización, dispositivo o usuario.
- No hardcodear credenciales.

---

# 6. Arquitectura multi-tenant

El tenant principal es:

`organization`

No usar `restaurante_id` como concepto universal de toda la plataforma.

La organización puede representar:

- restaurante
- heladería
- salsamentaria
- operación CHARR Tower
- otro negocio compatible

Debe existir un modelo equivalente a:

- organizations
- locations
- memberships
- roles
- organization_modules
- organization_settings

Cada organización decide qué módulos utiliza.

## Feature flags / módulos

Ejemplo conceptual:

- menu
- kitchen
- waiters
- delivery
- whatsapp
- payments
- reservations
- loyalty
- promotions
- charr_tower
- voice
- crm
- analytics
- ai_agents

La interfaz debe ocultar o desactivar módulos no habilitados.

No crear versiones separadas del código para cada tipo de negocio.

---

# 7. Autenticación y autorización

Hola Luz V2 debe tener autenticación real.

No replicar el acceso por PIN como única barrera de seguridad para roles administrativos.

La autorización debe distinguir como mínimo:

- platform_admin
- organization_owner
- organization_admin
- manager
- cashier
- kitchen
- waiter
- driver
- support
- customer

Las capacidades deben definirse por permisos, no solo por nombre de rol.

Toda operación crítica debe validar:

1. usuario autenticado;
2. organización autorizada;
3. permiso requerido;
4. recurso perteneciente a la organización;
5. transición válida si aplica;
6. auditoría.

---

# 8. Seguridad

## Prohibido

- secretos hardcodeados;
- contraseñas fallback;
- tokens fallback;
- `service_role` en navegador;
- proxies genéricos con privilegios de servicio;
- endpoints que acepten cualquier tabla/ruta desde frontend;
- confiar en IDs enviados por cliente sin autorización;
- buckets públicos para documentos financieros;
- errores financieros silenciosos;
- fallar abierto.

## Regla de secretos

Nunca usar:

```js
process.env.SECRET || "default-secret"
```

para secretos críticos.

Si falta una variable esencial:

**la aplicación debe fallar cerrada**.

---

# 9. Estructura técnica

No continuar el patrón de V1 de archivos gigantes de miles de líneas.

Claude debe favorecer:

- módulos pequeños;
- separación de responsabilidades;
- tipos compartidos;
- servicios de dominio;
- componentes UI reutilizables;
- validadores;
- repositorios de datos;
- actions / commands;
- tests;
- documentación.

Estructura orientativa:

```text
/apps
  /web
  /admin
  /kitchen
  /waiter
  /driver

/packages
  /ui
  /types
  /config
  /domain
  /auth
  /database
  /messaging
  /orders
  /payments
  /menu
  /delivery
  /reservations
  /iot
  /agents

/supabase
  /migrations
  /functions
  /seed

/docs
/tests
```

Claude puede proponer una estructura mejor si justifica el cambio antes de implementarlo.

---

# 10. Messaging Core — prioridad P0

WhatsApp y conversaciones son una parte crítica de Hola Luz.

El nuevo sistema debe comportarse como un inbox profesional en tiempo real.

## Flujo obligatorio

```text
WhatsApp / canal
        ↓
Webhook
        ↓
Persistencia inmediata
        ↓
Realtime al panel
        ↓
Procesamiento IA
        ↓
Respuesta
```

El mensaje debe persistirse ANTES de enviar a la IA.

Si Claude, Supabase, Meta, Whapi o cualquier proveedor falla:

- el mensaje recibido no debe desaparecer;
- el panel debe conservar historial;
- debe existir estado de error/reintento;
- la conversación debe poder continuar.

## Requisitos

- provider_message_id único;
- idempotencia;
- estados:
  - received
  - queued
  - sent
  - delivered
  - read
  - failed
- direction:
  - inbound
  - outbound
- soporte para:
  - texto
  - imagen
  - audio
  - documento
  - ubicación
  - mensajes internos
- reconexión;
- mensajes optimistas solo cuando sea seguro;
- no devolver `ok:true` con arrays vacíos si Supabase falló;
- no borrar conversación visualmente ante un error de red.

La IA nunca debe bloquear la recepción del mensaje.

---

# 11. Luz como agente principal

Visualmente existe una sola inteligencia:

**Luz**

Internamente puede existir una arquitectura multi-agente.

Agentes conceptuales:

- Luz Orchestrator
- Orders Agent
- Messaging Agent
- Payments Agent
- Delivery Agent
- CRM Agent
- Menu Agent
- Promotions Agent
- Reservations Agent
- CHARR Tower / IoT Agent
- Observability Agent

Los agentes especializados son infraestructura interna. El usuario no debe percibir una colección de bots desconectados.

---

# 12. Agentic UI

Luz no debe ser solo un chatbot.

Debe poder:

- navegar a módulos;
- aplicar filtros;
- mostrar información;
- abrir recursos;
- ejecutar acciones autorizadas;
- modificar la interfaz de forma contextual;
- presentar resultados;
- solicitar confirmación cuando corresponda.

Ejemplo:

Usuario:
> Luz, muéstrame clientes Oro que no han pedido en 30 días.

El sistema puede:

1. abrir Clientes;
2. aplicar filtros;
3. mostrar resultados;
4. ofrecer una acción contextual.

No es necesario simular un mouse visible.

---

# 13. Niveles de autorización para IA

## Nivel 1 — seguro / automático

- buscar;
- filtrar;
- navegar;
- resumir;
- mostrar métricas;
- detectar anomalías;
- sugerir.

## Nivel 2 — acción operacional

- responder chat;
- cambiar estados válidos;
- asignar domiciliario;
- activar/desactivar disponibilidad;
- silenciar/reactivar Luz;
- registrar acciones operativas no financieras.

## Nivel 3 — confirmación obligatoria

- reembolsos;
- eliminar datos;
- cambiar precios masivamente;
- cerrar caja;
- enviar campañas masivas;
- cambiar configuración financiera;
- desactivar organización;
- acciones irreversibles;
- modificaciones sensibles de pagos.

Toda acción ejecutada por IA debe ser auditada.

---

# 14. Auditabilidad

Debe existir un sistema de auditoría equivalente a:

- audit_events
- agent_actions

Registrar:

- actor;
- agent;
- organization;
- action;
- resource;
- before;
- after;
- status;
- reason;
- correlation_id;
- created_at.

No registrar secretos.

---

# 15. Orders Core

Pedidos debe ser un dominio central.

Todos los canales deben usar el mismo núcleo:

- WhatsApp
- menú web
- POS
- mesero
- voz
- CHARR Tower
- admin

No crear lógica separada para cada canal.

Debe existir una única forma autorizada de crear y modificar pedidos.

## Estados

Las transiciones deben ser explícitas y validadas.

No permitir cambios arbitrarios de estado desde frontend.

---

# 16. Pedido adicional / modificaciones

Este requisito es crítico.

Problema actual:

El cliente agrega algo durante un pedido en curso, Luz responde como si se hubiera agregado, pero cocina nunca recibe nada.

Esto NO puede ocurrir en V2.

## Regla

Si el cliente quiere agregar algo:

- si el pedido todavía admite edición → modificar pedido original;
- si ya está en preparación → crear adición enlazada;
- si ya salió → crear pedido nuevo enlazado.

Concepto:

```text
Pedido #97501
└── Adición #97501-A
```

La adición debe:

- persistirse;
- aparecer en cocina;
- generar evento;
- notificar equipo;
- quedar vinculada al pedido;
- actualizar total cuando corresponda;
- informar al cliente solo después de éxito.

---

# 17. Menu Core

La sección Menú/Categorías debe reconstruirse profesionalmente.

No usar categorías guardadas en localStorage.

Modelo esperado:

- categories
- products
- product_variants
- modifier_groups
- modifier_options
- collections
- promotions
- availability_rules

Características:

- categorías;
- orden;
- subcategorías si aplican;
- variantes;
- extras;
- toppings;
- modificadores;
- disponibilidad;
- horarios;
- agotado;
- fotos;
- combos;
- promociones;
- colecciones dinámicas;
- precio;
- impuestos;
- reglas por organización/location.

“Más vendidos” debe ser colección dinámica, no categoría hardcodeada.

---

# 18. Menú cliente 2.0

El menú web del cliente es una prioridad de producto.

Debe ser:

- rápido;
- mobile-first;
- intuitivo;
- visual;
- centrado en comida;
- accesible;
- confiable;
- sin exceso de popups.

Flujo principal:

```text
Inicio
↓
Modo de consumo
↓
Categorías
↓
Producto
↓
Personalización
↓
Carrito
↓
Dirección / mesa
↓
Pago
↓
Confirmación
↓
Tracking / soporte
```

Modos:

- Domicilio
- Recoger
- Comer aquí

La identidad del restaurante debe ser protagonista.

Hola Luz debe aparecer como capa inteligente, no como sustituto visual de la marca del negocio.

---

# 19. Identidad visual de Luz

El proyecto se llama:

**Hola Luz**

La frase de activación de voz será:

**“Hola Luz”**

Luz NO tiene rostro humano.

Su identidad visual debe sentirse como:

- aura;
- esfera energética;
- halo;
- partículas;
- núcleo luminoso;
- presencia abstracta;
- inteligencia elegante.

No usar avatar humano como identidad principal de Luz V2.

---

# 20. Sistema visual

Dirección aprobada:

- futurista;
- espacial;
- premium;
- oscuro;
- morado;
- azul eléctrico;
- cyan;
- acentos verdes y otros colores funcionales;
- glow controlado;
- glass sutil;
- tarjetas limpias;
- tipografía legible;
- iconografía coherente;
- animaciones suaves;
- nada infantil.

No saturar.

La comida debe seguir siendo protagonista en el menú cliente.

La interfaz debe sentirse distinta y memorable, pero usable durante horas de operación.

---

# 21. Voz

El control por voz es configurable por organización.

Opciones posibles:

- voz desactivada;
- push-to-talk;
- wake word “Hola Luz”;
- respuesta por voz;
- respuesta solo visual;
- sensibilidad;
- idioma;
- volumen;
- horarios.

No asumir que todos los restaurantes pueden usar wake word por ruido ambiental.

---

# 22. CHARR Tower

CHARR Tower es un dispositivo físico inteligente.

## Importante

Las torres:

- NO tienen pantalla;
- usan audio;
- usan luces de estado;
- pueden usar ESP32 u otra arquitectura embebida;
- deben conectarse al backend de forma segura.

La interfaz del cliente NO debe mencionar detalles técnicos como:

- “sin pantalla”;
- ESP32;
- firmware;
- protocolo interno.

Eso pertenece a administración/técnica.

## Capacidades conceptuales

- wake word “Hola Luz”;
- audio;
- llamar mesero;
- tomar pedidos por voz;
- estados de mesa;
- reservas;
- estado de cocina;
- integración con pedidos;
- IoT.

Modelo esperado:

- devices
- device_heartbeats
- device_commands
- device_events

Cada dispositivo debe tener identidad segura.

Nunca depender solamente de IP local.

---

# 23. Estados CHARR Tower

Los colores exactos podrán configurarse, pero conceptualmente:

- libre;
- reservada;
- ocupada;
- preparando;
- listo;
- atención requerida;
- fiesta/evento;
- offline.

El estado visible del panel no debe asumir que un comando fue recibido.

Debe existir acknowledgement del dispositivo.

---

# 24. Reservas

Reservas es configurable por organización.

No asumir zonas como:

- VIP
- Terraza
- General

Cada negocio decide si usa zonas y cuáles existen.

Configuración posible:

- reservas activas/inactivas;
- zonas;
- mesas;
- capacidad;
- cliente elige mesa sí/no;
- anticipación;
- tolerancia;
- duración;
- horarios;
- preorden;
- confirmación automática/manual.

CHARR Tower puede reflejar reservas mediante luces.

---

# 25. Pedidos compartidos por mesa

Soportar conceptualmente:

- varias personas escaneando QR de una mesa;
- carrito/pedido compartido;
- productos agregados por distintos participantes;
- una sola mesa;
- pago conjunto;
- futura división de cuenta.

No es requisito de Fase 0, pero la arquitectura no debe impedirlo.

---

# 26. Payments Core

Separar:

`order_status`

de:

`payment_status`

Un pedido puede existir sin estar pagado.

Un pago puede estar pendiente mientras el pedido está confirmado según reglas del negocio.

Modelo conceptual:

- payments
- payment_events
- refunds
- payment_receipts
- reconciliation

Estados financieros deben ser explícitos.

---

# 27. ePayco

Hola Luz V2 debe quedar preparada para ePayco.

No asumir características específicas del proveedor sin revisar documentación vigente.

Necesidades:

- transaction reference;
- order relation;
- restaurant relation;
- gross amount;
- platform fee;
- gateway fee;
- net;
- status;
- webhook;
- idempotency;
- refunds/reversals;
- reconciliation.

La lógica financiera debe vivir en backend.

---

# 28. Receipt Vault

Los comprobantes manuales son documentos financieros.

No usar bucket público.

Crear un vault privado.

Modelo conceptual:

- payment_receipts

Campos posibles:

- id;
- organization_id;
- order_id;
- payment_id;
- conversation_id;
- customer_id;
- storage_path;
- mime_type;
- file_size;
- provider;
- provider_media_id;
- detected_bank;
- detected_amount;
- ai_confidence;
- verification_status;
- verified_by;
- verified_at;
- created_at.

Estados:

- pending
- approved
- rejected

---

# 29. IA y comprobantes

La IA puede:

- detectar si parece comprobante;
- extraer banco;
- monto;
- referencia;
- fecha;
- confianza;
- comparar contra pedido.

La IA NO puede ser autoridad final de pago.

Nunca:

```text
si IA falla → aceptar pago
```

Debe fallar cerrado.

Confirmación final:

- webhook del proveedor; o
- usuario autorizado; o
- proceso de conciliación.

---

# 30. Delivery / Tracking

Tracking debe reconstruirse como tiempo real real.

La V1 tiene captura de geolocalización, pero V2 debe integrar:

- driver_locations;
- last_seen;
- accuracy;
- timestamp;
- order assignment;
- status;
- realtime;
- customer tracking;
- restaurant tracking;
- stale location detection.

El cliente debe poder ver:

- posición;
- estado;
- última actualización;
- ETA;
- domiciliario;
- contacto cuando aplique.

Si la ubicación está obsoleta:

mostrarlo.

No fingir tiempo real.

---

# 31. CRM y fidelidad

CRM debe centralizar:

- cliente;
- teléfonos;
- direcciones;
- pedidos;
- conversaciones;
- puntos;
- nivel;
- preferencias;
- incidencias;
- promociones;
- reservas.

Fidelidad debe ser configurable por organización.

No hardcodear niveles o porcentajes universalmente.

---

# 32. WhatsApp onboarding

Una prioridad comercial es reducir la dificultad de conectar WhatsApp.

La arquitectura debe quedar preparada para onboarding multi-tenant.

Objetivo ideal:

```text
Conectar WhatsApp
↓
Login proveedor
↓
Seleccionar negocio/número
↓
Configurar
↓
Listo
```

Meta/WhatsApp sigue teniendo sus políticas y límites.

Hola Luz debe simplificar la operación, no fingir que esos límites no existen.

---

# 33. Canal abstraction

Messaging Core debe diseñarse para poder soportar:

- WhatsApp
- web chat
- Instagram DM
- otros canales futuros

Conceptualmente:

```text
Hola Luz Core
↓
Messaging Gateway
↓
Provider adapters
```

No amarrar el dominio completo a un único proveedor.

---

# 34. Realtime

Usar Realtime donde tenga sentido:

- chats;
- pedidos;
- cocina;
- tracking;
- devices;
- reservas;
- estados importantes.

Evitar polling agresivo.

No hacer polling cada 1–2 segundos de forma generalizada.

---

# 35. Resiliencia

El sistema debe asumir que pueden fallar:

- Supabase;
- Meta;
- Whapi;
- proveedor de IA;
- mapas;
- ePayco;
- red del usuario;
- dispositivo móvil;
- ESP32;
- Railway/Vercel;
- Realtime.

Diseñar:

- retry;
- backoff;
- idempotency;
- dead-letter/failed state cuando aplique;
- health checks;
- logs estructurados;
- correlation IDs;
- observabilidad.

---

# 36. UX de error

Nunca esconder errores críticos.

Ejemplo incorrecto:

```js
catch {
  return { ok: true, mensajes: [] }
}
```

Eso genera falsos estados.

La UI debe:

- conservar datos previos;
- mostrar reconectando;
- reintentar;
- informar si algo no sincroniza;
- nunca borrar datos visualmente solo por fallo temporal.

---

# 37. Testing

Antes de declarar una fase terminada:

- build;
- lint;
- typecheck;
- unit tests;
- integration tests;
- RLS tests;
- tenancy tests;
- critical flow tests.

Flujos críticos mínimos:

- login;
- tenant isolation;
- incoming message;
- outbound message;
- create order;
- modify order;
- order addition;
- kitchen notification;
- driver assignment;
- tracking;
- payment status;
- receipt verification;
- menu change;
- reservation;
- device command.

---

# 38. Staging

Todo cambio importante debe probarse antes de producción.

Entornos:

- local
- staging
- production

La Curva NO es staging.

Usar una organización demo en V2 para pruebas.

---

# 39. Git y releases

No trabajar directamente en production/main para cambios grandes.

Preferir:

- ramas de feature;
- commits claros;
- PR;
- revisión;
- tests;
- staging;
- merge.

Claude debe resumir al final de cada fase:

- archivos cambiados;
- migraciones;
- tablas;
- RLS;
- endpoints;
- variables nuevas;
- tests;
- riesgos pendientes;
- pasos manuales.

---

# 40. UI components

No duplicar componentes sin necesidad.

Crear design system reutilizable.

Componentes compartidos:

- buttons;
- cards;
- badges;
- tabs;
- inputs;
- modals;
- drawers;
- chat bubbles;
- navigation;
- status chips;
- product cards;
- order cards;
- customer cards;
- device cards;
- skeletons;
- error states;
- empty states.

---

# 41. Mobile first

Menú cliente, meseros y domiciliarios deben diseñarse mobile-first.

Panel restaurante debe ser excelente en:

- móvil;
- tablet;
- escritorio.

Cocina debe priorizar:

- velocidad;
- legibilidad;
- estados;
- interacción táctil.

---

# 42. Accesibilidad

Mantener:

- contraste;
- tamaños táctiles;
- navegación por teclado donde aplique;
- labels;
- estados no dependientes únicamente de color;
- reduced motion cuando corresponda.

---

# 43. Performance

Priorizar:

- imágenes optimizadas;
- carga progresiva;
- queries selectivas;
- paginación;
- virtualización en listas grandes;
- caching correcto;
- no descargar miles de mensajes innecesariamente;
- evitar re-render masivo;
- evitar llamadas repetidas.

---

# 44. Observabilidad

Implementar gradualmente:

- structured logging;
- error tracking;
- request IDs;
- message IDs;
- order event IDs;
- agent action IDs;
- provider event IDs.

Nunca imprimir secretos ni PII innecesaria en logs.

---

# 45. Migración desde V1

No copiar tablas ciegamente.

Proceso futuro:

1. inventariar;
2. mapear;
3. limpiar;
4. transformar;
5. importar;
6. validar;
7. reconciliar;
8. cutover.

La migración debe preservar:

- clientes;
- pedidos necesarios;
- fidelidad;
- menú;
- configuraciones;
- historial útil.

Solo cuando esté aprobado.

---

# 46. Regla para Claude al encontrar código V1

Cuando Claude use V1 como referencia:

- identificar intención;
- identificar comportamiento útil;
- identificar fallos;
- reconstruir correctamente en V2.

NO copiar automáticamente arquitectura V1.

La V1 es referencia de producto, no plantilla arquitectónica.

---

# 47. Regla para cambios grandes

Antes de realizar un cambio estructural importante:

1. explicar qué se cambiará;
2. listar archivos;
3. listar migraciones;
4. indicar riesgos;
5. indicar compatibilidad;
6. confirmar que no toca producción V1.

Después implementar.

---

# 48. Primera misión de Claude

La primera fase de Hola Luz V2 es:

## FASE 0 — FUNDACIÓN

Claude NO debe empezar creando todas las pantallas ni migrando toda la V1.

Debe primero:

- crear estructura del proyecto;
- preparar Supabase V2;
- establecer migrations;
- configurar Auth;
- modelar organizations;
- memberships;
- roles;
- organization_modules;
- RLS base;
- audit events;
- domain events;
- configuración de entornos;
- variables;
- seed demo;
- CI básico;
- documentación;
- build limpio.

Entregar un reporte antes de continuar.

---

# 49. Definition of Done — Fase 0

La Fase 0 solo puede considerarse terminada si:

- V2 corre localmente;
- Supabase V2 está separado;
- migraciones reproducibles;
- RLS activo;
- tenant isolation probado;
- no hay secretos hardcodeados;
- organización demo creada;
- módulos configurables existen;
- audit base existe;
- build pasa;
- tests base pasan;
- documentación está actualizada;
- V1/La Curva no fue modificada.

---

# 50. Principio final

Hola Luz V2 debe construirse como un producto que pueda operar en:

- 1 negocio;
- 10 negocios;
- 100 negocios;
- 1.000+ negocios;

sin depender de parches manuales por restaurante.

Cada decisión debe favorecer:

- estabilidad;
- seguridad;
- mantenibilidad;
- auditabilidad;
- escalabilidad;
- experiencia del cliente;
- operación del negocio.

Nunca sacrificar integridad operacional por velocidad visual.

La meta no es hacer una demo impresionante.

La meta es construir un SaaS profesional que pueda venderse, operar y crecer sin perder la confianza de los restaurantes ni de sus clientes.
