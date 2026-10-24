/* =========================================================================
   MADINE app — routing, rendering, filters, search, café detail, lightbox,
   people/connections and chat wiring. Data lives in data.js, chat transport
   in chat.js, auth in auth.js; this file is the only place that touches the DOM.
   ========================================================================= */

/* ---------------- tiny helpers ---------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtNum = (n) => Number(n).toLocaleString("en-IN");
const plural = (n, word, many) => `${fmtNum(n)} ${n === 1 ? word : many || word + "s"}`;
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const highlight = (text, q) => (q ? esc(text).replace(new RegExp(`(${escRe(esc(q))})`, "ig"), "<mark>$1</mark>") : esc(text));

// Preserve the existing broken-photo fallback without inline event handlers.
document.addEventListener('error', (event) => {
  if (event.target instanceof HTMLImageElement && event.target.closest('.ccard')) event.target.remove();
}, true);

/* Lucide icons rendered straight to SVG strings, so dynamic templates never
   need a document-wide createIcons() rescan. Static markup uses data-lucide. */
const _iconCache = {};
function icon(name, cls = "") {
  const key = name + "|" + cls;
  if (_iconCache[key]) return _iconCache[key];
  const lib = window.lucide && window.lucide.icons;
  const pascal = name.replace(/(^|-)([a-z0-9])/g, (_, __, ch) => ch.toUpperCase());
  let node = lib && lib[pascal];
  if (!node) return (_iconCache[key] = "");
  const children = node[0] === "svg" ? node[2] : node;
  const inner = children.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(" ")}/>`).join("");
  return (_iconCache[key] = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide ${cls}" aria-hidden="true">${inner}</svg>`);
}
function hydrateIcons() {
  $$('[data-lucide]').forEach((placeholder) => {
    const markup = icon(placeholder.dataset.lucide);
    if (!markup) return;
    const template = document.createElement('template'); template.innerHTML = markup;
    const svg = template.content.firstElementChild;
    for (const attr of placeholder.attributes) {
      if (attr.name === 'data-lucide') continue;
      if (attr.name === 'class') svg.classList.add(...attr.value.split(/\s+/).filter(Boolean));
      else svg.setAttribute(attr.name, attr.value);
    }
    placeholder.replaceWith(svg);
  });
}

/* ---------------- storage ----------------
   Only per-browser conveniences (recent searches) live in localStorage.
   Saved places, connections, chats, communities and events come from the
   server for the logged-in user (see loadSocialData). */
const Store = {
  get(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; } },
  set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} },
};
let saved = new Set();
let connections = {};   // personId -> "sent" | "incoming" | "connected"
let conversations = {}; // personId -> messages (latest only until the chat is opened)
let unread = {};        // personId -> unread message count
let recentSearches = Store.get("vybe_recent_searches", []);
const persistSearches = () => Store.set("vybe_recent_searches", recentSearches);

/* ---------------- data model ---------------- */
let CAFE_LIST = [];
let cafeById = {};
let AREAS = [];      // [[area, count]] sorted by count
let CUISINES = [];   // [[cuisine, count]]
let personById = {};

const VIBE_ICONS = { "Quiet Work": "laptop", "Date Night": "moon-star", Friends: "users-round", Solo: "coffee", Rooftop: "building-2", Cozy: "sofa", Luxury: "gem", Outdoor: "trees", "Late Night": "moon" };
const VIBE_BLURB = { "Quiet Work": "Plug in and focus", "Date Night": "Candles, good food, no rush", Friends: "Big tables, louder laughs", Solo: "A corner of your own", Rooftop: "Sunsets over the Pink City", Cozy: "Warm, unhurried spaces", Luxury: "Dress up a little", Outdoor: "Open-air tables", "Late Night": "For the night owls" };
const TYPE_LABELS = { Cafe: "Cafés", Restaurant: "Restaurants", Bakery: "Bakeries", Rooftop: "Rooftops", "Fine Dining": "Fine dining" };
const GRADIENTS = ["linear-gradient(135deg,#9B6BFF,#46169A)", "linear-gradient(135deg,#F2A65A,#C2410C)", "linear-gradient(135deg,#F472B6,#9D174D)", "linear-gradient(135deg,#34D399,#047857)", "linear-gradient(135deg,#60A5FA,#1D4ED8)", "linear-gradient(135deg,#FBBF24,#B45309)"];
const gradientFor = (s) => GRADIENTS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % GRADIENTS.length];

function normalizeCafe(c) {
  c.cuisines = c.cuisines && c.cuisines.length ? c.cuisines : [...c.cafeType];
  c.menuImages = Array.isArray(c.menuImages) ? c.menuImages : [];
  c.gallery = c.gallery && c.gallery.length ? c.gallery : c.image ? [c.image] : [];
  c.menuCategories = Array.isArray(c.menuCategories) ? c.menuCategories : [];
  c.links = c.links || { maps: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.name}, ${c.location.area}, Jaipur`)}` };
  const dishes = c.menuCategories.length ? c.menuCategories.flatMap((m) => m.items) : (c.menu || []).map((m) => m[0]);
  c._dishes = dishes;
  c._dishesLower = dishes.map((d) => d.toLowerCase());
  c._search = [c.name, c.location.area, c.location.address, ...c.cuisines, ...c.cafeType, ...c.ambience, ...c.topFoods.map((f) => f.name), ...dishes]
    .join(" · ").toLowerCase();
  c._score = (c.rating || 3.7) * 2 + Math.log10((c.reviews || 8) + 1) + (c.menuImages.length ? 0.6 : 0) + Math.min(c.gallery.length, 5) * 0.08;
  return c;
}

function prepareData() {
  CAFE_LIST = CAFES.map(normalizeCafe);
  cafeById = Object.fromEntries(CAFE_LIST.map((c) => [c.id, c]));
  const areaMap = {}, cuisineMap = {};
  CAFE_LIST.forEach((c) => {
    areaMap[c.location.area] = (areaMap[c.location.area] || 0) + 1;
    c.cuisines.forEach((x) => (cuisineMap[x] = (cuisineMap[x] || 0) + 1));
  });
  AREAS = Object.entries(areaMap).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  CUISINES = Object.entries(cuisineMap).sort((a, b) => b[1] - a[1]);
}

const usedFoodCategories = () => {
  const counts = {};
  CAFE_LIST.forEach((c) => new Set(c.topFoods.map((f) => f.category)).forEach((k) => (counts[k] = (counts[k] || 0) + 1)));
  return FOOD_CATEGORIES.filter((f) => counts[f.key]).map((f) => ({ ...f, count: counts[f.key] }));
};
const foodLabel = (key) => (FOOD_CATEGORIES.find((f) => f.key === key) || {}).label || key;
const vibeCounts = () => {
  const m = {};
  CAFE_LIST.forEach((c) => c.ambience.forEach((a) => (m[a] = (m[a] || 0) + 1)));
  return m;
};

/* ---------------- shared components ---------------- */
function ratingPill(c, size = "") {
  if (!c.rating) return `<span class="rating new ${size}">New</span>`;
  const tone = c.rating >= 4 ? "" : c.rating >= 3.5 ? "mid" : "low";
  return `<span class="rating ${tone} ${size}" title="${c.reviews ? fmtNum(c.reviews) + " reviews" : "Rating"}">${c.rating.toFixed(1)} ${icon("star")}</span>`;
}

function cafeCard(c, i = 0) {
  const img = c.gallery[0];
  const alt = c.gallery[1];
  const badge = c.trending
    ? `<span class="badge hot">${icon("flame")} Trending</span>`
    : c.rating >= 4.5 ? `<span class="badge top">${icon("award")} Top rated</span>` : "";
  const tries = c.topFoods.slice(0, 2).map((f) => esc(f.name)).join(", ");
  return `<article class="ccard enter" style="animation-delay:${Math.min(i, 8) * 45}ms" data-cafe="${esc(c.id)}" tabindex="0" role="link" aria-label="${esc(c.name)}">
    <div class="ccMedia">
      ${img ? `<img src="${esc(img)}" alt="" loading="lazy" decoding="async">` : `<span class="noImg">${esc(c.name[0])}</span>`}
      ${alt ? `<img class="alt" src="${esc(alt)}" alt="" loading="lazy" decoding="async">` : ""}
      <div class="ccBadges">${badge}</div>
      <button class="heartBtn ${saved.has(c.id) ? "on" : ""}" data-save="${esc(c.id)}" aria-pressed="${saved.has(c.id)}" aria-label="Save ${esc(c.name)}">${icon("heart")}</button>
      ${c.menuImages.length ? `<span class="ccMenuBadge">${icon("book-open")} ${plural(c.menuImages.length, "menu page")}</span>` : ""}
      ${c.gallery.length > 1 ? `<span class="ccDots">${c.gallery.slice(0, 5).map(() => "<i></i>").join("")}</span>` : ""}
    </div>
    <div class="ccBody">
      <div class="ccTitle"><h3>${esc(c.name)}</h3>${ratingPill(c)}</div>
      <div class="ccMeta">${icon("map-pin")}<span class="ellip">${esc(c.location.area)} · ${esc(c.cafeType[0])}${c.reviews ? ` · ${fmtNum(c.reviews)} reviews` : ""}</span></div>
      <div class="ccCuisine">${esc(c.cuisines.slice(0, 4).join(" · "))}</div>
      ${tries ? `<div class="ccTry"><b>Must try</b> · ${tries}</div>` : ""}
      ${c.menuImages.length ? '<span class="ccMenuMeta">Real menu cards</span>' : ''}
      <span class="ccExplore">View café &amp; menu ${icon("arrow-right")}</span>
    </div>
  </article>`;
}
const skeletonCards = (n) => Array.from({ length: n }, () => `<div class="skel"><div class="ccMedia"></div><div class="skelLine" style="width:72%"></div><div class="skelLine" style="width:46%"></div></div>`).join("");

// Avatar circle: the person's photo if they uploaded one, else their initial
// on a gradient. `cls` is the existing avatar class for that spot.
function avatarHTML(p, cls, extra = "") {
  const photo = p.avatar ? `background-image:url('${esc(p.avatar)}');` : "";
  return `<div class="${cls}${p.avatar ? " hasPhoto" : ""}" style="--g:${gradientFor(p.name)};${photo}">${p.avatar ? "" : esc(p.initial)}${extra}</div>`;
}
const roleLine = (p) => [p.role, "Jaipur"].filter(Boolean).join(" · ");

function personCard(p) {
  const favs = p.favoriteCafes.map((id) => cafeById[id]).filter(Boolean);
  return `<article class="pcard" data-person="${p.id}" tabindex="0" role="link" aria-label="${esc(p.name)}'s profile">
    <div class="pcTop">${avatarHTML(p, "pAvatar")}<div><b>${esc(p.name)}</b><span>${esc(roleLine(p))}</span></div></div>
    ${p.bio ? `<p>${esc(p.bio)}</p>` : ""}
    <div class="pcTags">${p.interests.slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
    ${favs.length ? `<div class="pcFav">${icon("heart")} Loves ${esc(favs[0].name)}${favs.length > 1 ? ` +${favs.length - 1}` : ""}</div>` : ""}
    ${connectBtnMarkup(p.id)}
  </article>`;
}
function connectionState(id) { return connections[id] || "none"; }
function connectBtnMarkup(id) {
  const m = {
    none: ["state-connect", icon("user-plus") + " Connect", "connect"],
    sent: ["state-sent", icon("clock") + " Requested", "cancel"],
    incoming: ["state-incoming", icon("check") + " Accept request", "accept"],
    connected: null,
  }[connectionState(id)];
  // Chat unlocks only once both people have accepted the connection.
  if (!m) return `<button class="connectBtn state-connected" data-chat="${id}">${icon("message-circle")} Message</button>`;
  return `<button class="connectBtn ${m[0]}" data-conn-action="${m[2]}" data-id="${id}">${m[1]}</button>`;
}
// One line under the profile button explaining why chat isn't available yet.
function connectHint(id) {
  const name = esc(personById[id]?.name || "they");
  return {
    none: `${icon("lock")} Connect first — you can chat once ${name} accepts.`,
    sent: `${icon("clock")} Request sent. You can chat once ${name} accepts.`,
    incoming: `${icon("user-check")} ${name} wants to connect. Accept to start chatting.`,
    connected: `${icon("check")} You're connected — say hello!`,
  }[connectionState(id)];
}

