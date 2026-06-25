const { randomUUID } = require("crypto");
const fs = require("fs");

const id = randomUUID();
const FILE = "/usr/src/app/files/output.txt";

const writeLog = () => {
  const line = `${new Date().toISOString()}: ${id}\n`;

  fs.writeFileSync(FILE, line);
  console.log(line.trim());
};

writeLog();
setInterval(writeLog, 5000);
