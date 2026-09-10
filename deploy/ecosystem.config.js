// ==============================================================
// PM CONTROL TOWER — PM2 process definitions (bare-metal Node 20+)
//   pm2 start deploy/ecosystem.config.js --env production
//   pm2 save && pm2 startup      # survive reboots
// Requires: npm run build completed; environment exported (see deploy/setup.sh,
// which loads .env into the PM2 environment).
// ==============================================================
module.exports = {
  apps: [
    {
      name: "pmct-app",
      script: ".next/standalone/server.js",
      exec_mode: "fork",
      instances: 1, // SQLite — keep a single writer process
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        HOSTNAME: "127.0.0.1",
      },
      max_memory_restart: "1024M",
      time: true,
    },
    {
      name: "pmct-realtime",
      // TS entry executed through tsx (installed with dev dependencies)
      script: "mini-services/realtime/index.ts",
      interpreter: "node",
      interpreter_args: "--import tsx",
      exec_mode: "fork",
      instances: 1,
      env: {
        NODE_ENV: "production",
        REALTIME_PORT: 3003,
      },
      time: true,
    },
  ],
};
