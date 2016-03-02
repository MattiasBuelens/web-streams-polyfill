require("babel-register")({
  presets: [
    require("babel-preset-es2015")
  ]
});

require("babel-polyfill");

module.exports = require("./index.es6");
