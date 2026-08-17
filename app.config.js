const baseUrl = process.env.EXPO_PUBLIC_BASE_URL || (process.env.GITHUB_REPOSITORY ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}` : '');

module.exports = {
  expo: {
    ...require('./app.json').expo,
    experiments: {
      ...require('./app.json').expo.experiments,
      baseUrl,
    },
  },
};
