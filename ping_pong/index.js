const http = require("http");
const { Pool } = require("pg");

const port = process.env.PORT || 3001;

const pool = new Pool({
  host: process.env.POSTGRES_HOST || "postgres-svc",
  port: process.env.POSTGRES_PORT || 5432,
  user: process.env.POSTGRES_USER || "user",
  password: process.env.POSTGRES_PASSWORD || "password",
  database: process.env.POSTGRES_DB || "mydatabase",
});

async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pingpong_counter (
        id SERIAL PRIMARY KEY,
        counter INTEGER DEFAULT 0
      );
    `);
    const result = await pool.query("SELECT COUNT(*) FROM pingpong_counter");
    if (parseInt(result.rows[0].count) === 0) {
      await pool.query("INSERT INTO pingpong_counter (counter) VALUES (0)");
    }
    console.log("Database initialized successfully");
  } catch (err) {
    console.error("Database initialization error:", err);
  }
}

async function getCounter() {
  try {
    const result = await pool.query("SELECT counter FROM pingpong_counter LIMIT 1");
    return parseInt(result.rows[0].counter);
  } catch (err) {
    console.error("Error getting counter:", err);
    return 0;
  }
}

async function incrementCounter() {
  try {
    const result = await pool.query(
      "UPDATE pingpong_counter SET counter = counter + 1 RETURNING counter"
    );
    return parseInt(result.rows[0].counter);
  } catch (err) {
    console.error("Error updating counter:", err);
    return 0;
  }
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/pingpong" && req.method === "GET") {
    const newCounter = await incrementCounter();
    res.writeHead(200, {
      "Content-Type": "text/plain",
    });
    res.end(`pong ${newCounter}`);
    return;
  }
  
  if (req.url === "/pings" && req.method === "GET") {
    const counter = await getCounter();
    res.writeHead(200, {
      "Content-Type": "text/plain",
    });
    res.end(counter.toString());
    return;
  }
  
  res.writeHead(404);
  res.end();
});

initializeDatabase().then(() => {
  server.listen(port, () => {
    console.log(`Pingpong server running on port ${port}`);
    console.log(`PostgreSQL host: ${process.env.POSTGRES_HOST || "postgres-svc"}`);
  });
});