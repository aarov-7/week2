const express = require("express");
const mysql = require("mysql2/promise");
const { createClient } = require("redis");

const app = express();
const port = process.env.PORT || 8000;
const redis = process.env.REDIS_URL
  ? createClient({ url: process.env.REDIS_URL })
  : null;

if (redis) {
  redis.on("error", (err) => console.error("Redis error:", err.message));
  redis
    .connect()
    .catch((err) => console.error("Redis connection error:", err.message));
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
});

async function readThroughCache(key, ttlSeconds, load) {
  if (redis?.isReady) {
    try {
      const cached = await redis.get(key);
      if (cached !== null) return { value: JSON.parse(cached), cache: "HIT" };
    } catch (err) {
      console.error("Redis read error:", err.message);
    }
  }

  const value = await load();
  if (redis?.isReady) {
    try {
      await redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
    } catch (err) {
      console.error("Redis write error:", err.message);
    }
  }
  return { value, cache: "MISS" };
}

async function initDb() {
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS visits (
          id INT AUTO_INCREMENT PRIMARY KEY,
          visited_at DATETIME NOT NULL
        )
      `);
      console.log("Database ready.");
      return;
    } catch (err) {
      console.log(
        `Waiting for database... (attempt ${attempt}) ${err.code || err.message}`,
      );
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
  console.error("Could not reach the database after 90 seconds. Exiting.");
  process.exit(1);
}

app.get("/api/time", async (req, res) => {
  try {
    const result = await readThroughCache("mysql:server-time", 5, async () => {
      const [rows] = await pool.query("SELECT NOW() AS server_time");
      return { server_time: rows[0].server_time };
    });
    res.json({ ...result.value, cache: result.cache });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/visit", async (req, res) => {
  try {
    await pool.query("INSERT INTO visits (visited_at) VALUES (NOW())");
    const [rows] = await pool.query("SELECT COUNT(*) AS total FROM visits");
    res.json({ visits: rows[0].total, pod: process.env.HOSTNAME || "unknown" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

initDb().then(() => {
  app.listen(port, () => console.log(`Backend listening on port ${port}`));
});
