// ===== Admin panel — real Supabase-backed version =====
// Replaces the old localStorage/IndexedDB-only admin page entirely.
// Access is gated by an actual is_admin flag on the signed-in user's
// profile row, checked server-side via RLS on every write — this page's
// own show/hide logic is just UX, not the actual security boundary.
(function () {
  if (!window.qsClient) return;

  const signedOutEl = document.getElementById('admin-signed-out');
  const noAccessEl = document.getElementById('admin-no-access');
  const loadingEl = document.getElementById('admin-loading');
  const contentEl = document.getElementById('admin-content');

  function showOnly(el) {
    [signedOutEl, noAccessEl, loadingEl, contentEl].forEach((e) => {
      if (e) e.style.display = e === el ? (el === contentEl ? 'block' : 'block') : 'none';
    });
  }

  async function checkAccess() {
    showOnly(loadingEl);
    const { data: sessionData } = await window.qsClient.auth.getSession();
    const session = sessionData && sessionData.session;
    if (!session) {
      showOnly(signedOutEl);
      return;
    }
    const { data: profile, error } = await window.qsClient
      .from('profiles')
      .select('is_admin')
      .eq('id', session.user.id)
      .single();
    if (error || !profile || !profile.is_admin) {
      showOnly(noAccessEl);
      return;
    }
    showOnly(contentEl);
    renderBeatList();
  }

  checkAccess();
  // Re-check whenever auth state changes (sign in / sign out elsewhere).
  window.qsClient.auth.onAuthStateChange(() => checkAccess());

  async function uploadFile(bucket, file) {
    if (!file) return '';
    const ext = file.name.split('.').pop();
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await window.qsClient.storage.from(bucket).upload(path, file);
    if (error) throw error;
    const { data } = window.qsClient.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  const beatForm = document.getElementById('admin-beat-form');
  if (beatForm) {
    beatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const statusEl = document.getElementById('beat-upload-status');
      const submitBtn = beatForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Uploading...';
      statusEl.style.display = 'none';

      try {
        const coverFile = document.getElementById('beat-cover').files[0];
        const audioFile = document.getElementById('beat-audio').files[0];
        const coverUrl = await uploadFile('covers', coverFile);
        const audioUrl = await uploadFile('audio', audioFile);

        const { error } = await window.qsClient.from('beats').insert({
          title: document.getElementById('beat-title').value.trim(),
          genre: document.getElementById('beat-genre').value,
          bpm: Number(document.getElementById('beat-bpm').value) || null,
          key: document.getElementById('beat-key').value.trim(),
          mp3_price: Number(document.getElementById('beat-mp3-price').value),
          wav_price: Number(document.getElementById('beat-wav-price').value),
          stems_price: Number(document.getElementById('beat-stems-price').value),
          cover_art_url: coverUrl,
          audio_file_url: audioUrl,
        });
        if (error) throw error;

        statusEl.textContent = 'Uploaded!';
        statusEl.style.display = 'block';
        beatForm.reset();
        renderBeatList();
      } catch (err) {
        statusEl.textContent = `Failed: ${err.message}`;
        statusEl.style.display = 'block';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Upload Beat';
      }
    });
  }

  const refForm = document.getElementById('admin-reference-form');
  if (refForm) {
    refForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const statusEl = document.getElementById('ref-upload-status');
      const submitBtn = refForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Uploading...';
      statusEl.style.display = 'none';

      try {
        const audioFile = document.getElementById('ref-audio').files[0];
        const audioUrl = await uploadFile('audio', audioFile);
        const { error } = await window.qsClient.from('mixing_references').insert({
          title: document.getElementById('ref-title').value.trim(),
          genre_label: document.getElementById('ref-genre-label').value.trim(),
          audio_file_url: audioUrl,
        });
        if (error) throw error;
        statusEl.textContent = 'Uploaded!';
        statusEl.style.display = 'block';
        refForm.reset();
      } catch (err) {
        statusEl.textContent = `Failed: ${err.message}`;
        statusEl.style.display = 'block';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Upload Reference';
      }
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  async function renderBeatList() {
    const listEl = document.getElementById('admin-beat-list');
    if (!listEl) return;
    const { data, error } = await window.qsClient.from('beats').select('*').order('created_at', { ascending: false });
    if (error) {
      listEl.innerHTML = `<p class="meta">Couldn't load beats: ${escapeHtml(error.message)}</p>`;
      return;
    }
    if (!data || !data.length) {
      listEl.innerHTML = '<p class="meta">No beats uploaded yet.</p>';
      return;
    }
    listEl.innerHTML = data.map((b) => `
      <div class="beat-card" style="margin-bottom: 14px; animation: none;">
        <div class="beat-card-top">
          <div>
            <h4 style="margin-bottom: 4px;">${escapeHtml(b.title)}</h4>
            <span class="meta">${escapeHtml(b.genre)} · ${escapeHtml(b.bpm)} BPM · ${escapeHtml(b.key)} · MP3 $${escapeHtml(b.mp3_price)} · WAV $${escapeHtml(b.wav_price)} · Stems $${escapeHtml(b.stems_price)}</span>
          </div>
          <button type="button" class="beat-info-close" data-delete-id="${escapeHtml(b.id)}" aria-label="Delete">✕</button>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('[data-delete-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this beat permanently?')) return;
        const { error: delError } = await window.qsClient.from('beats').delete().eq('id', btn.dataset.deleteId);
        if (delError) { alert(`Couldn't delete: ${delError.message}`); return; }
        renderBeatList();
      });
    });
  }
})();