const fmtWhen = (d) => `${d.toLocaleDateString("en-IN", { weekday: "long" })} · ${d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
function eventItem(e, compact) {
  const d = new Date(e.startsAt);
  const day = String(d.getDate());
  const mon = d.toLocaleDateString("en-IN", { month: "short" }).toUpperCase();
  const place = `<button class="linkish" data-cafe="${esc(e.cafeId)}">${icon("map-pin")} ${esc(e.cafeName)}</button>`;
  const full = e.capacity && e.goingCount >= e.capacity && !e.going;
  const meta = [`${icon("users-round")} ${e.goingCount}${e.capacity ? ` / ${e.capacity}` : ""} going`, e.communityName ? esc(e.communityName) : ""].filter(Boolean).join(" · ");
  const btn = e.going
    ? `<button class="btn btnGhost going" data-event-action="leave" data-id="${e.id}">${icon("check")} Going</button>`
    : `<button class="btn btnGhost" data-event-action="join" data-id="${e.id}" ${full ? "disabled" : ""}>${full ? "Full" : "Join"}</button>`;
  return `<div class="eventItem"><div class="dateBlock"><span>${esc(mon)}</span><b>${esc(day)}</b></div>
    <div class="eventInfo"><b>${esc(e.title)}</b><span>${icon("clock")} ${esc(fmtWhen(d))} ${compact ? "" : `· ${place}`}</span>${compact ? `<span>${place}</span>` : `<span>${meta}</span>`}
    ${!compact && e.description ? `<p class="eventDesc">${esc(e.description)}</p>` : ""}</div>
    ${btn}</div>`;
}

/* ---------------- routing ---------------- */
const VIEWS = ["home", "discover", "cafe", "people", "profile", "connections", "communities", "events", "messages", "saved", "me", "business", "admin", "discussion", "notifications"];
const LEGACY = { findPeople: "people", myProfile: "me", cafeDetail: "cafe" };
const scrollMemory = {};
let currentView = null;
let dataReady = false;

function parseHash() {
  const [view, ...rest] = location.hash.replace(/^#\/?/, "").split("/");
  const v = LEGACY[view] || view;
  try {
    return { view: VIEWS.includes(v) ? v : "home", params: rest.map(decodeURIComponent) };
  } catch {
    return { view: "discover", params: [], invalid: true };
  }
}
function navigate(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}
// kept for auth.js and any old call sites
function showView(id) { navigate("#" + (LEGACY[id] || id)); }

function setActiveView(view) {
  $$(".view").forEach((v) => v.classList.toggle("active", v.dataset.view === view));
  const navKey = { cafe: "discover", profile: "people", connections: "people" }[view] || view;
  $$("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === navKey));
  document.body.classList.toggle("onCafe", view === "cafe");
}

function route() {
  if (/^#\/?feed(?:\/|$)/.test(location.hash)) history.replaceState(null, '', '#home');
  const { view, params, invalid } = parseHash();
  if (invalid) {
    history.replaceState(null, '', '#discover');
    toast("That link isn't valid. Showing cafés instead.");
  }
  if (currentView) scrollMemory[currentView] = window.scrollY;
  const prev = currentView;
  if (!dataReady && ["cafe", "profile"].includes(view)) { setActiveView(view === "cafe" ? "discover" : "people"); return; }
  const cafeTab = view === 'cafe' ? params[1] || 'overview' : null;
  if (view !== 'cafe' || params[0] !== currentCafe || cafeTab !== 'people') stopCafeDinerPolling();

  if (view === "cafe" && !renderCafe(params[0], params[1])) return navigate("#discover");
  if (view === "profile" && !renderProfile(params[0])) return navigate("#people");
  if (dataReady && view === "home") renderHome();
  if (view === "people") renderPeople();
  if (view === "discover" && discoverDirty) renderDiscover();
  if (view === "saved") renderSaved();
  if (view === "me") renderMe();
  if (view === "messages") renderChatList();
  if (view === "connections") renderConnections();

  setActiveView(view);
  currentView = view;
  closeOverlays();
  if (view === "cafe") requestAnimationFrame(moveTabInk); // needs the view visible to measure
  const restore = prev === "cafe" && (view === "discover" || view === "home") ? scrollMemory[view] || 0 : 0;
  window.scrollTo({ top: restore, behavior: "instant" });
  if (view === "cafe" && pendingDish != null) {
    pendingDish = null;
    setTimeout(() => $("#dishBlock").scrollIntoView({ behavior: "smooth", block: "start" }), 300);
  }
  document.title = view === "cafe" && cafeById[params[0]] ? `${cafeById[params[0]].name} · MADINE` : "MADINE — Discover Jaipur's cafés, menus & people";
  if (dataReady && typeof Platform !== 'undefined') Platform.route(view);
}
window.addEventListener("hashchange", route);

/* ---------------- home ---------------- */
function renderHome() {
  const top = CAFE_LIST.filter((c) => c.rating).sort((a, b) => b.rating - a.rating || (b.reviews || 0) - (a.reviews || 0));
  $("#heroCount").textContent = CAFE_LIST.length;

  const menuPages = CAFE_LIST.reduce((n, c) => n + c.menuImages.length, 0);
  $("#statBand").innerHTML = [
    ["store", CAFE_LIST.length, "cafés & restaurants", ""],
    ["map-pin", AREAS.length, "neighbourhoods", ""],
    ["book-open", menuPages, "real menu pages", "gold"],
    ["utensils", CUISINES.length, "cuisines to explore", "gold"],
  ].map(([ic, n, label, tone]) => `<div class="stat"><span class="statIcon ${tone}">${icon(ic)}</span><div><b>${fmtNum(n)}</b><span>${label}</span></div></div>`).join("");

  const featured = ["JPR-014", "JPR-019", "JPR-001"].map((id) => cafeById[id]).filter(Boolean);
  const featuredIds = new Set(featured.map((c) => c.id));
  $("#railTop").innerHTML = [...featured, ...top.filter((c) => !featuredIds.has(c.id))].slice(0, 12).map(cafeCard).join("");

  $("#cravingTiles").innerHTML = usedFoodCategories().map((f) => `
    <button class="tile" data-quick="foods:${f.key}"><img src="${f.image}" alt="" loading="lazy"><div><b>${esc(f.label)}</b><span>${plural(f.count, "place")}</span></div></button>`).join("");

  const vc = vibeCounts();
  const vibeOrder = ["Date Night", "Quiet Work", "Friends", "Cozy", "Solo", "Rooftop", "Luxury", "Outdoor", "Late Night"].filter((v) => vc[v]);
  $("#vibeTiles").innerHTML = vibeOrder.slice(0, 7).map((v) => `
    <button class="tile" data-quick="vibes:${esc(v)}"><img src="${VIBE_IMAGES[v]}" alt="" loading="lazy"><div><b>${esc(v)}</b><span>${esc(VIBE_BLURB[v] || "")} · ${vc[v]}</span></div></button>`).join("");

  $("#areaGrid").innerHTML = AREAS.slice(0, 8).map(([area, n]) => {
    const best = CAFE_LIST.filter((c) => c.location.area === area && c.gallery[0]).sort((a, b) => b._score - a._score)[0];
    return `<button class="areaCard" data-quick="areas:${esc(area)}">
      ${best ? `<img src="${esc(best.gallery[0])}" alt="" loading="lazy">` : ""}
      <span class="arrow">${icon("arrow-right")}</span>
      <b>${esc(area)}</b><span>${icon("store")} ${plural(n, "place")}</span></button>`;
  }).join("");

  const cafes = CAFE_LIST.filter((c) => c.cafeType.includes("Cafe")).sort((a, b) => b._score - a._score);
  $("#cafePicks").innerHTML = cafes.slice(0, 8).map(cafeCard).join("");
  renderHomePeople();
  renderHomeEvents();
  renderForYou();
}
/* "Picked for you": extra rail on top of the default home sections, ranked
   from the profile's interests, usual times and favourite cafés. */
const PREFERENCE_HINTS = {
  Coffee: ["coffee", "cafe"], Startups: ["work friendly", "wi-fi"], Tech: ["work friendly", "wi-fi"], Networking: ["work friendly", "social"],
  Writing: ["quiet", "work friendly"], Books: ["quiet", "cozy"], Design: ["aesthetic", "artistic"], Art: ["artistic", "art"], Photography: ["aesthetic", "rooftop", "heritage"],
  Music: ["live music", "music"], Food: ["dining", "restaurant"], Travel: ["heritage", "rooftop"], Fitness: ["healthy", "salad"], Film: ["cozy"], Gaming: ["board games"],
  Mornings: ["breakfast", "brunch"], Afternoons: ["brunch", "dessert"], Evenings: ["rooftop", "sunset"], "Late nights": ["late night", "24 hours"], Weekends: ["brunch", "outdoor"],
};
function renderForYou() {
  const user = AuthService.getUser();
  const section = $("#forYouSection");
  if (!section) return;
  const favs = (user?.favoriteCafes || []).map((id) => cafeById[id]).filter(Boolean);
  const hints = [...(user?.interests || []), ...(user?.preference || [])].flatMap((x) => PREFERENCE_HINTS[x] || [x.toLowerCase()]);
  if (!user || (!favs.length && !hints.length)) { section.hidden = true; return; }
  const favAreas = new Set(favs.map((c) => c.location.area));
  const favCuisines = new Set(favs.flatMap((c) => c.cuisines));
  const skip = new Set([...favs.map((c) => c.id), ...saved]);
  const picks = CAFE_LIST.filter((c) => !skip.has(c.id)).map((c) => {
    let score = 0;
    if (favAreas.has(c.location.area)) score += 2;
    score += c.cuisines.filter((x) => favCuisines.has(x)).length * 1.2;
    score += hints.filter((h) => c._search.includes(h)).length;
    return { c, score: score ? score + c._score * 0.25 : 0 };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 12);
  section.hidden = !picks.length;
  $("#forYouWhy").textContent = [
    (user.interests || []).length ? `your interests (${user.interests.slice(0, 3).join(", ")})` : "",
    favs.length ? "your favourite cafés" : "",
  ].filter(Boolean).join(" and ").replace(/^/, "Based on ") + ".";
  $("#railForYou").innerHTML = picks.map((x, i) => cafeCard(x.c, i)).join("");
}
function renderHomePeople() {
  const content = PEOPLE.length ? PEOPLE.slice(0, 3).map(personCard).join("")
    : AuthService.getUser()?.profileComplete
      ? `<div class="emptyState slim"><p class="muted">You're one of the first people here — others will show up as they join.</p><button class="btn btnGhost" data-action="share-site">${icon("share-2")} Invite friends</button></div>`
      : `<div class="emptyState slim"><p class="muted">No profiles yet — be one of the first people on MADINE.</p><button class="btn btnGhost" data-action="edit-profile">${icon("user-plus")} Create your profile</button></div>`;
  $("#homePeople").innerHTML = withSocialStatus(['people'], content, PEOPLE.length > 0);
}
function renderHomeEvents() {
  const upcoming = EVENTS.filter((e) => new Date(e.startsAt) > Date.now());
  const content = upcoming.length ? upcoming.slice(0, 3).map((e) => eventItem(e, true)).join("")
    : `<div class="emptyState slim"><p class="muted">No meetups planned yet.</p><button class="btn btnGhost" data-action="create-event">${icon("calendar-plus")} Host one</button></div>`;
  $("#homeEvents").innerHTML = withSocialStatus(['events'], content, upcoming.length > 0);
}

/* ---------------- discover: filter engine ---------------- */
const F = { q: "", types: new Set(), vibes: new Set(), foods: new Set(), cuisines: new Set(), areas: new Set(), minRating: 0, hasMenu: false };
let sortBy = "recommended";
let discoverDirty = true;
let discoverResults = [];
let discoverShown = 0;
const PAGE = 18;

function resetFilters() {
  F.q = ""; F.minRating = 0; F.hasMenu = false;
  ["types", "vibes", "foods", "cuisines", "areas"].forEach((k) => F[k].clear());
}
function matchesCafe(c) {
  if (F.q) {
    const q = F.q.toLowerCase().trim();
    if (!c._search.includes(q) && !q.split(/\s+/).every((t) => c._search.includes(t))) return false;
  }
  if (F.types.size && !c.cafeType.some((t) => F.types.has(t))) return false;
  if (F.vibes.size && !c.ambience.some((a) => F.vibes.has(a))) return false;
  if (F.foods.size && !c.topFoods.some((f) => F.foods.has(f.category))) return false;
  if (F.cuisines.size && !c.cuisines.some((x) => F.cuisines.has(x))) return false;
  if (F.areas.size && !F.areas.has(c.location.area)) return false;
  if (F.minRating && !(c.rating >= F.minRating)) return false;
  if (F.hasMenu && !c.menuImages.length) return false;
  return true;
}
function sortCafes(list) {
  const by = {
    recommended: (a, b) => b._score - a._score,
    rating: (a, b) => (b.rating || 0) - (a.rating || 0) || (b.reviews || 0) - (a.reviews || 0),
    reviews: (a, b) => (b.reviews || 0) - (a.reviews || 0),
    menu: (a, b) => b.menuImages.length - a.menuImages.length,
    az: (a, b) => a.name.localeCompare(b.name),
  }[sortBy];
  return list.sort(by);
}
const filterCount = () => F.types.size + F.vibes.size + F.foods.size + F.cuisines.size + F.areas.size + (F.minRating ? 1 : 0) + (F.hasMenu ? 1 : 0);

