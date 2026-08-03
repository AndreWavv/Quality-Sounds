// ===== Auth (sign up / login, link-based email confirmation) =====
// Password-based signup/login (Premium Auth reference). Email
// confirmation uses Supabase's actual default behavior — a link, not a
// code — after real testing showed the code-based approach depended on
// a dashboard email-template setting ({{ .Token }} on the "Confirm
// signup" template) that wasn't actually configured, so no code was
// ever sent. Auth logs confirmed: signup succeeded, a link-based
// "confirmation" email went out, and clicking it worked correctly.
// Going with what's proven to work rather than a fragile, unverifiable
// dependency.
(function () {
  const modal = document.getElementById('auth-modal');
  if (!modal || !window.qsClient) return;

  const openBtns = document.querySelectorAll('[data-open-auth]');
  const closeBtn = document.getElementById('auth-close');
  const tabLogin = document.getElementById('auth-tab-login');
  const tabSignup = document.getElementById('auth-tab-signup');
  const formLogin = document.getElementById('auth-form-login');
  const formSignup = document.getElementById('auth-form-signup');
  const otpScreen = document.getElementById('auth-otp-screen');
  const authError = document.getElementById('auth-error');
  const otpEmailLabel = document.getElementById('auth-otp-email');
  const otpResendBtn = document.getElementById('auth-otp-resend');
  const pwToggles = document.querySelectorAll('.auth-pw-toggle');

  let pendingSignupEmail = '';

  function openModal() {
    modal.classList.add('visible');
    showLogin();
  }
  function closeModal() {
    modal.classList.remove('visible');
  }
  function showLogin() {
    if (tabLogin) tabLogin.classList.add('active');
    if (tabSignup) tabSignup.classList.remove('active');
    if (formLogin) formLogin.style.display = 'block';
    if (formSignup) formSignup.style.display = 'none';
    if (otpScreen) otpScreen.style.display = 'none';
    hideError();
  }
  function showSignup() {
    if (tabSignup) tabSignup.classList.add('active');
    if (tabLogin) tabLogin.classList.remove('active');
    if (formSignup) formSignup.style.display = 'block';
    if (formLogin) formLogin.style.display = 'none';
    if (otpScreen) otpScreen.style.display = 'none';
    hideError();
  }
  function showCheckEmailScreen(email) {
    pendingSignupEmail = email;
    if (otpEmailLabel) otpEmailLabel.textContent = email;
    if (formLogin) formLogin.style.display = 'none';
    if (formSignup) formSignup.style.display = 'none';
    if (otpScreen) otpScreen.style.display = 'block';
  }
  function showError(msg) {
    if (authError) { authError.textContent = msg; authError.style.display = 'block'; }
  }
  function hideError() {
    if (authError) authError.style.display = 'none';
  }

  openBtns.forEach((btn) => btn.addEventListener('click', () => {
    if (isSignedIn) {
      window.location.href = 'account.html';
    } else {
      openModal();
    }
  }));
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (tabLogin) tabLogin.addEventListener('click', showLogin);
  if (tabSignup) tabSignup.addEventListener('click', showSignup);

  pwToggles.forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const input = document.getElementById(toggle.dataset.for);
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  });

  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideError();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const btn = formLogin.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = 'Signing in...'; }
      const { error } = await window.qsClient.auth.signInWithPassword({ email, password });
      if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
      if (error) {
        showError(error.message);
      } else {
        closeModal();
        window.location.reload();
      }
    });
  }

  if (formSignup) {
    formSignup.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideError();
      const email = document.getElementById('signup-email').value.trim();
      const password = document.getElementById('signup-password').value;
      if (password.length < 6) {
        showError('Password needs to be at least 6 characters.');
        return;
      }
      const btn = formSignup.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = 'Creating account...'; }
      const { error } = await window.qsClient.auth.signUp({ email, password });
      if (btn) { btn.disabled = false; btn.textContent = 'Sign Up'; }
      if (error) {
        showError(error.message);
      } else {
        showCheckEmailScreen(email);
      }
    });
  }

  if (otpResendBtn) {
    otpResendBtn.addEventListener('click', async () => {
      otpResendBtn.disabled = true;
      const original = otpResendBtn.textContent;
      otpResendBtn.textContent = 'Sending...';
      await window.qsClient.auth.resend({ type: 'signup', email: pendingSignupEmail });
      otpResendBtn.textContent = 'Sent!';
      setTimeout(() => {
        otpResendBtn.disabled = false;
        otpResendBtn.textContent = original;
      }, 3000);
    });
  }

  // ===== Reflect signed-in state on any [data-open-auth] trigger =====
  let isSignedIn = false;
  async function reflectAuthState() {
    const { data } = await window.qsClient.auth.getSession();
    isSignedIn = !!(data && data.session);
    document.querySelectorAll('[data-auth-label]').forEach((el) => {
      el.textContent = isSignedIn ? 'Account' : 'Sign In';
    });
  }
  reflectAuthState();
  window.qsClient.auth.onAuthStateChange(() => reflectAuthState());

  const signOutBtns = document.querySelectorAll('[data-sign-out]');
  signOutBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      await window.qsClient.auth.signOut();
      window.location.reload();
    });
  });

})();
