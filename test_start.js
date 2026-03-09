console.log("=== Startup Test ===");
try {
  console.log("Testing express...");
  require('express');
  console.log("express: OK");
} catch(e) { console.log("express FAIL:", e.message); }

try {
  console.log("Testing better-sqlite3...");
  require('better-sqlite3');
  console.log("better-sqlite3: OK");
} catch(e) { console.log("better-sqlite3 FAIL:", e.message); }

try {
  console.log("Testing jsonwebtoken...");
  require('jsonwebtoken');
  console.log("jsonwebtoken: OK");
} catch(e) { console.log("jwt FAIL:", e.message); }

try {
  console.log("Loading server...");
  require('./server.js');
} catch(e) {
  console.log("SERVER CRASH:", e.message);
  console.log(e.stack);
}
