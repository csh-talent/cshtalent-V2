/* ═══════════════════════════════════════════════════════════════
   CSH TALENT — Autenticación (componente reutilizable)
   Incluir con una sola línea en cualquier página del ecosistema:
   <script src="csh-auth.js"></script>
   (después de @supabase/supabase-js, antes o después de assistant.js)

   Uso desde cualquier botón/herramienta que requiera sesión:

     window.CSHAuth.requireAuth(function (user) {
       // esta función solo se ejecuta si hay sesión activa;
       // si no la hay, primero se abre el modal y se ejecuta
       // automáticamente al autenticarse.
     });

   Solo Magic Link está activo en esta primera versión. Google y
   Microsoft están listados en AUTH_PROVIDERS con enabled:false —
   activarlos más adelante es cambiar ese flag y agregar el botón
   correspondiente, no reconstruir el modal.

   Limitación conocida: si el enlace mágico se abre en la misma
   pestaña, el navegador recarga la página al volver, por lo que la
   acción pendiente (ej. "enviar este mensaje al Asistente CSH") no
   se reanuda automáticamente tras ese reload — el usuario sí queda
   autenticado, pero deberá repetir la acción una vez. Si se abre en
   otra pestaña, la pestaña original si retoma la acción sin reload.
   ═══════════════════════════════════════════════════════════════ */
