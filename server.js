require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);

// ---- Configuración base ----
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Historial de conversación en memoria (por sesión simple, un solo usuario)
// Para multiusuario real, esto debería indexarse por sessionId.
let conversationHistory = [];

const SYSTEM_PROMPT = `Eres JARVIS, un asistente de inteligencia artificial personal.
Hablas en español, de forma cercana pero eficiente, con un toque de ingenio sutil (sin exagerar).
Responde de forma concisa salvo que se te pida detalle. Si el usuario pide realizar una acción
en su computadora (abrir apps, archivos, etc.), indica que esa función requiere el agente local
conectado (aún no implementado en esta fase) y sugiere cómo continuar.`;

// ---- Endpoint principal de chat ----
app.post('/api/chat', async (req, res) => {
  try {
    const { message, reset } = req.body;

    if (!GROQ_API_KEY) {
      return res.status(500).json({
        error: 'Falta configurar GROQ_API_KEY en las variables de entorno del servidor.'
      });
    }

    if (reset) {
      conversationHistory = [];
    }

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Falta el campo "message" (texto).' });
    }

    conversationHistory.push({ role: 'user', content: message });

    // Limitar historial para no crecer sin límite (últimos 20 turnos)
    if (conversationHistory.length > 40) {
      conversationHistory = conversationHistory.slice(-40);
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...conversationHistory
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Error de Groq API:', errText);
      return res.status(502).json({ error: 'Error al conectar con la API de Groq.' });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || '(Sin respuesta de texto)';

    conversationHistory.push({ role: 'assistant', content: reply });

    res.json({ reply });
  } catch (err) {
    console.error('Error en /api/chat:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', hasApiKey: !!GROQ_API_KEY });
});

// ---- WebSocket: puente para un futuro agente local (control de PC) ----
// Fase 2: un script en tu computadora se conectará aquí para recibir
// comandos del asistente (abrir apps, leer archivos, etc.)
const wss = new WebSocket.Server({ server, path: '/agent' });
let localAgentSocket = null;

wss.on('connection', (ws) => {
  console.log('🔌 Agente local conectado');
  localAgentSocket = ws;

  ws.on('message', (msg) => {
    console.log('Mensaje del agente local:', msg.toString());
  });

  ws.on('close', () => {
    console.log('🔌 Agente local desconectado');
    if (localAgentSocket === ws) localAgentSocket = null;
  });
});

// Endpoint de ejemplo para enviar un comando al agente local (Fase 2)
app.post('/api/agent-command', (req, res) => {
  if (!localAgentSocket) {
    return res.status(503).json({ error: 'No hay agente local conectado.' });
  }
  localAgentSocket.send(JSON.stringify(req.body));
  res.json({ status: 'comando enviado' });
});

server.listen(PORT, () => {
  console.log(`🤖 JARVIS backend corriendo en el puerto ${PORT}`);
});
