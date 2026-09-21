module.exports = {
  apps: [
    {
      name: "qindom",
      script: "src/index.js",

      // Pin the Node version explicitly — PM2 otherwise resolves a bare
      // "node" via PATH, which on this box finds the system apt-installed
      // v18.19.1 before nvm's v22.21.0. sharp (and other deps) require
      // Node >=20, so under v18 sharp's native binding fails to load and
      // the app crash-loops (this caused the 2026-09-19 Bad Gateway outage).
      interpreter: "/home/ubuntu/.nvm/versions/node/v22.21.0/bin/node",

      // Restart on crash
      autorestart: true,

      // Prevent infinite restart loops
      max_restarts: 10,
      min_uptime: "10s",

      // Logs
      out_file: "/home/ubuntu/.pm2/logs/qindom.out.log",
      error_file: "/home/ubuntu/.pm2/logs/qindom.err.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      max_size: "50M",
      rotate_interval: "1d",
      retain: 7,

      // Default (fallback)
      env: {
        NODE_ENV: "dev"
      },

      // Production
      env_prd: {
        NODE_ENV: "prd"
      }
    }
  ]
};