(function () {

  const AUTH_PROVIDERS = {
    magicLink: { enabled: true },
    google: { enabled: false },
    microsoft: { enabled: false }
  };

  let pendingCallback = null;
  let built = false;

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .csh-auth-overlay {
        position: fixed; inset: 0; z-index: 3000;
        background: rgba(17,24,39,0.55); backdrop-filter: blur(3px);
        display: flex; align-items: center; justify-content: center;
        opacity: 0; pointer-events: none; transition: opacity 0.2s ease;
        font-family: 'Raleway', sans-serif; padding: 1.5rem;
      }
      .csh-auth-overlay.open { opacity: 1; pointer-events: auto; }
      .csh-auth-card {
        width: 100%; max-width: 380px; background: var(--white, #fff);
        border-radius: 20px; box-shadow: 0 24px 70px rgba(17,24,39,0.28);
        overflow: hidden; transform: translateY(10px) scale(0.98);
        transition: transform 0.2s ease;
      }
      .csh-auth-overlay.open .csh-auth-card { transform: translateY(0) scale(1); }
      .csh-auth-head {
        background: var(--petrol-dark, #1e3340); color: white; padding: 1.5rem 1.5rem 1.25rem;
        position: relative;
      }
      .csh-auth-close {
        position: absolute; top: 12px; right: 14px; background: none; border: none;
        color: rgba(255,255,255,0.55); font-size: 1.1rem; cursor: pointer; padding: 4px;
      }
      .csh-auth-close:hover { color: white; }
      .csh-auth-title { font-size: 1.05rem; font-weight: 800; }
      .csh-auth-sub { font-size: 0.78rem; color: rgba(255,255,255,0.6); margin-top: 4px; }
      .csh-auth-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 0.9rem; }
      .csh-auth-input {
        width: 100%; border: 1.5px solid var(--border, #e5e7eb); border-radius: 10px;
        padding: 0.7rem 0.9rem; font-family: 'Raleway', sans-serif; font-size: 0.85rem; outline: none;
      }
      .csh-auth-input:focus { border-color: var(--petrol, #2F4E5F); }
      .csh-auth-btn {
        width: 100%; border: none; border-radius: 10px; padding: 0.75rem; cursor: pointer;
        font-family: 'Raleway', sans-serif; font-size: 0.82rem; font-weight: 700; letter-spacing: 0.02em;
        background: var(--coral, #E87B6F); color: white; transition: background 0.2s;
      }
      .csh-auth-btn:hover { background: var(--coral-deep, #d26359); }
      .csh-auth-btn:disabled { opacity: 0.6; cursor: default; }
      .csh-auth-status { font-size: 0.78rem; line-height: 1.5; text-align: center; }
      .csh-auth-status.error { color: var(--brand-red, #b5404a); }
      .csh-auth-status.ok { color: var(--petrol, #2F4E5F); }
      .csh-auth-note { font-size: 0.68rem; color: var(--muted, #6b7280); text-align: center; margin-top: 0.2rem; }
    `;
    document.head.appendChild(style);
  }

  function injectMarkup() {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="csh-auth-overlay" id="cshAuthOverlay">
        <div class="csh-auth-card">
          <div class="csh-auth-head">
            <button class="csh-auth-close" id="cshAuthClose" aria-label="Cerrar">✕</button>
            <div class="csh-auth-title">Crea tu cuenta CSH Talent</div>
            <div class="csh-auth-sub">Una sola cuenta para todo el ecosistema — sin contraseñas.</div>
          </div>
          <div class="csh-auth-body">
            <input type="email" class="csh-auth-input" id="cshAuthEmail" placeholder="tu@correo.com" autocomplete="email">
            <button class="csh-auth-btn" id="cshAuthSubmit">Continuar con correo</button>
            <div class="csh-auth-status" id="cshAuthStatus"></div>
            <div class="csh-auth-note">Próximamente también podrás continuar con Google y Microsoft.</div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
  }

  function ensureBuilt() {
    if (built) return;
    injectStyles();
    injectMarkup();
    wireEvents();
    built = true;
  }

  function setStatus(msg, kind) {
    const el = document.getElementById('cshAuthStatus');
    el.textContent = msg || '';
    el.className = 'csh-auth-status' + (kind ? ' ' + kind : '');
  }

  function openModal() {
    ensureBuilt();
    setStatus('', '');
    document.getElementById('cshAuthEmail').value = '';
    document.getElementById('cshAuthOverlay').classList.add('open');
  }

  function closeModal() {
    if (!built) return;
    document.getElementById('cshAuthOverlay').classList.remove('open');
  }

  async function handleSubmit() {
    const emailInput = document.getElementById('cshAuthEmail');
    const email = emailInput.value.trim();
    if (!email || !email.includes('@')) {
      setStatus('Escribe un correo válido.', 'error');
      return;
    }
    const btn = document.getElementById('cshAuthSubmit');
    btn.disabled = true;
    setStatus('Enviando enlace...', '');
    try {
      const client = window.getCSHSupabaseClient();
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.href }
      });
      if (error) {
        setStatus(error.message, 'error');
      } else {
        setStatus('Listo. Revisa tu correo (' + email + ') y haz clic en el enlace para continuar.', 'ok');
      }
    } catch (e) {
      setStatus('No pudimos enviar el enlace. Intenta de nuevo.', 'error');
    }
    btn.disabled = false;
  }

  function wireEvents() {
    document.getElementById('cshAuthClose').addEventListener('click', closeModal);
    document.getElementById('cshAuthOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'cshAuthOverlay') closeModal();
    });
    document.getElementById('cshAuthSubmit').addEventListener('click', handleSubmit);
    document.getElementById('cshAuthEmail').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSubmit();
    });
  }

  window.CSHAuth = {
    providers: AUTH_PROVIDERS,
    open: openModal,
    close: closeModal,
    requireAuth: async function (onSuccess) {
      try {
        const client = window.getCSHSupabaseClient();
        const { data: { user } } = await client.auth.getUser();
        if (user) {
          onSuccess(user);
          return;
        }
      } catch (e) { /* sin sesión */ }
      pendingCallback = onSuccess;
      openModal();
    }
  };

  function watchAuthState() {
    const client = window.getCSHSupabaseClient();
    client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        closeModal();
        if (pendingCallback) {
          const cb = pendingCallback;
          pendingCallback = null;
          cb(session.user);
        }
      }
    });
  }
  document.addEventListener('DOMContentLoaded', watchAuthState);
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(watchAuthState, 0);
  }

})();
