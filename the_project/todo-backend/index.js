const http = require("http");
const { Pool } = require("pg");

const PORT = process.env.PORT || 3000;
const MAX_LENGTH = Number(process.env.MAX_LENGTH) || 140;

const pool = new Pool({
  host: process.env.POSTGRES_HOST || "postgres-todo-svc",
  port: process.env.POSTGRES_PORT || 5432,
  user: process.env.POSTGRES_USER || "todo_user",
  password: process.env.POSTGRES_PASSWORD || "todo_password",
  database: process.env.POSTGRES_DB || "todos_db",
});

async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS todos (
        id SERIAL PRIMARY KEY,
        text VARCHAR(140) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("Database initialized successfully");
  } catch (err) {
    console.error("Database initialization error:", err);
    throw err;
  }
}

async function getTodos() {
  try {
    const result = await pool.query(
      "SELECT text FROM todos ORDER BY created_at DESC"
    );
    return result.rows.map(row => row.text);
  } catch (err) {
    console.error("Error getting todos:", err);
    return [];
  }
}

async function addTodo(text) {
  try {
    if (text.length > MAX_LENGTH) {
      console.log(`[BLOCKED] Todo too long: "${text}" (${text.length} chars, max ${MAX_LENGTH})`);
      return { success: false, error: "Todo too long" };
    }
    await pool.query(
      "INSERT INTO todos (text) VALUES ($1)",
      [text]
    );
    console.log(`[SUCCESS] Todo added: "${text}"`);
    return { success: true };
  } catch (err) {
    console.error(`[ERROR] Failed to add todo: "${text}"`, err);
    return { success: false, error: err.message };
  }
}

const server = http.createServer(async (req, res) => {
  // GET /todos
  if (req.method === "GET" && req.url === "/todos") {
    console.log(`[REQUEST] GET /todos`);
    const todos = await getTodos();
    res.writeHead(200, {
      "Content-Type": "application/json",
    });
    res.end(JSON.stringify(todos));
    return;
  }
  if (req.method === "POST" && req.url === "/todos") {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
    });
    req.on("end", async () => {
      const params = new URLSearchParams(body);
      const todo = (params.get("todo") || "").trim();
      console.log(`[REQUEST] POST /todos: "${todo}" (${todo.length} chars)`);
      if (todo.length === 0) {
        console.log(`[BLOCKED] Empty todo rejected`);
        res.writeHead(400);
        res.end();
        return;
      }
      const result = await addTodo(todo);
      if (result.success) {
        res.writeHead(201);
      } else {
        res.writeHead(400);
      }
      res.end();
    });
    return;
  }
  console.log(`[REQUEST] 404: ${req.method} ${req.url}`);
  res.writeHead(404);
  res.end();
});

initializeDatabase().then(() => {
  server.listen(PORT, () => {
    console.log(`Todo backend listening on ${PORT}`);
    console.log(`PostgreSQL host: ${process.env.POSTGRES_HOST || "postgres-todo-svc"}`);
    console.log(`Max todo length: ${MAX_LENGTH} characters`);
  });
}).catch(err => {
  console.error("Failed to initialize database:", err);
  process.exit(1);
});
