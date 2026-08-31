// ===== Account dashboard =====
(function () {
  if (!window.qsClient) return;

  const signedOutEl = document.getElementById('account-signed-out');
  const loadingEl = document.getElementById('account-loading');
  const contentEl = document.getElementById('account-content');

  function showOnly(el) {
    [signedOutEl, loadingEl, contentEl].forEach((e) => {
      if (e) e.style.display = e === el ? 'block' : 'none';
    });
  }

  async function checkAccess() {
    showOnly(loadingEl);
    const { data } = await window.qsClient.auth.getSession();
    if (!data || !data.session) {
      showOnly(signedOutEl);
      return;
    }
    showOnly(contentEl);
    populateProfileForm(data.session.user);
    if (window.qsLibrary) {
      window.qsLibrary.refreshFavorites();
      window.qsLibrary.refreshPlaylists();
    }
  }
  checkAccess();
  window.qsClient.auth.onAuthStateChange(() => checkAccess());

  // ===== Tabs =====
  const tabProfile = document.getElementById('account-tab-profile');
  const tabFav = document.getElementById('account-tab-favorites');
  const tabPlaylists = document.getElementById('account-tab-playlists');
  const profilePanel = document.getElementById('account-profile-panel');
  const favPanel = document.getElementById('account-favorites-panel');
  const playlistsPanel = document.getElementById('account-playlists-panel');

  function showPanel(activeTab, activePanel) {
    [tabProfile, tabFav, tabPlaylists].forEach((t) => t && t.classList.toggle('active', t === activeTab));
    [profilePanel, favPanel, playlistsPanel].forEach((p) => { if (p) p.style.display = p === activePanel ? 'block' : 'none'; });
  }
  if (tabProfile) tabProfile.addEventListener('click', () => showPanel(tabProfile, profilePanel));
  if (tabFav) tabFav.addEventListener('click', () => showPanel(tabFav, favPanel));
  if (tabPlaylists) tabPlaylists.addEventListener('click', () => showPanel(tabPlaylists, playlistsPanel));

  // ===== Profile editing (name + email) =====
  // Name is stored in Supabase Auth's own user_metadata (no schema
  // change needed — it's a flexible JSON field already built into
  // auth.users). Email changes go through Supabase's own confirmation
  // flow: the change doesn't actually take effect until the user
  // clicks the link sent to the new address.
  const profileForm = document.getElementById('profile-form');
  const profileNameInput = document.getElementById('profile-name');
  const profileEmailInput = document.getElementById('profile-email');
  const profileStatus = document.getElementById('profile-status');

  function populateProfileForm(user) {
    if (profileNameInput) profileNameInput.value = (user.user_metadata && user.user_metadata.full_name) || '';
    if (profileEmailInput) profileEmailInput.value = user.email || '';
  }

  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = profileForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';
      profileStatus.style.display = 'none';

      const { data: sessionData } = await window.qsClient.auth.getSession();
      const currentUser = sessionData && sessionData.session ? sessionData.session.user : null;
      if (!currentUser) { submitBtn.disabled = false; submitBtn.textContent = 'Save Changes'; return; }

      const newName = profileNameInput.value.trim();
      const newEmail = profileEmailInput.value.trim();
      const emailChanged = newEmail && newEmail !== currentUser.email;

      const updatePayload = { data: { full_name: newName } };
      if (emailChanged) updatePayload.email = newEmail;

      const { error } = await window.qsClient.auth.updateUser(updatePayload);

      submitBtn.disabled = false;
      submitBtn.textContent = 'Save Changes';
      profileStatus.style.display = 'block';
      if (error) {
        profileStatus.textContent = `Couldn't save: ${error.message}`;
      } else if (emailChanged) {
        profileStatus.textContent = 'Name saved. Check your new email address for a confirmation link — the email change takes effect once you click it.';
      } else {
        profileStatus.textContent = 'Saved.';
      }
    });
  }

  const signOutBtn = document.getElementById('account-sign-out');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
      await window.qsClient.auth.signOut();
      window.location.href = 'index.html';
    });
  }
})();
