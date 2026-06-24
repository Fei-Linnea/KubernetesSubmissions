const http = require("http");
const { randomUUID } = require("node:crypto");

const PORT = process.env.PORT || 3000;
const id = randomUUID();

setInterval(() => {
  console.log(`${new Date().toISOString()}: ${id}`);
}, 5000);

const server = http.createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(`${new Date().toISOString()}: ${id}`);
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
