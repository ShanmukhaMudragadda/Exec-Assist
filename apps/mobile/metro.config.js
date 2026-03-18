const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Disable package exports resolution — prevents "import.meta" errors from
// ESM-only packages (socket.io-client, etc.) when bundling for web
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
