const http = require("http");
const { Pool } = require("pg");

let counter = 0;
const port = process.env.PORT || 3001;

const pool = new Pool({
  host: process.env.POSTGRES_HOST || "postgres-svc",
  port: process.env.POSTGRES_PORT || 5432,
  user: process.env.POSTGRES_USER || "postgres",
  password: process.env.POSTGRES_PASSWORD || "example",
  database: process.env.POSTGRES_DB || "postgres",
});

const server = http.createServer(async (req, res) => {
  if (req.url === "/healthz" && req.method === "GET") {
    try {
      await pool.query("SELECT 1");
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("OK");
    } catch {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Database not ready");
    }
    return;
  }
  if (req.url === "/" && req.method === "GET") {
    counter++;
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(`pong ${counter}`);
    return;
  }
  if (req.url === "/pings" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(counter.toString());
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(port, () => {
  console.log(`Pingpong server running on port ${port}`);
});
