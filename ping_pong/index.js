const http = require("http");

let counter = 0;
const port = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  if (req.url === "/pingpong" && req.method === "GET") {
    counter++;
    res.writeHead(200, {
      "Content-Type": "text/plain",
    });
    res.end(`pong ${counter}`);
    return;
  }
  if (req.url === "/pings" && req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "text/plain",
    });
    res.end(counter.toString());
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(port, () => {
  console.log(`Pingpong server running on port ${port}`);
});
