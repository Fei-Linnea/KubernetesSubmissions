const http = require("http");
const fs = require("fs");

const PORT = process.env.PORT || 3000;
const FILE = "/usr/src/app/files/output.txt";
const INFO_FILE = "/usr/src/app/config/information.txt";
const PINGPONG_URL = "http://pingpong-svc/pings";

const server = http.createServer(async (req, res) => {
  if (req.url === "/") {
    try {
      const log = fs.readFileSync(FILE, "utf8").trim();
      let info = "";
      try {
        info = fs.readFileSync(INFO_FILE, "utf8").trim();
      } catch {
        info = "information file missing";
      }
      const message = process.env.MESSAGE || "";
      let counter = "0";
      try {
        const response = await fetch(PINGPONG_URL);
        if (response.ok) {
          counter = await response.text();
        }
      } catch (err) {
        console.error("Failed to fetch ping count:", err.message);
      }
      res.writeHead(200, {
        "Content-Type": "text/plain",
      });
      res.end(
`file content: ${info}
env variable: MESSAGE=${message}
${log}
Ping / Pongs: ${counter}`
      );
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