function filterPanelHTML(scope) {
  const vc = vibeCounts();
  const foods = usedFoodCategories();
  const cuisineList = CUISINES;
  return `
    <div class="fGroup"><h4>Rating</h4>
      <div class="segmented">${[[0, "Any"], [3.5, "3.5+"], [4, "4.0+"], [4.5, "4.5+"]].map(([v, l]) =>
        `<button class="${F.minRating === v ? "active" : ""}" data-filter-rating="${v}">${v ? icon("star") : ""}${l}</button>`).join("")}</div>
    </div>
    <div class="fGroup"><label class="toggleRow"><span>Has menu card photos</span><input type="checkbox" class="switch" data-filter-menu ${F.hasMenu ? "checked" : ""}></label></div>
    <div class="fGroup"><h4>Vibe</h4><div class="chipRow">${VIBE_TAGS.filter((v) => vc[v]).map((v) =>
      `<button class="chip ${F.vibes.has(v) ? "active" : ""}" data-filter="vibes" data-value="${esc(v)}">${icon(VIBE_ICONS[v] || "sparkles")} ${esc(v)}</button>`).join("")}</div></div>
    <div class="fGroup"><h4>Craving</h4><div class="chipRow">${foods.map((f) =>
      `<button class="chip ${F.foods.has(f.key) ? "active" : ""}" data-filter="foods" data-value="${f.key}">${esc(f.label)}</button>`).join("")}</div></div>
    <div class="fGroup"><h4>Neighbourhood <small>${AREAS.length}</small></h4>
      <input class="miniSearch" placeholder="Find an area…" data-list-filter="areas-${scope}" aria-label="Find an area">
      <div class="checkList scroll" id="areas-${scope}">${AREAS.map(([a, n]) =>
        `<label class="check" data-label="${esc(a.toLowerCase())}"><input type="checkbox" data-filter="areas" data-value="${esc(a)}" ${F.areas.has(a) ? "checked" : ""}><span>${esc(a)}</span><em>${n}</em></label>`).join("")}</div>
    </div>
    <div class="fGroup"><h4>Cuisine <small>${CUISINES.length}</small></h4>
      <input class="miniSearch" placeholder="Find a cuisine…" data-list-filter="cuisines-${scope}" aria-label="Find a cuisine">
      <div class="checkList scroll" id="cuisines-${scope}">${cuisineList.map(([x, n]) =>
        `<label class="check" data-label="${esc(x.toLowerCase())}"><input type="checkbox" data-filter="cuisines" data-value="${esc(x)}" ${F.cuisines.has(x) ? "checked" : ""}><span>${esc(x)}</span><em>${n}</em></label>`).join("")}</div>
    </div>`;
}
function syncFilterUI() {
  const panel = $("#filterPanel"), sheet = $("#filterSheetBody");
  const keepScroll = [panel.scrollTop, sheet.scrollTop];
  const keepLists = $$("[data-list-filter]").map((i) => [i.dataset.listFilter, i.value, $("#" + i.dataset.listFilter)?.scrollTop || 0]);
  panel.innerHTML = filterPanelHTML("p");
  sheet.innerHTML = filterPanelHTML("s");
  panel.scrollTop = keepScroll[0]; sheet.scrollTop = keepScroll[1];
  keepLists.forEach(([id, value, top]) => {
    const input = $(`[data-list-filter="${id}"]`);
    if (!input || !value) return;
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    $("#" + id).scrollTop = top;
  });
  const types = ["Cafe", "Restaurant", "Bakery", "Rooftop", "Fine Dining"].map((t) => [t, CAFE_LIST.filter((c) => c.cafeType.includes(t)).length]).filter(([, n]) => n);
  $("#typeTabs").innerHTML = `<button class="${F.types.size ? "" : "active"}" data-type="" aria-pressed="${!F.types.size}">All<small>${CAFE_LIST.length}</small></button>` +
    types.map(([t, n]) => `<button class="${F.types.has(t) ? "active" : ""}" data-type="${esc(t)}" aria-pressed="${F.types.has(t)}">${esc(TYPE_LABELS[t] || t)}<small>${n}</small></button>`).join("");
  const si = $("#discoverSearch");
  if (si.value !== F.q) si.value = F.q;
  $("#discoverClear").hidden = !F.q;
  const n = filterCount();
  $("#filterCount").hidden = !n;
  $("#filterCount").textContent = n;
}
function activeChipsHTML() {
  const chips = [];
  if (F.q) chips.push(["q", "", `“${F.q}”`]);
  F.vibes.forEach((v) => chips.push(["vibes", v, v]));
  F.foods.forEach((v) => chips.push(["foods", v, foodLabel(v)]));
  F.cuisines.forEach((v) => chips.push(["cuisines", v, v]));
  F.areas.forEach((v) => chips.push(["areas", v, v]));
  if (F.minRating) chips.push(["minRating", "", `${F.minRating}+ rating`]);
  if (F.hasMenu) chips.push(["hasMenu", "", "Has menu photos"]);
  if (!chips.length) return "";
  return chips.map(([k, v, label]) => `<button class="chip" data-remove="${k}" data-value="${esc(v)}">${esc(label)} ${icon("x", "x")}</button>`).join("")
    + `<button class="textBtn" data-action="clear-filters">Clear all</button>`;
}
function renderDiscover() {
  discoverDirty = false;
  discoverResults = sortCafes(CAFE_LIST.filter(matchesCafe));
  discoverShown = 0;
  $("#activeFilters").innerHTML = activeChipsHTML();
  $("#sheetApply").textContent = `Show ${plural(discoverResults.length, "place")}`;
  const grid = $("#discoverGrid");
  if (!discoverResults.length) {
    grid.innerHTML = `<div class="emptyState"><div class="emptyIcon">${icon("search-x")}</div><h2>Nothing matches — yet.</h2><p class="muted">Try removing a filter, or search for a dish like “pasta” or “cold coffee”.</p><button class="btn btnPrimary" data-action="clear-filters">Clear all filters</button></div>`;
    $("#resultCount").innerHTML = "";
    $("#loadMore").innerHTML = "";
    return;
  }
  grid.innerHTML = "";
  appendDiscoverPage();
}
function appendDiscoverPage() {
  const next = discoverResults.slice(discoverShown, discoverShown + PAGE);
  $("#discoverGrid").insertAdjacentHTML("beforeend", next.map((c, i) => cafeCard(c, i)).join(""));
  discoverShown += next.length;
  $("#resultCount").innerHTML = `<b>${plural(discoverResults.length, "place")}</b>${filterCount() || F.q ? " match your filters" : " in Jaipur"}`;
  $("#loadMore").innerHTML = discoverShown < discoverResults.length
    ? `<button class="btn btnGhost" data-action="load-more">Show more · ${fmtNum(discoverResults.length - discoverShown)} left</button>` : "";
}
function applyFilters() { syncFilterUI(); renderDiscover(); }
function quickFilter(spec) {
  const i = spec.indexOf(":");
  const key = spec.slice(0, i), value = spec.slice(i + 1);
  resetFilters();
  F[key].add(value);
  syncFilterUI();
  discoverDirty = true;
  navigate("#discover");
}
function searchDiscover(q) {
  resetFilters();
  F.q = q.trim();
  if (F.q) addRecentSearch(F.q);
  syncFilterUI();
  discoverDirty = true;
  navigate("#discover");
}

/* ---------------- café detail ---------------- */
let currentCafe = null;
let pendingDish = null; // set when a dish search result opens a café's menu
function renderCafe(id, tab) {
  const c = cafeById[id];
  if (!c) return false;
  const same = currentCafe === c.id;
  currentCafe = c.id;

  if (!same) {
    // gallery mosaic
    const g = c.gallery.slice(0, 5);
    $("#cafeMosaic").className = `mosaic n${g.length}`;
    $("#cafeMosaic").innerHTML = g.map((src, i) => `<button data-lb-gallery="${i}" aria-label="Open photo ${i + 1}"><img src="${esc(src)}" alt="${esc(c.name)} photo ${i + 1}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'}></button>`).join("");
    $("#mosaicAll").hidden = c.gallery.length < 2;
    $("#mosaicAll span").textContent = `Show all ${c.gallery.length} photos`;
    $("#mosaicCount").textContent = c.gallery.length > 1 ? `1 / ${c.gallery.length}` : "";
    $("#mosaicCount").hidden = c.gallery.length < 2;
    $("#cafeMosaic").scrollLeft = 0;

    $("#crumbTrail").innerHTML = `<a href="#discover">Discover</a> / <a href="#discover" data-quick="areas:${esc(c.location.area)}">${esc(c.location.area)}</a>`;
    $("#cafeBadges").innerHTML = [
      c.trending ? `<span class="badge hot">${icon("flame")} Trending</span>` : "",
      c.rating >= 4.5 ? `<span class="badge top">${icon("award")} Top rated</span>` : "",
      ...c.cafeType.map((t) => `<span class="badge">${esc(t)}</span>`),
    ].join("");
    $("#cafeName").textContent = c.name;
    $("#cafeMeta").innerHTML = [
      c.rating ? `<span>${ratingPill(c)} ${c.reviews ? `<span class="muted">${fmtNum(c.reviews)} reviews</span>` : ""}</span>` : `<span>${ratingPill(c)}<span class="muted">Not rated yet</span></span>`,
      `<span>${icon("map-pin")} ${esc(c.location.area)}</span>`,
      c.hours ? `<span>${icon("clock")} ${esc(c.hours)}</span>` : "",
    ].join("");
    $("#cafeCuisines").innerHTML = c.cuisines.map((x) => `<button class="chip" data-quick="cuisines:${esc(x)}">${esc(x)}</button>`).join("");
    $("#cafeDirections").href = $("#cafeDirectionsMobile").href = c.links.maps;

    // overview
    $("#mustTryBlock").hidden = !c.topFoods.length;
    $("#cafeMustTry").innerHTML = c.topFoods.map((f, i) => `<div class="dish"><span class="dishNum">${i + 1}</span><div><b>${esc(f.name)}</b><span>${esc(foodLabel(f.category))}</span></div></div>`).join("");
    $("#cafeAbout").textContent = c.about || c.description || `${c.name} is a ${c.cafeType[0].toLowerCase()} in ${c.location.area}, Jaipur.`;
    $("#cafeVibes").innerHTML = c.ambience.map((a) => `<button class="vibeChip" data-quick="vibes:${esc(a)}">${icon(VIBE_ICONS[a] || "sparkles")} ${esc(a)}</button>`).join("");

    // menu
    const pages = c.menuImages;
    $("#menuTabCount").textContent = pages.length || c._dishes.length || "";
    $("#photoTabCount").textContent = c.gallery.length || "";
    $("#menuPreviewBlock").hidden = !pages.length;
    const preview = pages.slice(0, 4);
    $("#menuPreview").innerHTML = preview.map((p, i) => i === 3 && pages.length > 4
      ? `<button class="menuThumb more" data-lb-menu="3"><img src="${esc(p.thumb)}" alt="" loading="lazy"><span><b>+${pages.length - 3}</b>more pages</span></button>`
      : menuThumb(p, i)).join("");
    $("#menuCardsBlock").hidden = !pages.length;
    $("#menuCardMeta").textContent = pages.length ? plural(pages.length, "page") : "";
    $("#menuThumbs").innerHTML = pages.map(menuThumb).join("");
    $("#dishBlock").hidden = !c._dishes.length;
    $("#dishSearch").value = "";
    renderDishes("");

    // photos & people
    $("#photoGrid").innerHTML = c.gallery.map((src, i) => `<button data-lb-gallery="${i}" aria-label="Open ${esc(c.name)} photo ${i + 1} of ${c.gallery.length}"><img src="${esc(src)}" alt="" loading="lazy"></button>`).join("")
      || `<p class="muted">Photos for this place are on their way.</p>`;
    renderCafePeople();
    renderInfoCard(c);

    // similar
    const near = CAFE_LIST.filter((x) => x.id !== c.id && x.location.area === c.location.area).sort((a, b) => b._score - a._score);
    const alike = CAFE_LIST.filter((x) => x.id !== c.id && !near.includes(x) && x.cafeType[0] === c.cafeType[0]).sort((a, b) => b._score - a._score);
    const similar = [...near, ...alike].slice(0, 10);
    $("#similarTitle").textContent = near.length >= 3 ? `More in ${c.location.area}` : "You might also like";
    $("#railSimilar").innerHTML = similar.map(cafeCard).join("");
    $("#similarSection").hidden = !similar.length;
  }
  if (pendingDish != null) {
    $("#dishSearch").value = pendingDish;
    renderDishes(pendingDish);
  }
  updateSaveButtons();
  const activeTab = tab && ["overview", "menu", "photos", "people"].includes(tab) ? tab : "overview";
  selectTab(activeTab, false);
  return true;
}
const menuThumb = (p, i) => `<button class="menuThumb" data-lb-menu="${i}" aria-label="Open menu page ${i + 1}"><img src="${esc(p.thumb)}" alt="Menu page ${i + 1}" loading="lazy" decoding="async"><span class="pg">Page ${i + 1}</span></button>`;

