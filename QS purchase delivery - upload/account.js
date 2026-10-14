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
    refreshPurchases();
  }
  checkAccess();
  window.qsClient.auth.onAuthStateChange(() => checkAccess());

  // ===== Tabs =====
  const tabProfile = document.getElementById('account-tab-profile');
  const tabPurchases = document.getElementById('account-tab-purchases');
  const tabFav = document.getElementById('account-tab-favorites');
  const tabPlaylists = document.getElementById('account-tab-playlists');
  const profilePanel = document.getElementById('account-profile-panel');
  const purchasesPanel = document.getElementById('account-purchases-panel');
  const favPanel = document.getElementById('account-favorites-panel');
  const playlistsPanel = document.getElementById('account-playlists-panel');

  function showPanel(activeTab, activePanel) {
    [tabProfile, tabPurchases, tabFav, tabPlaylists].forEach((t) => t && t.classList.toggle('active', t === activeTab));
    [profilePanel, purchasesPanel, favPanel, playlistsPanel].forEach((p) => { if (p) p.style.display = p === activePanel ? 'block' : 'none'; });
  }
  if (tabProfile) tabProfile.addEventListener('click', () => showPanel(tabProfile, profilePanel));
  if (tabPurchases) tabPurchases.addEventListener('click', () => showPanel(tabPurchases, purchasesPanel));
  if (tabFav) tabFav.addEventListener('click', () => showPanel(tabFav, favPanel));
  if (tabPlaylists) tabPlaylists.addEventListener('click', () => showPanel(tabPlaylists, playlistsPanel));

  // account.html#purchases (the link in the delivery email and after
  // checkout) opens straight on the Purchases tab.
  if (window.location.hash === '#purchases' && tabPurchases) showPanel(tabPurchases, purchasesPanel);

  // ===== Purchases =====
  // Lists the buyer's own orders (RLS only returns their rows). Files are
  // never linked directly: "Download files" asks the get-download-links
  // edge function, which checks the order is paid and the lease is still
  // active, then returns short-lived links for the files this tier includes.
  const purchasesList = document.getElementById('purchases-list');
  const TIER_NAMES = { mp3: 'MP3 Lease', wav: 'WAV Lease', stems: 'Stems Lease' };
  const PENDING_WINDOW_MS = 60 * 60 * 1000; // show unpaid orders only briefly, right after checkout
  let pendingRetryTimer = null;

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function formatDate(iso) {
    return iso ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  }

  // supabase-js hides the function's own error text behind a generic
  // message on non-2xx responses; dig it out so the buyer sees why.
  async function functionErrorMessage(error) {
    try {
      if (error && error.context && typeof error.context.json === 'function') {
        const body = await error.context.json();
        if (body && body.error) return body.error;
      }
    } catch (e) { /* fall through */ }
    return 'Something went wrong. Please try again.';
  }

  async function refreshPurchases() {
    if (!purchasesList) return;
    clearTimeout(pendingRetryTimer);
    const { data, error } = await window.qsClient
      .from('orders')
      .select('id, license_type, price_paid, status, agreed_at, purchased_at, lease_expires_at, license_agreement_snapshot, beats(title)')
      .in('status', ['completed', 'pending'])
      .order('agreed_at', { ascending: false });

    if (error) {
      purchasesList.innerHTML = `<p class="meta">Couldn't load your purchases: ${escapeHtml(error.message)}</p>`;
      return;
    }

    const now = Date.now();
    const orders = (data || []).filter((o) =>
      o.status === 'completed' || (o.status === 'pending' && now - new Date(o.agreed_at).getTime() < PENDING_WINDOW_MS)
    );

    if (!orders.length) {
      purchasesList.innerHTML = '<p class="meta">No purchases yet. Beats you license show up here with their download files.</p>';
      return;
    }

    purchasesList.innerHTML = orders.map((o) => {
      const title = o.beats && o.beats.title ? o.beats.title : 'Beat';
      const tier = TIER_NAMES[o.license_type] || o.license_type;
      let badge;
      let actions = '';
      if (o.status === 'pending') {
        badge = '<span class="purchase-badge pending">Payment pending</span>';
      } else if (o.lease_expires_at && new Date(o.lease_expires_at).getTime() > now) {
        badge = `<span class="purchase-badge active">Active until ${escapeHtml(formatDate(o.lease_expires_at))}</span>`;
        actions = '<button type="button" class="btn solid" data-get-files>Download files</button>';
      } else {
        badge = `<span class="purchase-badge expired">Expired ${escapeHtml(formatDate(o.lease_expires_at))}</span>`;
      }
      if (o.status === 'completed' && o.license_agreement_snapshot) {
        actions += '<button type="button" class="btn" data-show-license>View license</button>';
      }
      const bought = o.status === 'completed' ? ` · Bought ${escapeHtml(formatDate(o.purchased_at))}` : '';
      return `
        <div class="purchase-card" data-order-id="${escapeHtml(o.id)}">
          <div class="purchase-top">
            <div>
              <div class="purchase-title">${escapeHtml(title)}</div>
              <div class="purchase-meta">${escapeHtml(tier)} · $${escapeHtml(o.price_paid)}${bought}</div>
            </div>
            ${badge}
          </div>
          ${actions ? `<div class="purchase-actions">${actions}</div>` : ''}
          <div class="purchase-files" hidden></div>
          <pre class="purchase-license" hidden>${escapeHtml(o.license_agreement_snapshot || '')}</pre>
        </div>`;
    }).join('');

    purchasesList.querySelectorAll('.purchase-card').forEach((card) => {
      const getBtn = card.querySelector('[data-get-files]');
      if (getBtn) getBtn.addEventListener('click', () => loadFiles(card, getBtn));
      const licenseBtn = card.querySelector('[data-show-license]');
      if (licenseBtn) {
        licenseBtn.addEventListener('click', () => {
          const pre = card.querySelector('.purchase-license');
          pre.hidden = !pre.hidden;
          licenseBtn.textContent = pre.hidden ? 'View license' : 'Hide license';
        });
      }
    });

    // A payment that's still being confirmed usually completes within
    // seconds; check again so the buyer doesn't have to refresh.
    if (orders.some((o) => o.status === 'pending')) {
      pendingRetryTimer = setTimeout(refreshPurchases, 5000);
    }
  }

  async function loadFiles(card, btn) {
    const filesEl = card.querySelector('.purchase-files');
    btn.disabled = true;
    btn.textContent = 'Getting files...';
    filesEl.hidden = false;
    filesEl.innerHTML = '';

    const { data, error } = await window.qsClient.functions.invoke('get-download-links', {
      body: { order_id: card.dataset.orderId },
    });

    btn.disabled = false;
    btn.textContent = 'Refresh links';

    if (error || !data || !Array.isArray(data.files)) {
      const message = error ? await functionErrorMessage(error) : 'Something went wrong. Please try again.';
      filesEl.innerHTML = `<p class="purchase-note">${escapeHtml(message)}</p>`;
      return;
    }

    const rows = data.files.map((f) => {
      let control;
      if (f.status === 'ready' && f.kind === 'file') {
        control = `<a class="btn solid" href="${escapeHtml(f.url)}" download="${escapeHtml(f.filename || '')}">Download ${escapeHtml(f.label)}</a>`;
      } else if (f.status === 'ready' && f.kind === 'link') {
        control = `<a class="btn solid" href="${escapeHtml(f.url)}" target="_blank" rel="noopener noreferrer">Open ${escapeHtml(f.label)} download</a>`;
      } else {
        control = '<span class="purchase-note">Not available yet. Email andre.wavbusiness@gmail.com</span>';
      }
      return `<div class="purchase-file-row"><span class="label">${escapeHtml(f.label)}</span>${control}</div>`;
    }).join('');

    filesEl.innerHTML = rows + '<p class="purchase-note">Download links work for 15 minutes. Press Refresh links for new ones any time while your lease is active.</p>';
  }

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
