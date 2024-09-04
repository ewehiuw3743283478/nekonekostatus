"use strict";
const { initServer, updateServer } = require("./func");
const ssh = require("../../ssh");
const uuid = require("uuid"); // Ensure you have this package installed
const fs = require("fs");
const path = require("path");

module.exports = (svr) => {
    const { db, setting, pr, parseNumber } = svr.locals;

    // Add a new server
    svr.post("/admin/servers/add", async (req, res) => {
        let { sid, name, data, top, status } = req.body;
        if (!sid) sid = uuid.v1(); // Generate a new UUID if sid is not provided
        try {
            await db.servers.ins(sid, name, data, top, status);
            res.json(pr(1, sid));
        } catch (error) {
            console.error("Error adding server:", error);
            res.status(500).json(pr(0, "添加失败"));
        }
    });

    // Render the add server page
    svr.get("/admin/servers/add", (req, res) => {
        res.render("admin/servers/add");
    });

    // Edit an existing server
    svr.post("/admin/servers/:sid/edit", async (req, res) => {
        const { sid } = req.params;
        const { name, data, top, status } = req.body;
        try {
            await db.servers.upd(sid, name, data, top);
            if (status != null) await db.servers.upd_status(sid, status);
            res.json(pr(1, '修改成功'));
        } catch (error) {
            console.error("Error editing server:", error);
            res.status(500).json(pr(0, "修改失败"));
        }
    });

    // Delete a server
    svr.post("/admin/servers/:sid/del", async (req, res) => {
        const { sid } = req.params;
        try {
            await db.servers.del(sid);
            res.json(pr(1, '删除成功'));
        } catch (error) {
            console.error("Error deleting server:", error);
            res.status(500).json(pr(0, "删除失败"));
        }
    });

    // Initialize a server
    svr.post("/admin/servers/:sid/init", async (req, res) => {
        const { sid } = req.params;
        const server = db.servers.get(sid);
        try {
            res.json(await initServer(server, setting.get("neko_status_url")));
        } catch (error) {
            console.error("Error initializing server:", error);
            res.status(500).json(pr(0, "初始化失败"));
        }
    });

    // Update a server
    svr.post("/admin/servers/:sid/update", async (req, res) => {
        const { sid } = req.params;
        const server = db.servers.get(sid);
        try {
            res.json(await updateServer(server, setting.get("neko_status_url")));
        } catch (error) {
            console.error("Error updating server:", error);
            res.status(500).json(pr(0, "更新失败"));
        }
    });

    // Render the list of servers
    svr.get("/admin/servers", (req, res) => {
        res.render("admin/servers", {
            servers: db.servers.all()
        });
    });

    // Update server order
    svr.post("/admin/servers/ord", async (req, res) => {
        const { servers } = req.body;
        let ord = 0;
        servers.reverse();
        try {
            for (const sid of servers) {
                await db.servers.upd_top(sid, ++ord);
            }
            res.json(pr(true, '更新成功'));
        } catch (error) {
            console.error("Error updating server order:", error);
            res.status(500).json(pr(false, '更新失败'));
        }
    });

    // Render the server edit page
    svr.get("/admin/servers/:sid", (req, res) => {
        const { sid } = req.params;
        const server = db.servers.get(sid);
        res.render("admin/servers/edit", {
            server
        });
    });

    // WebSocket for SSH
    svr.ws("/admin/servers/:sid/ws-ssh/:data", (ws, req) => {
        const { sid, data } = req.params;
        const server = db.servers.get(sid);
        if (data) {
            try {
                const parsedData = JSON.parse(data);
                ssh.createSocket(server.data.ssh, ws, parsedData);
            } catch (error) {
                console.error("Error parsing data:", error);
                ws.send(JSON.stringify({ error: "Invalid data format" }));
            }
        } else {
            ssh.createSocket(server.data.ssh, ws);
        }
    });

    // Serve the neko-status file
    svr.get("/get-neko-status", async (req, res) => {
        const nekoStatusPath = path.join(__dirname, 'neko-status');
        try {
            if (!fs.existsSync(nekoStatusPath)) {
                // Uncomment and replace the following with the actual URL to fetch the file if needed
                // await fetch("文件url", {
                //     method: 'GET',
                //     headers: { 'Content-Type': 'application/octet-stream' },
                // })
                // .then(res => res.buffer())
                // .then(data => fs.writeFileSync(nekoStatusPath, data, "binary"));
            }
            res.sendFile(nekoStatusPath);
        } catch (error) {
            console.error("Error serving neko-status file:", error);
            res.status(500).send("文件服务失败");
        }
    });
};
