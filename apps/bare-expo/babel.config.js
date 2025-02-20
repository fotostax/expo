module.exports = function (api) {
  api.cache(true);

  const moduleResolverConfig = {
    alias: {},
  };

  // We'd like to get rid of `native-component-list` being a part of the final bundle.
  // Otherwise, some tests may fail due to timeouts (bundling takes significantly more time).
  if (process.env.CI || process.env.NO_NCL) {
    moduleResolverConfig.alias['^native-component-list(/.*)?'] = require.resolve(
      './moduleResolvers/nullResolver.js'
    );
  }

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['babel-plugin-module-resolver', moduleResolverConfig],
      ['react-native-worklets-core/plugin'],
      ['react-native-reanimated/plugin', { processNestedWorklets: true }],
    ],
  };
};
