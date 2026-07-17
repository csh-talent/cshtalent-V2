/* ═══════════════════════════════════════════════════════════════
   CSH TALENT — Asistente CSH (componente reutilizable)
   Incluir con una sola línea en cualquier página del ecosistema:
   <script src="assistant.js"></script>
   (debe cargarse DESPUÉS del script de @supabase/supabase-js)

   Identidad: "Asistente CSH" — nombre oficial en toda la plataforma.
   Pertenece a todo el ecosistema CSH Talent, no a una página aislada.

   Arquitectura:
   - window.getCSHSupabaseClient() → cliente Supabase compartido,
     para que ninguna página tenga que crear su propio cliente.
   - detectPage() → reconoce automáticamente en qué puerta está el
     usuario (home / empresas / profesionales / trabajadores) leyendo
     la URL, sin necesidad de tocar el HTML de cada página.
   - window.CSHAssistantConfig → identidad, especialización, regla de
     oro sobre fuentes oficiales y prioridades por página. Es el
     bloque que se usará como contexto/system prompt cuando se
     conecte la IA real.
   - window.CSHAssistantAPI.getResponse(message, user, config) →
     punto único donde se conectará más adelante la API de IA real.
     Conectado a Claude Haiku 4.5 vía /api/chat (ver carpeta /api).
   - window.CSHAssistant.open()/close() → control externo opcional.

   No implementa cobros ni límites de uso: solo deja la estructura
   preparada para conectarlos más adelante.
   ═══════════════════════════════════════════════════════════════ */
