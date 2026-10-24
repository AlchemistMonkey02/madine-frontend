/* Customer onboarding, reviews and notifications. Optional tools load on demand. */
const Platform = (() => {
  const empty = (message) => `<div class="platformCard emptyState"><p>${esc(message)}</p></div>`;
  const loginCard = (message) => `<div class="platformCard"><p>${esc(message)}</p><button class="btn btnPrimary" data-platform="login">Log in with email</button></div>`;
  const dateLabel = (value) => new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const modules = new Map();
  function loadModule(name) {
    if (!modules.has(name)) {
      const pending = new Promise((resolve, reject) => {
        const script = document.createElement('script'); script.src = '/js/' + name + '.js';
        script.onload = resolve;
        script.onerror = () => { script.remove(); modules.delete(name); reject(new Error('Could not load this page. Please retry.')); };
        document.head.append(script);
      });
      modules.set(name, pending);
    }
    return modules.get(name);
  }
  async function onboard(after) {
    let user = AuthService.getUser();
    if (!user) return requireAuth(() => onboard(after));
    if (!user.accountType && !user.isAdmin) {
      const result = await Api.put('/me/account-type', { accountType: 'customer' });
      user = result.user; AuthService.setUser(user); renderAccountMenu();
    }
    if (!user.profileComplete && !user.isAdmin) return openProfileForm({ firstTime: true, then: after || (() => navigate('#home')) });
    if (after) return after();
    navigate('#home');
  }
  function ensureProfile(action) { return onboard(action).catch((error) => toast(error.message)); }
  async function refreshCatalog() {
    await loadCafesFromAPI({ fresh: true }); prepareData(); discoverDirty = true; _cafeLabelToId = null;
  }
  async function refreshBadge() {
    const badge = $('#notificationCount');
    if (!AuthService.isAuthenticated()) { badge.hidden = true; return; }
    try { const { unread: count } = await Api.get('/notifications'); badge.textContent = count > 99 ? '99+' : count; badge.hidden = !count; } catch {}
  }
  async function renderReviews(cafeId) {
    const box = $('#cafeReviews'); if (!box || !cafeId) return;
    box.innerHTML = '<p class="muted">Loading reviews…</p>';
    try {
      const result = await Api.get('/cafes/' + encodeURIComponent(cafeId) + '/reviews');
      if (currentCafe !== cafeId) return;
      box.innerHTML = result.reviews.length ? result.reviews.map((r) => `<article class="platformCard"><b>${esc(r.name)} · ${r.rating}/5</b><p>${esc(r.text)}</p><small class="muted">${esc(dateLabel(r.updatedAt))}</small></article>`).join('') : '<p class="muted">No community reviews yet. Share your experience.</p>';
    } catch (error) { box.innerHTML = empty(error.message); }
  }
  function openCafeReview() {
    const cafeId = currentCafe; if (!cafeId) return;
    requireProfile(() => openFormModal({ title: 'Review ' + cafeById[cafeId].name, submitLabel: 'Save review',
      body: field('Your rating', '<select name="rating"><option value="5">5 — Loved it</option><option value="4">4 — Very good</option><option value="3">3 — Good</option><option value="2">2 — Could be better</option><option value="1">1 — Disappointing</option></select>') + field('Your experience', '<textarea name="text" maxlength="1200" rows="4" required></textarea>'),
      onSubmit: async (form) => { await Api.post('/cafes/' + encodeURIComponent(cafeId) + '/reviews', { rating: Number(val(form, 'rating')), text: val(form, 'text') }); return () => renderReviews(cafeId); },
    }));
  }
  async function renderNotifications() {
    const box = $('#notificationsContent');
    if (!AuthService.isAuthenticated()) { box.innerHTML = loginCard('Log in to see your notifications.'); return; }
    try {
      const { notifications: list } = await Api.get('/notifications');
      if (currentView !== 'notifications') return;
      box.innerHTML = list.length ? list.map((n) => `<a class="platformCard notificationItem ${n.read ? '' : 'unread'}" href="${esc(n.href)}"><b>${esc(n.title)}</b><p>${esc(n.body)}</p><small>${esc(dateLabel(n.createdAt))}</small></a>`).join('') : empty('You are all caught up. Activity and café review updates will appear here.');
      refreshBadge();
    } catch (error) { box.innerHTML = empty(error.message); }
  }

  function route(view) {
    let pending;
    if (view === 'business' || view === 'admin') pending = loadModule('management').then(() => { if (currentView === view) return window.PlatformManagement.route(view); });
    if (view === 'discussion') pending = loadModule('discussions').then(() => { if (currentView === view) return window.GroupDiscussions.render(); });
    if (view === 'notifications') pending = renderNotifications();
    if (pending) pending.catch((error) => toast(error.message));
  }
  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-platform]'); if (!button) return;
    event.preventDefault();
    try {
      if (button.dataset.platform === 'login') requireAuth(() => onboard().catch((error) => toast(error.message)));
      if (button.dataset.platform === 'review-cafe') openCafeReview();
      if (button.dataset.platform === 'mark-read' && AuthService.isAuthenticated()) { await Api.put('/notifications/read'); await renderNotifications(); refreshBadge(); }
    } catch (error) { toast(error.message); }
  });
  return { onboard, ensureProfile, route, refreshBadge, renderReviews, refreshCatalog };
})();
