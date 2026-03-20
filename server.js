// Royal Spice AI Food Recommender — Backend Proxy
// Keeps your Claude API key secure on the server side
//
// SETUP:
//   1. npm install
//   2. Create a .env file with: ANTHROPIC_API_KEY=sk-ant-...
//   3. node server.js
//
// The server runs on port 3001 by default.

require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3001;

// =============================================
// PROTECTION CONFIG — tweak these as needed
// =============================================
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 10;                    // max 10 requests per IP per window
const MAX_CONVERSATION_TURNS = 6;             // max user messages per session
const DAILY_BUDGET_LIMIT = 200;               // max API calls site-wide per day
const ALLOWED_ORIGINS = [                     // your website domain(s)
  "http://localhost",
  "http://127.0.0.1",
  "https://royalspicerestaurant.com",
  "https://www.royalspicerestaurant.com",
];

// =============================================
// RATE LIMITER — per IP, in-memory
// =============================================
const ipHits = new Map();

function rateLimit(req, res, next) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.ip;
  const now = Date.now();

  if (!ipHits.has(ip)) {
    ipHits.set(ip, []);
  }

  const timestamps = ipHits.get(ip).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  ipHits.set(ip, timestamps);

  if (timestamps.length >= RATE_LIMIT_MAX) {
    return res.status(429).json({
      error: "Too many requests. Please try again in a few minutes.",
    });
  }

  timestamps.push(now);
  next();
}

// Clean up old IP entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of ipHits) {
    const fresh = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (fresh.length === 0) ipHits.delete(ip);
    else ipHits.set(ip, fresh);
  }
}, 30 * 60 * 1000);

// =============================================
// DAILY BUDGET CAP — site-wide
// =============================================
let dailyCalls = 0;
let dailyResetDate = new Date().toDateString();

function budgetCheck(req, res, next) {
  const today = new Date().toDateString();
  if (today !== dailyResetDate) {
    dailyCalls = 0;
    dailyResetDate = today;
  }

  if (dailyCalls >= DAILY_BUDGET_LIMIT) {
    return res.status(503).json({
      error: "Our AI recommender has reached its daily limit. Please try again tomorrow, or call us at (410) 589-5166!",
    });
  }

  next();
}

// =============================================
// CORS — only allow your website
// =============================================
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.some((allowed) => origin.startsWith(allowed))) {
        return callback(null, true);
      }
      callback(new Error("Not allowed by CORS"));
    },
  })
);

app.use(express.json({ limit: "10kb" }));

// =============================================
// HEALTH CHECK
// =============================================
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    dailyCallsRemaining: DAILY_BUDGET_LIMIT - dailyCalls,
  });
});

