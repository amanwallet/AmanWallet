// react-native.config.js
module.exports = {
  dependencies: {
    'react-native-randombytes': { platforms: { ios: null, android: null } },
    'react-native-crypto':     { platforms: { ios: null, android: null } },
    'react-native-webcrypto':  { platforms: { ios: null, android: null } }, // أضفناها هنا
  },
};
