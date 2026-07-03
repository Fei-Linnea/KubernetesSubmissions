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
      <html>
      <head>
          <meta charset="UTF-8">
          <title>Todo App</title>
      </head>
      <body>
          <h1>Todo App</h1>
          <img src="/image" alt="Random image" width="600">
          <p>DevOps with Kubernetes 2026</p>
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