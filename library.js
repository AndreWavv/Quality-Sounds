// ===== Favorites / Likes / Playlists =====
// Three genuinely separate systems, per explicit confirmation:
// - Likes: public, visible aggregate count, anyone signed in can toggle
// - Favorites: private, simple saved-for-later list, no sub-categories
// - Playlists: fully custom, user-named collections (many per user)
(function () {
  if (!window.qsClient) return;

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  async function getUserId() {
    const { data } = await window.qsClient.auth.getSession();
    return data && data.session ? data.session.user.id : null;
  }

  // ===== Likes (public) =====
  async function getLikeState(beatId) {
    const { count } = await window.qsClient
      .from('likes')
      .select('id', { count: 'exact', head: true })
      .eq('beat_id', beatId);
    const userId = await getUserId();
    let likedByMe = false;
    if (userId) {
      const { data } = await window.qsClient
        .from('likes')
        .select('id')
        .eq('beat_id', beatId)
        .eq('user_id', userId)
        .maybeSingle();
      likedByMe = !!data;
    }
    return { count: count || 0, likedByMe };
  }

  async function toggleLike(beatId, currentlyLiked) {
    const userId = await getUserId();
    if (!userId) {
      alert('Sign in to like beats.');
      return null;
    }
    if (currentlyLiked) {
      await window.qsClient.from('likes').delete().eq('beat_id', beatId).eq('user_id', userId);
    } else {
      await window.qsClient.from('likes').insert({ beat_id: beatId, user_id: userId });
    }
    return getLikeState(beatId);
  }

  // ===== Favorites (private) =====
  async function isFavorited(beatId) {
    const userId = await getUserId();
    if (!userId) return false;
    const { data } = await window.qsClient
      .from('favorites')
      .select('id')
      .eq('beat_id', beatId)
      .eq('user_id', userId)
      .maybeSingle();
    return !!data;
  }

  async function toggleFavorite(beatId, currentlyFavorited) {
    const userId = await getUserId();
    if (!userId) {
      alert('Sign in to save favorites.');
      return currentlyFavorited;
    }
    if (currentlyFavorited) {
      await window.qsClient.from('favorites').delete().eq('beat_id', beatId).eq('user_id', userId);
      return false;
    }
    await window.qsClient.from('favorites').insert({ beat_id: beatId, user_id: userId });
    return true;
  }

  async function refreshFavorites() {
    const listEl = document.getElementById('favorites-list');
    if (!listEl) return;
    const userId = await getUserId();
    if (!userId) { listEl.innerHTML = '<p class="meta">Sign in to see your favorites.</p>'; return; }
    const { data, error } = await window.qsClient
      .from('favorites')
      .select('beat_id, beats(title, genre)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) { listEl.innerHTML = `<p class="meta">${escapeHtml(error.message)}</p>`; return; }
    if (!data || !data.length) { listEl.innerHTML = '<p class="meta">No favorites saved yet.</p>'; return; }
    listEl.innerHTML = data.map((f) => `
      <div class="library-row">
        <span>${escapeHtml(f.beats ? f.beats.title : 'Unknown beat')}</span>
        <span class="meta">${escapeHtml(f.beats ? f.beats.genre : '')}</span>
      </div>
    `).join('');
  }

  // ===== Playlists (custom, user-named) =====
  async function refreshPlaylists() {
    const listEl = document.getElementById('playlists-list');
    if (!listEl) return;
    const userId = await getUserId();
    if (!userId) { listEl.innerHTML = '<p class="meta">Sign in to see your playlists.</p>'; return; }
    const { data, error } = await window.qsClient
      .from('playlists')
      .select('id, name, playlist_beats(beat_id, beats(title))')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) { listEl.innerHTML = `<p class="meta">${escapeHtml(error.message)}</p>`; return; }
    if (!data || !data.length) { listEl.innerHTML = '<p class="meta">No playlists yet — create one above.</p>'; return; }
    listEl.innerHTML = data.map((p) => `
      <div class="library-playlist">
        <div class="library-row">
          <strong>${escapeHtml(p.name)}</strong>
          <button type="button" class="beat-info-close" data-delete-playlist="${escapeHtml(p.id)}" aria-label="Delete playlist">✕</button>
        </div>
        <div class="meta">
          ${(p.playlist_beats || []).length
            ? p.playlist_beats.map((pb) => escapeHtml(pb.beats ? pb.beats.title : 'Unknown')).join(', ')
            : 'Empty'}
        </div>
      </div>
    `).join('');
    listEl.querySelectorAll('[data-delete-playlist]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this playlist?')) return;
        await window.qsClient.from('playlists').delete().eq('id', btn.dataset.deletePlaylist);
        refreshPlaylists();
      });
    });
  }

  const createForm = document.getElementById('create-playlist-form');
  if (createForm) {
    createForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const userId = await getUserId();
      if (!userId) { alert('Sign in to create playlists.'); return; }
      const nameInput = document.getElementById('new-playlist-name');
      const name = nameInput.value.trim();
      if (!name) return;
      const { error } = await window.qsClient.from('playlists').insert({ user_id: userId, name });
      if (error) { alert(`Couldn't create playlist: ${error.message}`); return; }
      nameInput.value = '';
      refreshPlaylists();
    });
  }

  async function addBeatToPlaylist(beatId) {
    const userId = await getUserId();
    if (!userId) { alert('Sign in to use playlists.'); return; }
    const { data: playlists } = await window.qsClient.from('playlists').select('id, name').eq('user_id', userId);
    if (!playlists || !playlists.length) {
      alert('You don\'t have any playlists yet — create one from the Account panel first.');
      return;
    }
    const choice = prompt(`Add to which playlist?\n${playlists.map((p, i) => `${i + 1}. ${p.name}`).join('\n')}\n\nEnter a number:`);
    const idx = parseInt(choice, 10) - 1;
    if (isNaN(idx) || !playlists[idx]) return;
    const { error } = await window.qsClient.from('playlist_beats').insert({ playlist_id: playlists[idx].id, beat_id: beatId });
    if (error) {
      alert(error.message.includes('duplicate') ? 'Already in that playlist.' : `Couldn't add: ${error.message}`);
    } else {
      alert(`Added to "${playlists[idx].name}".`);
    }
  }

  window.qsLibrary = {
    getLikeState,
    toggleLike,
    isFavorited,
    toggleFavorite,
    addBeatToPlaylist,
    refreshFavorites,
    refreshPlaylists,
  };
})();
