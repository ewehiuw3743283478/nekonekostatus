"use strict";
const fetch = require("node-fetch");
const schedule = require("node-schedule");

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = async (svr) => {
    const { db, pr, bot } = svr.locals;
    const stats = {};
    const fails = {};
    const highCpu = {};
    const highDown = {};
    const updating = new Set();
    const noticed = {};

    function getStats(isAdmin = false) {
        const Stats = {};
        for (const { sid, status } of db.servers.all()) {
            if (status === 1 || (status === 2 && isAdmin)) {
                if (stats[sid]) {
                    Stats[sid] = stats[sid];
                }
            }
        }
        return Stats;
    }

    svr.get("/", (req, res) => {
        const { theme = db.setting.get("theme") || "card" } = req.query;
        res.render(`stats/${theme}`, {
            stats: getStats(req.admin),
            admin: req.admin
        });
    });

    svr.get("/stats/data", (req, res) => {
        res.json(getStats(req.admin));
    });

    svr.get("/stats/:sid", (req, res) => {
        const { sid } = req.params;
        const node = stats[sid];
        res.render('stat', {
            sid,
            node,
            traffic: db.traffic.get(sid),
            load_m: db.load_m.select(sid),
            load_h: db.load_h.select(sid),
            admin: req.admin
        });
    });

    svr.get("/stats/:sid/data", (req, res) => {
        const { sid } = req.params;
        res.json({ sid, ...stats[sid] });
    });

    svr.post("/stats/update", (req, res) => {
        const { sid, data } = req.body;
        stats[sid] = data;
        res.json(pr(1, 'update success'));
    });

    async function getStat(server) {
        let res;
        try {
            res = await fetch(`http://${server.data.ssh.host}:${server.data.api.port}/stat`, {
                method: "GET",
                headers: { key: server.data.api.key },
                timeout: 15000,
            }).then(res => res.json());
        } catch (e) {
            res = { success: false, msg: 'timeout' };
        }
        return res.success ? res.data : false;
    }

    async function update(server) {
        const { sid } = server;
        if (server.status <= 0) {
            delete stats[sid];
            return;
        }
        const stat = await getStat(server);
        if (stat) {
            let notice = false;
            if (stats[sid] && stats[sid].stat === false) {
                notice = true;
            }
            if (server.data.device) {
                const device = stat.net.devices[server.data.device];
                if (device) {
                    stat.net.total = device.total;
                    stat.net.delta = device.delta;
                }
            }
            stats[sid] = { name: server.name, stat };
            fails[sid] = 0;
            if (notice) {
                bot.funcs.notice(`#恢复 ${server.name} ${new Date().toLocaleString()}`);
            }
        } else {
            const failCount = (fails[sid] = (fails[sid] || 0) + 1);
            if (failCount > 10) {
                const notice = stats[sid] && stats[sid].stat;
                stats[sid] = { name: server.name, stat: false };
                if (notice) {
                    bot.funcs.notice(`#掉线 ${server.name} ${new Date().toLocaleString()}`);
                }
            }
        }
    }

    async function get() {
        const activeServers = new Set();
        const updateTasks = [];
        for (const server of db.servers.all()) {
            if (server.status > 0) {
                activeServers.add(server.sid);
                if (!updating.has(server.sid)) {
                    updateTasks.push((async (server) => {
                        updating.add(server.sid);
                        await update(server);
                        updating.delete(server.sid);
                    })(server));
                }
            }
        }
        for (const sid in stats) {
            if (!activeServers.has(sid)) {
                delete stats[sid];
            }
        }
        return Promise.all(updateTasks);
    }

    function calc() {
        for (const server of db.servers.all()) {
            const { sid } = server;
            const stat = stats[sid];
            if (!stat || !stat.stat || stat.stat === -1) continue;
            const { in: ni, out: no } = stat.stat.net.total;
            const t = db.lt.get(sid) || db.lt.ins(sid);
            const ti = ni < t.traffic[0] ? ni : ni - t.traffic[0];
            const to = no < t.traffic[1] ? no : no - t.traffic[1];
            db.lt.set(sid, [ni, no]);
            db.traffic.add(sid, [ti, to]);
        }
    }

    get();
    setInterval(get, 1500);
    setInterval(calc, 30000);

    schedule.scheduleJob({ second: 0 }, () => {
        for (const { sid } of db.servers.all()) {
            const stat = stats[sid];
            const cpu = stat && stat.stat && stat.stat !== -1 ? stat.stat.cpu.multi * 100 : -1;
            const mem = stat && stat.stat && stat.stat !== -1 ? stat.stat.mem.virtual.usedPercent : -1;
            const swap = stat && stat.stat && stat.stat !== -1 ? stat.stat.mem.swap.usedPercent : -1;
            const ibw = stat && stat.stat && stat.stat !== -1 ? stat.stat.net.delta.in : -1;
            const obw = stat && stat.stat && stat.stat !== -1 ? stat.stat.net.delta.out : -1;
            db.load_m.shift(sid, { cpu, mem, swap, ibw, obw });
        }
    });

    schedule.scheduleJob({ minute: 0, second: 1 }, () => {
        db.traffic.shift_hs();
        for (const { sid } of db.servers.all()) {
            let Cpu = 0, Mem = 0, Swap = 0, Ibw = 0, Obw = 0, total = 0;
            for (const { cpu, mem, swap, ibw, obw } of db.load_m.select(sid)) {
                if (cpu !== -1) {
                    total++;
                    Cpu += cpu;
                    Mem += mem;
                    Swap += swap;
                    Ibw += ibw;
                    Obw += obw;
                }
            }
            if (total === 0) {
                db.load_h.shift(sid, { cpu: -1, mem: -1, swap: -1, ibw: -1, obw: -1 });
            } else {
                db.load_h.shift(sid, { cpu: Cpu / total, mem: Mem / total, swap: Swap / total, ibw: Ibw / total, obw: Obw / total });
            }
        }
    });

    schedule.scheduleJob({ hour: 4, minute: 0, second: 2 }, () => {
        db.traffic.shift_ds();
    });

    schedule.scheduleJob({ date: 1, hour: 4, minute: 0, second: 3 }, () => {
        db.traffic.shift_ms();
    });
};
