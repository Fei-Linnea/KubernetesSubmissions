const http = require("http");
const { Pool } = require("pg");
const { connect, StringCodec } = require("nats");

const PORT = process.env.PORT || 3000;
const MAX_LENGTH = Number(process.env.MAX_LENGTH) || 140;

const NATS_URL =
  process.env.NATS_URL ||
  "nats://my-nats.nats.svc.cluster.local:4222";

const NATS_SUBJECT = "todo.events";

const pool = new Pool({
  host: process.env.POSTGRES_HOST || "postgres-todo-svc",
  port: process.env.POSTGRES_PORT || 5432,
  user: process.env.POSTGRES_USER || "todo_user",
  password: process.env.POSTGRES_PASSWORD || "todo_password",
  database: process.env.POSTGRES_DB || "todos_db",
});

const sc = StringCodec();

let natsConnection;

async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS todos (
        id SERIAL PRIMARY KEY,
        text VARCHAR(140) NOT NULL,
        done BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      ALTER TABLE todos
      ADD COLUMN IF NOT EXISTS done BOOLEAN DEFAULT FALSE;
    `);

    console.log("Database initialized successfully");
  } catch (err) {
    console.error("Database initialization error:", err);
    throw err;
  }
}

async function initializeNats() {
  try {
    natsConnection = await connect({
      servers: NATS_URL,
    });

    console.log(`Connected to NATS at ${NATS_URL}`);
  } catch (err) {
    console.error("NATS connection error:", err);
    throw err;
  }
}

async function publishTodoEvent(action, todo) {
  try {
    const event = {
      action,
      id: todo.id,
      text: todo.text,
      done: todo.done,
    };

    natsConnection.publish(
      NATS_SUBJECT,
      sc.encode(JSON.stringify(event))
    );

    console.log(
      `[NATS] Published ${action} event for todo ${todo.id}`
    );
  } catch (err) {
    console.error("[NATS] Failed to publish event:", err);
  }
}

async function getTodos() {
  try {
    const result = await pool.query(
      "SELECT id, text, done FROM todos ORDER BY created_at DESC"
    );

    return result.rows;
  } catch (err) {
    console.error("Error getting todos:", err);
    return [];
  }
}

async function addTodo(text) {
  try {
    if (text.length > MAX_LENGTH) {
      console.log(
        `[BLOCKED] Todo too long: "${text}" (${text.length} chars, max ${MAX_LENGTH})`
      );

      return {
        success: false,
        error: "Todo too long",
      };
    }

    const result = await pool.query(
      `
      INSERT INTO todos (text)
      VALUES ($1)
      RETURNING id, text, done
      `,
      [text]
    );

    const todo = result.rows[0];

    console.log(`[SUCCESS] Todo added: "${text}"`);

    await publishTodoEvent("created", todo);

    return {
      success: true,
      todo,
    };
  } catch (err) {
    console.error(
      `[ERROR] Failed to add todo: "${text}"`,
      err
    );

    return {
      success: false,
      error: err.message,
    };
  }
}

async function markTodoDone(id) {
  try {
    const result = await pool.query(
      `
      UPDATE todos
      SET done = TRUE
      WHERE id = $1
      RETURNING id, text, done
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return {
        success: false,
        error: "Todo not found",
      };
    }

    const todo = result.rows[0];

    console.log(`[SUCCESS] Todo ${id} marked as done`);

    await publishTodoEvent("completed", todo);

    return {
      success: true,
      todo,
    };
  } catch (err) {
    console.error(
      `[ERROR] Failed to mark todo ${id} as done:`,
      err
    );

    return {
      success: false,
      error: err.message,
    };
  }
}

const server = http.createServer(async (req, res) => {
  // GET /todos
  if (req.method === "GET" && req.url === "/todos") {
    console.log("[REQUEST] GET /todos");

    const todos = await getTodos();

    res.writeHead(200, {
      "Content-Type": "application/json",
    });

    res.end(JSON.stringify(todos));
    return;
  }

  // POST /todos
  if (req.method === "POST" && req.url === "/todos") {
    let body = "";

    req.on("data", chunk => {
      body += chunk;
    });

    req.on("end", async () => {
      const params = new URLSearchParams(body);
      const todo = (params.get("todo") || "").trim();

      console.log(
        `[REQUEST] POST /todos: "${todo}" (${todo.length} chars)`
      );

      if (todo.length === 0) {
        console.log("[BLOCKED] Empty todo rejected");

        res.writeHead(400);
        res.end();
        return;
      }

      const result = await addTodo(todo);

      if (result.success) {
        res.writeHead(201, {
          "Content-Type": "application/json",
        });

        res.end(JSON.stringify(result.todo));
      } else {
        res.writeHead(400, {
          "Content-Type": "application/json",
        });

        res.end(
          JSON.stringify({
            error: result.error,
          })
        );
      }
    });

    return;
  }

  // PUT /todos/<id>
  if (
    req.method === "PUT" &&
    req.url.match(/^\/todos\/\d+$/)
  ) {
    const id = Number(req.url.split("/")[2]);

    console.log(`[REQUEST] PUT /todos/${id}`);

    const result = await markTodoDone(id);

    if (result.success) {
      res.writeHead(200, {
        "Content-Type": "application/json",
      });

      res.end(JSON.stringify(result.todo));
    } else {
      res.writeHead(404, {
        "Content-Type": "application/json",
      });

      res.end(
        JSON.stringify({
          error: result.error,
        })
      );
    }

    return;
  }

  console.log(`[REQUEST] 404: ${req.method} ${req.url}`);

  res.writeHead(404);
  res.end();
});

async function start() {
  try {
    await initializeDatabase();
    await initializeNats();

    server.listen(PORT, () => {
      console.log(`Todo backend listening on ${PORT}`);
      console.log(
        `PostgreSQL host: ${
          process.env.POSTGRES_HOST || "postgres-todo-svc"
        }`
      );
      console.log(`Max todo length: ${MAX_LENGTH} characters`);
    });
  } catch (err) {
    console.error("Failed to start todo backend:", err);
    process.exit(1);
  }
}

start();