// Full menu data so Claude has context for recommendations
const MENU_CONTEXT = `
You are Royal Spice's AI food recommender — a warm, knowledgeable guide to our Nepalese & Indian menu.
You speak like a passionate friend who knows every dish on the menu. Keep responses concise (2-4 sentences max per dish recommendation). 
Recommend 2-3 dishes max. Use the person's preferences to match them with the best options.
Always mention the price. If they want something you don't have, suggest the closest match.
Format each recommendation as: **Dish Name** ($price) — brief reason.
End with a short, warm sign-off.

FULL MENU:

NEPALESE SPECIALTIES:
- Chicken Fried Rice $18.99
- Vegetable Fried Rice $17.99
- Grilled Masala Wings (8) $16.99 — Eight tender bone-in wings marinated overnight & cooked in tandoor oven
- Chicken Tikka Masala Wrap $13.99+ — Chicken tikka masala with lettuce, tomatoes & onions, wrapped in naan
- Butter Chicken Wrap $13.99+ — Pulled butter chicken with lettuce, tomatoes & onions, wrapped in naan
- Palak Paneer Wrap $12.99+ — Homemade palak paneer with lettuce, tomatoes & onions, wrapped in naan
- Piro Tareko Aloo $10.99 — Nepali deep-fried spicy potatoes
- Bhatmas Sadeko $9.99 — Spiced soybean tossed in mustard oil, onions, chili, garlic & ginger
- Chicken Chowmein $15.99 — Noodles, chicken & vegetables stir-fried in a blend of spices
- Veggie Chowmein $14.99
- Lamb Sekuwa $21.99 — Marinated overnight & roasted in wood fire for smoky flavor
- Chicken Sekuwa $19.99 — Marinated overnight & roasted in wood fire for smoky flavor
- Nepali Chicken Curry $19.99 — Bone-in chicken cooked in Himalayan spices
- Chicken Choila $19.99 — BBQ chicken in ginger, garlic, onions, fenugreek seeds & mustard oil
- Vegetable Momo $12.99 — Steamed dumplings filled with vegetables & spices
- Chicken Momo $14.99 — Steamed dumplings filled with ground chicken & spices
- C-Momo $15.99 — Chicken momo deep-fried and sauteed in tangy sauce
- Jhol Momo $15.99 — Chicken momo submerged in house-special tomato sauce (#1 Seller)
- Lamb Sadeko $15.99 — Spiced lamb salad with mustard oil, onion & Nepali spices
- Chicken Thali $23.99 — Nepali chicken curry, naan, rice, daal & vegetables on a silver platter
- Vegetable Thali $20.99 — Mixed vegetable curry, naan, rice, daal & vegetables on a silver platter

APPETIZERS:
- Vegetable Samosa $6.99 — Crispy pastry filled with potatoes & peas
- Chicken Samosa $7.99 — Crispy pastry filled with seasoned chicken
- Vegetable Pakoras $8.99 — Crispy fried vegetable fritters
- Paneer Pakora $9.99 — Crispy fried homemade cheese fritters
- Onion Bhaji $8.99 — Crispy fried onion fritters
- Lamb Chops $18.99 — Tandoor oven-roasted lamb chops (4 pieces)
- Chicken Lollipop $13.99 — Crispy fried chicken wings in Indo-Chinese sauce
- Aloo Tikki $8.99 — Pan-fried potato cakes with spices
- Shrimp Pakora $12.99 — Crispy fried shrimp fritters

SOUPS & SALADS:
- Chicken Mulligatawny $7.99 — Classic Indian chicken & lentil soup
- Vegetable Soup $6.99
- Tomato Soup $5.99
- House Salad $7.99

FROM THE GRILL (Tandoor Oven):
- Chicken Tikka $17.99 — Boneless chicken marinated in yogurt & spices
- Seekh Kebab $19.99 — Ground lamb mixed with herbs, skewered & grilled
- Lamb Boti $21.99 — Lamb cubes marinated in yogurt & spices
- Paneer Tikka $16.99 — Marinated homemade cheese grilled with peppers & onions
- Mixed Grill $23.99 — Chicken tikka, seekh kebab, lamb boti & tandoori shrimp

VEGETABLE ENTREES:
- Palak Paneer $17.99 — Homemade cheese in creamy spinach
- Paneer Tikka Masala $17.99 — Grilled paneer in tomato-cream sauce
- Chana Masala $15.99 — Chickpeas in spiced tomato-onion gravy
- Aloo Gobi $15.99 — Potatoes & cauliflower in turmeric & spices
- Vegetable Korma $16.99 — Mixed vegetables in creamy cashew-almond sauce
- Daal Tadka $14.99 — Yellow lentils with cumin & garlic tempering
- Baingan Bharta $16.99 — Roasted & mashed eggplant with spices
- Malai Kofta $17.99 — Veggie-cheese dumplings in creamy sauce

CHICKEN ENTREES:
- Butter Chicken $20.99 — Tandoor-grilled tender pulled chicken in chef's special creamy sauce
- Chicken Tikka Masala $20.99 — Grilled chicken in rich, creamy tomato-based sauce
- Chicken Korma $19.99 — Chicken in rich cashew-almond cream sauce
- Chicken Vindaloo $19.99 — Chicken in fiery Goan-style chili & vinegar sauce (SPICY)
- Chicken Madras $19.99 — Chicken in tangy coconut & tamarind sauce
- Chicken Saag $19.99 — Chicken cooked with fresh spinach & spices
- Chicken Do Pyaza $19.99 — Chicken with onion-tomato gravy
- Chicken Jalfrezi $19.99 — Chicken stir-fried with fresh peppers & onions

LAMB & GOAT ENTREES:
- Lamb Korma $21.99 — Lamb in rich cashew-almond cream sauce
- Lamb Vindaloo $21.99 — Lamb in fiery Goan-style chili & vinegar sauce (SPICY)
- Lamb Rogan Josh $21.99 — Slow-cooked lamb in aromatic Kashmiri sauce
- Goat Curry $21.99 — Bone-in goat in traditional curry
- Lamb Saag $21.99 — Lamb cooked with fresh spinach
- Bhutan (Goat Tripe) $21.99 — Goat tripe & organs stir fried in Himalayan spices
- Khasi Ko Sekuwa $21.99 — Goat in Himalayan spices, grilled with raw onions & mustard oil

SEAFOOD:
- Shrimp Tikka Masala $21.99 — Grilled shrimp in creamy tomato sauce
- Fish Curry $19.99 — Fish in traditional curry sauce
- Shrimp Korma $21.99 — Shrimp in creamy cashew-almond sauce
- Shrimp Vindaloo $21.99 — Shrimp in fiery Goan-style sauce (SPICY)

RICE & BIRYANI:
- Chicken Biryani $19.99 — Basmati rice layered with spiced chicken
- Lamb Biryani $21.99 — Basmati rice layered with spiced lamb
- Vegetable Biryani $17.99 — Basmati rice with mixed vegetables
- Shrimp Biryani $21.99 — Basmati rice with spiced shrimp

BREADS:
- Plain Naan $3.99 — Tandoor-baked flatbread
- Garlic Naan $4.99
- Butter Naan $4.99
- Cheese Naan $5.99
- Peshwari Naan $5.99 — Stuffed with coconut & raisins
- Onion Kulcha $5.99
- Aloo Paratha $5.99 — Potato-stuffed bread
- Tandoori Roti $3.99 — Whole wheat bread

SIDES:
- Papadum $3.99
- Onion Salad $3.99
- Indian Mixed Pickle $3.99
- Plain Yogurt $4.99
- Raita $4.99 — Yogurt with onions, cucumbers & spices
- Chana Masala (8 oz) $9.99

DESSERTS:
- Gulab Jamun $5.99 — Fried dough balls in syrup & honey
- Kheer $5.99 — Nepali rice pudding with almonds
- Rasmalai $6.99 — Cottage cheese discs in sweet rosewater syrup
- Gajar Ka Halwa $5.99 — Grated carrots in milk, sugar & butter
- Cheese Cake $7.99

BEVERAGES:
- Sweet Lassi $5.99 — Yogurt drink sweetened with rose water
- Salt Lassi $5.99 — Yogurt drink salted with cumin seeds
- Mango Lassi $6.99 — Sweet mangoes blended with yogurt
- Masala Chai $4.99 — Freshly brewed with cardamom & milk
- Soda $2.99
- Iced Tea $2.99

IMPORTANT NOTES:
- All meats are 100% Halal certified
- Spice levels can be adjusted (mild, medium, hot, extra hot)
- Vegetarian and vegan options available
- Located in Linthicum Heights, MD near BWI airport
`;

