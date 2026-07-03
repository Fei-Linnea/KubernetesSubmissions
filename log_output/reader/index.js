const http = require("http");
const fs = require("fs");

const PORT = process.env.PORT || 3000;
const FILE = "/usr/src/app/files/output.txt";
const COUNTER_FILE = "/usr/src/app/files/counter.txt";

const server = http.createServer((req, res) => {
  if (req.url === "/") {
    try {
      const log = fs.readFileSync(FILE, "utf8").trim();
      let counter = "0";
      if (fs.existsSync(COUNTER_FILE)) {
        counter = fs.readFileSync(COUNTER_FILE, "utf8").trim();
      }
      res.writeHead(200, {
        "Content-Type": "text/plain",
      });
      res.end(`${log}\nPing / Pongs: ${counter}`);
    } catch {
      res.writeHead(404);
      res.end("No data yet");
    }
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`Reader listening on port ${PORT}`);
});