const BASE_DOWNLOAD_COUNT = 162;
const COUNT_KEY = "fydor:website:download-count";

const redisUrl = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  if (!redisUrl || !redisToken) {
    response.status(503).json({
      count: BASE_DOWNLOAD_COUNT,
      error: "Download counter storage is not configured."
    });
    return;
  }

  try {
    if (request.method === "GET") {
      const count = await readCount();
      response.status(200).json({ count });
      return;
    }

    if (request.method === "POST") {
      const count = await incrementCount();
      response.status(200).json({ count });
      return;
    }

    response.setHeader("Allow", "GET, POST");
    response.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    response.status(500).json({
      count: BASE_DOWNLOAD_COUNT,
      error: error instanceof Error ? error.message : "Unable to update download count."
    });
  }
};

async function readCount() {
  await command(["SETNX", COUNT_KEY, BASE_DOWNLOAD_COUNT]);
  const value = await command(["GET", COUNT_KEY]);
  return normalizeCount(value);
}

async function incrementCount() {
  await command(["SETNX", COUNT_KEY, BASE_DOWNLOAD_COUNT]);
  const value = await command(["INCR", COUNT_KEY]);
  return normalizeCount(value);
}

async function command(args) {
  const result = await fetch(redisUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${redisToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(args)
  });

  if (!result.ok) {
    throw new Error(`Counter storage returned ${result.status}.`);
  }

  const data = await result.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

function normalizeCount(value) {
  const count = Number.parseInt(String(value), 10);
  return Number.isFinite(count) && count >= BASE_DOWNLOAD_COUNT ? count : BASE_DOWNLOAD_COUNT;
}
