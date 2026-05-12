// CloudFront Function — URL Rewrite
// Rewrites clean URLs to .html files
// e.g. /pages/login → /pages/login.html
// e.g. /pages/admin-dashboard → /pages/admin-dashboard.html

function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // Already has an extension — pass through
  if (uri.includes('.')) {
    return request;
  }

  // Root path
  if (uri === '/' || uri === '') {
    request.uri = '/index.html';
    return request;
  }

  // Remove trailing slash
  if (uri.endsWith('/')) {
    uri = uri.slice(0, -1);
  }

  // Add .html extension
  request.uri = uri + '.html';
  return request;
}