function renderInfoCard(c) {
  const stars = c.rating ? Array.from({ length: 5 }, (_, i) => icon("star", i < Math.round(c.rating) ? "" : "off")).join("") : "";
  $("#cafeInfoCard").innerHTML = `
    ${c.rating ? `<div class="infoRating"><span class="big">${c.rating.toFixed(1)}</span><div><div class="stars">${stars}</div><span>${c.reviews ? fmtNum(c.reviews) + " reviews on Zomato" : "Community rating"}</span></div></div>` : ""}
    <div class="infoRow">${icon("clock")}<div><b>Hours</b><p>${esc(c.hours || "Hours not listed — check before you go")}</p></div></div>
    <div class="infoRow">${icon("map-pin")}<div><b>Address</b><p>${esc(c.location.address || c.location.area + ", Jaipur")}</p><a href="${esc(c.links.maps)}" target="_blank" rel="noopener">Open in Google Maps ${icon("arrow-up-right")}</a></div></div>
    <div class="infoRow">${icon("utensils")}<div><b>Cuisine</b><p>${esc(c.cuisines.join(", "))}</p></div></div>
    ${c.menuImages.length ? `<button class="btn btnPrimary block" data-tab-jump="menu">${icon("book-open")} View menu · ${plural(c.menuImages.length, "page")}</button>` : ""}
    ${c.links.zomato ? `<a class="btn btnGhost block" href="${esc(c.links.zomato)}" target="_blank" rel="noopener">View on Zomato ${icon("arrow-up-right")}</a>` : ""}
    ${c.verificationNote ? `<div class="infoNote">${icon("info")} ${esc(c.verificationNote)}</div>` : ""}`;
}
function renderCafePeople() {
  const c = cafeById[currentCafe];
  if (!c) return;
  const fans = PEOPLE.filter((p) => p.favoriteCafes.includes(c.id));
  $("#cafePeople").innerHTML = fans.length ? fans.map(personCard).join("")
    : `<div class="emptyState"><div class="emptyIcon">${icon("users-round")}</div><h2>Be the first regular</h2><p class="muted">No one has listed ${esc(c.name)} as a favourite yet.</p><a href="#people" class="btn btnGhost">Find people</a></div>`;
  renderCafeCheckins();
}

/* ---------------- check-ins: "I'll be here" ----------------
   Only you and your accepted connections ever see these times. */
let cafeCheckins = { cafeId: null, list: [] };
async function loadCafeCheckins(cafeId) {
  if (!AuthService.isAuthenticated()) { cafeCheckins = { cafeId, list: [] }; return; }
  try { cafeCheckins = { cafeId, list: (await Api.get(`/cafes/${encodeURIComponent(cafeId)}/checkins`)).checkins }; }
  catch (e) { cafeCheckins = { cafeId, list: [] }; }
}
function fmtRange(a, b) {
  const s = new Date(a), e = new Date(b);
  const day = s.toDateString() === new Date().toDateString() ? "Today"
    : s.toDateString() === new Date(Date.now() + 864e5).toDateString() ? "Tomorrow"
    : s.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  const t = (d) => d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  return `${day}, ${t(s)} – ${t(e)}`;
}
async function renderCafeCheckins(force) {
  const c = cafeById[currentCafe];
  const box = $("#cafeCheckins");
  if (!c || !box) return;
  if (force || cafeCheckins.cafeId !== c.id) {
    await loadCafeCheckins(c.id);
    if (currentCafe !== c.id) return;
  }
  const me = AuthService.getUser();
  const rows = cafeCheckins.list.map((k) => {
    const p = k.mine ? me : personById[k.userId];
    if (!p) return "";
    return `<div class="rowItem">${avatarHTML(p, "pAvatar")}<div class="grow" ${k.mine ? "" : `data-person="${p.id}"`}><b>${k.mine ? "You" : esc(p.name)}</b><span>${icon("clock")} ${esc(fmtRange(k.startsAt, k.endsAt))}</span></div>
      <div class="rowActions">${k.mine ? `${new Date(k.endsAt) > new Date() ? `<button class="btn btnGhost" data-checkin-discovery="${k.id}" data-enabled="${k.openToChat}">${k.openToChat ? "Chat discovery · On" : "Enable chat discovery"}</button>` : ""}<button class="btn btnGhost" data-checkin-delete="${k.id}">Remove</button>` : `<button class="btn btnPrimary" data-chat="${p.id}">${icon("message-circle")} Message</button>`}</div></div>`;
  }).join("");
  const now = Date.now();
  const discoverable = cafeCheckins.list.filter((k) => k.mine && k.openToChat && new Date(k.endsAt).getTime() > now);
  const discoveryActive = discoverable.some((k) => new Date(k.startsAt).getTime() <= now);
  if (cafeDinerStartTimeout) { clearTimeout(cafeDinerStartTimeout); cafeDinerStartTimeout = null; }
  if (discoveryActive) startCafeDinerPolling(c.id);
  else {
    if (cafeDinerTimer) { clearInterval(cafeDinerTimer); cafeDinerTimer = null; }
    const nextStart = Math.min(...discoverable.map((k) => new Date(k.startsAt).getTime()).filter((time) => time > now));
    if (Number.isFinite(nextStart)) cafeDinerStartTimeout = setTimeout(() => renderCafeCheckins(true), Math.max(1000, nextStart - now + 1000));
  }
  box.innerHTML = `<div class="checkinHead"><div><h3 class="miniTitle">Who's going</h3><p class="muted small">${icon("shield-check")} Check-ins are private to connections. Cafe chat discovery is opt-in.</p></div>
      <button class="btn btnPrimary" data-action="check-in">${icon("calendar-plus")} I'll be here</button></div>
    ${!me ? `<p class="muted">Log in to see when your connections are planning to be here.</p>`
      : rows ? `<div class="rowList">${rows}</div>` : `<p class="muted">None of your connections have planned a visit yet. Add yours so they know where to find you.</p>`}`;
  hydrateIcons();
}

let cafeDinerTimer = null;
let cafeDinerStartTimeout = null;
let cafeDinerPollBusy = false;
const cafeDinerPrompted = new Set();
function stopCafeDinerPolling() {
  if (cafeDinerTimer) clearInterval(cafeDinerTimer);
  if (cafeDinerStartTimeout) clearTimeout(cafeDinerStartTimeout);
  cafeDinerTimer = null;
  cafeDinerStartTimeout = null;
}
function startCafeDinerPolling(cafeId) {
  if (cafeDinerTimer) return;
  const poll = async () => {
    if (currentView !== "cafe" || currentCafe !== cafeId || !$("#cafeTabs [data-tab='people']")?.classList.contains("active")) {
      stopCafeDinerPolling(); return;
    }
    if (document.hidden || cafeDinerPollBusy || !AuthService.isAuthenticated()) return;
    cafeDinerPollBusy = true;
    try {
      const { diners = [] } = await Api.get(`/cafes/${encodeURIComponent(cafeId)}/diners`);
      if (document.hidden || currentView !== 'cafe' || currentCafe !== cafeId || !$("#cafeTabs [data-tab='people']")?.classList.contains('active')) return;
      for (const diner of diners) {
        const id = diner.userId;
        const promptKey = `${cafeId}:${id}`;
        let alreadyPrompted = cafeDinerPrompted.has(promptKey);
        try { alreadyPrompted ||= sessionStorage.getItem(`madine-cafe-diner-prompt:${promptKey}`) === "1"; } catch { /* private browsing may disable storage */ }
        if (!id || alreadyPrompted || ["connected", "sent"].includes(connections[id])) continue;
        if ($("#formOverlay")?.classList.contains("open") || $("#authOverlay")?.classList.contains("open")) return;
        cafeDinerPrompted.add(promptKey);
        try { sessionStorage.setItem(`madine-cafe-diner-prompt:${promptKey}`, "1"); } catch { /* the in-memory guard still prevents repeats */ }
        const incoming = connections[id] === "incoming";
        openFormModal({
          title: `${diner.name || "A MADINE member"} is at this café too`,
          subtitle: `${cafeById[cafeId]?.name || "This café"} · here now by their check-in. Your email stays private.`,
          body: `<p class="prose">They opted in to meeting other MADINE members. Send a chat request? You can chat after they accept.</p><button class="btn btnGhost block" type="button" data-action="close-form">Not now</button>`,
          submitLabel: incoming ? "Accept and chat" : "Send chat request",
          onSubmit: async () => {
            const { state } = await Api.post(`/connections/${encodeURIComponent(id)}`, { action: incoming ? "accept" : "connect" });
            connections[id] = state;
            await reloadSocial();
            toast(incoming ? "Connected — you can chat now" : "Request sent — chat opens when they accept");
          },
        });
        return;
      }
    } catch { /* a missed poll is retried automatically */ }
    finally { cafeDinerPollBusy = false; }
  };
  cafeDinerTimer = setInterval(poll, 12000);
  poll();
}
function renderDishes(q) {
  const c = cafeById[currentCafe];
  if (!c) return;
  const query = q.trim().toLowerCase();
  const cats = c.menuCategories.length ? c.menuCategories : [{ category: "Menu", items: c._dishes }];
  const filtered = cats.map((cat) => ({ ...cat, items: query ? cat.items.filter((d) => d.toLowerCase().includes(query)) : cat.items })).filter((cat) => cat.items.length);
  const total = filtered.reduce((n, cat) => n + cat.items.length, 0);
  $("#dishMeta").textContent = query ? `${plural(total, "match", "matches")}` : `${plural(c._dishes.length, "dish", "dishes")} · ${plural(cats.length, "section")}`;
  $("#menuCats").innerHTML = filtered.length > 1 ? filtered.map((cat, i) => `<button class="chip" data-dish-cat="${i}">${esc(cat.category)}</button>`).join("") : "";
  $("#dishList").innerHTML = filtered.length
    ? filtered.map((cat, i) => `<section class="dishCat" id="dishCat-${i}" style="scroll-margin-top:calc(var(--nav-h) + 70px)"><h4>${esc(cat.category)}</h4><ul>${cat.items.map((d) => `<li>${highlight(d, query)}</li>`).join("")}</ul></section>`).join("")
    : `<p class="muted">No dishes match “${esc(q)}”.</p>`;
}
function selectTab(tab, scroll = true) {
  if (tab !== 'people') stopCafeDinerPolling();
  $$("#cafeTabs [data-tab]").forEach((b) => { b.classList.toggle("active", b.dataset.tab === tab); b.setAttribute("aria-selected", b.dataset.tab === tab); });
  $$(".tabPane").forEach((p) => p.classList.toggle("active", p.dataset.pane === tab));
  moveTabInk();
  if (tab === 'overview' && typeof Platform !== 'undefined') Platform.renderReviews(currentCafe);
  if (scroll) {
    const tabs = $("#cafeTabs");
    const y = tabs.getBoundingClientRect().top + window.scrollY - parseInt(getComputedStyle(document.documentElement).getPropertyValue("--nav-h"));
    if (window.scrollY > y || tabs.getBoundingClientRect().top > window.innerHeight * 0.6) window.scrollTo({ top: y, behavior: "smooth" });
  }
}
function moveTabInk() {
  const active = $("#cafeTabs .active");
  const ink = $("#cafeTabs .tabInk");
  if (!active || !ink) return;
  ink.style.width = active.offsetWidth + "px";
  ink.style.transform = `translateX(${active.offsetLeft}px)`;
}

/* ---------------- save ---------------- */
function toggleSave(id) {
  const on = !saved.has(id);
  on ? saved.add(id) : saved.delete(id); // update instantly, roll back if the server refuses
  toast(on ? "Saved to your collection" : "Removed from saved");
  updateSaveButtons(id);
  if (currentView === "saved") renderSaved();
  Api.put("/me/saved", { cafeId: id, saved: on }).catch((err) => {
    on ? saved.delete(id) : saved.add(id);
    updateSaveButtons();
    if (currentView === "saved") renderSaved();
    toast(err.message);
  });
}
function updateSaveButtons(popId) {
  $$("[data-save]").forEach((b) => {
    const on = saved.has(b.dataset.save);
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on);
    if (popId && b.dataset.save === popId && on) { b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); }
  });
  const on = currentCafe && saved.has(currentCafe);
  $("#cafeSaveBtn").classList.toggle("saved", !!on);
  $("#cafeSaveBtn span").textContent = on ? "Saved" : "Save";
  $$(".iconAction[data-action='save-current']").forEach((b) => b.classList.toggle("saved", !!on));
  const n = saved.size;
  $("#savedCount").hidden = !n;
  $("#savedCount").textContent = n;
}
function renderSaved() {
  const list = [...saved].map((id) => cafeById[id]).filter(Boolean);
  $("#savedGrid").innerHTML = list.length ? list.map(cafeCard).join("")
    : `<div class="emptyState"><div class="emptyIcon">${icon("heart")}</div><h2>No saved places yet</h2><p class="muted">Tap the heart on any café to build your personal shortlist.</p><a href="#discover" class="btn btnPrimary">Start exploring</a></div>`;
}

