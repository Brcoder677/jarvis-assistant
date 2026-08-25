const chatEl = document.getElementById('chat');
const textInput = document.getElementById('text-input');
const sendBtn = document.getElementById('send-btn');
const micBtn = document.getElementById('mic-btn');
const resetBtn = document.getElementById('reset-btn');
const statusText = document.getElementById('status-text');
const core = document.getElementById('core');

let voiceEnabled = true; // si el navegador soporta síntesis de voz, JARVIS te responderá hablando

// ---- Utilidades de chat ----
function addMessage(text, role) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.textContent = text;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
  return div;
}

function setStatus(text) {
  statusText.textContent = text;
}

// ---- Comunicación con el backend ----
async function sendMessage(message, { reset = false } = {}) {
  if (!message.trim()) return;

  addMessage(message, 'user');
  textInput.value = '';
  setStatus('Procesando...');
  core.classList.add('thinking');

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, reset })
    });

    const data = await res.json();

    if (!res.ok) {
      addMessage(`⚠ ${data.error || 'Error desconocido'}`, 'system');
      setStatus('Error');
      return;
    }

    addMessage(data.reply, 'assistant');
    speak(data.reply);
    setStatus('Sistemas en espera');
  } catch (err) {
    addMessage('⚠ No se pudo conectar con el servidor.', 'system');
    setStatus('Sin conexión');
  } finally {
    core.classList.remove('thinking');
  }
}

sendBtn.addEventListener('click', () => sendMessage(textInput.value));
textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendMessage(textInput.value);
});

resetBtn.addEventListener('click', () => {
  chatEl.innerHTML = '';
  addMessage('Conversación reiniciada.', 'system');
  fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Hola', reset: true })
  }).then(r => r.json()).then(d => {
    if (d.reply) addMessage(d.reply, 'assistant');
  });
});

// ---- Síntesis de voz (JARVIS habla) ----
function speak(text) {
  if (!voiceEnabled || !('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'es-ES';
  utterance.rate = 1.02;
  utterance.pitch = 0.85;
  const voices = speechSynthesis.getVoices();
  const esVoice = voices.find(v => v.lang.startsWith('es'));
  if (esVoice) utterance.voice = esVoice;
  speechSynthesis.speak(utterance);
}

// ---- Reconocimiento de voz (tú hablas) ----
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let listening = false;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = 'es-ES';
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    listening = true;
    micBtn.classList.add('active');
    core.classList.add('listening');
    setStatus('Escuchando...');
  };

  recognition.onend = () => {
    listening = false;
    micBtn.classList.remove('active');
    core.classList.remove('listening');
    setStatus('Sistemas en espera');
  };

  recognition.onerror = (e) => {
    console.error('Error de reconocimiento de voz:', e.error);
    setStatus('Error de micrófono');
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    sendMessage(transcript);
  };

  micBtn.addEventListener('click', () => {
    if (listening) {
      recognition.stop();
    } else {
      recognition.start();
    }
  });
} else {
  micBtn.disabled = true;
  micBtn.title = 'Tu navegador no soporta reconocimiento de voz (usa Chrome)';
}

// Mensaje de bienvenida
addMessage('JARVIS en línea. ¿En qué puedo ayudarte?', 'assistant');
