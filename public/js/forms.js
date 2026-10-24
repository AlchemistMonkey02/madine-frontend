/* =========================================================================
   Form modal — one reusable dialog (styled like the login modal) for the
   profile, community, event and check-in forms. Each form supplies its
   fields and an async onSubmit; a thrown error is shown inside the dialog.
   ========================================================================= */

let _formSubmit = null;
let _formOpen = false;

function openFormModal({ title, subtitle = "", body, submitLabel, onSubmit }) {
  $("#formTitle").textContent = title;
  $("#formSubtitle").textContent = subtitle;
  $("#formSubtitle").hidden = !subtitle;
  $("#formBody").innerHTML = `${body}<div class="authError" id="formError"></div><button class="btn btnPrimary block" type="submit">${esc(submitLabel)}</button>`;
  _formSubmit = onSubmit;
  if (!_formOpen) { _formOpen = true; lockScroll(true); }
  $("#formOverlay").classList.add("open");
  $("#formOverlay .formModal").scrollTop = 0;
  setTimeout(() => $("#formBody input:not([type=hidden]), #formBody textarea")?.focus(), 60);
}
function closeFormModal() {
  if (!_formOpen) return;
  _formOpen = false;
  _formSubmit = null;
  $("#formOverlay").classList.remove("open");
  lockScroll(false);
}