(function () {

  const SUPABASE_URL = 'https://eiauimhrybdamjpntdwh.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_xAJpeRsaWAukGtwoLaYPwg_krPVnKat';

  /* ─── Cliente Supabase compartido (evita instancias duplicadas) ─── */
  window.getCSHSupabaseClient = function () {
    if (!window.__cshSupabaseClient) {
      window.__cshSupabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
    return window.__cshSupabaseClient;
  };

  /* ─── Reconocimiento automático de la página/puerta actual ─── */
  function detectPage() {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('empresas')) return 'empresas';
    if (path.includes('profesionales')) return 'profesionales';
    if (path.includes('trabajadores')) return 'trabajadores';
    return 'home';
  }
  const currentPage = detectPage();

  /* Prioridad de herramientas según la puerta, sin dejar de conocer
     el resto del ecosistema (regla: "sin importar la página, el
     asistente debe conocer TODO el ecosistema CSH Talent"). */
  const PAGE_PRIORITY = {
    empresas: 'simuladores, diagnósticos (como el Diagnóstico CIMA®) y herramientas de gestión para empresas',
    profesionales: 'cursos, metodologías, indicadores y plantillas para profesionales de Gestión Humana',
    trabajadores: 'calculadoras, simuladores y orientación laboral para trabajadores',
    home: 'todas las herramientas disponibles en el ecosistema CSH Talent'
  };

  /* ─── Configuración e identidad del Asistente CSH ───
     Este objeto es el que se usará como contexto/system prompt
     cuando se conecte la API de IA real. Por ahora solo describe
     el comportamiento esperado; no ejecuta ninguna lógica de IA. */
  window.CSHAssistantConfig = {
    name: 'Asistente CSH',
    scope: 'Todo el ecosistema CSH Talent (Empresas, Profesionales GH, Trabajadores y futuras herramientas), no una página aislada.',
    currentPage: currentPage,
    pagePriority: PAGE_PRIORITY[currentPage],
    specialties: [
      'Legislación laboral colombiana',
      'Gestión Humana',
      'Nómina',
      'Compensación y beneficios',
      'Seguridad Social',
      'Administración de personal',
      'Procesos de talento humano',
      'Uso de las herramientas de CSH Talent'
    ],
    goldenRule: 'Nunca inventar información jurídica ni responder con suposiciones. Toda respuesta que dependa de la legislación laboral colombiana debe fundamentarse únicamente en fuentes oficiales. Si no hay una fuente oficial suficiente para responder con certeza, debe indicarlo expresamente.',
    officialSources: [
      'Código Sustantivo del Trabajo',
      'Constitución Política de Colombia',
      'Ministerio del Trabajo',
      'Función Pública',
      'UGPP',
      'DIAN (cuando aplique)',
      'Corte Suprema de Justicia',
      'Corte Constitucional',
      'Leyes y decretos vigentes'
    ]
  };

  /* ─── Conexión real con la IA (Claude Haiku 4.5, vía /api/chat) ───
     El endpoint /api/chat es un simple puente seguro hacia la API de
     Anthropic: la API key vive como variable de entorno en Vercel,
     nunca en este archivo ni en el navegador. Aquí solo se arma el
     contexto (system prompt) a partir de CSHAssistantConfig y se
     mantiene la memoria de la conversación en memoria (no persiste
     entre recargas de página todavía — eso llegará con user_workspace). */
  const MODEL_NAME = 'claude-haiku-4-5-20251001';
  const MAX_TOKENS = 1024;
  let conversationHistory = [];

  function buildSystemPrompt(config) {
    return [
      'Eres el ' + config.name + ', el asistente conversacional oficial de CSH Talent.',
      'Alcance: ' + config.scope,
      'Especialidades: ' + config.specialties.join(', ') + '.',
      'La persona está actualmente en la puerta "' + config.currentPage + '" del sitio, así que prioriza cuando sea pertinente: ' + config.pagePriority + '. Sin dejar de conocer y poder recomendar cualquier otra herramienta del ecosistema si aplica.',
      'Regla de oro: ' + config.goldenRule,
      'Fuentes oficiales permitidas para fundamentar temas legales: ' + config.officialSources.join(', ') + '.',
      'Responde siempre en español, de forma clara, cálida y profesional, en el contexto de la legislación laboral colombiana.'
    ].join('\n');
  }

  window.CSHAssistantAPI = window.CSHAssistantAPI || {
    getResponse: async function (message, user, config) {
      conversationHistory.push({ role: 'user', content: message });
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: MODEL_NAME,
            max_tokens: MAX_TOKENS,
            system: buildSystemPrompt(config),
            messages: conversationHistory.slice(-20)
          })
        });
        const data = await res.json();
        if (data.error) {
          return 'No pude procesar tu consulta en este momento (' + (data.error.message || 'error desconocido') + '). Intenta de nuevo en unos segundos.';
        }
        const text = (data.content || [])
          .filter(block => block.type === 'text')
          .map(block => block.text)
          .join('\n');
        conversationHistory.push({ role: 'assistant', content: text });
        return text || 'No pude generar una respuesta. Intenta reformular tu pregunta.';
      } catch (e) {
        return 'No pude conectar con el Asistente CSH en este momento. Revisa tu conexión e intenta de nuevo.';
      }
    }
  };

  const WELCOME_MSG = 'Hola. Soy el Asistente CSH.\nEstoy aquí para ayudarte con legislación laboral colombiana, nómina, compensación, seguridad social y Gestión Humana — y para ayudarte a encontrar ' + PAGE_PRIORITY[currentPage] + ' dentro de CSH Talent.';
  const GATE_MSG = 'Regístrate gratuitamente para utilizar el Asistente CSH.';

  let currentUser = null;
  let isOpen = false;
  let welcomed = false;

  /* ─── Estilos ─── */
  const style = document.createElement('style');
  style.textContent = `
    .csh-a-launcher {
      position: fixed; bottom: 24px; right: 24px; z-index: 2000;
      display: flex; align-items: center; gap: 0.65rem;
    }
    .csh-a-label {
      background: var(--white, #fff); border: 1.5px solid var(--border, #e5e7eb);
      color: var(--petrol-dark, #1e3340); font-family: 'Raleway', sans-serif;
      font-size: 0.8rem; font-weight: 700; letter-spacing: 0.01em;
      padding: 0.6rem 1rem; border-radius: 24px; white-space: nowrap; cursor: pointer;
      box-shadow: 0 6px 22px rgba(17,24,39,0.1);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .csh-a-label:hover { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(17,24,39,0.16); }
    .csh-a-btn {
      position: relative; width: 58px; height: 58px; border-radius: 50%; border: none; cursor: pointer;
      background: var(--petrol-dark, #1e3340);
      box-shadow: 0 8px 28px rgba(30,51,64,0.35);
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .csh-a-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(30,51,64,0.45); }
    .csh-a-btn .csh-a-dot {
      position: absolute; top: 3px; right: 3px; width: 12px; height: 12px; border-radius: 50%;
      background: var(--coral, #E87B6F); border: 2px solid white;
    }
    .csh-a-panel {
      position: fixed; bottom: 96px; right: 24px; z-index: 2000;
      width: 380px; max-width: calc(100vw - 32px); height: 520px; max-height: calc(100vh - 140px);
      background: var(--white, #fff); border: 1.5px solid var(--border, #e5e7eb); border-radius: 20px;
      box-shadow: 0 20px 60px rgba(17,24,39,0.18);
      display: flex; flex-direction: column; overflow: hidden;
      opacity: 0; transform: translateY(16px) scale(0.98); pointer-events: none;
      transition: opacity 0.22s ease, transform 0.22s ease;
      font-family: 'Raleway', sans-serif;
    }
    .csh-a-panel.open { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }
    .csh-a-head {
      background: var(--petrol-dark, #1e3340); color: white; padding: 1rem 1.25rem;
      display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;
    }
    .csh-a-head-title { font-size: 0.88rem; font-weight: 800; letter-spacing: 0.02em; }
    .csh-a-head-sub { font-size: 0.68rem; color: rgba(255,255,255,0.55); margin-top: 2px; }
    .csh-a-close { background: none; border: none; color: rgba(255,255,255,0.6); cursor: pointer; font-size: 1.1rem; line-height: 1; padding: 4px; }
    .csh-a-close:hover { color: white; }
    .csh-a-body {
      flex: 1; overflow-y: auto; padding: 1.1rem; background: var(--surface, #f9fafb);
      display: flex; flex-direction: column; gap: 0.7rem;
    }
    .csh-a-msg { display: flex; gap: 0.5rem; max-width: 88%; }
    .csh-a-msg.user { align-self: flex-end; flex-direction: row-reverse; }
    .csh-a-avatar {
      width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
      background: var(--coral-pale, #fdece9); color: var(--coral-deep, #d26359);
      display: flex; align-items: center; justify-content: center; font-size: 0.6rem; font-weight: 800;
    }
    .csh-a-msg.user .csh-a-avatar { background: var(--petrol-pale, #e6ecef); color: var(--petrol, #2F4E5F); }
    .csh-a-bubble {
      font-size: 0.82rem; line-height: 1.6; padding: 0.65rem 0.9rem; border-radius: 14px;
      white-space: pre-line;
      background: white; border: 1.5px solid var(--border, #e5e7eb); color: var(--text, #1f2937);
    }
    .csh-a-msg.user .csh-a-bubble { background: var(--petrol, #2F4E5F); color: white; border-color: transparent; }
    .csh-a-foot { flex-shrink: 0; padding: 0.8rem; border-top: 1px solid var(--border, #e5e7eb); background: white; display: flex; gap: 0.5rem; }
    .csh-a-input {
      flex: 1; resize: none; border: 1.5px solid var(--border, #e5e7eb); border-radius: 10px;
      padding: 0.6rem 0.8rem; font-family: 'Raleway', sans-serif; font-size: 0.82rem; outline: none;
      max-height: 70px;
    }
    .csh-a-input:focus { border-color: var(--petrol, #2F4E5F); }
    .csh-a-send {
      width: 40px; height: 40px; border-radius: 10px; border: none; cursor: pointer; flex-shrink: 0;
      background: var(--petrol, #2F4E5F); color: white; display: flex; align-items: center; justify-content: center;
      transition: background 0.2s;
    }
    .csh-a-send:hover { background: var(--petrol-soft, #4A90A4); }
    @media (max-width: 560px) {
      .csh-a-panel { right: 12px; left: 12px; width: auto; bottom: 88px; }
      .csh-a-launcher { right: 16px; bottom: 16px; }
      .csh-a-label { font-size: 0.72rem; padding: 0.5rem 0.8rem; }
    }
    @media (max-width: 380px) {
      .csh-a-label { display: none; }
    }
  `;
  document.head.appendChild(style);

  /* ─── Marcado ─── */
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="csh-a-launcher" id="cshAssistantLauncher">
      <span class="csh-a-label" id="cshAssistantLabel">Asistente CSH</span>
      <button class="csh-a-btn" id="cshAssistantBtn" aria-label="Abrir Asistente CSH">
        <span class="csh-a-dot"></span>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
      </button>
    </div>
    <div class="csh-a-panel" id="cshAssistantPanel">
      <div class="csh-a-head">
        <div>
          <div class="csh-a-head-title">Asistente CSH</div>
          <div class="csh-a-head-sub">Legislación laboral colombiana · Gestión Humana</div>
        </div>
        <button class="csh-a-close" id="cshAssistantClose" aria-label="Cerrar">✕</button>
      </div>
      <div class="csh-a-body" id="cshAssistantBody"></div>
      <div class="csh-a-foot">
        <textarea class="csh-a-input" id="cshAssistantInput" rows="1" placeholder="Escribe tu pregunta..."></textarea>
        <button class="csh-a-send" id="cshAssistantSend" aria-label="Enviar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>
  `;
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(wrap));
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    document.body.appendChild(wrap);
  }

  function addMessage(role, text) {
    const body = document.getElementById('cshAssistantBody');
    const row = document.createElement('div');
    row.className = 'csh-a-msg' + (role === 'user' ? ' user' : '');
    row.innerHTML = `<div class="csh-a-avatar">${role === 'user' ? 'Tú' : 'CSH'}</div><div class="csh-a-bubble"></div>`;
    row.querySelector('.csh-a-bubble').textContent = text;
    body.appendChild(row);
    body.scrollTop = body.scrollHeight;
  }

  function openPanel() {
    isOpen = true;
    document.getElementById('cshAssistantPanel').classList.add('open');
    if (!welcomed) {
      addMessage('assistant', WELCOME_MSG);
      welcomed = true;
    }
  }
  function closePanel() {
    isOpen = false;
    document.getElementById('cshAssistantPanel').classList.remove('open');
  }
  window.CSHAssistant = {
    open: openPanel,
    close: closePanel,
    toggle: () => (isOpen ? closePanel() : openPanel())
  };

  async function handleSend() {
    const input = document.getElementById('cshAssistantInput');
    const text = input.value.trim();
    if (!text) return;

    if (!currentUser) {
      input.value = '';
      if (window.CSHAuth) {
        window.CSHAuth.requireAuth(function (user) {
          currentUser = user;
          addMessage('user', text);
          window.CSHAssistantAPI.getResponse(text, currentUser, window.CSHAssistantConfig)
            .then(reply => addMessage('assistant', reply));
        });
      } else {
        addMessage('assistant', GATE_MSG);
      }
      return;
    }

    addMessage('user', text);
    input.value = '';
    const reply = await window.CSHAssistantAPI.getResponse(text, currentUser, window.CSHAssistantConfig);
    addMessage('assistant', reply);
  }

  function wireEvents() {
    document.getElementById('cshAssistantBtn').addEventListener('click', () => window.CSHAssistant.toggle());
    document.getElementById('cshAssistantLabel').addEventListener('click', () => window.CSHAssistant.toggle());
    document.getElementById('cshAssistantClose').addEventListener('click', closePanel);
    document.getElementById('cshAssistantSend').addEventListener('click', handleSend);
    document.getElementById('cshAssistantInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });
  }
  document.addEventListener('DOMContentLoaded', wireEvents);
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(wireEvents, 0);
  }

  /* ─── Estado de autenticación (visitante vs. usuario registrado) ─── */
  async function initAuth() {
    try {
      const client = window.getCSHSupabaseClient();
      const { data: { user } } = await client.auth.getUser();
      currentUser = user || null;
      client.auth.onAuthStateChange((_event, session) => {
        currentUser = session?.user || null;
      });
    } catch (e) {
      currentUser = null;
    }
  }
  initAuth();

})();
