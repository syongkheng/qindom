"use strict";
module.exports = {
    apps: [
        {
            name: "base-expressts",
            script: "dist/src/index.js", // Run the built JS file
            instances: 1, // You can increase this for clustering
            autorestart: true,
            watch: false,
            max_memory_restart: "1G",
            env: {
                NODE_ENV: "PRD",
                DB_URL: "127.0.0.1",
                DB_USER: "root",
                DB_PW: "P@ssw0rd1234",
                DB_NAME: "wuxi",
                LTA_DATAMALL_API_KEY: "KfyQf89WR8K1OPGjrwJpCA==",
                JWT_SECRET: "c2hlcm9uZ3FpbmppYW5neWFuamlzaWppYXhpbmppYXBvd3V4aWppYW5nc3V6aG9uZ2d1bw=="
            }
        }
    ]
};
