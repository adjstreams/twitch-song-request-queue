const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3001;
const ROOT = path.join(__dirname);

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

function serveFile(res, filePath) {
  const ext = path.extname(filePath);
  const contentType = MIME[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  const pathname = (req.url || "").split("?")[0] || "/";

  if (pathname === "/dock") {
    res.writeHead(302, { Location: "/dock/" });
    res.end();
    return;
  }
  if (pathname === "/" || pathname === "/index.html") {
    const filePath = path.join(ROOT, "src", "index.html");
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    serveFile(res, filePath);
    return;
  }
  if (pathname === "/dock/") {
    const filePath = path.join(ROOT, "src", "dock", "index.html");
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    serveFile(res, filePath);
    return;
  }

  if (pathname.startsWith("/dock/")) {
    const subPath = pathname.slice(6) || "index.html";
    const filePath = path.join(ROOT, "src", "dock", path.normalize(subPath).replace(/^(\.\.(\/|\\))+/, ""));
    if (!filePath.startsWith(path.join(ROOT, "src", "dock")) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    serveFile(res, filePath);
    return;
  }

  if (pathname === "/player" || pathname === "/player/") {
    if (pathname !== "/player/") {
      res.writeHead(302, { Location: "/player/" });
      res.end();
      return;
    }
    const filePath = path.join(ROOT, "src", "player", "index.html");
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    serveFile(res, filePath);
    return;
  }

  if (pathname.startsWith("/player/")) {
    const subPath = pathname.slice(8) || "index.html";
    const filePath = path.join(ROOT, "src", "player", path.normalize(subPath).replace(/^(\.\.(\/|\\))+/, ""));
    if (!filePath.startsWith(path.join(ROOT, "src", "player")) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    serveFile(res, filePath);
    return;
  }

  if (pathname === "/now-playing" || pathname === "/now-playing/") {
    if (pathname !== "/now-playing/") {
      res.writeHead(302, { Location: "/now-playing/" });
      res.end();
      return;
    }
    const filePath = path.join(ROOT, "src", "now-playing", "index.html");
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    serveFile(res, filePath);
    return;
  }

  if (pathname.startsWith("/now-playing/")) {
    const subPath = pathname.slice(13) || "index.html";
    const filePath = path.join(ROOT, "src", "now-playing", path.normalize(subPath).replace(/^(\.\.(\/|\\))+/, ""));
    if (!filePath.startsWith(path.join(ROOT, "src", "now-playing")) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    serveFile(res, filePath);
    return;
  }

  const filePath = path.join(ROOT, path.normalize(pathname).replace(/^(\.\.(\/|\\))+/, ""));
  if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }
  serveFile(res, filePath);
});

server.listen(PORT, () => {
  console.log(`Media Request: http://localhost:${PORT}`);
  console.log(`  Root:       http://localhost:${PORT}/`);
  console.log(`  Dock:       http://localhost:${PORT}/dock/`);
  console.log(`  Player:     http://localhost:${PORT}/player/`);
  console.log(`  Now Playing: http://localhost:${PORT}/now-playing/`);
});
