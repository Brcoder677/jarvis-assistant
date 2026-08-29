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
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Historial de conversación en memoria (por sesión simple, un solo usuario)
let conversationHistory = [];

const SYSTEM_PROMPT = `Eres JARVIS, un asistente de inteligencia artificial personal.
Hablas en español, de forma cercana pero eficiente, con un toque de ingenio sutil (sin exagerar).
Responde de forma concisa salvo que se te pida detalle.
Si la pregunta requiere información actual (noticias, clima, precios, eventos recientes, datos
que puedan haber cambiado), usa la herramienta "buscar_en_internet" antes de responder.
Si el usuario pide realizar una acción en su computadora (abrir apps, archivos, etc.), indica que
esa función requiere el agente local conectado (aún no implementado en esta fase).`;

// ---- Herramienta: búsqueda web con Tavily ----
async function buscarEnInternet(query) {
  if (!TAVILY_API_KEY) {
    return 'Búsqueda web no configurada (falta TAVILY_API_KEY).';
  }
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query,
        search_depth: 'basic',
        max_results: 5,
        include_answer: true
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Error de Tavily:', errText);
      return 'No se pudo completar la búsqueda en internet.';
    }

    const data = await res.json();
    let resumen = '';
    if (data.answer) resumen += `Resumen: ${data.answer}\n\n`;
    if (Array.isArray(data.results)) {
      resumen += data.results
        .slice(0, 5)
        .map((r, i) => `${i + 1}. ${r.title}: ${r.content?.slice(0, 300)} (Fuente: ${r.url})`)
        .join('\n');
    }
    return resumen || 'No se encontraron resultados relevantes.';
  } catch (err) {
    console.error('Error al buscar en internet:', err);
    return 'Ocurrió un error al intentar buscar en internet.';
  }
}

// Definición de la herramienta en formato compatible con Groq/OpenAI tool-calling
const tools = [{
  type: 'function',
  function: {
    name: 'buscar_en_internet',
    description: 'Busca información actualizada en internet (noticias, clima, precios, datos recientes, etc.)',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'La consulta de búsqueda, en pocas palabras clave'
        }
      },
      required: ['query']
    }
  }
}];

// ---- Endpoint principal de chat ----
app.post('/api/chat', async (req, res) => {
  try {
    const {
      message,
      reset
    } = req.body;

    if (!GROQ_API_KEY) {
      return res.status(500).json({
        error: 'Falta configurar GROQ_API_KEY en las variables de entorno del servidor.'
      });
    }

    if (reset) {
      conversationHistory = [];
    }

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        error: 'Falta el campo "message" (texto).'
      });
    }

    conversationHistory.push({
      role: 'user',
      content: message
    });

    if (conversationHistory.length > 40) {
      conversationHistory = conversationHistory.slice(-40);
    }

    let messages = [{
        role: 'system',
        content: SYSTEM_PROMPT
      },
      ...conversationHistory
    ];

    // Primera llamada: el modelo decide si necesita buscar en internet
    let response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: 1024,
        messages,
        tools,
        tool_choice: 'auto'
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Error de Groq API:', errText);
      return res.status(502).json({
        error: 'Error al conectar con la API de Groq.'
      });
    }

    let data = await response.json();
    let choice = data.choices?. [0];
    let toolCalls = choice?.message?.tool_calls;

    // Si el modelo pidió usar la herramienta de búsqueda
    if (toolCalls && toolCalls.length > 0) {
      messages.push(choice.message);

      for (const call of toolCalls) {
        if (call.function.name === 'buscar_en_internet') {
          const args = JSON.parse(call.function.arguments || '{}');
          const resultado = await buscarEnInternet(args.query || message);
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: resultado
          });
        }
      }

      // Segunda llamada: el modelo redacta la respuesta final usando los resultados
      response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          max_tokens: 1024,
          messages
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('Error de Groq API (segunda llamada):', errText);
        return res.status(502).json({
          error: 'Error al conectar con la API de Groq.'
        });
      }

      data = await response.json();
      choice = data.choices?. [0];
    }

    const reply = choice?.message?.content || '(Sin respuesta de texto)';
    conversationHistory.push({
      role: 'assistant',
      content: reply
    });

    res.json({
      reply
    });
  } catch (err) {
    console.error('Error en /api/chat:', err);
    res.status(500).json({
      error: 'Error interno del servidor.'
    });
  }
});

// ---- Endpoint de voz: convierte texto a audio con ElevenLabs ----
app.post('/api/tts', async (req, res) => {
  try {
    const {
      text
    } = req.body;

    if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
      return res.status(500).json({
        error: 'Falta configurar ElevenLabs (API key o Voice ID).'
      });
    }
    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        error: 'Falta el campo "text".'
      });
    }

    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
          }
        })
      }
    );

    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      console.error('Error de ElevenLabs:', errText);
      return res.status(502).json({
        error: 'Error al generar la voz.'
      });
    }

    const audioBuffer = await ttsRes.arrayBuffer();
    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(audioBuffer));
  } catch (err) {
    console.error('Error en /api/tts:', err);
    res.status(500).json({
      error: 'Error interno del servidor al generar voz.'
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: !!GROQ_API_KEY,
    hasSearch: !!TAVILY_API_KEY,
    hasVoice: !!(ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID)
  });
});

// ---- WebSocket: puente para un futuro agente local (control de PC) ----
const wss = new WebSocket.Server({
  server,
  path: '/agent'
});
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

app.post('/api/agent-command', (req, res) => {
  if (!localAgentSocket) {
    return res.status(503).json({
      error: 'No hay agente local conectado.'
    });
  }
  localAgentSocket.send(JSON.stringify(req.body));
  res.json({
    status: 'comando enviado'
  });
});

server.listen(PORT, () => {
  console.log(`🤖 JARVIS backend corriendo en el puerto ${PORT}`);
});