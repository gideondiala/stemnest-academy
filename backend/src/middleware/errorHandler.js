/**
 * Global error handler.
 * All unhandled errors land here and return a consistent JSON shape.
 */

function errorHandler(err, req, res, _next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  const status  = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' && status === 500
    ? 'Internal server error'
    : err.message;

  res.status(status).json({ success: false, error: message });
}

module.exports = errorHandler;
