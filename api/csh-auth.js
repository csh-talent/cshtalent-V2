/* ═══════════════════════════════════════════════════════════════
   CSH TALENT — Autenticación (componente reutilizable)
   Incluir con una sola línea en cualquier página del ecosistema:
   <script src="csh-auth.js"></script>
   (después de @supabase/supabase-js, antes o después de assistant.js)

   Uso desde cualquier botón/herramienta que requiera sesión:

     window.CSHAuth.requireAuth(function (user) {
       // esta función solo se ejecuta si hay sesión activa;
       // si no la hay, primero se abre el modal (registro o login)
       // y se ejecuta automáticamente al autenticarse.
     });

   Experiencia principal: correo + contraseña (registro y login).
   - Registro pide nombre completo (obligatorio, para personalizar
     saludos como "Hola, Carolina" en vez del correo).
   - Login: correo + contraseña, con "¿Olvidaste tu contraseña?"
     usando el flujo de recuperación nativo de Supabase.
   - Google y Microsoft siguen listados en AUTH_PROVIDERS con
     enabled:false — activarlos es un flag, no una reconstrucción.
   - Magic Link se conserva internamente (sendMagicLinkFallback,
     no conectado a ningún botón visible) por si se necesita más
     adelante como mecanismo alterno.

   Nota: si tu proyecto de Supabase tiene activado "Confirm email"
   (Authentication → Providers → Email), un usuario nuevo deberá
   confirmar su correo antes de tener sesión activa; este componente
   detecta ambos casos (sesión inmediata o confirmación pendiente)
   y muestra el mensaje correspondiente automáticamente.
   ═══════════════════════════════════════════════════════════════ */
