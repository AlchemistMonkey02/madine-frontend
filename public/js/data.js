/* =========================================================================
   VYBE data layer — normalized from the original prototype's inline arrays.
   Real cafe names/areas/ratings/menus are carried over from the existing
   dataset (originally sourced from Zomato/Swiggy Dineout listings — see
   footer disclosure). Where the original data had no detail record for a
   cafe, fields are left null / marked unverified rather than invented.
   People, communities and events come from real users via the API
   (see the bottom of this file).
   ========================================================================= */

/* Self-hosted locally in assets/images/ (originally sourced from Wikimedia
   Commons, resized/compressed) — hotlinking Wikimedia directly was unreliable:
   this page requests ~19 of these at once on load, and Wikimedia's media
   servers throttle concurrent per-IP requests more aggressively than the
   café photos' Zomato CDN does. */
const FOOD_CATEGORIES = [
  { key: "coffee", label: "Coffee", emoji: "☕", image: "assets/images/food-coffee.jpg" },
  { key: "chai", label: "Chai & Tea", emoji: "🫖", image: "assets/images/food-chai.jpg" },
  { key: "pizza", label: "Pizza", emoji: "🍕", image: "assets/images/food-pizza.jpg" },
  { key: "pasta", label: "Pasta", emoji: "🍝", image: "assets/images/food-pasta.jpg" },
  { key: "burgers", label: "Burgers", emoji: "🍔", image: "assets/images/food-burgers.jpg" },
  { key: "desserts", label: "Desserts", emoji: "🍰", image: "assets/images/food-desserts.jpg" },
  { key: "indian", label: "Indian", emoji: "🥘", image: "assets/images/food-indian.jpg" },
  { key: "healthy", label: "Healthy", emoji: "🥗", image: "assets/images/food-healthy.jpg" },
  { key: "drinks", label: "Drinks", emoji: "🍹", image: "assets/images/food-drinks.jpg" },
  { key: "bakery", label: "Bakery", emoji: "🥐", image: "assets/images/food-bakery.jpg" },
];

const VIBE_TAGS = [
  "Quiet Work", "Date Night", "Friends", "Solo", "Rooftop",
  "Cozy", "Luxury", "Outdoor", "Late Night",
];
/* Real venue photos (reused from the verified café galleries below) standing
   in for each vibe — more honest than generic stock photography for a site
   built on real Jaipur venues. */
const VIBE_IMAGES = {
  "Quiet Work": "assets/images/vibe-quietwork.jpg",
  "Date Night": "assets/images/vibe-datenight.jpg",
  "Friends": "assets/images/vibe-friends.jpg",
  "Solo": "assets/images/vibe-solo.jpg",
  "Rooftop": "assets/images/vibe-rooftop.jpg",
  "Cozy": "assets/images/vibe-cozy.jpg",
  "Luxury": "assets/images/vibe-luxury.jpg",
  "Outdoor": "assets/images/vibe-outdoor.jpg",
  "Late Night": "assets/images/vibe-latenight.jpg",
};

const CAFE_TYPES = ["Cafe", "Restaurant", "Bakery", "Rooftop", "Fine Dining"];

const PRICE_RANGES = ["₹", "₹₹", "₹₹₹", "₹₹₹₹"];
const PRICE_LABELS = { "₹": "Budget", "₹₹": "Moderate", "₹₹₹": "Premium", "₹₹₹₹": "Luxury" };
const PRICE_SEARCH_TERMS = {
  "₹": "budget cheap affordable inexpensive",
  "₹₹": "moderate mid-range reasonable",
  "₹₹₹": "premium upscale",
  "₹₹₹₹": "luxury expensive fancy fine dining",
};


// Always use the complete catalog. The bundled snapshot contains the original
// 250 records and is used only if the live catalog cannot be reached.
let CAFES = [];
let CATALOG_SOURCE = '';
async function loadCafesFromAPI({ fresh = false } = {}) {
  for (const url of ['/api/cafes', '/data/cafes.json']) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: fresh ? 'reload' : 'default' });
      if (!response.ok) throw new Error('Catalog HTTP ' + response.status);
      const data = await response.json(), cafes = Array.isArray(data) ? data : data.cafes;
      if (!Array.isArray(cafes) || !cafes.length) throw new Error('Catalog is empty');
      CAFES = cafes;
      CATALOG_SOURCE = url === '/api/cafes' ? 'live' : 'bundled';
      console.info('Loaded complete café catalog:', CAFES.length, CATALOG_SOURCE);
      return;
    } catch (error) {
      console.warn('Catalog source unavailable:', url, error.message);
    } finally { clearTimeout(timeout); }
  }
  throw new Error('The café catalog could not load. Please refresh or check the server.');
}
let PEOPLE = [];
let COMMUNITIES = [];
let EVENTS = [];