// =============================================
// MAIN ENDPOINT
// =============================================
app.post("/api/recommend", rateLimit, budgetCheck, async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "messages array is required" });
  }

  // Cap conversation length
  const userMsgCount = messages.filter((m) => m.role === "user").length;
  if (userMsgCount > MAX_CONVERSATION_TURNS) {
    return res.status(400).json({
      error: "You've reached the conversation limit. Please refresh to start a new chat!",
    });
  }

  // Sanitize — only allow role and content fields, trim long messages
  const cleanMessages = messages.slice(-MAX_CONVERSATION_TURNS * 2).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || "").slice(0, 500),
  }));

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        system: MENU_CONTEXT,
        messages: cleanMessages,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Anthropic API error:", err);
      return res.status(response.status).json({ error: "API request failed" });
    }

    const data = await response.json();
    const text = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    dailyCalls++;
    console.log(`[${new Date().toISOString()}] API call #${dailyCalls}/${DAILY_BUDGET_LIMIT}`);

    res.json({ reply: text });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(`Royal Spice AI backend running on http://localhost:${PORT}`);
  console.log(`Rate limit: ${RATE_LIMIT_MAX} requests per ${RATE_LIMIT_WINDOW_MS / 60000} min per IP`);
  console.log(`Daily budget: ${DAILY_BUDGET_LIMIT} API calls`);
  console.log(`Max conversation turns: ${MAX_CONVERSATION_TURNS}`);
});
