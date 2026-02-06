module.exports = {
  contextToAppId: ({ securityContext }) => {
    return `CUBEJS_APP_${securityContext?.tenant || 'default'}`;
  },

  scheduledRefreshContexts: () => [{}],

  // Allow all origins in development
  http: {
    cors: {
      origin: '*',
    },
  },
};
