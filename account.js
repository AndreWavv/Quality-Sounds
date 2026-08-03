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
    if (window.qsLibrary) {
      window.qsLibrary.refreshFavorites();
      window.qsLibrary.refreshPlaylists();
    }
  }
  checkAccess();
  window.qsClient.auth.onAuthStateChange(() => checkAccess());

  const tabFav = document.getElementById('account-tab-favorites');
  const tabPlaylists = document.getElementById('account-tab-playlists');
  const favPanel = document.getElementById('account-favorites-panel');
  const playlistsPanel = document.getElementById('account-playlists-panel');

  function showFavorites() {
    tabFav.classList.add('active');
    tabPlaylists.classList.remove('active');
    favPanel.style.display = 'block';
    playlistsPanel.style.display = 'none';
  }
  function showPlaylists() {
    tabPlaylists.classList.add('active');
    tabFav.classList.remove('active');
    playlistsPanel.style.display = 'block';
    favPanel.style.display = 'none';
  }
  if (tabFav) tabFav.addEventListener('click', showFavorites);
  if (tabPlaylists) tabPlaylists.addEventListener('click', showPlaylists);

  const signOutBtn = document.getElementById('account-sign-out');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
      await window.qsClient.auth.signOut();
      window.location.href = 'index.html';
    });
  }
})();
