# Comprobantes Bot — Imperio Comercial

Bot que lee comprobantes de pago (imagen/PDF) de grupos de WhatsApp
y los registra automáticamente en Google Sheets usando Claude API.

## Arquitectura

```
Grupos WhatsApp → Evolution API → Webhook (este bot) → Claude API → Google Sheets
                                                      ↓
                                              Confirmación en el grupo ✅
```

## Instalación en el VPS

### 1. Instalar Node.js (si no está)
```bash
dnf module install nodejs:20 -y
```

### 2. Subir el proyecto al VPS
```bash
# En tu PC local:
scp -r comprobantes-bot/ root@IP-VPS:/opt/

# O en el VPS, clonar desde GitHub:
cd /opt && git clone https://github.com/danqueve/comprobantes-bot.git
```

### 3. Instalar dependencias
```bash
cd /opt/comprobantes-bot
npm install
```

### 4. Configurar variables de entorno
```bash
cp .env.example .env
nano .env   # Completar con tus claves reales
```

### 5. Configurar Google Apps Script
1. Abrí tu Google Sheet en https://sheets.google.com
2. Extensiones → Apps Script
3. Pegá el contenido de `apps-script.gs`
4. Guardá → Implementar → Nueva implementación
5. Tipo: Aplicación web | Acceso: Cualquier usuario
6. Copiá la URL y pegala en `.env` como `GOOGLE_APPS_SCRIPT_URL`

### 6. Obtener API key de Anthropic
1. Entrá a https://console.anthropic.com
2. API Keys → Create Key
3. Cargá créditos (mínimo $5)
4. Pegá la key en `.env` como `ANTHROPIC_API_KEY`

### 7. Configurar webhook en Evolution API
```bash
curl -X POST https://evolution.imperiocomercial.com.ar/webhook/set/imperio \
  -H "apikey: TU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://localhost:3000/webhook",
    "webhook_by_events": true,
    "webhook_base64": true,
    "events": ["MESSAGES_UPSERT"]
  }'
```

### 8. Obtener IDs de los grupos
Una vez conectado el número, listar grupos:
```bash
curl https://evolution.imperiocomercial.com.ar/group/fetchAllGroups/imperio?getParticipants=false \
  -H "apikey: TU_API_KEY"
```
Copiar los IDs de los grupos deseados al `.env` como `GRUPOS_PERMITIDOS`.

### 9. Levantar con PM2
```bash
npm install -g pm2
pm2 start index.js --name comprobantes-bot
pm2 save
pm2 startup
```

## Estructura del proyecto

```
comprobantes-bot/
├── index.js         ← Servidor webhook principal
├── claude.js        ← Extracción de datos con Claude API
├── sheets.js        ← Escritura en Google Sheets
├── apps-script.gs   ← Código para Google Apps Script
├── .env.example     ← Variables de entorno (template)
├── package.json
└── README.md
```

## Costos estimados

- **Evolution API**: gratuita (self-hosted)
- **Claude Haiku 4.5**: ~$0.001 por comprobante → $0.20-0.50/mes típico
- **Google Sheets/Apps Script**: gratuito

## Monitoreo

```bash
pm2 logs comprobantes-bot      # Ver logs en tiempo real
pm2 status                     # Estado del proceso
pm2 restart comprobantes-bot   # Reiniciar
```
