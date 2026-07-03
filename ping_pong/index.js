const http = require("http");
const fs = require("fs");

const COUNTER_FILE = "/usr/src/app/files/counter.txt";

let counter = 0;

if (fs.existsSync(COUNTER_FILE)) {
  const data = fs.readFileSync(COUNTER_FILE, "utf8");
  counter = parseInt(data, 10) || 0;
}

const port = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  if (req.url === "/pingpong" && req.method === "GET") {
    counter++;
    fs.writeFileSync(COUNTER_FILE, counter.toString());
    res.writeHead(200, {
      "Content-Type": "text/plain",
    });
    res.end(`pong ${counter}`);
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(port, () => {
  console.log(`Pingpong server running on port ${port}`);
});