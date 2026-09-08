const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;

const IMAGE_DIR = process.env.IMAGE_DIR;
const IMAGE_FILE = path.join(IMAGE_DIR, "image.jpg");
const TIMESTAMP_FILE = path.join(IMAGE_DIR, "image.timestamp");

const IMAGE_URL = process.env.IMAGE_URL;
const TODO_BACKEND = process.env.TODO_BACKEND;
const TEN_MINUTES = Number(process.env.IMAGE_CACHE_MINUTES) * 60 * 1000;

let downloadInProgress = false;
let isHealthy = true;

async function downloadImage() {
  if (downloadInProgress) return;

  downloadInProgress = true;

  try {
    const response = await fetch(IMAGE_URL);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    fs.mkdirSync(IMAGE_DIR, { recursive: true });
    fs.writeFileSync(IMAGE_FILE, buffer);
    fs.writeFileSync(TIMESTAMP_FILE, Date.now().toString());
  } catch (err) {
    console.error(err.message);
  } finally {
    downloadInProgress = false;
  }
}

function imageExists() {
  return fs.existsSync(IMAGE_FILE) && fs.existsSync(TIMESTAMP_FILE);
}

function imageIsExpired() {
  if (!imageExists()) return true;

  const timestamp = Number(
    fs.readFileSync(TIMESTAMP_FILE, "utf8")
  );

  return Date.now() - timestamp >= TEN_MINUTES;
}

