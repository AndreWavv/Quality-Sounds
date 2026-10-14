// ===== Admin panel — real Supabase-backed version =====
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
      if (e) e.style.display = e === el ? 'block' : 'none';
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

  // Public uploads (cover art, previews, mixing references).
  async function uploadFile(bucket, file) {
    if (!file) return '';
    const ext = file.name.split('.').pop();
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await window.qsClient.storage.from(bucket).upload(path, file);
    if (error) throw error;
    const { data } = window.qsClient.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  // ===== Delivery files (what buyers get after paying) =====
  // Stored in the PRIVATE `deliverables` bucket at <beat id>/<mp3|wav|stems>.<ext>,
  // with the path (or an external share link for big files) recorded in
  // the admin-only `beat_files` table. Buyers only ever reach these
  // through the get-download-links edge function.
  const DELIVERY_KEYS = ['mp3', 'wav', 'stems'];
  const DELIVERY_LABELS = { mp3: 'Full MP3', wav: 'WAV', stems: 'Stems ZIP' };
  const DELIVERY_ACCEPT = {
    mp3: '.mp3,audio/mpeg',
    wav: '.wav,audio/wav,audio/x-wav',
    stems: '.zip,.rar,.7z,application/zip',
  };
  const MAX_UPLOAD_MB = 50; // Supabase free plan limit per file
  const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

  function tooBigMessage(key, file) {
    const mb = (file.size / (1024 * 1024)).toFixed(0);
    return `${DELIVERY_LABELS[key]} is ${mb} MB, over the ${MAX_UPLOAD_MB} MB upload limit. Upload it to Google Drive or Dropbox and paste the share link instead.`;
  }

  async function uploadDeliverable(beatId, key, file, previousPath) {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error(tooBigMessage(key, file));
    const ext = (file.name.includes('.') ? file.name.split('.').pop() : key).toLowerCase();
    const path = `${beatId}/${key}.${ext}`;
    const { error: upError } = await window.qsClient.storage
      .from('deliverables')
      .upload(path, file, { upsert: true, contentType: file.type || undefined });
    if (upError) throw upError;

    const { error: dbError } = await window.qsClient
      .from('beat_files')
      .upsert({ beat_id: beatId, [`${key}_path`]: path, [`${key}_url`]: null, updated_at: new Date().toISOString() }, { onConflict: 'beat_id' });
    if (dbError) throw dbError;

    // Same file type replaced in place; a different extension leaves the
    // old object behind, so remove it.
    if (previousPath && previousPath !== path) {
      await window.qsClient.storage.from('deliverables').remove([previousPath]);
    }
  }

  async function saveDeliverableLink(beatId, key, url, previousPath) {
    const { error } = await window.qsClient
      .from('beat_files')
      .upsert({ beat_id: beatId, [`${key}_url`]: url, [`${key}_path`]: null, updated_at: new Date().toISOString() }, { onConflict: 'beat_id' });
    if (error) throw error;
    if (previousPath) await window.qsClient.storage.from('deliverables').remove([previousPath]);
  }

  async function removeDeliverable(beatId, key, previousPath) {
    const { error } = await window.qsClient
      .from('beat_files')
      .upsert({ beat_id: beatId, [`${key}_url`]: null, [`${key}_path`]: null, updated_at: new Date().toISOString() }, { onConflict: 'beat_id' });
    if (error) throw error;
    if (previousPath) await window.qsClient.storage.from('deliverables').remove([previousPath]);
  }

  function isHttpsUrl(value) {
    try {
      return new URL(value).protocol === 'https:';
    } catch (e) {
      return false;
    }
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

      const deliveryFiles = {
        mp3: document.getElementById('beat-deliver-mp3').files[0],
        wav: document.getElementById('beat-deliver-wav').files[0],
        stems: document.getElementById('beat-deliver-stems').files[0],
      };

      // Catch oversized delivery files before anything is created.
      const tooBig = DELIVERY_KEYS.filter((k) => deliveryFiles[k] && deliveryFiles[k].size > MAX_UPLOAD_BYTES);
      if (tooBig.length) {
        statusEl.textContent = tooBigMessage(tooBig[0], deliveryFiles[tooBig[0]]) + ' Clear that file field, upload the beat, then add the link under Your Beats.';
        statusEl.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Upload Beat';
        return;
      }

      let beatId = null;
      try {
        const coverFile = document.getElementById('beat-cover').files[0];
        const audioFile = document.getElementById('beat-audio').files[0];
        const coverUrl = await uploadFile('covers', coverFile);
        const audioUrl = await uploadFile('audio', audioFile);

        const { data: inserted, error } = await window.qsClient.from('beats').insert({
          title: document.getElementById('beat-title').value.trim(),
          genre: document.getElementById('beat-genre').value,
          bpm: Number(document.getElementById('beat-bpm').value) || null,
          key: document.getElementById('beat-key').value.trim(),
          mp3_price: Number(document.getElementById('beat-mp3-price').value),
          wav_price: Number(document.getElementById('beat-wav-price').value),
          stems_price: Number(document.getElementById('beat-stems-price').value),
          cover_art_url: coverUrl,
          audio_file_url: audioUrl,
        }).select('id').single();
        if (error) throw error;
        beatId = inserted.id;

        for (const key of DELIVERY_KEYS) {
          if (!deliveryFiles[key]) continue;
          submitBtn.textContent = `Uploading ${DELIVERY_LABELS[key]}...`;
          await uploadDeliverable(beatId, key, deliveryFiles[key], null);
        }

        const missing = DELIVERY_KEYS.filter((k) => !deliveryFiles[k]).map((k) => DELIVERY_LABELS[k]);
        statusEl.textContent = missing.length
          ? `Uploaded! Still missing for buyers: ${missing.join(', ')}. Add them under Your Beats.`
          : 'Uploaded! All buyer files are attached.';
        statusEl.style.display = 'block';
        beatForm.reset();
        renderBeatList();
      } catch (err) {
        statusEl.textContent = beatId
          ? `The beat was added, but a buyer file failed: ${err.message} Add it under Your Beats.`
          : `Failed: ${err.message}`;
        statusEl.style.display = 'block';
        if (beatId) renderBeatList();
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

  function fileState(files, key) {
    if (files && files[`${key}_path`]) return { ok: true, text: `Uploaded: ${files[`${key}_path`].split('/').pop()}` };
    if (files && files[`${key}_url`]) return { ok: true, text: `Link: ${files[`${key}_url`]}` };
    return { ok: false, text: 'Missing' };
  }

  const openPanels = new Set(); // keep "Manage files" panels open across re-renders

  async function renderBeatList() {
    const listEl = document.getElementById('admin-beat-list');
    if (!listEl) return;
    const [{ data, error }, { data: filesData, error: filesError }] = await Promise.all([
      window.qsClient.from('beats').select('*').order('created_at', { ascending: false }),
      window.qsClient.from('beat_files').select('*'),
    ]);
    if (error || filesError) {
      listEl.innerHTML = `<p class="meta">Couldn't load beats: ${escapeHtml((error || filesError).message)}</p>`;
      return;
    }
    if (!data || !data.length) {
      listEl.innerHTML = '<p class="meta">No beats uploaded yet.</p>';
      return;
    }
    const filesByBeat = new Map((filesData || []).map((f) => [f.beat_id, f]));

    listEl.innerHTML = data.map((b) => {
      const files = filesByBeat.get(b.id);
      const chips = DELIVERY_KEYS.map((k) => {
        const s = fileState(files, k);
        return `<span class="delivery-chip ${s.ok ? 'ok' : 'missing'}">${escapeHtml(DELIVERY_LABELS[k])} ${s.ok ? '✓' : '✗'}</span>`;
      }).join('');
      const rows = DELIVERY_KEYS.map((k) => {
        const s = fileState(files, k);
        const inputId = `deliver-${b.id}-${k}`;
        return `
          <div class="delivery-row" data-beat-id="${escapeHtml(b.id)}" data-key="${k}">
            <div class="delivery-row-head"><strong>${escapeHtml(DELIVERY_LABELS[k])}</strong><span class="delivery-state">${escapeHtml(s.text)}</span></div>
            <div class="delivery-controls">
              <input type="file" id="${escapeHtml(inputId)}-file" accept="${DELIVERY_ACCEPT[k]}" aria-label="${escapeHtml(DELIVERY_LABELS[k])} file">
              <button type="button" data-action="upload">Upload</button>
            </div>
            <div class="delivery-controls">
              <input type="url" id="${escapeHtml(inputId)}-link" placeholder="or paste a Google Drive / Dropbox link" aria-label="${escapeHtml(DELIVERY_LABELS[k])} link">
              <button type="button" data-action="link">Save link</button>
              ${s.ok ? '<button type="button" data-action="remove">Remove</button>' : ''}
            </div>
            <div class="delivery-msg" aria-live="polite"></div>
          </div>`;
      }).join('');
      const isOpen = openPanels.has(b.id);
      return `
      <div class="beat-card" style="margin-bottom: 14px; animation: none;">
        <div class="beat-card-top" style="margin-bottom: 0;">
          <div>
            <h4 style="margin-bottom: 4px;">${escapeHtml(b.title)}</h4>
            <span class="meta">${escapeHtml(b.genre)} · ${escapeHtml(b.bpm)} BPM · ${escapeHtml(b.key)} · MP3 $${escapeHtml(b.mp3_price)} · WAV $${escapeHtml(b.wav_price)} · Stems $${escapeHtml(b.stems_price)}</span>
          </div>
          <button type="button" class="beat-info-close" data-delete-id="${escapeHtml(b.id)}" aria-label="Delete">✕</button>
        </div>
        <div class="delivery-summary">
          ${chips}
          <button type="button" class="delivery-toggle" data-toggle-id="${escapeHtml(b.id)}">${isOpen ? 'Hide files' : 'Manage files'}</button>
        </div>
        <div class="delivery-panel" data-panel-id="${escapeHtml(b.id)}" ${isOpen ? '' : 'hidden'}>${rows}</div>
      </div>`;
    }).join('');

    listEl.querySelectorAll('[data-toggle-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.toggleId;
        const panel = listEl.querySelector(`[data-panel-id="${id}"]`);
        panel.hidden = !panel.hidden;
        if (panel.hidden) openPanels.delete(id); else openPanels.add(id);
        btn.textContent = panel.hidden ? 'Manage files' : 'Hide files';
      });
    });

    listEl.querySelectorAll('.delivery-row').forEach((row) => {
      const beatId = row.dataset.beatId;
      const key = row.dataset.key;
      const msg = row.querySelector('.delivery-msg');
      const files = filesByBeat.get(beatId);
      const previousPath = files ? files[`${key}_path`] : null;

      async function run(btn, busyText, work) {
        const buttons = row.querySelectorAll('button');
        buttons.forEach((b) => { b.disabled = true; });
        const original = btn.textContent;
        btn.textContent = busyText;
        msg.textContent = '';
        try {
          await work();
          renderBeatList();
        } catch (err) {
          msg.textContent = err.message || String(err);
          buttons.forEach((b) => { b.disabled = false; });
          btn.textContent = original;
        }
      }

      row.querySelector('[data-action="upload"]').addEventListener('click', (e) => {
        const file = row.querySelector('input[type="file"]').files[0];
        if (!file) { msg.textContent = 'Choose a file first.'; return; }
        if (file.size > MAX_UPLOAD_BYTES) { msg.textContent = tooBigMessage(key, file); return; }
        run(e.currentTarget, 'Uploading...', () => uploadDeliverable(beatId, key, file, previousPath));
      });

      row.querySelector('[data-action="link"]').addEventListener('click', (e) => {
        const url = row.querySelector('input[type="url"]').value.trim();
        if (!isHttpsUrl(url)) { msg.textContent = 'Paste a full https:// share link.'; return; }
        run(e.currentTarget, 'Saving...', () => saveDeliverableLink(beatId, key, url, previousPath));
      });

      const removeBtn = row.querySelector('[data-action="remove"]');
      if (removeBtn) {
        removeBtn.addEventListener('click', (e) => {
          if (!confirm(`Remove the ${DELIVERY_LABELS[key]} for this beat? Buyers won't be able to download it until you add it again.`)) return;
          run(e.currentTarget, 'Removing...', () => removeDeliverable(beatId, key, previousPath));
        });
      }
    });

    listEl.querySelectorAll('[data-delete-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this beat permanently?')) return;
        const beatId = btn.dataset.deleteId;
        const files = filesByBeat.get(beatId);
        const { error: delError } = await window.qsClient.from('beats').delete().eq('id', beatId);
        if (delError) {
          const sold = /orders_beat_id_fkey/i.test(delError.message);
          const saved = /(likes|favorites|playlist_beats)_beat_id_fkey/i.test(delError.message);
          alert(sold
            ? "This beat can't be deleted because someone has bought a license for it. Their order and downloads depend on it."
            : saved
              ? "This beat can't be deleted yet because someone has it in their likes, favorites or a playlist."
              : `Couldn't delete: ${delError.message}`);
          return;
        }
        // The beat_files row goes with the beat (on delete cascade); clear
        // its uploaded files out of storage too.
        const paths = files ? DELIVERY_KEYS.map((k) => files[`${k}_path`]).filter(Boolean) : [];
        if (paths.length) await window.qsClient.storage.from('deliverables').remove(paths);
        openPanels.delete(beatId);
        renderBeatList();
      });
    });
  }
})();
