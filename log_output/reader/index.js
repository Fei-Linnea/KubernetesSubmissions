const http = require("http");
const fs = require("fs");

const PORT = process.env.PORT || 3000;
const FILE = "/usr/src/app/files/output.txt";

const server = http.createServer((req, res) => {
  if (req.url === "/") {
    try {
      const content = fs.readFileSync(FILE, "utf8");

      res.writeHead(200, {
        "Content-Type": "text/plain",
      });

      res.end(content);
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