async function getTodos() {
  try {
    const response = await fetch(TODO_BACKEND);

    if (!response.ok) {
      return [];
    }

    return await response.json();
  } catch {
    return [];
  }
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const server = http.createServer(async (req, res) => {
  // GET /healthz
  if (req.url === "/healthz" && req.method === "GET") {
    if (!isHealthy) {
      res.writeHead(500, {
        "Content-Type": "application/json",
      });

      res.end(JSON.stringify({
        status: "unhealthy",
      }));

      return;
    }

    res.writeHead(200, {
      "Content-Type": "application/json",
    });

    res.end(JSON.stringify({
      status: "ok",
    }));

    return;
  }

  // POST /break
  if (req.url === "/break" && req.method === "POST") {
    isHealthy = false;

    console.log("App broken by user request");

    res.writeHead(302, {
      Location: "/",
    });

    res.end();

    return;
  }

  // POST /todos
  if (req.method === "POST" && req.url === "/todos") {
    let body = "";

    req.on("data", chunk => {
      body += chunk;
    });

    req.on("end", async () => {
      await fetch(TODO_BACKEND, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });

      res.writeHead(302, {
        Location: "/",
      });

      res.end();
    });

    return;
  }

  // PUT /todos/<id>
  if (req.method === "PUT" && req.url.match(/^\/todos\/\d+$/)) {
    const id = req.url.split("/")[2];

    try {
      const response = await fetch(`${TODO_BACKEND}/${id}`, {
        method: "PUT",
      });

      if (!response.ok) {
        res.writeHead(response.status);
        res.end();

        return;
      }

      const todo = await response.json();

      res.writeHead(200, {
        "Content-Type": "application/json",
      });

      res.end(JSON.stringify(todo));
    } catch (err) {
      console.error("Failed to mark todo as done:", err);

      res.writeHead(500);
      res.end();
    }

    return;
  }

  // GET /image
  if (req.url === "/image") {
    if (!imageExists()) {
      await downloadImage();
    } else if (imageIsExpired()) {
      downloadImage();
    }

    try {
      const image = fs.readFileSync(IMAGE_FILE);

      res.writeHead(200, {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-cache",
      });

      res.end(image);
    } catch {
      res.writeHead(500);
      res.end();
    }

    return;
  }

  // GET /
  if (req.url === "/") {
    if (!imageExists()) {
      await downloadImage();
    } else if (imageIsExpired()) {
      downloadImage();
    }

    const todos = await getTodos();

    const todoHtml = todos.map(todo => `
      <div class="todo ${todo.done ? "todo-done" : ""}">
        <div class="todo-bar"></div>

        <div class="todo-text">
          ${escapeHtml(todo.text)}
        </div>

        ${
          todo.done
            ? `
              <div class="done-label">
                Done
              </div>
            `
            : `
              <button
                class="done-btn"
                onclick="markDone(${todo.id})"
              >
                Mark done
              </button>
            `
        }
      </div>
    `).join("");

    if (!isHealthy) {
      res.writeHead(200, {
        "Content-Type": "text/html",
      });

      res.end(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Todo App</title>

  <style>
    body {
      font-family: Arial, Helvetica, sans-serif;
      background: #f5f5f5;
      margin: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
    }

    .failure-banner {
      background: #ffebee;
      border: 4px solid #d32f2f;
      border-radius: 12px;
      padding: 40px 60px;
      max-width: 500px;
      text-align: center;
      box-shadow: 0 4px 20px rgba(211, 47, 47, 0.3);
    }

    .failure-title {
      font-size: 32px;
      font-weight: bold;
      color: #d32f2f;
    }

    .failure-message {
      font-size: 18px;
      color: #333;
      margin-top: 12px;
    }
  </style>
</head>

<body>

  <div class="failure-banner">
    <div class="failure-title">
      System Failure
    </div>

    <div class="failure-message">
      The Todo App is currently unhealthy. Please wait for recovery.
    </div>
  </div>

</body>
</html>
      `);

      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/html",
    });

    res.end(`
<!DOCTYPE html>
<html>

<head>
  <meta charset="UTF-8">
  <title>Todo App</title>

  <style>
    body {
      font-family: Arial, Helvetica, sans-serif;
      background: #f5f5f5;
      margin: 0;
    }

    .container {
      max-width: 700px;
      margin: 40px auto;
      text-align: center;
    }

    img {
      width: 100%;
      border-radius: 8px;
      margin-bottom: 25px;
    }

    .todo-form {
      display: flex;
      justify-content: center;
      margin-bottom: 35px;
    }

    input[type=text] {
      flex: 1;
      padding: 12px;
      font-size: 16px;
      border: 2px solid #2e7d32;
      border-right: none;
      border-radius: 6px 0 0 6px;
      outline: none;
    }

    .todo-form button {
      padding: 12px 26px;
      font-size: 16px;
      border: none;
      background: #2e7d32;
      color: white;
      cursor: pointer;
      border-radius: 0 6px 6px 0;
    }

    .todo-form button:hover {
      background: #256b2a;
    }

    .todo {
      display: flex;
      align-items: center;
      background: white;
      margin-bottom: 12px;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0, 0, 0, .1);
      min-height: 58px;
    }

    .todo-bar {
      width: 8px;
      background: #2e7d32;
      align-self: stretch;
      flex-shrink: 0;
    }

    .todo-text {
      padding: 16px;
      text-align: left;
      flex: 1;
    }

    .done-btn {
      margin-right: 12px;
      padding: 9px 14px;
      border: none;
      border-radius: 5px;
      background: #1976d2;
      color: white;
      font-size: 14px;
      cursor: pointer;
      white-space: nowrap;
    }

    .done-btn:hover {
      background: #1565c0;
    }

    .todo-done {
      opacity: 0.65;
    }

    .todo-done .todo-bar {
      background: #777;
    }

    .todo-done .todo-text {
      text-decoration: line-through;
      color: #777;
    }

    .done-label {
      margin-right: 16px;
      color: #2e7d32;
      font-weight: bold;
      font-size: 15px;
    }

    .break-btn {
      background: #d32f2f;
      color: white;
      border: none;
      padding: 12px 24px;
      font-size: 16px;
      border-radius: 6px;
      cursor: pointer;
      margin-top: 30px;
    }

    .break-btn:hover {
      background: #b71c1c;
    }
  </style>
</head>

<body>

<div class="container">

  <h1>Todo App</h1>

  <img src="/image">

  <form class="todo-form" method="POST" action="/todos">
    <input
      type="text"
      name="todo"
      maxlength="140"
      required
      placeholder="Enter a new todo (max 140 characters)"
    >

    <button type="submit">
      Send
    </button>
  </form>

  <h2>Todos</h2>

  ${todoHtml}

  <form method="POST" action="/break">
    <button type="submit" class="break-btn">
      Break the app
    </button>
  </form>

</div>

<script>
  async function markDone(id) {
    try {
      const response = await fetch("/todos/" + id, {
        method: "PUT"
      });

      if (!response.ok) {
        throw new Error("Failed to mark todo as done");
      }

      window.location.reload();
    } catch (error) {
      console.error(error);
      alert("Could not mark todo as done");
    }
  }
</script>

</body>

</html>
    `);

    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`Todo app listening on ${PORT}`);
});
