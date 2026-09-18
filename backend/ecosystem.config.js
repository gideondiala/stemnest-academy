/**
 * PM2 Ecosystem Config
 * Runs the API in cluster mode on AWS EC2 for zero-downtime restarts.
 * Usage:
 *   pm2 start ecosystem.config.js --env production
 *   pm2 reload stemnest-api --update-env   (zero-downtime redeploy)
 */

module.exports = {
  apps: [{
    name:         'stemnest-api',
    script:       'src/index.js',
    instances:    'max',          // use all CPU cores
    exec_mode:    'cluster',      // cluster mode = zero-downtime restarts
    watch:        false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'development',
      PORT:     3000,
    },
    env_production: {
      NODE_ENV: 'production',
      PORT:     3000,
    },
    error_file:  'logs/err.log',
    out_file:    'logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs:  true,
  }],
};
