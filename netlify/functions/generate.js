// Netlify serverless function — proxies requests to Claude API
// Your API key lives here as an environment variable, never exposed to the browser

const RATE_LIMIT_MAX = 5;       // max requests per IP per window
const RATE_LIMIT_WINDOW = 3600000; // 1 hour in ms
const requestLog = new Map();   // in-memory (resets on cold start — good enough for basic protection)

function checkRate(ip) {
  const now = Date.now();
  const entry = requestLog.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    requestLog.set(ip, { count: 1, start: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

exports.handler = async (event) => {
  // Only accept POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // CORS headers — update origin to your actual domain
  const headers = {
    "Access-Control-Allow-Origin": "https://nickholtlcsw.com",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  // Handle preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  // Rate limiting
  const ip = event.headers["x-forwarded-for"]?.split(",")[0] || "unknown";
  if (!checkRate(ip)) {
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({ error: "Too many requests. Please try again in an hour." }),
    };
  }

  // Parse request
  let prompt;
  try {
    const body = JSON.parse(event.body);
    prompt = body.prompt;
    if (!prompt || typeof prompt !== "string" || prompt.length > 3000) {
      throw new Error("Invalid prompt");
    }
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid request" }) };
  }

  // Call Claude
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "model: "claude-sonnet-4-5",
        max_tokens: 900,
        system: "You are an elite fitness coach. Return ONLY valid JSON with no markdown or extra text.",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error("API error: " + response.status);
    }

    const data = await response.json();
    const text = data.content.find((b) => b.type === "text")?.text || "";
    const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const circuit = JSON.parse(cleaned);

    return { statusCode: 200, headers, body: JSON.stringify(circuit) };
  } catch (e) {
    console.error("Generate error:", e);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Generation failed. Please try again." }),
    };
  }
};
