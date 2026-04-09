const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config();

const rootDir = path.resolve(__dirname, "..", "..");

module.exports = {
  rootDir,
  port: Number(process.env.PORT || 3000),
  appName: process.env.APP_NAME || "师资测算与预警系统",
  dbPath: path.resolve(rootDir, process.env.DB_PATH || "data/teacher-warning.db"),
};
