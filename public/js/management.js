/* Loaded only when an existing café owner or admin opens their tools. */
window.PlatformManagement = (() => {
  let ownerRows = [], adminRows = [];
  const statusLabel = { pending: 'Awaiting admin approval', approved: 'Approved', changes_requested: 'Changes requested', rejected: 'Rejected' };
  const empty = (message) => `<div class="platformCard emptyState"><p>${esc(message)}</p></div>`;
  const loginCard = (message) => `<div class="platformCard"><p>${esc(message)}</p><button class="btn btnPrimary" data-platform="login">Log in with email</button></div>`;
  async function renderOwner() {
    const box = $('#businessContent'), user = AuthService.getUser();
    if (!user) { box.innerHTML = loginCard('Log in to manage your existing café account.'); return; }
    
    if (user.accountType !== 'cafe_owner') { box.innerHTML = empty('Café registration is available to accounts registered as Café Owner.'); return; }
    box.innerHTML = '<p class="muted">Loading your café applications…</p>';
    try {
      const result = await Api.get('/owner/cafes'); ownerRows = result.cafes;
      if (currentView !== 'business') return;
      box.innerHTML = `<div class="platformActions"><button class="btn btnPrimary" data-platform="register-cafe">${icon('plus')} Register a café</button><a href="#notifications" class="btn btnGhost">Review updates</a></div>` +
        (ownerRows.length ? ownerRows.map((row) => `<article class="platformCard"><div class="platformCardHead"><div><span class="statusBadge ${row.status}">${esc(statusLabel[row.status])}</span><h2>${esc(row.details.name)}</h2><p class="muted">${esc(row.details.area)} · Revision ${row.revision}</p></div><button class="btn btnGhost" data-platform="edit-cafe" data-id="${row.id}">Edit / resubmit</button></div><p>${esc(row.details.description)}</p>${row.reviewNote ? `<div class="reviewNote"><b>Admin feedback</b><p>${esc(row.reviewNote)}</p></div>` : ''}<div class="platformActions">${row.published ? `<a class="btn btnPrimary" href="#cafe/${encodeURIComponent(row.cafeId)}">Manage café page</a><button class="btn btnGhost" data-platform="owner-event" data-cafe="${esc(row.cafeId)}">Create event</button>` : '<p class="muted">Publishing tools unlock after admin approval.</p>'}</div></article>`).join('') : empty('Register your café to send its details to the admin. Approval status and requested changes will appear here.'));
    } catch (error) { box.innerHTML = empty(error.message); }
  }
  function openOwnerForm(record) {
    const d = record?.details || {}, user = AuthService.getUser();
    openFormModal({
      title: record ? 'Update café details' : 'Register your café', subtitle: 'Details go to the admin for review before publication.', submitLabel: 'Submit for admin review',
      body: `${field('Your name *', `<input name="contactName" required maxlength="60" value="${esc(d.contactName || user?.name || '')}">`)}
        ${!record ? field('Existing café listing (optional)', `<input name="existing" list="cafeOptions" placeholder="Select to claim a listed café, or leave blank">${cafeDatalist()}`) : ''}
        ${field('Café name *', `<input name="name" required maxlength="100" value="${esc(d.name || '')}">`)}
        <div class="formRow">${field('Area *', `<input name="area" required maxlength="80" value="${esc(d.area || '')}">`)}${field('Opening hours', `<input name="hours" maxlength="120" value="${esc(d.hours || '')}" placeholder="9 AM – 10 PM">`)}</div>
        ${field('Address *', `<textarea name="address" required maxlength="300" rows="2">${esc(d.address || '')}</textarea>`)}
        ${field('About your café *', `<textarea name="description" required maxlength="1600" rows="4">${esc(d.description || '')}</textarea>`)}
        ${field('Cuisines', `<input name="cuisines" maxlength="160" value="${esc((d.cuisines || []).join(', '))}" placeholder="Coffee, Italian, Bakery">`)}
        <div class="formRow">${field('Contact phone', `<input name="phone" maxlength="40" value="${esc(d.phone || '')}">`)}${field('Website', `<input name="website" type="url" value="${esc(d.website || '')}" placeholder="https://">`)}</div>`,
      onSubmit: async (form) => {
        const body = Object.fromEntries(['contactName','name','area','hours','address','description','cuisines','phone','website'].map((key) => [key, val(form, key)]));
        if (!record && val(form, 'existing')) { body.existingCafeId = _cafeLabelToId?.[val(form, 'existing')]; if (!body.existingCafeId) throw new Error('Select an existing café from the suggestions'); }
        const result = await (record ? Api.put('/owner/cafes/' + record.id, body) : Api.post('/owner/cafes', body));
        if (result.user) { AuthService.setUser(result.user); renderMyAvatar(); renderAccountMenu(); }
        toast('Café submitted for admin review');
        return () => { navigate('#business'); renderOwner(); Platform.refreshBadge(); };
      },
    });
  }
  async function renderAdmin() {
    const box = $('#adminContent');
    if (!AuthService.getUser()?.isAdmin) { box.innerHTML = empty('This page is available to authorized administrators.'); return; }
    box.innerHTML = '<p class="muted">Loading applications…</p>';
    try {
      const result = await Api.get('/admin/cafes'); adminRows = result.cafes;
      if (currentView !== 'admin') return;
      box.innerHTML = adminRows.length ? adminRows.map((row) => `<article class="platformCard"><span class="statusBadge ${row.status}">${esc(statusLabel[row.status])}</span><h2>${esc(row.details.name)}</h2><p>${esc(row.details.description)}</p><dl class="applicationDetails"><dt>Owner</dt><dd>${esc(row.details.contactName)}</dd><dt>Address</dt><dd>${esc(row.details.address)} · ${esc(row.details.area)}</dd><dt>Hours / cuisines</dt><dd>${esc(row.details.hours)} · ${esc(row.details.cuisines.join(', '))}</dd><dt>Contact</dt><dd>${esc(row.details.phone)} ${esc(row.details.website)}</dd><dt>Listing</dt><dd>${esc(row.existingCafeId || 'New café')} · Revision ${row.revision}</dd></dl>${row.reviewNote ? `<p class="reviewNote">${esc(row.reviewNote)}</p>` : ''}${row.status === 'pending' ? `<div class="platformActions"><button class="btn btnPrimary" data-platform="approve" data-id="${row.id}">Approve</button><button class="btn btnGhost" data-platform="request-changes" data-id="${row.id}">Request changes</button><button class="btn btnGhost" data-platform="reject" data-id="${row.id}">Reject</button></div>` : ''}</article>`).join('') : empty('No café applications have been submitted yet.');
    } catch (error) { box.innerHTML = empty(error.message); }
  }
  function openReviewDecision(record, decision) {
    openFormModal({ title: decision === 'approved' ? 'Approve ' + record.details.name : decision === 'rejected' ? 'Reject café application' : 'Request changes', subtitle: 'The owner receives this decision in their dashboard and notifications.', submitLabel: 'Save decision',
      body: field(decision === 'approved' ? 'Review note (optional)' : 'Reason / changes needed *', '<textarea name="note" maxlength="500" rows="4"></textarea>'),
      onSubmit: async (form) => {
        await Api.post('/admin/cafes/' + record.id + '/review', { decision, revision: record.revision, note: val(form, 'note') });
        await Platform.refreshCatalog(); toast('Review saved');
        return () => renderAdmin();
      },
    });
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-platform]'); if (!button) return;
    const action = button.dataset.platform, id = button.dataset.id;
    if (action === 'register-cafe') openOwnerForm();
    if (action === 'edit-cafe') openOwnerForm(ownerRows.find((row) => row.id === id));
    if (action === 'owner-event') requireProfile(() => openEventForm({ cafeId: button.dataset.cafe }));
    if (['approve', 'request-changes', 'reject'].includes(action)) openReviewDecision(adminRows.find((row) => row.id === id), { approve: 'approved', 'request-changes': 'changes_requested', reject: 'rejected' }[action]);
  });
  return { route(view) { return view === 'admin' ? renderAdmin() : renderOwner(); } };
})();