/* ---------------- people & profile ---------------- */
let interestFilter = "";
function renderPeople() {
  const interests = [...new Set(PEOPLE.flatMap((p) => p.interests))].sort();
  $("#interestChips").innerHTML = [`<button class="chip ${interestFilter ? "" : "active"}" data-interest="">Everyone</button>`, ...interests.map((t) => `<button class="chip ${interestFilter === t ? "active" : ""}" data-interest="${esc(t)}">${esc(t)}</button>`)].join("");
  const q = ($("#peopleSearch").value || "").toLowerCase().trim();
  const list = PEOPLE.filter((p) => (!interestFilter || p.interests.includes(interestFilter)) && (!q || `${p.name} ${p.role} ${p.interests.join(" ")} ${p.bio}`.toLowerCase().includes(q)));
  const content = list.length ? list.map(personCard).join("")
    : !PEOPLE.length
      ? AuthService.getUser()?.profileComplete
        ? `<div class="emptyState"><div class="emptyIcon">${icon("sparkles")}</div><h2>You're early!</h2><p class="muted">Your profile is live. No one else has joined yet — invite a friend and connect.</p><button class="btn btnPrimary" data-action="share-site">${icon("share-2")} Invite friends</button></div>`
        : `<div class="emptyState"><div class="emptyIcon">${icon("sparkles")}</div><h2>You're early!</h2><p class="muted">No one else has set up a profile yet. Create yours so people can find you.</p><button class="btn btnPrimary" data-action="edit-profile">Create your profile</button></div>`
      : `<div class="emptyState"><div class="emptyIcon">${icon("user-search")}</div><h2>No one found</h2><p class="muted">Try a different name or interest.</p></div>`;
  $("#peopleGrid").innerHTML = withSocialStatus(['people'], content, list.length > 0);
}
function renderProfile(id) {
  const p = personById[id];
  if (!p) return false;
  window.currentProfile = id;
  const av = $("#profileInitial");
  av.textContent = p.avatar ? "" : p.initial;
  av.style.setProperty("--g", gradientFor(p.name));
  av.style.backgroundImage = p.avatar ? `url('${p.avatar}')` : "";
  av.classList.toggle("hasPhoto", !!p.avatar);
  $("#profileName").textContent = p.name;
  $("#profileRoleTag").textContent = roleLine(p);
  $("#profileBio").textContent = p.bio || "No bio yet.";
  $("#profileInterests").innerHTML = p.interests.map((i) => `<span class="chip">${esc(i)}</span>`).join("") || `<p class="muted">None listed yet.</p>`;
  $("#profilePreference").textContent = p.generalPreference || "Not specified";
  $("#profileConnectBtn").innerHTML = connectBtnMarkup(p.id) + `<p class="connectHint">${connectHint(p.id)}</p>`;
  const favs = p.favoriteCafes.map((cid) => cafeById[cid]).filter(Boolean);
  $("#profileFavCafes").innerHTML = favs.map((c) => `<button class="miniCafe" data-cafe="${esc(c.id)}">${c.gallery[0] ? `<img src="${esc(c.gallery[0])}" alt="" loading="lazy">` : ""}<div><b>${esc(c.name)}</b><span>${esc(c.location.area)} · ${esc(c.cuisines.slice(0, 2).join(", "))}</span></div></button>`).join("")
    || `<p class="muted">No public favourites yet.</p>`;
  return true;
}

/* ---------------- connections ---------------- */
let connTab = "mine";
// Connecting, accepting and chatting need a profile, so the other person
// knows who they're talking to.
function requireProfile(action) {
  requireAuth(() => Platform.ensureProfile(action));
}
function handleConnection(action, id) {
  const p = personById[id];
  if (!p || action === "noop") return;
  if (action === "remove" && !confirm(`Remove ${p.name} from your connections? You won't be able to chat until you both connect again.`)) return;
  const run = async () => {
    try {
      const { state } = await Api.post(`/connections/${encodeURIComponent(id)}`, { action });
      if (state === "none") delete connections[id]; else connections[id] = state;
      toast({
        connect: state === "connected" ? `You're now connected with ${p.name} — say hello!` : `Request sent to ${p.name}. You can chat once they accept.`,
        accept: `You're now connected with ${p.name} — you can chat now`,
        cancel: "Request cancelled",
        reject: "Request declined",
        remove: "Connection removed",
      }[action]);
    } catch (err) {
      toast(err.message);
      await reloadSocial();
    }
    refreshPeopleUI();
  };
  if (action === "connect" || action === "accept") requireProfile(run); else run();
}
function refreshPeopleUI() {
  renderPeople();
  renderHomePeople();
  renderConnections();
  renderChatList();
  renderMe();
  if (window.currentChat && connectionState(window.currentChat) !== "connected") closeChat();
  if (currentView === "profile" && window.currentProfile) renderProfile(window.currentProfile);
  if (currentView === "cafe") renderCafePeople();
  ChatService.refreshPresence();
}
function renderConnections() {
  const by = (state) => Object.entries(connections).filter(([, s]) => s === state).map(([id]) => personById[id]).filter(Boolean);
  const incoming = by("incoming");
  $("#incomingCount").textContent = incoming.length || "";
  $$("#connTabs [data-conn]").forEach((b) => b.classList.toggle("active", b.dataset.conn === connTab));
  if (!AuthService.isAuthenticated()) {
    $("#connList").innerHTML = `<div class="emptyState"><div class="emptyIcon">${icon("users-round")}</div><h2>Log in to see your connections</h2><p class="muted">Send requests, accept them, and chat once you're both connected.</p><button class="btn btnPrimary" data-action="login">Log in / Sign up</button></div>`;
    return;
  }
  const list = { mine: by("connected"), incoming, sent: by("sent") }[connTab];
  const actions = {
    mine: (p) => `<button class="btn btnGhost" data-conn-action="remove" data-id="${p.id}">Remove</button><button class="btn btnPrimary" data-chat="${p.id}">${icon("message-circle")} Message</button>`,
    incoming: (p) => `<button class="btn btnGhost" data-conn-action="reject" data-id="${p.id}">Decline</button><button class="btn btnPrimary" data-conn-action="accept" data-id="${p.id}">Accept</button>`,
    sent: (p) => `<span class="pendingTag">${icon("clock")} Waiting for ${esc(p.name)}</span><button class="btn btnGhost" data-conn-action="cancel" data-id="${p.id}">Cancel request</button>`,
  }[connTab];
  const sub = (p) => [roleLine(p), p.generalPreference].filter(Boolean).join(" · ");
  const empty = { mine: ["users-round", "No connections yet", "Send a request — once they accept, you can chat."], incoming: ["inbox", "No pending requests", "New requests will show up here (we'll email you too)."], sent: ["send", "No sent requests", "Requests you send will wait here until they're accepted."] }[connTab];
  const content = list.length
    ? list.map((p) => `<div class="rowItem">${avatarHTML(p, "pAvatar")}<div class="grow" data-person="${p.id}"><b>${esc(p.name)}</b><span>${esc(sub(p))}</span></div><div class="rowActions">${actions(p)}</div></div>`).join("")
    : `<div class="emptyState"><div class="emptyIcon">${icon(empty[0])}</div><h2>${empty[1]}</h2><p class="muted">${empty[2]}</p><a href="#people" class="btn btnGhost">Discover people</a></div>`;
  $("#connList").innerHTML = withSocialStatus(['connections', 'people'], content, list.length > 0);
}

/* ---------------- chat (connected people only) ---------------- */
const connectedPeople = () => Object.entries(connections).filter(([, s]) => s === "connected").map(([id]) => personById[id]).filter(Boolean);
function renderChatList() {
  if (!AuthService.isAuthenticated()) {
    $("#chatList").innerHTML = `<div class="srEmpty">Log in to chat with your connections.<br><button class="textBtn" data-action="login" style="margin-top:10px">Log in ${icon("arrow-right")}</button></div>`;
    return;
  }
  const lastAt = (p) => (conversations[p.id] || []).slice(-1)[0]?.timestamp || 0;
  const people = connectedPeople().sort((a, b) => lastAt(b) - lastAt(a));
  const content = people.length ? people.map((p) => {
    const last = (conversations[p.id] || []).slice(-1)[0];
    const online = ChatService.getPresence(p.id);
    const n = unread[p.id] || 0;
    return `<button class="chatItem ${window.currentChat === p.id ? "active" : ""} ${n ? "unread" : ""}" data-chat="${p.id}">
      ${avatarHTML(p, "miniAvatar", `<span class="presenceDot ${online ? "online" : ""}"></span>`)}
      <div class="grow"><b>${esc(p.name)}</b><span>${last ? esc((last.from === "me" ? "You: " : "") + last.text) : online ? "Online" : "Say hello 👋"}</span></div>${n ? `<span class="unreadDot">${n}</span>` : ""}</button>`;
  }).join("") : `<div class="srEmpty">Chat opens once you and someone have both accepted a connection.<br><a class="textBtn" href="#people" style="margin-top:10px">Find people ${icon("arrow-right")}</a></div>`;
  $("#chatList").innerHTML = withSocialStatus(['connections', 'people', 'conversations'], content, people.length > 0);
}
async function openChatWith(id) {
  if (!AuthService.isAuthenticated()) { requireAuth(() => openChatWith(id)); return; }
  const p = personById[id];
  if (!p) return;
  if (connectionState(id) !== "connected") {
    toast(`You can chat with ${p.name} once you're both connected`);
    navigate(`#profile/${id}`);
    return;
  }
  window.currentChat = id;
  const av = $("#convoAvatar");
  av.textContent = p.avatar ? "" : p.initial;
  av.style.setProperty("--g", gradientFor(p.name));
  av.style.backgroundImage = p.avatar ? `url('${p.avatar}')` : "";
  av.classList.toggle("hasPhoto", !!p.avatar);
  $("#convoHeadName").textContent = p.name;
  updatePresenceLine();
  $("#chatEmptyState").hidden = true;
  $("#chatActive").hidden = false;
  $("#chatShell").classList.add("hasActive");
  if (currentView !== "messages") navigate("#messages");
  unread[id] = 0;
  renderChatList();
  renderMessages(id);
  setTimeout(() => $("#msgInput").focus(), 50);
  try {
    conversations[id] = await ChatService.history(id);
    if (window.currentChat === id) renderMessages(id);
    ChatService.markRead(id);
  } catch (err) {
    toast(err.message);
  }
}
function closeChat() {
  window.currentChat = null;
  $("#chatShell").classList.remove("hasActive");
  $("#chatActive").hidden = true;
  $("#chatEmptyState").hidden = false;
  renderChatList();
}
function updatePresenceLine() {
  if (!window.currentChat) return;
  const on = ChatService.getPresence(window.currentChat);
  $("#convoHeadPresence").innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px"><span class="presenceDot ${on ? "online" : ""}"></span>${on ? "Online" : "Offline"}</span>`;
}
function renderMessages(id) {
  const box = $("#messagesBox");
  const msgs = conversations[id] || [];
  box.innerHTML = msgs.length ? msgs.map(bubbleHTML).join("") : `<div class="srEmpty">Start the conversation — suggest a café to meet at ☕</div>`;
  box.scrollTop = box.scrollHeight;
}
function bubbleHTML(m) {
  const time = new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `<div class="bubble ${m.from === "me" ? "me" : ""}">${esc(m.text)}<span class="bubbleTime">${time}</span></div>`;
}
ChatService.onMessage((m) => {
  const list = (conversations[m.conversationId] = conversations[m.conversationId] || []);
  if (list.some((x) => x.id === m.id)) return; // the sender's ack and the live push can both arrive
  list.push(m);
  const viewing = window.currentChat === m.conversationId && currentView === "messages" && !document.hidden;
  if (viewing) {
    renderMessages(m.conversationId);
    if (m.from === "them") ChatService.markRead(m.conversationId);
  } else if (m.from === "them") {
    unread[m.conversationId] = (unread[m.conversationId] || 0) + 1;
    const p = personById[m.conversationId];
    if (p) toast(`New message from ${p.name}`);
  }
  renderChatList();
});
ChatService.onTyping(({ conversationId, typing }) => {
  if (window.currentChat !== conversationId) return;
  const box = $("#messagesBox");
  const el = $("#typingIndicator");
  if (typing && !el) { box.insertAdjacentHTML("beforeend", `<div class="typingDots" id="typingIndicator"><span></span><span></span><span></span></div>`); box.scrollTop = box.scrollHeight; }
  else if (!typing && el) el.remove();
});
ChatService.onPresence(() => { renderChatList(); updatePresenceLine(); });
// Live pushes from the server: someone sent/accepted a request, or a
// connection added a check-in at the café being viewed.
ChatService.onEvent(async ({ name, payload }) => {
  if (name === 'notifications:changed') { Platform.refreshBadge(); if (currentView === 'notifications') Platform.route(currentView); }
  if (name === "connections:changed") {
    const before = { ...connections };
    await reloadSocial();
    const newIncoming = Object.entries(connections).find(([id, s]) => s === "incoming" && before[id] !== "incoming");
    const newlyConnected = Object.entries(connections).find(([id, s]) => s === "connected" && before[id] !== "connected");
    if (newIncoming) toast(`${personById[newIncoming[0]]?.name || "Someone"} wants to connect with you`);
    else if (newlyConnected) toast(`${personById[newlyConnected[0]]?.name || "Someone"} accepted your request — you can chat now`);
  }
  if (name === "checkins:changed" && currentView === "cafe" && payload.cafeId === currentCafe) renderCafeCheckins(true);
});

