"use strict";
const Database = require("better-sqlite3");

module.exports = (conf = {}) => {
    // Extract configuration path or use default
    const { path = __dirname + '/db.db' } = conf;
    // Initialize the SQLite database
    const DB = new Database(path);

    // Import and initialize database tables and related functionality
    const { servers } = require("./servers")(DB);
    const { traffic, lt } = require("./traffic")(DB);
    const { load_m, load_h } = require("./load")(DB);
    const { ssh_scripts } = require("./ssh_scripts")(DB);
    const { setting } = require("./setting")(DB);

    // Define a function to get all servers
    function getServers() {
        return servers.all();
    }

    // Return an object with all functionalities and the database instance
    return {
        DB,
        servers,
        getServers,
        traffic,
        lt,
        load_m,
        load_h,
        ssh_scripts,
        setting,
    };
};
