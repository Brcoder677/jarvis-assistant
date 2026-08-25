# JARVIS Assistant — Fase 1

Asistente de IA con chat + voz (reconocimiento y síntesis) en el navegador, backend en Node.js/Express que hace de proxy seguro hacia la API gratuita de **Groq** (Llama 3.3), y una base de WebSocket lista para conectar un agente local en la Fase 2 (control de PC).

## Estructura del proyecto

```
jarvis-assistant/
├── server.js          # Backend Express + proxy a Claude + WebSocket
├── package.json
├── .env.example        # Plantilla de variables de entorno
├── public/
│   ├── index.html       # Interfaz
│   ├── style.css        # Estética tipo JARVIS
│   └── app.js            # Chat, voz, conexión al backend
```

## 1. Correrlo en local (VS Code)

```bash
cd jarvis-assistant
npm install
cp .env.example .env
```

Edita `.env` y pon tu API key de Groq (gratis, la consigues en [console.groq.com](https://console.groq.com/keys)):

```
GROQ_API_KEY=gsk_xxxxxxxx
```

Luego:

```bash
npm start
```

Abre `http://localhost:3000` en Chrome (el reconocimiento de voz solo funciona bien en Chrome/Edge).

## 2. Subirlo a GitHub

```bash
git init
git add .
git commit -m "JARVIS Fase 1"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/jarvis-assistant.git
git push -u origin main
```

Asegúrate de que `.env` **no** se suba (ya está en `.gitignore`).

## 3. Desplegar en Railway

1. Entra a [railway.app](https://railway.app) e inicia sesión con GitHub.
2. **New Project → Deploy from GitHub repo** → selecciona `jarvis-assistant`.
3. Railway detecta Node.js automáticamente (usa `npm start`).
4. Ve a **Variables** y agrega:
   - `GROQ_API_KEY` = tu key (gratis desde console.groq.com/keys)
   - `GROQ_MODEL` = `llama-3.3-70b-versatile`
5. Railway te da una URL pública tipo `https://jarvis-assistant-production.up.railway.app`. Esa es tu app, accesible desde cualquier lugar.

## 4. Desplegar en Render (alternativa)

1. Entra a [render.com](https://render.com) → **New → Web Service**.
2. Conecta tu repo de GitHub.
3. Configuración:
   - Build Command: `npm install`
   - Start Command: `npm start`
4. En **Environment**, agrega las mismas variables (`GROQ_API_KEY`, `GROQ_MODEL`).
5. Deploy. Render te da una URL pública `https://jarvis-assistant.onrender.com`.

> Nota: el plan gratuito de Render "duerme" el servicio tras inactividad (tarda ~30s en despertar). Railway no tiene ese problema en su plan gratuito con créditos, pero sí un límite de horas/mes. Para uso personal, cualquiera de los dos te alcanza.

## Qué incluye esta Fase 1

- ✅ Chat de texto con memoria de conversación (contexto entre mensajes)
- ✅ Reconocimiento de voz (hablas y se transcribe) — Web Speech API
- ✅ Síntesis de voz (JARVIS te responde hablando)
- ✅ Interfaz con estética holográfica (núcleo animado, scanlines, tema cian/oscuro)
- ✅ Base de WebSocket (`/agent`) lista para la Fase 2

## Fase 2 (siguiente paso): control de PC

Para que JARVIS controle tu computadora (abrir apps, leer archivos, ejecutar comandos), se necesita un **agente local** — un script Python o Node corriendo en tu máquina que:

1. Se conecta al backend desplegado vía WebSocket (`wss://tu-app.railway.app/agent`).
2. Recibe comandos desde `/api/agent-command`.
3. Los ejecuta localmente y devuelve el resultado.

Esto es necesario porque, por seguridad, ningún servidor remoto (ni Railway ni Render) puede acceder directamente a tu computadora — el agente local es el que abre esa puerta, y tú decides qué puede hacer.

Cuando quieras, seguimos con esta fase.