/* ---------------- communities & events ---------------- */
const COMMUNITY_ICONS = ["rocket", "palette", "coffee", "book-open", "code-xml", "map"];
function renderCommunities() {
  const circles = $("#peopleCommunityList");
  if (circles) circles.innerHTML = withSocialStatus(['communities'], COMMUNITIES.length
    ? COMMUNITIES.slice(0, 3).map((c, i) => `<a class="circleLink" href="#discussion/${encodeURIComponent(c.id)}"><div class="comIcon">${icon(COMMUNITY_ICONS[i % COMMUNITY_ICONS.length])}</div><div><b>${esc(c.name)}</b><small>${plural(c.memberCount, "member")}</small><span>Explore group ${icon("arrow-right")}</span></div></a>`).join("")
    : '<p class="muted">Coffee people, book lovers, city creatives. Start a group and find your little circle.</p>', COMMUNITIES.length > 0);
  const content = COMMUNITIES.map((c, i) => `
    <div class="comCard"><div class="comIcon">${icon(COMMUNITY_ICONS[i % COMMUNITY_ICONS.length])}</div><h3>${esc(c.name)}</h3><p class="muted">${esc(c.description)}</p>
      ${c.tags.length ? `<div class="pcTags">${c.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
      <div class="comFoot"><span>${icon("users-round")} ${plural(c.memberCount, "member")}${c.upcomingEvents ? ` · ${plural(c.upcomingEvents, "event")}` : ""}</span>
        ${c.isOwner ? `<span class="pendingTag">${icon("crown")} Owner</span>`
          : c.joined ? `<button class="btn btnGhost going" data-community-action="leave" data-id="${c.id}">${icon("check")} Joined</button>`
          : `<button class="btn btnGhost" data-community-action="join" data-id="${c.id}">Join</button>`}</div><a class="btn btnGhost" href="#discussion/${c.id}">${icon("messages-square")} Open discussions</a></div>`).join("")
    + `<div class="comCard create"><div class="comIcon">${icon("plus")}</div><h3>Start a community</h3><p class="muted">Build a space around an interest, neighbourhood or recurring plan.</p><div class="comFoot"><span></span><button class="btn btnPrimary" data-action="create-community">Create</button></div></div>`;
  $("#communityGrid").innerHTML = withSocialStatus(['communities'], content, COMMUNITIES.length > 0);
}
function renderEvents() {
  const upcoming = EVENTS.filter((e) => new Date(e.startsAt) > Date.now() - 3 * 36e5);
  const content = upcoming.length ? upcoming.map((e) => eventItem(e, false)).join("")
    : `<div class="emptyState"><div class="emptyIcon">${icon("calendar")}</div><h2>No meetups yet</h2><p class="muted">Host the first one — pick a café, a time, and invite people.</p><button class="btn btnPrimary" data-action="create-event">${icon("calendar-plus")} Host an event</button></div>`;
  $("#eventList").innerHTML = withSocialStatus(['events'], content, upcoming.length > 0);
}
function renderStatic() {
  renderCommunities();
  renderEvents();
}
function handleCommunityAction(action, id) {
  const c = COMMUNITIES.find((x) => x.id === id);
  if (!c) return;
  if (action === "leave" && !confirm(`Leave ${c.name}?`)) return;
  requireAuth(async () => {
    try {
      const r = await Api.post(`/communities/${id}/${action}`);
      Object.assign(c, { joined: r.joined, memberCount: r.memberCount });
      toast(r.joined ? `Joined ${c.name}` : `You left ${c.name}`);
      renderCommunities();
    } catch (err) { toast(err.message); }
  });
}
function handleEventAction(action, id) {
  const e = EVENTS.find((x) => x.id === id);
  if (!e) return;
  if (action === "leave" && !confirm(`Cancel your spot at ${e.title}?`)) return;
  requireAuth(async () => {
    try {
      const r = await Api.post(`/events/${id}/${action}`);
      Object.assign(e, { going: r.going, goingCount: r.goingCount });
      toast(r.going ? `You're going to ${e.title} 🎉` : "Your spot was cancelled");
      renderEvents();
      renderHomeEvents();
      renderMe();
    } catch (err) { toast(err.message); }
  });
}

