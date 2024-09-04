const ssh = require("../../ssh");

async function initServer(server, neko_status_url) {
    // Validate input
    if (!server || !server.data || !server.data.ssh || !server.data.api || !neko_status_url) {
        console.error("Invalid server data or URL");
        return { status: 0, data: "Invalid input data" };
    }

    const sh = `
    wget --version || yum install wget -y || apt-get install wget -y
    /usr/bin/neko-status -v || (wget ${neko_status_url} -O /usr/bin/neko-status && chmod +x /usr/bin/neko-status)
    systemctl stop nekonekostatus
    mkdir -p /etc/neko-status/
    echo "key: ${server.data.api.key}
    port: ${server.data.api.port}
    debug: false" > /etc/neko-status/config.yaml
    systemctl stop nekonekostatus
    echo "[Unit]
    Description=nekonekostatus

    [Service]
    Restart=always
    RestartSec=5
    ExecStart=/usr/bin/neko-status -c /etc/neko-status/config.yaml

    [Install]
    WantedBy=multi-user.target" > /etc/systemd/system/nekonekostatus.service
    systemctl daemon-reload
    systemctl start nekonekostatus
    systemctl enable nekonekostatus`;

    try {
        const res = await ssh.Exec(server.data.ssh, sh);
        if (res.success) {
            return { status: 1, data: "安装成功" };
        } else {
            console.error("Installation failed:", res.error);
            return { status: 0, data: "安装失败/SSH连接失败" };
        }
    } catch (error) {
        console.error("Error during initServer:", error);
        return { status: 0, data: "安装失败/SSH连接失败" };
    }
}

async function updateServer(server, neko_status_url) {
    // Validate input
    if (!server || !server.data || !server.data.ssh || !server.data.api || !neko_status_url) {
        console.error("Invalid server data or URL");
        return { status: 0, data: "Invalid input data" };
    }

    const sh = `
    rm -f /usr/bin/neko-status
    wget ${neko_status_url} -O /usr/bin/neko-status
    chmod +x /usr/bin/neko-status`;

    try {
        await ssh.Exec(server.data.ssh, sh);
        return { status: 1, data: "更新成功" };
    } catch (error) {
        console.error("Error during updateServer:", error);
        return { status: 0, data: "更新失败/SSH连接失败" };
    }
}

module.exports = {
    initServer,
    updateServer,
};