(function () {

  const AUTH_PROVIDERS = {
    emailPassword: { enabled: true },
    magicLink: { enabled: false }, // conservado internamente, sin UI
    google: { enabled: false },
    microsoft: { enabled: false }
  };

  let pendingCallback = null;
  let built = false;
  let currentView = 'signup';

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
        width: 100%; max-width: 400px; max-height: calc(100vh - 3rem); overflow-y: auto;
        background: var(--white, #fff);
        border-radius: 20px; box-shadow: 0 24px 70px rgba(17,24,39,0.28);
        transform: translateY(10px) scale(0.98);
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
      .csh-auth-sub { font-size: 0.78rem; color: rgba(255,255,255,0.6); margin-top: 4px; line-height: 1.5; }
      .csh-auth-body { padding: 1.5rem; }
      .csh-auth-view { display: none; flex-direction: column; gap: 0.85rem; }
      .csh-auth-view.active { display: flex; }
      .csh-auth-label { font-size: 0.72rem; font-weight: 700; color: var(--muted, #6b7280); letter-spacing: 0.03em; text-transform: uppercase; margin-bottom: -0.4rem; }
      .csh-auth-input {
        width: 100%; border: 1.5px solid var(--border, #e5e7eb); border-radius: 10px;
        padding: 0.7rem 0.9rem; font-family: 'Raleway', sans-serif; font-size: 0.85rem; outline: none;
      }
      .csh-auth-input:focus { border-color: var(--petrol, #2F4E5F); }
      .csh-auth-check-row { display: flex; align-items: flex-start; gap: 0.55rem; font-size: 0.74rem; color: var(--muted, #6b7280); line-height: 1.5; }
      .csh-auth-check-row input { margin-top: 3px; flex-shrink: 0; }
      .csh-auth-check-row a { color: var(--petrol, #2F4E5F); font-weight: 600; text-decoration: none; }
      .csh-auth-check-row a:hover { text-decoration: underline; }
      .csh-auth-forgot { align-self: flex-end; font-size: 0.74rem; color: var(--petrol, #2F4E5F); cursor: pointer; font-weight: 600; margin-top: -0.4rem; }
      .csh-auth-forgot:hover { text-decoration: underline; }
      .csh-auth-btn {
        width: 100%; border: none; border-radius: 10px; padding: 0.75rem; cursor: pointer;
        font-family: 'Raleway', sans-serif; font-size: 0.82rem; font-weight: 700; letter-spacing: 0.02em;
        background: var(--coral, #E87B6F); color: white; transition: background 0.2s;
      }
      .csh-auth-btn:hover { background: var(--coral-deep, #d26359); }
      .csh-auth-btn:disabled { opacity: 0.6; cursor: default; }
      .csh-auth-status { font-size: 0.78rem; line-height: 1.5; text-align: center; min-height: 1px; }
      .csh-auth-status.error { color: var(--brand-red, #b5404a); }
      .csh-auth-status.ok { color: var(--petrol, #2F4E5F); }
      .csh-auth-callout {
        display: flex; flex-direction: column; align-items: center; gap: 0.6rem;
        text-align: center; padding: 1.5rem 1.25rem; border-radius: 16px;
        background: var(--petrol-pale, #e6ecef); border: 1.5px solid var(--petrol, #2F4E5F);
      }
      .csh-auth-callout-icon {
        width: 44px; height: 44px; border-radius: 50%; background: var(--petrol, #2F4E5F);
        display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      }
      .csh-auth-callout-title { font-size: 0.95rem; font-weight: 800; color: var(--petrol-dark, #1e3340); }
      .csh-auth-callout-text { font-size: 0.82rem; color: var(--text, #1f2937); line-height: 1.6; }
      .csh-auth-callout-text strong { color: var(--petrol-dark, #1e3340); }
      .csh-auth-switch { font-size: 0.78rem; text-align: center; color: var(--muted, #6b7280); }
      .csh-auth-switch a { color: var(--petrol, #2F4E5F); font-weight: 700; text-decoration: none; cursor: pointer; }
      .csh-auth-switch a:hover { text-decoration: underline; }
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
            <div class="csh-auth-title" id="cshAuthTitle">Crea tu cuenta en CSH Talent</div>
            <div class="csh-auth-sub" id="cshAuthSub">Una sola cuenta para todo el ecosistema: empresas, profesionales y trabajadores.</div>
          </div>
          <div class="csh-auth-body">

            <!-- CREAR CUENTA -->
            <div class="csh-auth-view active" id="cshAuthViewSignup">
              <div id="cshAuthSignupForm" style="display:flex; flex-direction:column; gap:0.85rem;">
                <div class="csh-auth-label">Nombre completo</div>
                <input type="text" class="csh-auth-input" id="cshAuthSignupName" placeholder="Ej. Carolina Salazar" autocomplete="name">
                <div class="csh-auth-label">Correo electrónico</div>
                <input type="email" class="csh-auth-input" id="cshAuthSignupEmail" name="email" placeholder="tu@correo.com" autocomplete="email">
                <div class="csh-auth-label">Contraseña</div>
                <input type="password" class="csh-auth-input" id="cshAuthSignupPassword" name="new-password" placeholder="Mínimo 8 caracteres" autocomplete="new-password">
                <div class="csh-auth-label">Confirmar contraseña</div>
                <input type="password" class="csh-auth-input" id="cshAuthSignupPassword2" name="new-password-confirm" placeholder="Repite tu contraseña" autocomplete="new-password">
                <label class="csh-auth-check-row">
                  <input type="checkbox" id="cshAuthAcceptTerms">
                  <span>Acepto los <a href="terminos-condiciones.html" target="_blank">Términos y Condiciones</a> y la <a href="politica-privacidad.html" target="_blank">Política de Privacidad</a> de CSH Talent.</span>
                </label>
                <button class="csh-auth-btn" id="cshAuthSignupSubmit">Crear mi cuenta</button>
                <div class="csh-auth-status" id="cshAuthStatusSignup"></div>
                <div class="csh-auth-switch">¿Ya tienes cuenta? <a id="cshAuthGoLogin">Inicia sesión</a></div>
              </div>
              <div class="csh-auth-callout" id="cshAuthSignupSuccess" style="display:none;">
                <div class="csh-auth-callout-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z" opacity="0"/><path d="M22 6l-10 7L2 6"/><rect x="2" y="4" width="20" height="16" rx="2"/></svg>
                </div>
                <div class="csh-auth-callout-title">Revisa tu correo</div>
                <div class="csh-auth-callout-text" id="cshAuthSignupSuccessText"></div>
                <div class="csh-auth-switch" style="margin-top:0.4rem;">¿Ya confirmaste? <a id="cshAuthGoLoginFromSuccess">Inicia sesión</a></div>
              </div>
            </div>


            <!-- INICIAR SESIÓN -->
            <div class="csh-auth-view" id="cshAuthViewLogin">
              <div class="csh-auth-label">Correo electrónico</div>
              <input type="email" class="csh-auth-input" id="cshAuthLoginEmail" name="email" placeholder="tu@correo.com" autocomplete="email">
              <div class="csh-auth-label">Contraseña</div>
              <input type="password" class="csh-auth-input" id="cshAuthLoginPassword" name="current-password" placeholder="Tu contraseña" autocomplete="current-password">
              <div class="csh-auth-forgot" id="cshAuthGoForgot">¿Olvidaste tu contraseña?</div>
              <button class="csh-auth-btn" id="cshAuthLoginSubmit">Iniciar sesión</button>
              <div class="csh-auth-status" id="cshAuthStatusLogin"></div>
              <div class="csh-auth-switch">¿No tienes cuenta? <a id="cshAuthGoSignup">Crea una gratis</a></div>
            </div>

            <!-- OLVIDÉ MI CONTRASEÑA -->
            <div class="csh-auth-view" id="cshAuthViewForgot">
              <div class="csh-auth-label">Correo electrónico</div>
              <input type="email" class="csh-auth-input" id="cshAuthForgotEmail" placeholder="tu@correo.com" autocomplete="email">
              <button class="csh-auth-btn" id="cshAuthForgotSubmit">Enviar enlace de recuperación</button>
              <div class="csh-auth-status" id="cshAuthStatusForgot"></div>
              <div class="csh-auth-switch"><a id="cshAuthBackToLogin">Volver a iniciar sesión</a></div>
            </div>

            <!-- NUEVA CONTRASEÑA (llega desde el enlace de recuperación) -->
            <div class="csh-auth-view" id="cshAuthViewReset">
              <div class="csh-auth-label">Nueva contraseña</div>
              <input type="password" class="csh-auth-input" id="cshAuthResetPassword" name="new-password" placeholder="Mínimo 8 caracteres" autocomplete="new-password">
              <div class="csh-auth-label">Confirmar nueva contraseña</div>
              <input type="password" class="csh-auth-input" id="cshAuthResetPassword2" name="new-password-confirm" placeholder="Repite la contraseña" autocomplete="new-password">
              <button class="csh-auth-btn" id="cshAuthResetSubmit">Guardar nueva contraseña</button>
              <div class="csh-auth-status" id="cshAuthStatusReset"></div>
            </div>

          </div>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
  }

  const VIEW_COPY = {
    signup: { title: 'Crea tu cuenta en CSH Talent', sub: 'Una sola cuenta para todo el ecosistema: empresas, profesionales y trabajadores.' },
    login: { title: 'Inicia sesión en CSH Talent', sub: 'Accede con tu correo y tu contraseña.' },
    forgot: { title: 'Recupera tu contraseña', sub: 'Te enviaremos un enlace a tu correo para crear una nueva.' },
    reset: { title: 'Crea una nueva contraseña', sub: 'Ya casi terminas — define la contraseña con la que vas a acceder de ahora en adelante.' }
  };

  function setView(view) {
    currentView = view;
    document.querySelectorAll('.csh-auth-view').forEach(v => v.classList.remove('active'));
    const map = { signup: 'cshAuthViewSignup', login: 'cshAuthViewLogin', forgot: 'cshAuthViewForgot', reset: 'cshAuthViewReset' };
    document.getElementById(map[view]).classList.add('active');
    document.getElementById('cshAuthTitle').textContent = VIEW_COPY[view].title;
    document.getElementById('cshAuthSub').textContent = VIEW_COPY[view].sub;
  }

  function ensureBuilt() {
    if (built) return;
    injectStyles();
    injectMarkup();
    wireEvents();
    built = true;
  }

  function setStatus(elId, msg, kind) {
    const el = document.getElementById(elId);
    el.textContent = msg || '';
    el.className = 'csh-auth-status' + (kind ? ' ' + kind : '');
  }

  function limpiarCampos() {
    const ids = [
      'cshAuthSignupEmail', 'cshAuthSignupPassword', 'cshAuthSignupPassword2',
      'cshAuthLoginEmail', 'cshAuthLoginPassword',
      'cshAuthForgotEmail',
      'cshAuthResetPassword', 'cshAuthResetPassword2'
    ];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  }

  function openModal(view) {
    ensureBuilt();
    setView(view || 'signup');
    document.getElementById('cshAuthSignupForm').style.display = 'flex';
    document.getElementById('cshAuthSignupSuccess').style.display = 'none';
    document.getElementById('cshAuthOverlay').classList.add('open');
    limpiarCampos();
    // Chrome a veces autocompleta después de que el modal ya se muestra —
    // lo volvemos a limpiar un instante después, por si acaso.
    setTimeout(limpiarCampos, 60);
  }

  function closeModal() {
    if (!built) return;
    document.getElementById('cshAuthOverlay').classList.remove('open');
  }

  function resolvePending(user) {
    closeModal();
    if (pendingCallback) {
      const cb = pendingCallback;
      pendingCallback = null;
      cb(user);
    }
  }

  function showSignupSuccess(email) {
    document.getElementById('cshAuthSignupForm').style.display = 'none';
    document.getElementById('cshAuthSignupSuccessText').innerHTML =
      'Creamos tu cuenta. Te enviamos un enlace a <strong>' + email + '</strong> — ábrelo para confirmarla antes de iniciar sesión.';
    document.getElementById('cshAuthSignupSuccess').style.display = 'flex';
  }

  async function handleSignup() {
    const fullName = document.getElementById('cshAuthSignupName').value.trim();
    const email = document.getElementById('cshAuthSignupEmail').value.trim();
    const password = document.getElementById('cshAuthSignupPassword').value;
    const password2 = document.getElementById('cshAuthSignupPassword2').value;
    const accepted = document.getElementById('cshAuthAcceptTerms').checked;

    if (!fullName) return setStatus('cshAuthStatusSignup', 'Escribe tu nombre completo.', 'error');
    if (!email || !email.includes('@')) return setStatus('cshAuthStatusSignup', 'Escribe un correo válido.', 'error');
    if (password.length < 8) return setStatus('cshAuthStatusSignup', 'La contraseña debe tener al menos 8 caracteres.', 'error');
    if (password !== password2) return setStatus('cshAuthStatusSignup', 'Las contraseñas no coinciden.', 'error');
    if (!accepted) return setStatus('cshAuthStatusSignup', 'Debes aceptar los Términos y la Política de Privacidad.', 'error');

    const btn = document.getElementById('cshAuthSignupSubmit');
    btn.disabled = true;
    setStatus('cshAuthStatusSignup', 'Creando tu cuenta...', '');
    try {
      const client = window.getCSHSupabaseClient();
      const { data, error } = await client.auth.signUp({
        email, password,
        options: { data: { full_name: fullName } }
      });
      if (error) {
        setStatus('cshAuthStatusSignup', error.message, 'error');
      } else if (data.session) {
        resolvePending(data.user);
      } else {
        showSignupSuccess(email);
      }
    } catch (e) {
      setStatus('cshAuthStatusSignup', 'No pudimos crear tu cuenta. Intenta de nuevo.', 'error');
    }
    btn.disabled = false;
  }

  async function handleLogin() {
    const email = document.getElementById('cshAuthLoginEmail').value.trim();
    const password = document.getElementById('cshAuthLoginPassword').value;
    if (!email || !password) return setStatus('cshAuthStatusLogin', 'Escribe tu correo y tu contraseña.', 'error');

    const btn = document.getElementById('cshAuthLoginSubmit');
    btn.disabled = true;
    setStatus('cshAuthStatusLogin', 'Verificando...', '');
    try {
      const client = window.getCSHSupabaseClient();
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        setStatus('cshAuthStatusLogin', 'Correo o contraseña incorrectos.', 'error');
      } else {
        resolvePending(data.user);
      }
    } catch (e) {
      setStatus('cshAuthStatusLogin', 'No pudimos iniciar sesión. Intenta de nuevo.', 'error');
    }
    btn.disabled = false;
  }

  async function handleForgot() {
    const email = document.getElementById('cshAuthForgotEmail').value.trim();
    if (!email || !email.includes('@')) return setStatus('cshAuthStatusForgot', 'Escribe un correo válido.', 'error');

    const btn = document.getElementById('cshAuthForgotSubmit');
    btn.disabled = true;
    setStatus('cshAuthStatusForgot', 'Enviando...', '');
    try {
      const client = window.getCSHSupabaseClient();
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.href
      });
      if (error) {
        setStatus('cshAuthStatusForgot', error.message, 'error');
      } else {
        setStatus('cshAuthStatusForgot', 'Listo. Revisa tu correo (' + email + ') y sigue el enlace para crear una nueva contraseña.', 'ok');
      }
    } catch (e) {
      setStatus('cshAuthStatusForgot', 'No pudimos enviar el enlace. Intenta de nuevo.', 'error');
    }
    btn.disabled = false;
  }

  async function handleReset() {
    const p1 = document.getElementById('cshAuthResetPassword').value;
    const p2 = document.getElementById('cshAuthResetPassword2').value;
    if (p1.length < 8) return setStatus('cshAuthStatusReset', 'La contraseña debe tener al menos 8 caracteres.', 'error');
    if (p1 !== p2) return setStatus('cshAuthStatusReset', 'Las contraseñas no coinciden.', 'error');

    const btn = document.getElementById('cshAuthResetSubmit');
    btn.disabled = true;
    setStatus('cshAuthStatusReset', 'Guardando...', '');
    try {
      const client = window.getCSHSupabaseClient();
      const { data, error } = await client.auth.updateUser({ password: p1 });
      if (error) {
        setStatus('cshAuthStatusReset', error.message, 'error');
      } else {
        setStatus('cshAuthStatusReset', 'Contraseña actualizada correctamente.', 'ok');
        setTimeout(() => resolvePending(data.user), 900);
      }
    } catch (e) {
      setStatus('cshAuthStatusReset', 'No pudimos actualizar tu contraseña. Intenta de nuevo.', 'error');
    }
    btn.disabled = false;
  }

  /* Conservado internamente (sin botón visible) para uso futuro,
     tal como se pidió: puede reactivarse como método alterno. */
  async function sendMagicLinkFallback(email) {
    const client = window.getCSHSupabaseClient();
    return client.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href } });
  }

  function wireEvents() {
    document.getElementById('cshAuthClose').addEventListener('click', closeModal);
    document.getElementById('cshAuthOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'cshAuthOverlay') closeModal();
    });

    document.getElementById('cshAuthSignupSubmit').addEventListener('click', handleSignup);
    document.getElementById('cshAuthLoginSubmit').addEventListener('click', handleLogin);
    document.getElementById('cshAuthForgotSubmit').addEventListener('click', handleForgot);
    document.getElementById('cshAuthResetSubmit').addEventListener('click', handleReset);

    document.getElementById('cshAuthGoLogin').addEventListener('click', () => setView('login'));
    document.getElementById('cshAuthGoLoginFromSuccess').addEventListener('click', () => setView('login'));
    document.getElementById('cshAuthGoSignup').addEventListener('click', () => setView('signup'));
    document.getElementById('cshAuthGoForgot').addEventListener('click', () => setView('forgot'));
    document.getElementById('cshAuthBackToLogin').addEventListener('click', () => setView('login'));

    ['cshAuthSignupPassword2', 'cshAuthSignupEmail', 'cshAuthSignupName'].forEach(id => {
      document.getElementById(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSignup(); });
    });
    document.getElementById('cshAuthLoginPassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleLogin(); });
    document.getElementById('cshAuthForgotEmail').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleForgot(); });
    document.getElementById('cshAuthResetPassword2').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleReset(); });
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
      openModal('signup');
    }
  };

  function actualizarNavTrasLogin(user) {
    const navRight = document.getElementById('navRight');
    if (!navRight || !user) return;
    const name = (user.user_metadata?.full_name || user.email.split('@')[0]).split(' ')[0];
    navRight.innerHTML = `
      <span style="font-size:.78rem;color:var(--muted);">Hola, ${name}</span>
      <a href="mi-espacio.html" class="btn-nav" style="background:var(--petrol, #2F4E5F);">Mi Espacio</a>
      <button onclick="(async()=>{await window.getCSHSupabaseClient().auth.signOut();window.location.reload();})()" class="btn-nav coral" style="cursor:pointer;">Salir</button>`;
  }

  function watchAuthState() {
    const client = window.getCSHSupabaseClient();
    client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        ensureBuilt();
        openModal('reset');
      }
      if (event === 'SIGNED_IN' && session?.user && currentView !== 'reset') {
        actualizarNavTrasLogin(session.user);
        resolvePending(session.user);
      }
    });
  }
  document.addEventListener('DOMContentLoaded', watchAuthState);
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(watchAuthState, 0);
  }

})();
