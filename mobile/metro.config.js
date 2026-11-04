const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const root = path.resolve(__dirname, '..');
const config = getDefaultConfig(__dirname);

// Share the pure-TS transaction engine with the backend.
config.watchFolders = [path.join(root, 'packages/core')];
config.resolver.extraNodeModules = { '@upi/core': path.join(root, 'packages/core/src') };
module.exports = config;
