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

/* Each cafe: { id, name, slug, description, location, priceRange, cafeType[],
   ambience[], topFoods[5], image, gallery[], rating, reviews, hours,
   about, features[], menu[], verificationNote (present only when some detail
   about the listing could not be independently confirmed) } */
/* Used only if /api/cafes can't be reached (backend not running) — keeps the
   page from rendering completely empty. Real data (250 Jaipur cafés from
   MongoDB) is loaded by loadCafesFromAPI() below and replaces this. */
const CAFES_FALLBACK = [
  {
    id: "tapri-central", name: "Tapri Central", slug: "tapri-central",
    description: "Rooftop city views, chai and relaxed social meetups.",
    location: { area: "Bapu Nagar", city: "Jaipur", address: "Bapu Nagar · Tonk Road" },
    priceRange: "₹₹", cafeType: ["Cafe", "Rooftop"],
    ambience: ["Rooftop", "City View", "Sunset", "Social"],
    topFoods: [
      { name: "Bun Muska", category: "bakery", isSpeciality: true },
      { name: "Khakhra Pizza", category: "pizza", isSpeciality: true },
      { name: "Masala Chai", category: "chai", isSpeciality: false },
      { name: "Cheese Corn Shots", category: "healthy", isSpeciality: false },
      { name: "Hibiscus Tea", category: "drinks", isSpeciality: false },
    ],
    image: "https://dineout-media-assets.swiggy.com/swiggy/image/upload/fl_lossy%2Cf_auto%2Cq_auto/DINEOUT_ALL_RESTAURANTS/IMAGES/RESTAURANT_IMAGE_SERVICE/2025/3/27/de5b9ef6-782d-4440-89ba-31c6124f34a2_image158b43695f363c4e0a8c4a1478ecb080cf.JPG",
    gallery: [
      "https://b.zmtcdn.com/data/pictures/2/101212/0023f2447294a7450077fa150c6b6155.jpg",
      "https://b.zmtcdn.com/data/pictures/2/101212/0da933dd58a9223e542ace74fae7a13d.jpg",
      "https://b.zmtcdn.com/data/pictures/2/101212/125af03bc47da625ca645b883eb58c5d.jpg",
      "https://b.zmtcdn.com/data/pictures/2/101212/18a8a6d5a56434d02ef5915da77b19b8.jpg",
      "https://b.zmtcdn.com/data/pictures/2/101212/466bc79307690575dfd032d3665f08db_featured_v2.jpg",
      "https://b.zmtcdn.com/data/pictures/2/101212/4c37c59b010ba241fcd3a41297d49896.jpg",
      "https://b.zmtcdn.com/data/pictures/2/101212/5900d267a693cfb89c08634156b397fe.jpg",
      "https://b.zmtcdn.com/data/pictures/2/101212/592db9a49e07705d086f39268241c9fd.jpg",
      "https://b.zmtcdn.com/data/pictures/2/101212/5c839ec18c43ea468b10b3a9b7702e29.jpg",
      "https://b.zmtcdn.com/data/pictures/2/101212/5e30f435a04244cc056be9f3b96a2fb3.jpg",
    ],
    rating: 4.7, reviews: 3133, priceForTwo: "₹950 for two", budget: "₹400–₹1,000",
    hours: "7:30 AM – 10:00 PM",
    about: "A Jaipur favourite for rooftop city views, chai, casual conversations and relaxed social meetups.",
    features: ["Rooftop", "Sunset View", "Outdoor Seating", "Board Games", "Free Parking", "Vegetarian"],
    menu: [["Masala Chai", "₹140"], ["Bun Muska", "₹190"], ["Khakhra Pizza", "₹320"], ["Cheese Corn Shots", "₹280"], ["Hibiscus Tea", "₹170"]],
    featured: true, trending: true,
  },
  {
    id: "khameer-burdera", name: "Khameer by BUR'dera", slug: "khameer-by-burdera",
    description: "Artistic heritage-modern space for brunch, work and dates.",
    location: { area: "Durgapura", city: "Jaipur", address: "Durgapura · S.L. Marg" },
    priceRange: "₹₹", cafeType: ["Cafe", "Restaurant"],
    ambience: ["Artistic", "Romantic", "Heritage Modern", "Work Friendly"],
    topFoods: [
      { name: "Pizza", category: "pizza", isSpeciality: true },
      { name: "Pasta", category: "pasta", isSpeciality: true },
      { name: "All Day Breakfast", category: "indian", isSpeciality: false },
      { name: "Desserts", category: "desserts", isSpeciality: false },
      { name: "Coffee", category: "coffee", isSpeciality: false },
    ],
    image: "https://dineout-media-assets.swiggy.com/swiggy/image/upload/fl_lossy%2Cf_auto%2Cq_auto%2Cw_600%2Ch_468/v1675677765/a05ae17ed5fa5851aba6f8668895887f.jpg",
    gallery: [
      "https://b.zmtcdn.com/data/pictures/5/21155825/925ca89ba2af0c467fe478be36eedc82.jpg",
      "https://b.zmtcdn.com/data/pictures/5/21155825/b5de613296fc2bdc51118d78d7de2a41_featured_v2.jpg",
      "https://b.zmtcdn.com/data/pictures/chains/5/21155825/064d7c38c92f5e7b0103a7af4d5a1fac.jpg",
      "https://b.zmtcdn.com/data/pictures/chains/5/21155825/2b1ff1a9d41899bb9dd1bf99cf4003e9.jpg",
      "https://b.zmtcdn.com/data/pictures/chains/5/21155825/3298860c0119241856e747d9a3306b21.jpg",
      "https://b.zmtcdn.com/data/pictures/chains/5/21155825/32fd37c4b1770ba4f61e681ada8c6932.jpg",
      "https://b.zmtcdn.com/data/pictures/chains/5/21155825/3984b19b95cc68236be6c93e864fb932.jpg",
      "https://b.zmtcdn.com/data/pictures/chains/5/21155825/3ad4d5570fa3486ae3aa6bdd84baa63b.jpg",
      "https://b.zmtcdn.com/data/pictures/chains/5/21155825/6a11e15bef7f6f563e9c906f2ff641f5.jpg",
      "https://b.zmtcdn.com/data/pictures/chains/5/21155825/74398df2e6d60a02669974b5cf4d7d6f.jpg",
    ],
    rating: 4.4, reviews: 1074, priceForTwo: "₹1,250 for two", budget: "₹600–₹1,500",
    hours: "8:00 AM – 11:00 PM",
    about: "An artistic café and dining space with modern heritage styling, suitable for brunch, work sessions and dates.",
    features: ["Wi-Fi", "Outdoor Seating", "Work Friendly", "Vegan Options", "Brunch", "Parking"],
    menu: [["All Day Breakfast", "₹350+"], ["Pasta", "₹420+"], ["Pizza", "₹450+"], ["Desserts", "₹220+"], ["Coffee", "₹180+"]],
    featured: true, trending: true,
  },
  {
    id: "coffee-sutra", name: "Coffee Sutra", slug: "coffee-sutra",
    description: "Spacious, work-friendly café known for coffee meetings.",
    location: { area: "C-Scheme", city: "Jaipur", address: "C-Scheme · Tilak Marg" },
    priceRange: "₹", cafeType: ["Cafe"],
    ambience: ["Spacious", "Work Friendly", "Modern"],
    topFoods: [
      { name: "Cappuccino", category: "coffee", isSpeciality: true },
      { name: "Cold Brew", category: "coffee", isSpeciality: false },
      { name: "Pasta", category: "pasta", isSpeciality: false },
      { name: "Sandwich", category: "burgers", isSpeciality: false },
      { name: "Dessert", category: "desserts", isSpeciality: false },
    ],
    image: "https://b.zmtcdn.com/data/pictures/2/101212/ad83d624e8e3b1a17f8f4b40db49531a.jpg?output-format=webp",
    gallery: [
      "https://b.zmtcdn.com/data/pictures/8/20137258/2e6a50b9f2ab6918e7a09d5d494ee329.jpg",
      "https://b.zmtcdn.com/data/pictures/8/20137258/34ef4a3c22e9f374aefa702c7558eb49.jpg",
      "https://b.zmtcdn.com/data/pictures/8/20137258/45f52a404e732c7833d0bc28cfd56d43.jpg",
      "https://b.zmtcdn.com/data/pictures/8/20137258/47973785be8f9cdcd3780ef20e9e8702.jpg",
      "https://b.zmtcdn.com/data/pictures/8/20137258/520ad48489d310c2936121da70c68e51.jpg",
      "https://b.zmtcdn.com/data/pictures/8/20137258/82379105236c1f8d39d528765b95c1f4.jpg",
      "https://b.zmtcdn.com/data/pictures/8/20137258/8d0bac4042edf8bdccbf60ad7738be0e.jpg",
      "https://b.zmtcdn.com/data/pictures/8/20137258/bc8aa2c0a01b956b0777e64d71a8ffee.jpg",
      "https://b.zmtcdn.com/data/pictures/8/20137258/cea3d06b78c4c74b900017f4aff87550.jpg",
      "https://b.zmtcdn.com/data/pictures/8/20137258/f8923f8ccc6c63e310b709e52d5c8558.jpg",
    ],
    rating: 4.4, reviews: 317, priceForTwo: "₹800 for two", budget: "₹350–₹900",
    hours: "8:30 AM – 10:30 PM",
    about: "Known for spacious interiors and a work-friendly setting, making it useful for coffee meetings and focused sessions.",
    features: ["Wi-Fi", "Work Friendly", "Indoor Seating", "Outdoor Seating", "Board Games", "Parking"],
    menu: [["Cappuccino", "₹180+"], ["Cold Brew", "₹220+"], ["Pasta", "₹320+"], ["Sandwich", "₹260+"], ["Dessert", "₹220+"]],
    trending: true,
  },
  {
    id: "anokhi-cafe", name: "Anokhi Café", slug: "anokhi-cafe",
    description: "Calm, heritage-inspired café for quiet conversations.",
    location: { area: "Bais Godam", city: "Jaipur", address: "Bais Godam · C-Scheme" },
    priceRange: "₹₹", cafeType: ["Cafe"],
    ambience: ["Heritage", "Artistic", "Quiet"],
    topFoods: [
      { name: "Fresh Salad", category: "healthy", isSpeciality: true },
      { name: "Sandwich", category: "burgers", isSpeciality: false },
      { name: "Coffee", category: "coffee", isSpeciality: false },
      { name: "Cake", category: "desserts", isSpeciality: false },
      { name: "Fresh Juice", category: "drinks", isSpeciality: false },
    ],
    image: "assets/images/anokhi-1.jpg",
    gallery: [
      "https://b.zmtcdn.com/data/pictures/0/101220/47b691475b68e9c0ba3d9d86cbcd36a1.jpg",
      "https://b.zmtcdn.com/data/pictures/0/101220/575432c208eb1ebf06671acbbb6e1ae9.jpg",
      "https://b.zmtcdn.com/data/pictures/0/101220/a7787ebf0efd1b47ae047e2e4f9fb6ca.jpg",
      "https://b.zmtcdn.com/data/pictures/0/101220/af80af1757b6789dbffb4591acaa6069.jpg",
      "https://b.zmtcdn.com/data/pictures/0/101220/e63fbe46b04f7f4c305ff2690cb90659.jpg",
      "https://b.zmtcdn.com/data/pictures/chains/0/101220/01340fae02cb5877b07675538e4c685f_featured_v2.jpg",
      "https://b.zmtcdn.com/data/pictures/chains/0/101220/34ea79b8031a83051cc9b90e653cad0a.jpg",
      "https://b.zmtcdn.com/data/pictures/chains/0/101220/6f32d1cbc433481a5d8df72cc1c2c725.jpg",
      "assets/images/anokhi-1.jpg",
      "assets/images/anokhi-2.jpg",
    ],
    rating: 4.4, reviews: 1100, priceForTwo: "₹1,000 for two", budget: "₹500–₹1,300",
    hours: "9:00 AM – 7:00 PM",
    about: "A calm, heritage-inspired café experience that works especially well for quiet conversations and relaxed afternoons.",
    features: ["Quiet", "Outdoor Seating", "Healthy Options", "Art & Culture", "Vegetarian"],
    menu: [["Fresh Salad", "₹300+"], ["Sandwich", "₹280+"], ["Coffee", "₹180+"], ["Cake", "₹220+"], ["Fresh Juice", "₹200+"]],
    featured: true,
  },
  {
    id: "havaana-coffee", name: "Havaana Coffee", slug: "havaana-coffee",
    description: "Modern, comfortable café for casual coffee and work.",
    location: { area: "Malviya Nagar", city: "Jaipur", address: "Malviya Nagar" },
    priceRange: "₹", cafeType: ["Cafe"],
    ambience: ["Modern", "Cozy", "Casual"],
    topFoods: [
      { name: "Latte", category: "coffee", isSpeciality: true },
      { name: "Cold Coffee", category: "coffee", isSpeciality: false },
      { name: "Pasta", category: "pasta", isSpeciality: false },
      { name: "Burger", category: "burgers", isSpeciality: false },
      { name: "Cake", category: "desserts", isSpeciality: false },
    ],
    image: "https://b.zmtcdn.com/data/pictures/2/21597282/15398118cb7d9adc005a08897955aea4.jpg",
    gallery: [
      "https://b.zmtcdn.com/data/pictures/2/21597282/15398118cb7d9adc005a08897955aea4.jpg",
      "https://b.zmtcdn.com/data/pictures/2/21597282/2f63b431c763c849931f294cd1509d4a.jpg",
      "https://b.zmtcdn.com/data/pictures/2/21597282/4f34d36b379880804404c0ca6c1f78dd.jpg",
      "https://b.zmtcdn.com/data/pictures/2/21597282/6473347f5f373eed5836f8d0f51fcfee.jpg",
      "https://b.zmtcdn.com/data/pictures/2/21597282/8875a034a444450800e68e6693962257_o2_featured_v2.jpg",
      "https://b.zmtcdn.com/data/pictures/2/21597282/c2b302c91df991f8391cf653c86fd5df_featured_v2.jpg",
      "https://b.zmtcdn.com/data/pictures/chains/2/21597282/721405c148d28e80fc294aa1b12d9057.jpg",
      "https://b.zmtcdn.com/data/pictures/chains/2/21597282/b0dbff080192e1ba22d89ec62fed9050.jpg",
    ],
    rating: 4.3, reviews: 500, priceForTwo: "₹700 for two", budget: "₹300–₹800",
    hours: "10:00 AM – 11:00 PM",
    about: "A modern, comfortable café for casual coffee, work sessions and small meetups.",
    features: ["Wi-Fi", "Indoor Seating", "Outdoor Seating", "Work Friendly"],
    menu: [["Latte", "₹180+"], ["Cold Coffee", "₹210+"], ["Pasta", "₹300+"], ["Burger", "₹320+"], ["Cake", "₹180+"]],
  },
  {
    id: "noir-coffee-house", name: "Noir Coffee House", slug: "noir-coffee-house",
    description: "Cozy 24-hour coffee house for late evenings and work.",
    location: { area: "MI Road", city: "Jaipur", address: "MI Road · Jai Club" },
    priceRange: "₹", cafeType: ["Cafe"],
    ambience: ["Chill", "Cozy", "Late Night"],
    topFoods: [
      { name: "Cappuccino", category: "coffee", isSpeciality: true },
      { name: "Cold Brew", category: "coffee", isSpeciality: false },
      { name: "Burger", category: "burgers", isSpeciality: true },
      { name: "Pasta", category: "pasta", isSpeciality: false },
      { name: "Chocolate Cake", category: "desserts", isSpeciality: false },
    ],
    image: "https://b.zmtcdn.com/data/pictures/2/20562862/05387d5fe2f4d4c5cddde5a41c96ff05.jpg",
    gallery: [
      "https://b.zmtcdn.com/data/pictures/2/20562862/05387d5fe2f4d4c5cddde5a41c96ff05.jpg",
      "https://b.zmtcdn.com/data/pictures/2/20562862/07d221fa8377aa7136fb9f8a8de499ef_featured_v2.jpg",
      "https://b.zmtcdn.com/data/pictures/2/20562862/21622ac2f5d5c3094407f4c5a9cb8261.jpg",
      "https://b.zmtcdn.com/data/pictures/2/20562862/39dee6ee5819069804e9ee7fc4bd31c4.jpg",
      "https://b.zmtcdn.com/data/pictures/2/20562862/968296b0f9e1ac39401fc5cf2468dc30.jpg",
      "https://b.zmtcdn.com/data/pictures/2/20562862/975eedf0378eb507c0f8c6766dd20848.jpg",
      "https://b.zmtcdn.com/data/pictures/2/20562862/ae428b42af0310552faba44d9bb9da37.jpg",
      "https://b.zmtcdn.com/data/pictures/2/20562862/d155788dda1b2486c81a8d6442d39f19.jpg",
    ],
    rating: 4.4, reviews: 778, priceForTwo: "₹700 for two", budget: "₹300–₹900",
    hours: "Open 24 hours",
    about: "A cozy coffee-house environment on MI Road, suitable for late-evening conversations, focused work and coffee breaks.",
    features: ["24 Hours", "Indoor Seating", "Coffee", "Work Friendly", "Parking"],
    menu: [["Cappuccino", "₹180+"], ["Cold Brew", "₹220+"], ["Burger", "₹350+"], ["Pasta", "₹380+"], ["Chocolate Cake", "₹260+"]],
    trending: true,
  },
  {
    id: "roastery-coffee-house", name: "Roastery Coffee House", slug: "roastery-coffee-house",
    description: "Calm, earthy café for productive coffee sessions.",
    location: { area: "C-Scheme", city: "Jaipur", address: "C-Scheme" },
    priceRange: "₹₹", cafeType: ["Cafe"],
    ambience: ["Productive", "Calm", "Earthy"],
    topFoods: [
      { name: "Coffee", category: "coffee", isSpeciality: false },
      { name: "Cold Coffee", category: "coffee", isSpeciality: false },
      { name: "Sandwiches", category: "burgers", isSpeciality: false },
      { name: "Pasta", category: "pasta", isSpeciality: false },
      { name: "Desserts", category: "desserts", isSpeciality: false },
    ],
    image: "https://b.zmtcdn.com/data/pictures/7/20374287/11fd8b3f8c7b4a73e27f334f1625938a.jpg",
    gallery: [
      "https://b.zmtcdn.com/data/pictures/7/20374287/11fd8b3f8c7b4a73e27f334f1625938a.jpg",
      "https://b.zmtcdn.com/data/pictures/7/20374287/20ae1a335cd54ef6763a5aac0bc53655.jpg",
      "https://b.zmtcdn.com/data/pictures/7/20374287/2668c938f7197db844ba1519740351b8.jpg",
      "https://b.zmtcdn.com/data/pictures/7/20374287/52aea3688f188f8794c361165264f90e.jpg",
      "https://b.zmtcdn.com/data/pictures/7/20374287/57fd3ffc0a6e959e79eac214c172b395.jpg",
      "https://b.zmtcdn.com/data/pictures/7/20374287/6a7b1f18ea714675f588ccc4288bda49.jpg",
      "https://b.zmtcdn.com/data/pictures/7/20374287/7b6c7fcaad8881464c21366f65f76669_featured_v2.jpg",
      "https://b.zmtcdn.com/data/pictures/7/20374287/7c7cdc69fd2eac016693ae67c96facf2.jpg",
      "https://b.zmtcdn.com/data/pictures/7/20374287/8d209db492bee486f1fea862e28fca4c.jpg",
      "https://b.zmtcdn.com/data/pictures/7/20374287/94d79886ab758ee82c42e6991ebd17cd.jpg",
      "https://b.zmtcdn.com/data/pictures/7/20374287/bd4bc18b782d4316b2f615b2770e0a68.jpg",
      "https://b.zmtcdn.com/data/pictures/7/20374287/c6bf80d0900cc1f9a28cb181bd365b1f.jpg",
    ],
    rating: null, reviews: null, priceForTwo: null, budget: null,
    hours: null,
    about: "A calm, earthy café space suited to focused work and coffee. It has a real Zomato listing (hence the photos), but menu and pricing details could not be independently confirmed.",
    features: ["Work Friendly"],
    menu: [],
    verificationNote: "Menu and pricing details are still being verified",
  },
  {
    id: "caffe-palladio", name: "Caffé Palladio", slug: "caffe-palladio",
    description: "Premium heritage setting for dates and special occasions.",
    location: { area: "Narain Niwas", city: "Jaipur", address: "Narain Niwas · Kanota Bagh" },
    priceRange: "₹₹₹", cafeType: ["Cafe", "Fine Dining"],
    ambience: ["Heritage", "Luxury", "Romantic"],
    topFoods: [
      { name: "Pasta", category: "pasta", isSpeciality: true },
      { name: "Pizza", category: "pizza", isSpeciality: true },
      { name: "Espresso", category: "coffee", isSpeciality: false },
      { name: "Dessert", category: "desserts", isSpeciality: false },
      { name: "Mocktail", category: "drinks", isSpeciality: false },
    ],
    image: "https://b.zmtcdn.com/data/pictures/0/103080/15634082bb838330673ec5fc4b9c070d.jpg",
    gallery: [
      "https://b.zmtcdn.com/data/pictures/0/103080/15634082bb838330673ec5fc4b9c070d.jpg",
      "https://b.zmtcdn.com/data/pictures/0/103080/5525a41d03d3f39579832f110cc5b42f.jpg",
      "https://b.zmtcdn.com/data/pictures/0/103080/906c03ab02e51c7b18c9eeb217abe844.jpg",
      "https://b.zmtcdn.com/data/pictures/0/103080/d7f70b035f824d8a978b2845e71b6a37.jpg",
      "https://b.zmtcdn.com/data/pictures/0/103080/f5107a5464f7ad732c576ef2cd7c7cac_featured_v2.jpg",
      "https://b.zmtcdn.com/data/pictures/chains/0/103080/da3bc255fde44f0aa74b95044d636a5f.jpg",
      "https://b.zmtcdn.com/data/pictures/chains/0/103080/e9d10b2edb0ed33c0ba310d1c3866c4e.jpg",
    ],
    rating: 4.5, reviews: 1000, priceForTwo: "₹1,800 for two", budget: "₹900–₹2,200",
    hours: "12:00 PM – 11:00 PM",
    about: "A premium heritage-inspired setting for dates, special occasions and elevated café dining.",
    features: ["Heritage", "Premium", "Outdoor Seating", "Romantic", "Fine Dining"],
    menu: [["Espresso", "₹250+"], ["Pasta", "₹650+"], ["Pizza", "₹650+"], ["Dessert", "₹350+"], ["Mocktail", "₹300+"]],
    featured: true,
  },
  {
    id: "the-farm-coffee-bar", name: "The Farm Coffee Bar", slug: "the-farm-coffee-bar",
    description: "Peaceful, nature-facing spot away from the city buzz.",
    location: { area: "Vaishali Nagar", city: "Jaipur", address: "Vaishali Nagar" },
    priceRange: "₹₹", cafeType: ["Cafe"],
    ambience: ["Peaceful", "Outdoor", "Nature"],
    topFoods: [
      { name: "Coffee", category: "coffee", isSpeciality: false },
      { name: "Chai", category: "chai", isSpeciality: false },
      { name: "Sandwiches", category: "burgers", isSpeciality: false },
      { name: "Salads", category: "healthy", isSpeciality: false },
      { name: "Desserts", category: "desserts", isSpeciality: false },
    ],
    image: "https://b.zmtcdn.com/data/pictures/5/19267395/028eedef3897e55d32dec3114af5561e_featured_v2.jpg",
    gallery: [
      "https://b.zmtcdn.com/data/pictures/5/19267395/028eedef3897e55d32dec3114af5561e_featured_v2.jpg",
      "https://b.zmtcdn.com/data/pictures/5/19267395/06a34d7fe4b598f8e229ba659ba2943b.jpg",
      "https://b.zmtcdn.com/data/pictures/5/19267395/2ff1bb076da52475f493463e32afa0a5.jpg",
      "https://b.zmtcdn.com/data/pictures/5/19267395/4d1c29d4cafd33f12c1dd4db7aa8aeff.jpg",
      "https://b.zmtcdn.com/data/pictures/5/19267395/d5e943840c4b677107c3e53580309e9e.jpg",
      "https://b.zmtcdn.com/data/pictures/chains/5/19267395/0a388d9d92246aa4a155ec17fd2856c0.jpg",
      "https://b.zmtcdn.com/data/pictures/chains/5/19267395/1266bb22ecc2bc44c76bd271e3d5b5ff.jpg",
      "https://b.zmtcdn.com/data/pictures/chains/5/19267395/171d9f87e57b75da24a585b73e0e6cc4.jpg",
    ],
    rating: null, reviews: null, priceForTwo: null, budget: null,
    hours: null,
    about: "A peaceful, nature-facing café good for slowing down. It has a real Zomato listing (hence the photos), but menu and pricing details could not be independently confirmed.",
    features: ["Outdoor Seating"],
    menu: [],
    verificationNote: "Menu and pricing details are still being verified",
  },
  {
    id: "pink-cozy-cafe", name: "Pink Cozy Café", slug: "pink-cozy-cafe",
    description: "Aesthetic, chill café with an Instagram-friendly feel.",
    location: { area: "Jaipur", city: "Jaipur", address: "361 Akdon ka Rasta, Kishan Pol Bazar, Jaipur" },
    priceRange: "₹₹", cafeType: ["Cafe"],
    ambience: ["Chill", "Aesthetic", "Cozy"],
    topFoods: [
      { name: "Coffee", category: "coffee", isSpeciality: false },
      { name: "Cold Coffee", category: "coffee", isSpeciality: false },
      { name: "Waffles", category: "desserts", isSpeciality: false },
      { name: "Sandwiches", category: "burgers", isSpeciality: false },
      { name: "Mocktails", category: "drinks", isSpeciality: false },
    ],
    image: "https://www.pinkcozycafe.com/wp-content/uploads/2025/10/WhatsApp-Image-2025-10-29-at-11.16.25_620c7c96.jpg",
    gallery: [
      "https://www.pinkcozycafe.com/wp-content/uploads/2025/10/WhatsApp-Image-2025-10-29-at-11.16.25_620c7c96.jpg",
      "http://www.pinkcozycafe.com/wp-content/uploads/2025/10/1.jpg",
      "http://www.pinkcozycafe.com/wp-content/uploads/2025/10/Untitled-design-1.jpg",
      "http://www.pinkcozycafe.com/wp-content/uploads/2025/10/Untitled-design-2.jpg",
    ],
    rating: null, reviews: null, priceForTwo: null, budget: null,
    hours: null,
    about: "An aesthetic, cozy café with a chill, photogenic feel, confirmed via its own website. No aggregator listing (Zomato/Swiggy) was found, so menu and pricing details could not be independently verified.",
    features: ["Aesthetic"],
    menu: [],
    verificationNote: "Menu and pricing details are still being verified",
  },
  {
    id: "the-pink-bean", name: "The Pink Bean", slug: "the-pink-bean",
    description: "Bright, aesthetic café for brunch and casual work.",
    location: { area: "Bani Park", city: "Jaipur", address: "Bani Park" },
    priceRange: "₹₹", cafeType: ["Cafe"],
    ambience: ["Aesthetic", "Cozy", "Work Friendly"],
    topFoods: [
      { name: "Cappuccino", category: "coffee", isSpeciality: true },
      { name: "Brunch Plate", category: "indian", isSpeciality: true },
      { name: "Pasta", category: "pasta", isSpeciality: false },
      { name: "Burger", category: "burgers", isSpeciality: false },
      { name: "Cake", category: "desserts", isSpeciality: false },
    ],
    image: null,
    gallery: [],
    rating: 4.4, reviews: 680, priceForTwo: "₹800 for two", budget: "₹400–₹1,000",
    hours: "9:00 AM – 11:00 PM",
    about: "A bright, aesthetic café suited to brunch, casual work and social catch-ups. Note: a dedicated research pass could not find any current Zomato, Swiggy, Magicpin or District listing under this name in Jaipur — this record is carried over from the original dataset and its details (including whether this specific business currently exists) could not be independently reconfirmed.",
    features: ["Brunch", "Work Friendly", "Desserts", "Indoor Seating", "Aesthetic"],
    menu: [["Cappuccino", "₹190"], ["Brunch Plate", "₹420"], ["Pasta", "₹360"], ["Burger", "₹380"], ["Cake", "₹260"]],
    verificationNote: "This business could not be independently reconfirmed — treat details as unverified",
  },
];

