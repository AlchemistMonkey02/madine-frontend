/* Group discussions are loaded only when a group is opened. */
window.GroupDiscussions = (() => {
  let discussionRows = [];
  const empty = (message) => `<div class="platformCard emptyState"><p>${esc(message)}</p></div>`;
  const dateLabel = (value) => new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const discussionScope = () => { const { params } = parseHash(); return { communityId: params[0], ...(params[1] ? { postId: params[1] } : {}) }; };
  async function renderDiscussion() {
    const box = $('#discussionContent'), scope = discussionScope(), group = COMMUNITIES.find((c) => c.id === scope.communityId);
    $('#discussionTitle').textContent = (group?.name || 'Group') + ' discussions';
    box.innerHTML = '<p class="muted">Loading conversations…</p>';
    try {
      const query = new URLSearchParams(scope).toString(), result = await Api.get('/feed' + (query ? '?' + query : '')); discussionRows = result.posts;
      if (currentView !== 'discussion' || discussionScope().communityId !== scope.communityId) return;
      box.innerHTML = discussionRows.length ? discussionRows.map((post) => `<article class="platformCard discussionPost"><div class="platformCardHead"><div><b>${esc(post.authorName)}</b><small>${esc(dateLabel(post.createdAt))}</small></div><span class="statusBadge">${post.type === 'offer' ? 'Café offer' : post.communityName ? esc(post.communityName) : 'Community'}</span></div><p class="postText">${esc(post.text)}</p>${post.cafeId ? `<a class="textBtn" href="#cafe/${encodeURIComponent(post.cafeId)}">${esc(post.cafeName)} ${icon('arrow-right')}</a>` : ''}<div class="platformActions postActions"><button class="btn btnGhost" data-platform="like" data-id="${post.id}" aria-pressed="${post.liked}">${icon('heart')} ${post.likes} ${post.liked ? 'Liked' : 'Like'}</button><button class="btn btnGhost" data-platform="comments" data-id="${post.id}">${icon('message-circle')} ${post.comments} Comments</button><button class="btn btnGhost" data-platform="share-post" data-id="${post.id}">${icon('share-2')} Share</button></div></article>`).join('') : empty('Start the first discussion in this group.');
    } catch (error) { box.innerHTML = empty(error.message); }
  }
  function openPostForm() {
    const communityId = discussionScope().communityId;
    requireProfile(() => openFormModal({ title: 'Start a group discussion', submitLabel: 'Post discussion',
      body: field('Your discussion *', '<textarea name="text" maxlength="2000" rows="5" required></textarea>'),
      onSubmit: async (form) => { await Api.post('/feed', { text: val(form, 'text'), communityId }); toast('Discussion posted'); return () => { navigate('#discussion/' + communityId); renderDiscussion(); }; },
    }));
  }
  async function openComments(id) {
    const result = await Api.get('/feed/' + id + '/comments');
    openFormModal({ title: 'Comments', submitLabel: 'Post comment',
      body: `<div class="commentList">${result.comments.length ? result.comments.map((c) => `<div><b>${esc(c.name)}</b><p>${esc(c.text)}</p></div>`).join('') : '<p class="muted">Be the first to comment.</p>'}</div>${field('Your comment', '<textarea name="text" maxlength="1000" rows="3" required></textarea>')}`,
      onSubmit: async (form) => { await Api.post('/feed/' + id + '/comments', { text: val(form, 'text') }); return () => renderDiscussion(); },
    });
  }

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-platform]'); if (!button) return;
    const action = button.dataset.platform, id = button.dataset.id;
    try {
      if (action === 'new-discussion') openPostForm();
      if (action === 'like') requireAuth(async () => { const post = discussionRows.find((row) => row.id === id); try { await Api.post('/feed/' + id + '/like', { liked: !post.liked }); renderDiscussion(); } catch (error) { toast(error.message); } });
      if (action === 'comments') requireProfile(() => openComments(id).catch((error) => toast(error.message)));
      if (action === 'share-post') { const url = location.origin + '/#discussion/' + discussionScope().communityId + '/' + id; if (navigator.share) await navigator.share({ title: 'MADINE group discussion', url }); else { await navigator.clipboard.writeText(url); toast('Discussion link copied'); } }
    } catch (error) { if (error.name !== 'AbortError') toast(error.message); }
  });
  return { render: renderDiscussion };
})();
