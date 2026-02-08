# Baileys API — Referencia de endpoints

Resumen de cómo acceder a los endpoints de esta API. Base: [@WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys) expuesto como REST con soporte multi-sesión.

## Autenticación

Todas las peticiones deben enviar el header:

```
X-API-Key: <API_KEY>
```

El valor debe coincidir con la variable `API_KEY` configurada en el servidor. Si el header falta o es incorrecto, la API responde con `403` y cuerpo `{ "error": "..." }`.

Excepción: `GET /sessions/:sessionId/add-sse` admite también la API key por query: `api_key` o `API_KEY`.

## Base URL

`http://<host>:<PORT>`. Por defecto `PORT=3000` (configurable en el servidor). Las rutas de sesión están bajo `/sessions`; el resto de recursos bajo `/:sessionId/...`.

## Variables de entorno (cliente)

Para consumir esta API desde otra aplicación:

- **BAILEYS_URL**: URL base del servicio (ej. `http://localhost:3001`).
- **API_KEY**: Clave que debe coincidir con la configurada en el servidor (`API_KEY` en `.env` del proyecto).

Quien despliega esta API define `PORT`, `DATABASE_URL`, `API_KEY`, etc.; el cliente solo necesita la URL base y la clave acordada.

## Endpoints

### Sesiones

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/sessions` | Lista sesiones. Respuesta: `[{ id, status }]`. |
| GET | `/sessions/:sessionId` | Comprueba que la sesión existe. Respuesta: `{ "message": "Session found" }`. |
| GET | `/sessions/:sessionId/status` | Estado de la sesión. Respuesta: `{ "status": "<estado>" }`. |
| POST | `/sessions/add` | Crear sesión. Body: `sessionId` (requerido), opcional `readIncomingMessages`, opcional `socketConfig`. Devuelve QR o error. |
| GET | `/sessions/:sessionId/add-sse` | Crear sesión con QR por Server-Sent Events. API key por header o query. |
| DELETE | `/sessions/:sessionId` | Elimina la sesión y datos asociados. Respuesta: `{ "message": "Session deleted" }`. |

Estados de sesión: `unknown`, `wait_for_qrcode_auth`, `authenticated`, `pulling_wa_data`, `connected`, `disconected`.

Todos los endpoints bajo `/:sessionId/...` requieren que la sesión exista; si no, responden con error.

### Chats

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/:sessionId/chats` | Lista chats. Query: `cursor`, `limit`. |
| GET | `/:sessionId/chats/:jid` | Chat por JID. Query: `cursor`, `limit`. |
| POST | `/:sessionId/chats/:jid/presence` | Presencia. Body: `{ "presence": "available" \| "composing" \| "recording" \| "paused" }`. |

### Contactos

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/:sessionId/contacts` | Lista contactos. Query: `cursor`, `limit`. |
| GET | `/:sessionId/contacts/blocklist` | Lista bloqueados. |
| POST | `/:sessionId/contacts/blocklist/update` | Body: `jid`, `action`: `"block"` \| `"unblock"`. |
| GET | `/:sessionId/contacts/:jid` | Comprobar contacto. |
| GET | `/:sessionId/contacts/:jid/photo` | Foto del contacto. |

### Grupos

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/:sessionId/groups` | Lista grupos. Query: `cursor`, `limit`. |
| GET | `/:sessionId/groups/:jid` | Metadatos del grupo. |
| POST | `/:sessionId/groups/:jid/presence` | Presencia en grupo. Body: `{ "presence": "..." }`. |
| GET | `/:sessionId/groups/:jid/photo` | Foto del grupo. |
| POST | `/:sessionId/groups/create` | Body: `subject`, `participants` (array). |
| PUT | `/:sessionId/groups/:jid/update/participants` | Body: `participants`, `action`: `add` \| `remove` \| `demote` \| `promote`. |
| PUT | `/:sessionId/groups/:jid/update/subject` | Body: `subject`. |
| PUT | `/:sessionId/groups/:jid/update/description` | Body: `description`. |
| PUT | `/:sessionId/groups/:jid/update/setting` | Body: `action`: `announcement` \| `not_announcement` \| `unlocked` \| `locked`. |
| DELETE | `/:sessionId/groups/:jid` | Salir del grupo. |