$("#formBody").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!_formSubmit) return;
  const form = e.target;
  const btn = form.querySelector("button[type=submit]");
  $("#formError").textContent = "";
  btn.disabled = true;
  try {
    const after = await _formSubmit(form);
    closeFormModal();
    if (typeof after === "function") after();
  } catch (err) {
    $("#formError").textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

/* ---------- small field helpers ---------- */
const field = (label, input, hint = "") =>
  `<label class="formField"><span class="formLabel">${label}</span>${input}${hint ? `<span class="formHint">${hint}</span>` : ""}</label>`;
const pad2 = (n) => String(n).padStart(2, "0");
const localDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const localTime = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const val = (form, name) => (form.elements[name]?.value || "").trim();

function chipGroup(name, options, selected, max) {
  return `<div class="chipRow wrap formChips" data-chip-group="${name}" data-max="${max}">${options.map((o) =>
    `<button type="button" class="chip ${selected.includes(o) ? "active" : ""}" data-form-chip="${name}" data-value="${esc(o)}">${esc(o)}</button>`).join("")}</div>`;
}
const chipValues = (name) => $$(`[data-chip-group="${name}"] .chip.active`).map((b) => b.dataset.value);
function toggleFormChip(chip) {
  const group = chip.closest("[data-chip-group]");
  const max = Number(group.dataset.max) || 99;
  if (!chip.classList.contains("active") && group.querySelectorAll(".chip.active").length >= max) {
    toast(`You can pick up to ${max}`);
    return;
  }
  chip.classList.toggle("active");
}

// Café picker: a native <datalist> of "Name · Area" labels mapped back to ids.
let _cafeLabelToId = null;
function cafeDatalist() {
  if (!_cafeLabelToId) {
    _cafeLabelToId = {};
    CAFE_LIST.forEach((c) => { _cafeLabelToId[`${c.name} · ${c.location.area}`] = c.id; });
  }
  return `<datalist id="cafeOptions">${Object.keys(_cafeLabelToId).map((l) => `<option value="${esc(l)}"></option>`).join("")}</datalist>`;
}
const cafeLabel = (id) => (cafeById[id] ? `${cafeById[id].name} · ${cafeById[id].location.area}` : "");

/* ---------- profile ---------- */
const INTEREST_OPTIONS = ["Coffee", "Startups", "Design", "Photography", "Books", "Tech", "Music", "Art", "Food", "Travel", "Fitness", "Networking", "Writing", "Film", "Gaming"];
const PREFERENCE_OPTIONS = ["Mornings", "Afternoons", "Evenings", "Late nights", "Weekends"];
let _favSelected = [];

function renderFavList() {
  $("#favList").innerHTML = _favSelected.map((id) =>
    `<span class="chip active">${esc(cafeById[id]?.name || id)}<button type="button" class="x" data-fav-remove="${esc(id)}" aria-label="Remove">×</button></span>`).join("")
    || `<span class="muted small">No favourites yet.</span>`;
}
function addFavCafe(id) {
  if (!cafeById[id] || _favSelected.includes(id)) return;
  if (_favSelected.length >= 5) return toast("You can pick up to 5 favourites");
  _favSelected.push(id);
  renderFavList();
}
function removeFavCafe(id) {
  _favSelected = _favSelected.filter((x) => x !== id);
  renderFavList();
}

function openProfileForm({ firstTime = false, then = null } = {}) {
  const u = AuthService.getUser();
  if (!u) return;
  _favSelected = [...(u.favoriteCafes || [])];
  const interests = [...new Set([...INTEREST_OPTIONS, ...(u.interests || [])])];
  openFormModal({
    title: firstTime ? "Set up your profile" : "Edit profile",
    subtitle: "This is what other people on MADINE see. Your email always stays private.",
    submitLabel: firstTime ? "Save & continue" : "Save changes",
    body: `
      ${field("Name *", `<input name="name" maxlength="40" required value="${esc(u.name)}" placeholder="What should people call you?">`)}
      ${field("What do you do?", `<input name="role" maxlength="40" value="${esc(u.role)}" placeholder="e.g. Designer, Founder, Student">`)}
      ${field("Bio", `<textarea name="bio" maxlength="280" rows="3" placeholder="A line or two about you">${esc(u.bio)}</textarea>`)}
      <div class="formField"><span class="formLabel">Interests <span class="muted">(up to 10)</span></span>
        ${chipGroup("interests", interests, u.interests || [], 10)}
        <input id="customInterest" maxlength="24" placeholder="Add your own and press Enter"></div>
      <div class="formField"><span class="formLabel">When do you usually go out?</span>${chipGroup("preference", PREFERENCE_OPTIONS, u.preference || [], 5)}</div>
      <div class="formField"><span class="formLabel">Favourite cafés <span class="muted">(up to 5)</span></span>
        <div class="chipRow wrap" id="favList"></div>
        <input id="favInput" list="cafeOptions" placeholder="Search cafés…" autocomplete="off">${cafeDatalist()}</div>`,
    onSubmit: async (form) => {
      const { user } = await Api.put("/me/profile", {
        name: val(form, "name"),
        role: val(form, "role"),
        bio: val(form, "bio"),
        interests: chipValues("interests"),
        preference: chipValues("preference"),
        favoriteCafes: _favSelected,
      });
      AuthService.setUser(user);
      toast(firstTime ? `Welcome to MADINE, ${user.name}!` : "Profile updated");
      renderMyAvatar();
      renderAccountMenu();
      refreshPeopleUI(); // swaps "create your profile" prompts for the real thing
      return then;
    },
  });
  renderFavList();
}

// Enter in "add interest" adds a chip instead of submitting the form;
// picking a café from the datalist adds it to favourites.
$("#formBody").addEventListener("keydown", (e) => {
  if (e.target.id !== "customInterest" || e.key !== "Enter") return;
  e.preventDefault();
  const v = e.target.value.trim().replace(/\s+/g, " ");
  if (!v) return;
  const group = $('[data-chip-group="interests"]');
  const existing = [...group.querySelectorAll(".chip")].find((c) => c.dataset.value.toLowerCase() === v.toLowerCase());
  if (existing) { if (!existing.classList.contains("active")) toggleFormChip(existing); }
  else if (group.querySelectorAll(".chip.active").length >= 10) toast("You can pick up to 10");
  else group.insertAdjacentHTML("beforeend", `<button type="button" class="chip active" data-form-chip="interests" data-value="${esc(v)}">${esc(v)}</button>`);
  e.target.value = "";
});
$("#formBody").addEventListener("input", (e) => {
  if (e.target.id !== "favInput") return;
  const id = _cafeLabelToId?.[e.target.value];
  if (id) { addFavCafe(id); e.target.value = ""; }
});

/* ---------- community ---------- */
function openCommunityForm() {
  openFormModal({
    title: "Start a community",
    subtitle: "You'll be the owner. Anyone on MADINE can find and join it.",
    submitLabel: "Create community",
    body: `
      ${field("Name *", `<input name="name" maxlength="60" required placeholder="e.g. Jaipur Sketch Club">`)}
      ${field("What's it about? *", `<textarea name="description" maxlength="300" rows="3" required placeholder="Who is it for, and what do you do together?"></textarea>`)}
      ${field("Tags", `<input name="tags" maxlength="100" placeholder="e.g. Art, Weekends, Beginners">`, "Separate with commas — up to 4.")}`,
    onSubmit: async (form) => {
      const { community } = await Api.post("/communities", {
        name: val(form, "name"),
        description: val(form, "description"),
        tags: val(form, "tags").split(",").map((t) => t.trim()).filter(Boolean),
      });
      COMMUNITIES.unshift(community);
      renderCommunities();
      toast(`${community.name} is live 🎉`);
      return () => navigate("#communities");
    },
  });
}

/* ---------- event ---------- */
function openEventForm({ cafeId: presetCafeId } = {}) {
  const mine = COMMUNITIES.filter((c) => c.joined);
  const start = new Date(Date.now() + 864e5);
  start.setHours(18, 0, 0, 0);
  openFormModal({
    title: "Host an event",
    subtitle: "Pick a café and a time. You'll be listed as going automatically.",
    submitLabel: "Create event",
    body: `
      ${field("Title *", `<input name="title" maxlength="80" required placeholder="e.g. Founders coffee meetup">`)}
      ${field("Café *", `<input name="cafe" list="cafeOptions" required placeholder="Search cafés…" autocomplete="off" value="${esc(presetCafeId ? cafeLabel(presetCafeId) : currentView === "cafe" ? cafeLabel(currentCafe) : "")}">${cafeDatalist()}`)}
      <div class="formRow">
        ${field("Date *", `<input type="date" name="date" required min="${localDate(new Date())}" value="${localDate(start)}">`)}
        ${field("Time *", `<input type="time" name="time" required value="${localTime(start)}">`)}
      </div>
      <div class="formRow">
        ${field("Max people", `<input type="number" name="capacity" min="2" max="1000" placeholder="No limit">`)}
        ${mine.length ? field("Community", `<select name="communityId"><option value="">None</option>${mine.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select>`) : ""}
      </div>
      ${field("Details", `<textarea name="description" maxlength="500" rows="3" placeholder="What's the plan? Anything people should bring or know?"></textarea>`)}`,
    onSubmit: async (form) => {
      const cafeId = _cafeLabelToId[val(form, "cafe")];
      if (!cafeId) throw new Error("Pick a café from the list");
      const startsAt = new Date(`${val(form, "date")}T${val(form, "time")}`);
      if (isNaN(startsAt)) throw new Error("Pick a date and time");
      const { event } = await Api.post("/events", {
        title: val(form, "title"),
        description: val(form, "description"),
        cafeId,
        startsAt: startsAt.toISOString(),
        capacity: val(form, "capacity") || null,
        communityId: val(form, "communityId") || null,
      });
      EVENTS.push(event);
      EVENTS.sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
      renderEvents();
      renderHomeEvents();
      renderMe();
      toast("Your event is live 🎉");
      return () => navigate("#events");
    },
  });
}

/* ---------- check-in: "I'll be here" ---------- */
function openCheckinForm() {
  const c = cafeById[currentCafe];
  if (!c) return;
  const from = new Date(); from.setSeconds(0, 0); // allow an immediate check-in when the customer is already at the café
  const to = new Date(from.getTime() + 2 * 36e5);
  openFormModal({
    title: `I'll be at ${c.name}`,
    subtitle: "Share your visit plan with connections. You can also opt in to meet other MADINE members at this café.",
    submitLabel: "Share check-in",
    body: `
      ${field("Day", `<input type="date" name="date" required min="${localDate(new Date())}" max="${localDate(new Date(Date.now() + 13 * 864e5))}" value="${localDate(from)}">`)}
      <div class="formRow">
        ${field("From", `<input type="time" name="from" required value="${localTime(from)}">`)}
        ${field("Until", `<input type="time" name="to" required value="${localTime(to)}">`)}
      </div>
      <label class="checkinConsent"><input type="checkbox" name="openToChat"><span>Let other opted-in MADINE members at this café know I'm here and open to chat.</span></label>`,
    onSubmit: async (form) => {
      const startsAt = new Date(`${val(form, "date")}T${val(form, "from")}`);
      const endsAt = new Date(`${val(form, "date")}T${val(form, "to")}`);
      if (endsAt <= startsAt) endsAt.setDate(endsAt.getDate() + 1); // e.g. 10 PM → 1 AM
      await Api.post("/checkins", { cafeId: c.id, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), openToChat: form.elements.openToChat.checked });
      toast("Your café check-in is saved");
      return () => { selectTab("people"); renderCafeCheckins(true); }; // show the check-in and start discovery if opted in
    },
  });
}
async function deleteCheckin(id) {
  try {
    await Api.del(`/checkins/${encodeURIComponent(id)}`);
    toast("Check-in removed");
    renderCafeCheckins(true);
  } catch (err) { toast(err.message); }
}
async function toggleCheckinDiscovery(id, enabled) {
  try {
    await Api.put(`/checkins/${encodeURIComponent(id)}/discovery`, { openToChat: !enabled });
    toast(!enabled ? "Cafe chat discovery enabled" : "Cafe chat discovery turned off");
    await renderCafeCheckins(true);
  } catch (err) { toast(err.message); }
}
