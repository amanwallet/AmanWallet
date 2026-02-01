// metro.config.js
const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);

config.resolver = {
  ...config.resolver,
  extraNodeModules: {
    buffer: require.resolve("buffer/"),
    process: require.resolve("process/browser"),
  },
};

module.exports = config;