### Mensajes

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/:sessionId/messages` | Lista mensajes. Query: `cursor`, `limit`. |
| POST | `/:sessionId/messages/send` | Enviar mensaje. Body: `jid`, `message` (objeto Baileys), opcional `type` (`number` \| `group`), opcional `options`. |
| POST | `/:sessionId/messages/send/bulk` | Body: array de `{ jid, type?, message, options?, delay? }`. |
| POST | `/:sessionId/messages/download` | Descargar medio. Body: mensaje completo (objeto WAMessage). |
| DELETE | `/:sessionId/messages/delete` | Borrar mensaje. Body: `jid`, `type?`, `message` (key del mensaje). |
| DELETE | `/:sessionId/messages/delete/onlyme` | Borrar solo para el remitente. Body igual que delete. |

## Ejemplos de request/response

### Crear sesión

**Request**

```http
POST /sessions/add
X-API-Key: <API_KEY>
Content-Type: application/json

{
  "sessionId": "mi-session",
  "readIncomingMessages": false
}
```

**Response (200)** — QR listo para escanear

```json
{
  "qr": "data:image/png;base64,..."
}
```

**Response (400)** — Sesión ya existe

```json
{
  "error": "Session already exists"
}
```

### Enviar mensaje de texto

**Request**

```http
POST /mi-session/messages/send
X-API-Key: <API_KEY>
Content-Type: application/json

{
  "jid": "5492215924252@s.whatsapp.net",
  "type": "number",
  "message": {
    "text": "Hola!"
  }
}
```

**Response (200)** — Objeto resultado de Baileys (mensaje enviado).

**Response (400)** — JID no existe

```json
{
  "error": "JID does not exists"
}
```

El formato de `message` sigue la API de Baileys (texto, imagen, audio, etc.). Ver [Baileys](https://github.com/WhiskeySockets/Baileys) para tipos de mensaje.

## Flujo típico

1. **Listar sesiones:** `GET /sessions` con header `X-API-Key`.
2. **Crear sesión:** `POST /sessions/add` con `{ "sessionId": "mi-session" }`; la respuesta incluye `qr` (data URL) para escanear con WhatsApp.
3. **Alternativa QR por SSE:** `GET /sessions/<sessionId>/add-sse` para recibir varios QRs por stream hasta que se conecte.
4. **Comprobar estado:** `GET /sessions/:sessionId/status`.
5. **Enviar mensaje:** `POST /:sessionId/messages/send` con `jid` (ej. `5492215924252@s.whatsapp.net`), `type: "number"` y `message: { "text": "..." }`.
6. **Eliminar sesión:** `DELETE /sessions/:sessionId`.

Ejemplos de peticiones listas para ejecutar están en `requests.http` en la raíz del proyecto.

## Para integradores que venían de la doc v6 (consumidor)

Si tu aplicación consumía una “Baileys API” documentada con MongoDB/PostgreSQL y roles:

- Esta API **no** expone `POST /sessions/:id/cleanup`. Para “recrear” una sesión usad `DELETE /sessions/:sessionId` y luego `POST /sessions/add` con el mismo o nuevo `sessionId`.
- El body de creación solo usa `sessionId` (y opcionales `readIncomingMessages`, `socketConfig`). No hay `sessionName`; el nombre puede ser el mismo `sessionId` o gestionarse en vuestro lado.
- `GET /sessions` devuelve `[{ id, status }]`; no incluye `connectionData` (batería, plataforma, etc.) ni metadatos de otra base de datos.
