// PM2 Ecosystem Configuration
// Usage: pm2 start ecosystem.config.js

module.exports = {
  apps: [{
    name: 'cybersource-backend',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    // Logging
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // Auto-restart settings
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    
    // Advanced settings
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000,
    
    // Environment variables (override with .env file)
    env_production: {
      NODE_ENV: 'production',
      PORT: 5000
    }
  }]
};