/* Live data: starts as the fallback above, replaced by loadCafesFromAPI()
   with the real 250-café Jaipur dataset from MongoDB before app.js runs. */
let CAFES = CAFES_FALLBACK;

async function loadCafesFromAPI() {
  try {
    const data = await Api.get('/cafes');
    if (Array.isArray(data.cafes) && data.cafes.length) {
      const formatImg = (window.CONFIG && typeof window.CONFIG.formatImageUrl === 'function')
        ? window.CONFIG.formatImageUrl
        : (p) => p;

      CAFES = data.cafes.map((cafe) => {
        if (cafe.image) cafe.image = formatImg(cafe.image);
        if (Array.isArray(cafe.gallery)) {
          cafe.gallery = cafe.gallery.map(formatImg);
        }
        if (Array.isArray(cafe.menuImages)) {
          cafe.menuImages = cafe.menuImages.map((m) => ({
            src: formatImg(m.src),
            thumb: formatImg(m.thumb),
          }));
        }
        return cafe;
      });
      console.log(`Loaded ${CAFES.length} cafés from the database.`);
    }
  } catch (err) {
    console.warn('Could not load live café data, using fallback demo cafés instead:', err);
  }
}

/* Real people, communities and events — loaded from the API by app.js
   (loadSocialData). Profiles only ever expose broad preferences; check-in
   times are shown to a person's accepted connections only. */
let PEOPLE = [];
let COMMUNITIES = [];
let EVENTS = [];
