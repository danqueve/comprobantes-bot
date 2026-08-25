# Comprobantes Bot — Imperio Comercial

Bot que lee comprobantes de pago (imagen o PDF) enviados a grupos de
WhatsApp y los registra automaticamente en Google Sheets usando la
API de Claude, con deteccion de numeros de operacion duplicados.

## Arquitectura


## Archivos

- `index.js` — cliente de WhatsApp, orquesta todo el flujo
- `claude.js` — llama a Claude API con el prompt de extraccion
- `sheets.js` — hace el POST al Apps Script
- `media.js` — descarga y desencripta comprobantes manualmente
  (fallback para un bug conocido de `downloadMedia()` en
  whatsapp-web.js que falla con la version actual de WhatsApp Web)
- `apps-script.gs` — codigo a pegar en el editor de Apps Script
  de la planilla de Google

## Instalacion en un VPS nuevo

```bash
# Node 20
dnf module install -y nodejs:20   # o el gestor de paquetes que corresponda

# Chromium (lo usa whatsapp-web.js para correr WhatsApp Web real)
dnf install -y epel-release chromium

# Dependencias del proyecto
npm install whatsapp-web.js qrcode-terminal axios dotenv

# Configuracion
cp .env.example .env
nano .env   # completar con los valores reales
```

## Primera vinculacion

```bash
node index.js
```

Escanea el QR que aparece en la terminal desde
**WhatsApp → Dispositivos vinculados → Vincular un dispositivo**.
La sesion queda guardada en `.wwebjs_auth/` — no hace falta
volver a escanear salvo que se borre esa carpeta o se cierre
la sesion desde el celular.

## Google Apps Script — IMPORTANTE

Al editar el codigo en el editor de Apps Script:

- **Guardar (Ctrl+S) NO alcanza.** Hay que volver a implementar.
- El camino confiable es **Implementar → Nueva implementacion**
  (genera una URL nueva cada vez — hay que actualizar
  `GOOGLE_APPS_SCRIPT_URL` en el `.env` despues).
- El camino "Administrar implementaciones → editar → Nueva version"
  en teoria mantiene la misma URL, pero en la practica no siempre
  aplico el codigo nuevo — si el bot responde con datos viejos
  despues de ese camino, usar "Nueva implementacion" en su lugar.
- Acceso: "Cualquier usuario" (no "con cuenta de Google"), o el
  bot recibe error 401 al escribir.

## Deteccion de duplicados

Un mismo numero de operacion no se puede acreditar dos veces,
sin importar a que zona (grupo) llego. El indice vive en una
pestana oculta llamada "Indice" dentro de la misma planilla.

## Produccion (PM2)

```bash
npm install -g pm2
pm2 start index.js --name comprobantes-bot
pm2 save
pm2 startup   # ejecutar la linea que devuelve, una sola vez

# Uso diario
pm2 logs comprobantes-bot
pm2 restart comprobantes-bot
pm2 status
```

## Notas

- `webVersionCache: { type: 'none' }` en `index.js` es necesario:
  sin esto, whatsapp-web.js queda pegado a una version vieja de
  WhatsApp Web y falla al conectar con cuentas Business.
- Numero dedicado exclusivamente a este bot (no el numero
  principal de atencion al cliente) — reduce el riesgo si
  WhatsApp llegara a restringir el numero por actividad
  automatizada.
