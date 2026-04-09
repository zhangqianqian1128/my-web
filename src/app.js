const path = require("node:path");
const express = require("express");
const { appName } = require("./config/env");
const { migrate } = require("./db/migrate");
const pagesRouter = require("./routes/pages");
const crudRouter = require("./routes/crud");

const app = express();

migrate();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.locals.appName = appName;

app.use("/", pagesRouter);
app.use("/", crudRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render("error", {
    pageTitle: "系统错误",
    activeNav: "",
    message: "应用已启动，但出现了未处理异常。请查看终端日志。",
  });
});

module.exports = app;
