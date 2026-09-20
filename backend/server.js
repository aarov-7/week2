const express = require("express");
const mysql = require("mysql2/promise");

const app = express();
const port = process.env.PORT || 8000;

// Read connection settings from environment variables.
// These get filled in by Rahti from a ConfigMap and a Secret — never hard-coded here.
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
});

// Create the table if it doesn't exist yet. Retries because the database
// container might still be starting up when this one starts.
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

// READ operation — returns the current time according to MySQL itself,
// proving the data is genuinely coming from the database.
app.get("/api/time", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT NOW() AS server_time");
    res.json({ server_time: rows[0].server_time });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// WRITE operation — inserts a new visit row, then returns the total count.
// process.env.HOSTNAME is the Pod's own name, useful later for the scaling experiment.
app.get("/api/visit", async (req, res) => {
  try {
    await pool.query("INSERT INTO visits (visited_at) VALUES (NOW())");
    const [rows] = await pool.query("SELECT COUNT(*) AS total FROM visits");
    res.json({ visits: rows[0].total, pod: process.env.HOSTNAME || "unknown" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Simple health check, useful for debugging.
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

initDb().then(() => {
  app.listen(port, () => console.log(`Backend listening on port ${port}`));
});
