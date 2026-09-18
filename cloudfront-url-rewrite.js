// CloudFront Function — URL Rewrite + Clean URLs
// 1. Strips .html from URLs (redirect)
// 2. Adds .html when serving files without extension

function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // If URL ends with .html — redirect to clean URL (301)
  if (uri.endsWith('.html')) {
    var cleanUri = uri.slice(0, -5); // remove .html
    if (cleanUri === '' || cleanUri === '/index') cleanUri = '/';
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: {
        location: { value: cleanUri }
      }
    };
  }

  // Root path
  if (uri === '/' || uri === '') {
    request.uri = '/index.html';
    return request;
  }

  // Already has a non-html extension (css, js, png, etc) — pass through
  if (uri.match(/\.[a-zA-Z0-9]+$/)) {
    return request;
  }

  // Remove trailing slash
  if (uri.endsWith('/')) {
    uri = uri.slice(0, -1);
  }

  // Add .html to serve the file
  request.uri = uri + '.html';
  return request;
}
