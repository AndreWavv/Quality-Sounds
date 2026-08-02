// ===== Auth (sign up / login + OTP email confirmation) =====
// Combines both reference designs: password-based signup/login (Premium
// Auth), and an OTP code-entry screen (OTP Verify) for confirming a new
// account's email — Supabase supports emailing a 6-digit code instead of
// a magic link for this exact purpose.
//
// IMPORTANT — one manual dashboard step this depends on: Supabase's
// default "Confirm signup" email template needs to actually include
// {{ .Token }} (the 6-digit code) for this OTP screen to have a real
// code to check against. That's an Auth → Email Templates setting in
// the dashboard — not something changeable via the tools available here,
// so it needs to be verified/set by hand before this flow works
// end-to-end. If the default template only has a confirmation link and
// no {{ .Token }}, the code the user receives won't exist, and this
// screen will have nothing correct to verify against.
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
  const otpError = document.getElementById('auth-otp-error');
  const otpEmailLabel = document.getElementById('auth-otp-email');
  const otpInputs = Array.from(document.querySelectorAll('.otp-digit'));
  const otpConfirmBtn = document.getElementById('auth-otp-confirm');
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
  function showOtpScreen(email) {
    pendingSignupEmail = email;
    if (otpEmailLabel) otpEmailLabel.textContent = email;
    if (formLogin) formLogin.style.display = 'none';
    if (formSignup) formSignup.style.display = 'none';
    if (otpScreen) otpScreen.style.display = 'block';
    otpInputs.forEach((inp) => { inp.value = ''; });
    if (otpInputs[0]) otpInputs[0].focus();
  }
  function showError(msg) {
    if (authError) { authError.textContent = msg; authError.style.display = 'block'; }
  }
  function hideError() {
    if (authError) authError.style.display = 'none';
  }
  function showOtpError(msg) {
    if (otpError) { otpError.textContent = msg; otpError.style.display = 'block'; }
  }

  openBtns.forEach((btn) => btn.addEventListener('click', openModal));
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
        showOtpScreen(email);
      }
    });
  }

  // OTP digit boxes — auto-advance to the next box, backspace moves back.
  otpInputs.forEach((input, i) => {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/[^0-9]/g, '').slice(0, 1);
      if (input.value && otpInputs[i + 1]) otpInputs[i + 1].focus();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && otpInputs[i - 1]) otpInputs[i - 1].focus();
    });
  });

  if (otpConfirmBtn) {
    otpConfirmBtn.addEventListener('click', async () => {
      const code = otpInputs.map((inp) => inp.value).join('');
      if (code.length !== otpInputs.length) {
        showOtpError('Enter the full code.');
        return;
      }
      otpConfirmBtn.disabled = true;
      otpConfirmBtn.textContent = 'Verifying...';
      const { error } = await window.qsClient.auth.verifyOtp({
        email: pendingSignupEmail,
        token: code,
        type: 'signup',
      });
      otpConfirmBtn.disabled = false;
      otpConfirmBtn.textContent = 'Verify';
      if (error) {
        showOtpError(error.message);
      } else {
        closeModal();
        window.location.reload();
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
  async function reflectAuthState() {
    const { data } = await window.qsClient.auth.getSession();
    const signedIn = !!(data && data.session);
    document.querySelectorAll('[data-auth-label]').forEach((el) => {
      el.textContent = signedIn ? 'Account' : 'Sign In';
    });
  }
  reflectAuthState();

  const signOutBtns = document.querySelectorAll('[data-sign-out]');
  signOutBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      await window.qsClient.auth.signOut();
      window.location.reload();
    });
  });
})();
