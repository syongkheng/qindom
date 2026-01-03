module.exports = {
  apps: [
    {
      name: "qindom",
      script: "src/index.js",

      // Restart on crash
      autorestart: true,

      // Prevent infinite restart loops
      max_restarts: 10,
      min_uptime: "10s",

      // Logs
      out_file: "/home/ubuntu/.pm2/logs/qindom.out.log",
      error_file: "/home/ubuntu/.pm2/logs/qindom.err.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",

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
