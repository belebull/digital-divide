const path = require("path");

module.exports = (env) => {
  const dir = env.production ? "dist" : "dev";
  return {
    entry: "./src/js/main.js",
    resolve: {
      alias: {
        handlebars: "handlebars/dist/handlebars.min.js",
      },
    },
    output: {
      filename: "bundle.js",
      path: path.resolve(__dirname, dir),
    },
  };
};
