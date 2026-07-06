const http = require("http");
const PORT = process.env.PORT || 3000;
const todos = [
  "Learn Kubernetes basics",
  "Deploy application to cluster",
  "Configure persistent volumes",
];

const server = http.createServer((req, res) => {
  // GET /todos
  if (req.method === "GET" && req.url === "/todos") {
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
    req.on("end", () => {
      const params = new URLSearchParams(body);
      const todo = (params.get("todo") || "").trim();
      if (todo.length > 0 && todo.length <= 140) {
        todos.push(todo);
      }
      res.writeHead(201);
      res.end();
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`Todo backend listening on ${PORT}`);
});