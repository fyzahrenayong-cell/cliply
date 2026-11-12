// Static asset host only. Cliply content is stored entirely in the user's browser.
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  }
};