/* ---------------- my profile & account ---------------- */
const myDisplayName = (user) => user.name || user.email.split("@")[0];
function renderMyAvatar() {
  const user = AuthService.getUser();
  $$(".myAvatar").forEach((el) => {
    el.style.backgroundImage = user?.avatar ? `url('${user.avatar}')` : "";
    el.classList.toggle("hasAvatar", !!user?.avatar);
    const init = el.querySelector(".avatarInitial");
    if (init) init.textContent = user ? myDisplayName(user).charAt(0).toUpperCase() : "?";
  });
}
function renderAccountMenu() {
  const user = AuthService.getUser();
  $("#navLoginBtn").hidden = !!user;
  $("#avatarBtn").hidden = !user;
  $("#adminMenuLink").hidden = !user?.isAdmin;
  $("#businessMenuLink").hidden = user?.accountType !== "cafe_owner";
  $("#accountMenuHead").innerHTML = user
    ? `<b>${esc(myDisplayName(user))}</b><span>${esc(user.email)}</span>`
    : `<b>Welcome</b><span>Log in to save places and connect</span>`;
  $("#authMenuBtn").innerHTML = user ? `${icon("log-out")} <span>Log out</span>` : `${icon("log-in")} <span>Log in or sign up</span>`;
}
function renderMe() {
  const user = AuthService.getUser();
  if (dataReady) renderForYou();
  $("#myProfileLoggedOut").hidden = !!user;
  $("#myProfileLoggedIn").hidden = !user;
  if (!user) return;
  $("#myName").textContent = myDisplayName(user);
  $("#myPhone").textContent = [user.role, user.email].filter(Boolean).join(" · ");
  $("#myStats").innerHTML = [
    ["heart", saved.size, "saved places"],
    ["users-round", connectedPeople().length, "connections"],
    ["message-circle", Object.keys(conversations).length, "conversations"],
    ["calendar", EVENTS.filter((e) => e.going).length, "events joined"],
  ].map(([ic, n, l]) => `<div class="stat"><span class="statIcon">${icon(ic)}</span><div><b>${n}</b><span>${l}</span></div></div>`).join("");
  const favs = user.favoriteCafes.map((id) => cafeById[id]).filter(Boolean);
  $("#myAbout").innerHTML = !user.profileComplete
    ? `<p class="prose">Set up your profile so people can find you and send you connection requests.</p><button class="btn btnPrimary" data-action="edit-profile">${icon("user-pen")} Set up profile</button>`
    : `<p class="prose">${esc(user.bio || "No bio yet.")}</p>
      ${user.interests.length ? `<div class="chipRow wrap">${user.interests.map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div>` : ""}
      ${user.generalPreference ? `<p class="muted small" style="margin-top:12px">${icon("clock")} ${esc(user.generalPreference)}</p>` : ""}
      ${favs.length ? `<p class="muted small" style="margin-top:6px">${icon("heart")} ${favs.map((c) => esc(c.name)).join(", ")}</p>` : ""}`;
}
async function onAuthStateChanged() {
  const user = AuthService.getUser();
  saved = new Set(user?.saved || []);
  if (user) ChatService.connect();
  else { ChatService.disconnect(); if (window.currentChat) closeChat(); }
  cafeCheckins = { cafeId: null, list: [] };
  renderMyAvatar();
  renderAccountMenu();
  updateSaveButtons();
  if (dataReady) await reloadSocial();
  else renderMe();
  if (typeof Platform !== 'undefined') { Platform.refreshBadge(); Platform.route(currentView); }
}
function handleAvatarUpload(file) {
  if (!file) return;
  if (!AuthService.isAuthenticated()) return requireAuth(() => {});
  if (!file.type.startsWith("image/")) return toast("Please choose an image file");
  if (file.size > 10 * 1024 * 1024) return toast("Please choose an image under 10 MB");
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = async () => {
      const scale = Math.min(1, 512 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      try {
        const { user } = await Api.put("/me/avatar", { dataUrl: canvas.toDataURL("image/jpeg", 0.82) });
        AuthService.setUser(user);
        renderMyAvatar();
        toast("Profile photo updated");
      } catch (err) { toast(err.message); }
    };
    img.onerror = () => toast("That image could not be loaded");
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

/* ---------------- live social data ----------------
   People, connections, chats, communities and events all come from the API.
   Reloaded on login/logout and whenever the server pushes a change. */
const SOCIAL_LABELS = { people: 'people', communities: 'communities', events: 'events', connections: 'connections', conversations: 'conversations' };
const socialState = Object.fromEntries(Object.keys(SOCIAL_LABELS).map((key) => [key, { status: 'idle', error: null }]));
let socialLoadVersion = 0;
let socialAccount = null;
function withSocialStatus(keys, content, hasContent) {
  const failed = keys.filter((key) => socialState[key].error);
  const pending = keys.some((key) => ['idle', 'loading'].includes(socialState[key].status));
  if (failed.length) {
    const notice = `<div class="socialError" role="alert"><p>We couldn't load ${failed.map((key) => SOCIAL_LABELS[key]).join(' and ')}. ${hasContent ? 'Showing last loaded information; it may be out of date.' : 'Please try again.'}</p><button class="btn btnGhost" data-action="retry-social" ${pending ? 'disabled' : ''}>${pending ? 'Retrying…' : 'Try again'}</button></div>`;
    return notice + (hasContent ? content : '');
  }
  if (pending && !hasContent) return '<p class="muted socialLoading" role="status">Loading…</p>';
  return content;
}
async function loadSocialData() {
  const version = ++socialLoadVersion;
  const account = AuthService.getUser()?.id || null;
  const loggedIn = AuthService.isAuthenticated();
  if (account !== socialAccount) {
    // Joined/going flags and conversations belong to the current account.
    // Never retain another account's state during a failed refresh.
    socialAccount = account;
    PEOPLE = []; personById = {}; COMMUNITIES = []; EVENTS = [];
    connections = {}; conversations = {}; unread = {};
    Object.values(socialState).forEach((state) => { state.status = 'idle'; state.error = null; });
  }
  const loaders = {
    people: () => Api.get('/people').then((r) => r.people),
    communities: () => Api.get('/communities').then((r) => r.communities),
    events: () => Api.get('/events').then((r) => r.events),
    connections: () => loggedIn ? Api.get('/connections').then((r) => r.connections) : {},
    conversations: () => loggedIn ? ChatService.conversations() : [],
  };
  Object.values(socialState).forEach((state) => { state.status = 'loading'; });
  const results = await Promise.all(Object.entries(loaders).map(async ([key, load]) => {
    try {
      const value = await load();
      const valid = key === 'connections' ? value && typeof value === 'object' && !Array.isArray(value) : Array.isArray(value);
      if (!valid) throw new Error('Invalid response');
      return { key, value };
    } catch (error) { return { key, error }; }
  }));
  // A logout/login or a newer reload supersedes these responses.
  if (version !== socialLoadVersion || account !== (AuthService.getUser()?.id || null)) return;
  for (const result of results) {
    const { key, value, error } = result;
    socialState[key] = { status: error ? 'error' : 'ready', error: error || null };
    if (error) continue;
    if (key === 'people') { PEOPLE = value; personById = Object.fromEntries(PEOPLE.map((p) => [p.id, p])); }
    if (key === 'communities') COMMUNITIES = value;
    if (key === 'events') EVENTS = value;
    if (key === 'connections') connections = value;
    if (key === 'conversations') {
      const open = window.currentChat && conversations[window.currentChat];
      conversations = {}; unread = {};
      value.forEach((c) => { conversations[c.userId] = [c.last]; unread[c.userId] = c.unread; });
      if (open) { conversations[window.currentChat] = open; unread[window.currentChat] = 0; }
    }
  }
}
async function reloadSocial() {
  await loadSocialData();
  renderStatic();
  renderHomeEvents();
  refreshPeopleUI();
  if (currentView === "profile" && window.currentProfile && socialState.people.status === 'ready' && !personById[window.currentProfile]) navigate("#people");
}
let socialRetryTask = null;
function retrySocial() {
  if (socialRetryTask) return socialRetryTask;
  socialRetryTask = reloadSocial().catch((err) => toast(err.message)).finally(() => { socialRetryTask = null; });
  // loadSocialData has set pending flags synchronously; expose progress and
  // disable retries while keeping any previously loaded records visible.
  renderStatic(); renderHomeEvents(); refreshPeopleUI();
  return socialRetryTask;
}

/* ---------------- global search overlay ---------------- */
function openSearch(prefill = "") {
  const ov = $("#searchOverlay");
  const wasOpen = ov.classList.contains("open");
  ov.classList.add("open");
  ov.setAttribute("aria-hidden", "false");
  if (!wasOpen) lockScroll(true);
  const input = $("#globalSearch");
  input.value = prefill;
  renderSearchResults(prefill);
  setTimeout(() => input.focus(), 60);
}
function closeSearch() {
  const ov = $("#searchOverlay");
  if (!ov.classList.contains("open")) return;
  ov.classList.remove("open");
  ov.setAttribute("aria-hidden", "true");
  lockScroll(false);
}
function renderSearchResults(raw) {
  const q = raw.trim().toLowerCase();
  const box = $("#searchResults");
  if (!dataReady) { box.innerHTML = `<div class="srEmpty">Loading places…</div>`; return; }
  if (!q) {
    const popular = ["Coffee", "Pizza", "Rooftop", "North Indian", "Desserts", "C Scheme", "Vaishali Nagar", "Momos"];
    box.innerHTML = (recentSearches.length ? `<div class="srGroup"><h5>Recent</h5>${recentSearches.map((t) => `<button class="srItem" data-search-term="${esc(t)}"><span class="srThumb">${icon("history")}</span><div class="grow"><b>${esc(t)}</b></div></button>`).join("")}</div>` : "")
      + `<div class="srGroup"><h5>Popular in Jaipur</h5><div class="srChips">${popular.map((t) => `<button class="chip" data-search-term="${esc(t)}">${esc(t)}</button>`).join("")}</div></div>`;
    return;
  }
  const places = CAFE_LIST.filter((c) => c.name.toLowerCase().includes(q))
    .sort((a, b) => (b.name.toLowerCase().startsWith(q) - a.name.toLowerCase().startsWith(q)) || b._score - a._score).slice(0, 6);
  const dishHits = q.length >= 3 ? CAFE_LIST.map((c) => ({ c, dish: c._dishes[c._dishesLower.findIndex((d) => d.includes(q))] })).filter((x) => x.dish && !places.includes(x.c)).sort((a, b) => b.c._score - a.c._score) : [];
  const areas = AREAS.filter(([a]) => a.toLowerCase().includes(q)).slice(0, 3);
  const cuisines = CUISINES.filter(([x]) => x.toLowerCase().includes(q)).slice(0, 3);
  const total = CAFE_LIST.filter((c) => c._search.includes(q)).length;
  let html = "";
  if (places.length) html += `<div class="srGroup"><h5>Places</h5>${places.map((c) => `<button class="srItem" data-cafe="${esc(c.id)}">${c.gallery[0] ? `<img src="${esc(c.gallery[0])}" alt="" loading="lazy">` : `<span class="srThumb">${icon("store")}</span>`}<div class="grow"><b>${highlight(c.name, raw.trim())}</b><span>${esc(c.location.area)} · ${esc(c.cuisines.slice(0, 3).join(", "))}</span></div>${c.rating ? ratingPill(c) : ""}</button>`).join("")}</div>`;
  if (dishHits.length) html += `<div class="srGroup"><h5>Dishes · on ${plural(dishHits.length, "menu")}</h5>${dishHits.slice(0, 5).map(({ c, dish }) => `<button class="srItem" data-cafe="${esc(c.id)}" data-dish="${esc(raw.trim())}">${c.gallery[0] ? `<img src="${esc(c.gallery[0])}" alt="" loading="lazy">` : `<span class="srThumb">${icon("utensils")}</span>`}<div class="grow"><b>${highlight(dish, raw.trim())}</b><span>at ${esc(c.name)} · ${esc(c.location.area)}</span></div>${icon("arrow-right", "go")}</button>`).join("")}</div>`;
  if (areas.length || cuisines.length) html += `<div class="srGroup"><h5>Browse</h5>${areas.map(([a, n]) => `<button class="srItem" data-quick="areas:${esc(a)}"><span class="srThumb">${icon("map-pin")}</span><div class="grow"><b>${highlight(a, raw.trim())}</b><span>Neighbourhood · ${plural(n, "place")}</span></div>${icon("arrow-right", "go")}</button>`).join("")}${cuisines.map(([x, n]) => `<button class="srItem" data-quick="cuisines:${esc(x)}"><span class="srThumb">${icon("utensils")}</span><div class="grow"><b>${highlight(x, raw.trim())}</b><span>Cuisine · ${plural(n, "place")}</span></div>${icon("arrow-right", "go")}</button>`).join("")}</div>`;
  html += total
    ? `<div class="srGroup"><button class="srItem" data-search-term="${esc(raw.trim())}"><span class="srThumb">${icon("search")}</span><div class="grow"><b>See all ${plural(total, "result")} for “${esc(raw.trim())}”</b><span>Includes dishes on every menu</span></div>${icon("arrow-right", "go")}</button></div>`
    : `<div class="srEmpty">No places, dishes or areas match “${esc(raw.trim())}”.</div>`;
  box.innerHTML = html;
}
function addRecentSearch(term) {
  recentSearches = [term, ...recentSearches.filter((t) => t.toLowerCase() !== term.toLowerCase())].slice(0, 5);
  persistSearches();
}
function moveSearchFocus(dir) {
  const items = $$("#searchResults .srItem");
  if (!items.length) return;
  const i = items.findIndex((x) => x.classList.contains("focus"));
  items.forEach((x) => x.classList.remove("focus"));
  const next = items[(i + dir + items.length) % items.length];
  next.classList.add("focus");
  next.scrollIntoView({ block: "nearest" });
}

/* ---------------- lightbox ---------------- */
const LB = { items: [], i: 0, caption: "" };
function openLightbox(items, index, caption) {
  if (!items.length) return;
  LB.items = items; LB.caption = caption || "";
  const lb = $("#lightbox");
  const wasOpen = lb.classList.contains("open");
  lb.classList.remove("zoomed");
  $("#lbStrip").innerHTML = items.length > 1 ? items.map((it, i) => `<button data-lb-go="${i}" aria-label="Page ${i + 1}"><img src="${esc(it.thumb || it.src)}" alt="" loading="lazy"></button>`).join("") : "";
  lb.classList.add("open");
  lb.setAttribute("aria-hidden", "false");
  if (!wasOpen) lockScroll(true);
  lbShow(index);
}
function lbShow(i) {
  const n = LB.items.length;
  LB.i = (i + n) % n;
  const it = LB.items[LB.i];
  const img = $("#lbImg");
  const lb = $("#lightbox");
  lb.classList.remove("zoomed");
  lb.classList.add("busy");
  img.classList.add("loading");
  img.onload = () => { img.classList.remove("loading"); lb.classList.remove("busy"); };
  img.onerror = () => { lb.classList.remove("busy"); toast("This image couldn't be loaded"); };
  img.src = it.src;
  img.alt = `${LB.caption} ${LB.i + 1}`;
  $("#lbOpen").href = it.src;
  $("#lbCounter").textContent = `${LB.i + 1} / ${n}`;
  $("#lbCaption").textContent = LB.caption;
  $$("#lbStrip button").forEach((b, j) => b.classList.toggle("active", j === LB.i));
  const active = $(`#lbStrip [data-lb-go="${LB.i}"]`);
  if (active) active.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  [1, -1].forEach((d) => { const p = LB.items[(LB.i + d + n) % n]; if (p) new Image().src = p.src; });
  $$(".lbNav").forEach((b) => (b.hidden = n < 2));
}
function closeLightbox() {
  const lb = $("#lightbox");
  if (!lb.classList.contains("open")) return;
  lb.classList.remove("open", "zoomed");
  lb.setAttribute("aria-hidden", "true");
  lockScroll(false);
}
function toggleZoom(ev) {
  const lb = $("#lightbox");
  const stage = $("#lbStage");
  const img = $("#lbImg");
  const rect = img.getBoundingClientRect();
  const fx = ev ? (ev.clientX - rect.left) / rect.width : 0.5;
  const fy = ev ? (ev.clientY - rect.top) / rect.height : 0;
  lb.classList.toggle("zoomed");
  if (lb.classList.contains("zoomed")) {
    requestAnimationFrame(() => {
      stage.scrollLeft = img.offsetWidth * fx - stage.clientWidth / 2;
      stage.scrollTop = img.offsetHeight * fy - stage.clientHeight / 2;
    });
  }
}

/* ---------------- overlays, toast, misc ---------------- */
let scrollLocks = 0;
function lockScroll(on) {
  scrollLocks = Math.max(0, scrollLocks + (on ? 1 : -1));
  document.documentElement.style.overflow = scrollLocks ? "hidden" : "";
}
function openFilters() {
  if ($("#filterSheet").classList.contains("open")) return;
  $("#sheetOverlay").classList.add("open"); $("#filterSheet").classList.add("open"); lockScroll(true);
}
function closeFilters() {
  if (!$("#filterSheet").classList.contains("open")) return;
  $("#sheetOverlay").classList.remove("open"); $("#filterSheet").classList.remove("open"); lockScroll(false);
}
function closeMenu() { $("#accountMenu").classList.remove("open"); $("#avatarBtn").setAttribute("aria-expanded", "false"); }
function closeOverlays() { closeSearch(); closeFilters(); closeLightbox(); closeMenu(); closeFormModal(); closeAuthModal(); }
function toast(t) {
  const x = $("#toast");
  x.textContent = t;
  x.classList.add("show");
  clearTimeout(window._toastT);
  window._toastT = setTimeout(() => x.classList.remove("show"), 2400);
}
async function shareSite() {
  const url = location.origin + "/";
  try {
    if (navigator.share) await navigator.share({ title: "MADINE", text: "Find Jaipur's best cafés and meet people who love them — join me on MADINE", url });
    else { await navigator.clipboard.writeText(url); toast("Invite link copied — send it to a friend"); }
  } catch (e) { /* share sheet dismissed */ }
}
async function shareCurrent() {
  const c = cafeById[currentCafe];
  if (!c) return;
  const url = `${location.origin}${location.pathname}#cafe/${encodeURIComponent(c.id)}`;
  try {
    if (navigator.share) await navigator.share({ title: c.name, text: `${c.name} · ${c.location.area}, Jaipur — on MADINE`, url });
    else { await navigator.clipboard.writeText(url); toast("Link copied to clipboard"); }
  } catch (e) { /* share sheet dismissed */ }
}

/* ---------------- event wiring (delegated) ---------------- */
document.addEventListener("click", (e) => {
  const t = e.target;
  const el = (sel) => t.closest(sel);
  let x;

  if (el('.skipLink')) {
    e.preventDefault();
    const main = $("#main");
    main.focus({ preventScroll: true });
    main.scrollIntoView();
    return;
  }

  // Platform controls have their own delegated handler and may carry a café id.
  if (el('[data-platform]')) return;

  if ((x = el("[data-save]"))) { e.preventDefault(); e.stopPropagation(); const id = x.dataset.save; requireAuth(() => toggleSave(id)); return; }
  if ((x = el("[data-conn-action]"))) { e.stopPropagation(); handleConnection(x.dataset.connAction, x.dataset.id); return; }
  if ((x = el("[data-chat]"))) { e.stopPropagation(); openChatWith(x.dataset.chat); return; }
  if ((x = el("[data-cafe]"))) {
    const dish = x.dataset.dish;
    if (dish) { pendingDish = dish; addRecentSearch(dish); }
    if (dish && currentCafe === x.dataset.cafe) currentCafe = null; // force a re-render with the dish filter
    navigate(`#cafe/${encodeURIComponent(x.dataset.cafe)}${dish ? "/menu" : ""}`);
    return;
  }
  if ((x = el("[data-person]"))) { navigate(`#profile/${x.dataset.person}`); return; }
  if ((x = el("[data-quick]"))) { e.preventDefault(); closeSearch(); quickFilter(x.dataset.quick); return; }
  if ((x = el("[data-search-term]"))) { closeSearch(); searchDiscover(x.dataset.searchTerm); return; }
  if ((x = el("[data-href]"))) { navigate(x.dataset.href); return; }
  if ((x = el("[data-sort-link]"))) { resetFilters(); sortBy = x.dataset.sortLink; $("#sortSelect").value = sortBy; syncFilterUI(); discoverDirty = true; return; }
  if ((x = el("[data-type-link]"))) { resetFilters(); F.types.add(x.dataset.typeLink); syncFilterUI(); discoverDirty = true; return; }

  // discover filters
  if ((x = el("[data-type]"))) { F.types.clear(); if (x.dataset.type) F.types.add(x.dataset.type); applyFilters(); return; }
  if ((x = el("button[data-filter]"))) { const set = F[x.dataset.filter]; set.has(x.dataset.value) ? set.delete(x.dataset.value) : set.add(x.dataset.value); applyFilters(); return; }
  if ((x = el("[data-filter-rating]"))) { F.minRating = Number(x.dataset.filterRating); applyFilters(); return; }
  if ((x = el("[data-remove]"))) {
    const k = x.dataset.remove;
    if (k === "q") F.q = ""; else if (k === "minRating") F.minRating = 0; else if (k === "hasMenu") F.hasMenu = false; else F[k].delete(x.dataset.value);
    applyFilters(); return;
  }

  // café detail
  if ((x = el("[data-tab]"))) { selectTab(x.dataset.tab); history.replaceState(null, "", `#cafe/${encodeURIComponent(currentCafe)}${x.dataset.tab === "overview" ? "" : "/" + x.dataset.tab}`); if (x.dataset.tab === "people") renderCafeCheckins(true); return; }
  if ((x = el("[data-tab-jump]"))) { selectTab(x.dataset.tabJump); return; }
  if ((x = el("[data-lb-gallery]"))) { const c = cafeById[currentCafe]; openLightbox(c.gallery.map((src) => ({ src })), Number(x.dataset.lbGallery), `${c.name} · Photos`); return; }
  if ((x = el("[data-lb-menu]"))) { const c = cafeById[currentCafe]; openLightbox(c.menuImages, Number(x.dataset.lbMenu), `${c.name} · Menu`); return; }
  if ((x = el("[data-dish-cat]"))) { $(`#dishCat-${x.dataset.dishCat}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }

  // lightbox
  if ((x = el("[data-lb-go]"))) { lbShow(Number(x.dataset.lbGo)); return; }
  if ((x = el("[data-lb]"))) {
    const a = x.dataset.lb;
    if (a === "close") closeLightbox(); else if (a === "prev") lbShow(LB.i - 1); else if (a === "next") lbShow(LB.i + 1); else if (a === "zoom") toggleZoom();
    return;
  }
  if (t.id === "lbImg") { toggleZoom(e); return; }
  if (t.id === "lbStage") { closeLightbox(); return; }

  // misc
  if ((x = el("[data-interest]"))) { interestFilter = x.dataset.interest; renderPeople(); return; }
  if ((x = el("[data-conn]"))) { connTab = x.dataset.conn; renderConnections(); return; }
  if ((x = el("[data-event-action]"))) { handleEventAction(x.dataset.eventAction, x.dataset.id); return; }
  if ((x = el("[data-community-action]"))) { handleCommunityAction(x.dataset.communityAction, x.dataset.id); return; }
  if ((x = el("[data-checkin-delete]"))) { deleteCheckin(x.dataset.checkinDelete); return; }
  if ((x = el("[data-checkin-discovery]"))) { toggleCheckinDiscovery(x.dataset.checkinDiscovery, x.dataset.enabled === "true"); return; }
  if ((x = el("[data-form-chip]"))) { e.preventDefault(); toggleFormChip(x); return; }
  if ((x = el("[data-fav-add]"))) { e.preventDefault(); addFavCafe(x.dataset.favAdd); return; }
  if ((x = el("[data-fav-remove]"))) { e.preventDefault(); removeFavCafe(x.dataset.favRemove); return; }
  if ((x = el("[data-toast]"))) { toast(x.dataset.toast); return; }
  if ((x = el("[data-rail]"))) { const rail = $("#" + x.dataset.rail); rail.scrollBy({ left: Number(x.dataset.dir) * rail.clientWidth * 0.9, behavior: "smooth" }); return; }

  if ((x = el("[data-action]"))) {
    const a = x.dataset.action;
    const actions = {
      "open-search": () => openSearch(),
      "close-search": closeSearch,
      "retry-social": retrySocial,
      "open-filters": openFilters,
      "close-filters": closeFilters,
      "clear-filters": () => { resetFilters(); applyFilters(); },
      "load-more": appendDiscoverPage,
      "save-current": () => currentCafe && requireAuth(() => toggleSave(currentCafe)),
      "share-current": shareCurrent,
      "share-site": shareSite,
      // history.back() only when we navigated inside the app; a cold deep link goes to the parent list
      back: () => (window._navCount ? history.back() : navigate(currentView === "profile" ? "#people" : "#discover")),
      "chat-back": closeChat,
      "edit-profile": () => requireAuth(() => openProfileForm()),
      "create-community": () => requireProfile(openCommunityForm),
      "create-event": () => requireProfile(openEventForm),
      "check-in": () => requireProfile(openCheckinForm),
      "close-form": closeFormModal,
      "auth-toggle": () => { closeMenu(); AuthService.isAuthenticated() ? logout() : requireAuth(null); },
      login: () => requireAuth(null),
      logout: () => logout(),
      "close-auth": closeAuthModal,
    };
    if (actions[a]) { e.preventDefault(); actions[a](); }
    return;
  }

  if (t.closest("#avatarBtn")) {
    const m = $("#accountMenu");
    const open = !m.classList.contains("open");
    m.classList.toggle("open", open);
    $("#avatarBtn").setAttribute("aria-expanded", open);
    return;
  }
  if (!t.closest("#accountMenu")) closeMenu();
  if (t.closest("#accountMenu a")) closeMenu();
  if (t.id === "searchOverlay") closeSearch();
  if (t.id === "authOverlay") closeAuthModal();
  if (t.id === "formOverlay") closeFormModal();
});

document.addEventListener("keydown", (e) => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if (e.key === "Escape") { closeOverlays(); return; }
  if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) { e.preventDefault(); openSearch(); return; }
  if ($("#lightbox").classList.contains("open")) {
    if (e.key === "ArrowRight") lbShow(LB.i + 1);
    if (e.key === "ArrowLeft") lbShow(LB.i - 1);
    if (e.key === "+" || e.key === "z") toggleZoom();
    return;
  }
  if ($("#searchOverlay").classList.contains("open")) {
    if (e.key === "ArrowDown") { e.preventDefault(); moveSearchFocus(1); }
    if (e.key === "ArrowUp") { e.preventDefault(); moveSearchFocus(-1); }
    if (e.key === "Enter") {
      e.preventDefault();
      const f = $("#searchResults .srItem.focus");
      if (f) f.click();
      else if ($("#globalSearch").value.trim()) { const q = $("#globalSearch").value; closeSearch(); searchDiscover(q); }
    }
    return;
  }
  const card = document.activeElement?.closest?.("[data-cafe],[data-person]");
  if ((e.key === "Enter" || e.key === " ") && card && card === document.activeElement) { e.preventDefault(); card.click(); }
});

function wireInputs() {
  $("#globalSearch").addEventListener("input", debounce((e) => renderSearchResults(e.target.value), 70));
  $("#heroSearchForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("#heroSearch").value.trim();
    if (q) searchDiscover(q); else openSearch();
  });
  $("#heroSearch").addEventListener("focus", (e) => {
    if (window.matchMedia("(max-width:760px)").matches) { e.target.blur(); openSearch(); }
  });
  const onDiscoverInput = debounce(() => { F.q = $("#discoverSearch").value.trim(); $("#discoverClear").hidden = !F.q; renderDiscover(); }, 160);
  $("#discoverSearch").addEventListener("input", onDiscoverInput);
  $("#discoverSearch").addEventListener("change", () => F.q && addRecentSearch(F.q));
  $("#discoverClear").addEventListener("click", () => { $("#discoverSearch").value = ""; F.q = ""; $("#discoverClear").hidden = true; renderDiscover(); $("#discoverSearch").focus(); });
  $("#sortSelect").addEventListener("change", (e) => { sortBy = e.target.value; renderDiscover(); });
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.matches("input[data-filter]")) { const set = F[t.dataset.filter]; t.checked ? set.add(t.dataset.value) : set.delete(t.dataset.value); applyFilters(); }
    if (t.matches("[data-filter-menu]")) { F.hasMenu = t.checked; applyFilters(); }
    if (t.id === "avatarUpload") { handleAvatarUpload(t.files && t.files[0]); t.value = ""; }
  });
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.matches("[data-list-filter]")) {
      const q = t.value.toLowerCase().trim();
      $$(`#${t.dataset.listFilter} .check`).forEach((row) => (row.hidden = q && !row.dataset.label.includes(q)));
    }
  });
  $("#dishSearch").addEventListener("input", debounce((e) => renderDishes(e.target.value), 100));
  $("#peopleSearch").addEventListener("input", debounce(renderPeople, 100));
  $("#composer").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#msgInput");
    const text = input.value.trim();
    if (!text || !window.currentChat) return;
    input.value = "";
    ChatService.send(window.currentChat, text).catch((err) => {
      toast(err.message);
      if (!input.value) input.value = text; // give the text back so it isn't lost
    });
  });
  $("#msgInput").addEventListener("input", () => window.currentChat && ChatService.sendTyping(window.currentChat));
  $("#subscribeForm").addEventListener("submit", (e) => { e.preventDefault(); e.target.reset(); toast("Thanks! We'll be in touch when newsletters launch."); });
  $("#myProfileLoggedIn .profileAvatar").addEventListener("click", (e) => { if (!AuthService.isAuthenticated()) { e.preventDefault(); requireAuth(() => {}); } });

  // lightbox swipe
  let sx = null, sy = null;
  const stage = $("#lbStage");
  stage.addEventListener("pointerdown", (e) => { if (!$("#lightbox").classList.contains("zoomed")) { sx = e.clientX; sy = e.clientY; } });
  stage.addEventListener("pointerup", (e) => {
    if (sx == null) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    sx = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { lbShow(LB.i + (dx < 0 ? 1 : -1)); window._lbSwiped = true; setTimeout(() => (window._lbSwiped = false), 50); }
  });
  stage.addEventListener("click", (e) => { if (window._lbSwiped) e.stopPropagation(); }, true);

  // mobile mosaic counter
  $("#cafeMosaic").addEventListener("scroll", debounce((e) => {
    const m = e.target;
    const n = cafeById[currentCafe]?.gallery.length || 0;
    if (n > 1) $("#mosaicCount").textContent = `${Math.round(m.scrollLeft / m.clientWidth) + 1} / ${n}`;
  }, 40), { passive: true });

  // header elevation + tab ink on resize
  const nav = $("#topNav");
  window.addEventListener("scroll", () => nav.classList.toggle("scrolled", window.scrollY > 8), { passive: true });
  window.addEventListener("resize", debounce(moveTabInk, 100));
  window.addEventListener("hashchange", () => (window._navCount = (window._navCount || 0) + 1));
}

/* scroll-reveal for home sections + auto-load more results */
function wireObservers() {
  if (!("IntersectionObserver" in window)) { $$(".reveal").forEach((r) => r.classList.add("in")); return; }
  const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }), { rootMargin: "0px 0px -8% 0px" });
  $$(".reveal").forEach((r) => io.observe(r));
  const more = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && currentView === "discover" && discoverShown && discoverShown < discoverResults.length) appendDiscoverPage();
  }, { rootMargin: "600px 0px" });
  more.observe($("#loadMore"));
}

