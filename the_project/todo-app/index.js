const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;

const IMAGE_DIR = "/usr/src/app/files";
const IMAGE_FILE = path.join(IMAGE_DIR, "image.jpg");
const TIMESTAMP_FILE = path.join(IMAGE_DIR, "image.timestamp");

const IMAGE_URL = "https://picsum.photos/1200";
const TEN_MINUTES = 10 * 60 * 1000;

let downloadInProgress = false;

async function downloadImage() {
  if (downloadInProgress) {
    return;
  }

  downloadInProgress = true;

  try {
    console.log("Downloading new image...");
    const response = await fetch(IMAGE_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
    fs.writeFileSync(IMAGE_FILE, buffer);
    fs.writeFileSync(TIMESTAMP_FILE, Date.now().toString());
    console.log("Image updated.");
  } catch (err) {
    console.error("Image download failed:", err.message);
  } finally {
    downloadInProgress = false;
  }
}

function imageExists() {
  return fs.existsSync(IMAGE_FILE) && fs.existsSync(TIMESTAMP_FILE);
}

function imageIsExpired() {
  if (!imageExists()) {
    return true;
  }
  const timestamp = Number(fs.readFileSync(TIMESTAMP_FILE, "utf8"));

  return Date.now() - timestamp >= TEN_MINUTES;
}

const server = http.createServer(async (req, res) => {
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
      res.end("Image unavailable");
    }
    return;
  }
  if (req.url === "/") {
    if (!imageExists()) {
      await downloadImage();
    } else if (imageIsExpired()) {
      downloadImage();
    }
    res.writeHead(200, {
      "Content-Type": "text/html",
    });

    res.end(`
  <!DOCTYPE html>
  <html lang="en">
  <head>
  <meta charset="UTF-8">
  <title>Todo App</title>

  <style>

  body{
      font-family: Arial, Helvetica, sans-serif;
      background:#f5f5f5;
      margin:0;
  }

  .container{
      max-width:700px;
      margin:40px auto;
      text-align:center;
  }

  img{
      width:100%;
      border-radius:8px;
      margin-bottom:25px;
  }

  .todo-form{
      display:flex;
      justify-content:center;
      margin-bottom:35px;
  }

  input[type=text]{
      flex:1;
      padding:12px;
      font-size:16px;
      border:2px solid #2e7d32;
      border-right:none;
      border-radius:6px 0 0 6px;
      outline:none;
  }

  button{
      padding:12px 26px;
      font-size:16px;
      border:none;
      background:#2e7d32;
      color:white;
      cursor:pointer;
      border-radius:0 6px 6px 0;
  }

  button:hover{
      background:#256b2a;
  }

  h2{
      text-align:center;
      margin-bottom:15px;
  }

  .todo{
      display:flex;
      align-items:center;
      background:white;
      margin-bottom:12px;
      border-radius:8px;
      overflow:hidden;
      box-shadow:0 1px 3px rgba(0,0,0,.1);
  }

  .todo-bar{
      width:8px;
      background:#2e7d32;
      align-self:stretch;
  }

  .todo-text{
      padding:16px;
      text-align:left;
  }

  </style>

  </head>

  <body>

  <div class="container">

  <h1>Todo App</h1>

  <img src="/image" alt="Random image">

  <div class="todo-form">

  <input
  type="text"
  maxlength="140"
  placeholder="Enter a new todo (max 140 characters)">

  <button>Send</button>

  </div>

  <h2>Todos</h2>

  <div class="todo">
  <div class="todo-bar"></div>
  <div class="todo-text">
  Learn Kubernetes basics
  </div>
  </div>

  <div class="todo">
  <div class="todo-bar"></div>
  <div class="todo-text">
  Deploy application to cluster
  </div>
  </div>

  <div class="todo">
  <div class="todo-bar"></div>
  <div class="todo-text">
  Configure persistent volumes
  </div>
  </div>
  </div>
  </body>
  </html>
  `);
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});