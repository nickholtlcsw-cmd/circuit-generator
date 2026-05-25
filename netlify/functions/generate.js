const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW = 3600000;
const requestLog = new Map();

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
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const ip = (event.headers["x-forwarded-for"] || "unknown").split(",")[0];
  if (!checkRate(ip)) {
    return { statusCode: 429, headers, body: JSON.stringify({ error: "Too many requests. Try again in an hour." }) };
  }

  let prompt;
  try {
    const body = JSON.parse(event.body);
    prompt = body.prompt;
    if (!prompt || typeof prompt !== "string" || prompt.length > 3000) {
      throw new Error("bad prompt");