/* ---------------- boot ---------------- */
async function boot() {
  const authReady = AuthService.init();
  const cafesReady = loadCafesFromAPI();
  const socialReady = authReady.then(() => {
    if (AuthService.isAuthenticated()) ChatService.connect();
    return loadSocialData();
  });
  hydrateIcons();
  wireInputs();
  wireObservers();

  // skeletons while the dataset loads
  $("#railTop").innerHTML = skeletonCards(4);
  $("#cafePicks").innerHTML = skeletonCards(4);
  $("#discoverGrid").innerHTML = skeletonCards(6);
  setActiveView(parseHash().view === "cafe" ? "discover" : parseHash().view);

  await Promise.all([authReady, cafesReady]);
  prepareData();
  renderMyAvatar();
  renderAccountMenu();
  saved = new Set(AuthService.getUser()?.saved || []);
  // A profile deep link needs its person record; public café pages can paint
  // immediately while the independent social requests finish in the background.
  if (parseHash().view === 'profile') await socialReady;
  dataReady = true;
  updateSaveButtons();
  syncFilterUI();
  route();
  Platform.refreshBadge();
  await socialReady;
  renderStatic();
  renderHomeEvents();
  refreshPeopleUI();
}
document.addEventListener('DOMContentLoaded', () => boot().catch((error) => {
  console.error('Application could not start:', error);
  const box = document.createElement('p'); box.className = 'catalogError'; box.textContent = error.message;
  $('#main').prepend(box);
}), { once: true });
