// ===== Admin beat upload — LOCAL PREVIEW ONLY =====
// This does not connect to any real backend. Everything here lives in
// this browser: metadata in localStorage, actual audio file data in
// IndexedDB (localStorage has a ~5-10MB total quota, nowhere near enough
// for audio files; IndexedDB can hold far more). beats-galaxy.js reads
// from this exact same IndexedDB database/store to actually play what
// gets uploaded here — the names below have to match exactly.
//
// The "access code" check below is client-side string comparison. That
// is NOT security — it's trivially readable in this very file, or
// bypassable from the browser console. It exists only as a mild
// deterrent against someone stumbling onto this URL by accident, not
// as protection against anyone who actually wants in. Do not treat
// anything entered on this page (or stored via it) as private.
(function () {
  const STORAGE_KEY = 'qs-admin-beats';
  // Change this to whatever you like — again, this is not real security.
  const ACCESS_CODE = 'qualitysounds';
  const DB_NAME = 'qs-admin-db';
  const STORE_NAME = 'audioFiles';

  const gate = document.getElementById('admin-gate');
  const formWrap = document.getElementById('admin-form-wrap');
  const passwordInput = document.getElementById('admin-password');
  const unlockBtn = document.getElementById('admin-unlock');
  const gateError = document.getElementById('admin-gate-error');
  const UNLOCK_KEY = 'qs-admin-unlocked';

  function showForm() {
    gate.style.display = 'none';
    formWrap.style.display = 'block';
    renderList();
  }

  function unlock() {
    if (passwordInput.value === ACCESS_CODE) {
      sessionStorage.setItem(UNLOCK_KEY, '1');
      showForm();
    } else {
      gateError.style.display = 'block';
    }
  }

  if (sessionStorage.getItem(UNLOCK_KEY)) {
    showForm();
  }

  unlockBtn.addEventListener('click', unlock);
  passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') unlock();
  });

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE_NAME)) {
          req.result.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function saveAudioBlob(key, blob) {
    return openDB().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }));
  }

  function deleteAudioBlob(key) {
    if (!key) return Promise.resolve();
    return openDB().then((db) => new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    }));
  }

  function getBeats() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveBeats(beats) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(beats));
  }

  function renderList() {
    const beats = getBeats();
    const listEl = document.getElementById('admin-beat-list');
    if (!beats.length) {
      listEl.innerHTML = '<p class="meta">Nothing saved locally yet.</p>';
      return;
    }
    listEl.innerHTML = beats.map((b, i) => `
      <div class="beat-card" style="margin-bottom: 14px; animation: none;">
        <div class="beat-card-top">
          <div>
            <h4 style="margin-bottom: 4px;">${escapeHtml(b.title)}</h4>
            <span class="meta">${escapeHtml(b.genre)} · ${escapeHtml(String(b.bpm || '—'))} BPM · ${escapeHtml(b.key || '—')} · $${escapeHtml(String(b.price || '—'))}+</span>
            <span class="meta" style="display:block; margin-top:4px;">${b.audioKey ? '🎵 Audio uploaded — playable in the galaxy' : '⚠️ No audio attached'}</span>
          </div>
          <button type="button" class="beat-info-close" data-index="${i}" aria-label="Delete">✕</button>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('button[data-index]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const beats2 = getBeats();
        const [removed] = beats2.splice(Number(btn.dataset.index), 1);
        saveBeats(beats2);
        if (removed && removed.audioKey) deleteAudioBlob(removed.audioKey);
        renderList();
      });
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  const form = document.getElementById('admin-upload-form');
  const submitBtn = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const audioInput = document.getElementById('beat-audio');
    const file = audioInput.files[0];
    const beat = {
      title: document.getElementById('beat-title').value,
      genre: document.getElementById('beat-genre').value,
      bpm: document.getElementById('beat-bpm').value,
      key: document.getElementById('beat-key').value,
      price: document.getElementById('beat-price').value,
      audioKey: '',
    };

    function finish() {
      const beats = getBeats();
      beats.push(beat);
      saveBeats(beats);
      form.reset();
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Save Locally'; }
      renderList();
    }

    if (file) {
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving audio…'; }
      beat.audioKey = `audio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      saveAudioBlob(beat.audioKey, file).then(finish).catch(() => {
        alert('Could not save the audio file locally (it may be too large, or your browser blocked it). The beat will be saved without playable audio.');
        beat.audioKey = '';
        finish();
      });
    } else {
      finish();
    }
  });
})();
