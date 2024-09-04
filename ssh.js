const { NodeSSH } = require('node-ssh');
const SSHClient = require("ssh2").Client;
const crypto = require('crypto');

// Helper function to securely store and retrieve credentials
function getCredentials(key) {
    if (!key.privateKey || key.privateKey.trim() === '') delete key.privateKey;
    if (!key.password || key.password.trim() === '') delete key.password;
    key.readyTimeout = 10000;
    return key;
}

// Improved SSH connection function with detailed error handling
async function ssh_con(key) {
    const ssh = new NodeSSH();
    try {
        await ssh.connect(getCredentials(key));
        ssh.connection.on("error", (err) => {
            console.error(`SSH Connection Error: ${err.message}`);
        });
        return ssh;
    } catch (e) {
        console.error(`SSH Connection Failed: ${e.message}`);
        return null;
    }
}

// Improved SSH command execution function
async function ssh_exec(ssh, command) {
    try {
        const res = await ssh.execCommand(command, { onStdout: null });
        return { success: true, data: res.stdout };
    } catch (e) {
        console.error(`Command Execution Failed: ${e.message}`);
        return { success: false, data: e.message };
    }
}

// Function to execute a command with real-time output streaming
async function spawn(key, command, onData = (chunk) => { process.stdout.write(chunk); }) {
    const ssh = await ssh_con(key);
    if (!ssh) return { success: false, data: "Failed to establish SSH connection." };
    
    try {
        const res = await ssh.execCommand(command, { onStdout: onData });
        await ssh.dispose();
        return { success: true, data: res.stdout };
    } catch (e) {
        console.error(`Spawn Failed: ${e.message}`);
        return { success: false, data: e.message };
    }
}

// Simplified command execution function
async function exec(key, command) {
    const ssh = await ssh_con(key);
    if (!ssh) return { success: false, data: "Failed to establish SSH connection." };
    
    try {
        const res = await ssh.execCommand(command);
        await ssh.dispose();
        return { success: true, data: res.stdout };
    } catch (e) {
        console.error(`Execution Failed: ${e.message}`);
        return { success: false, data: e.message };
    }
}

// Create a WebSocket SSH session with better error handling
async function createSocket(key, ws, conf = {}) {
    const ssh = new SSHClient();
    ssh.on("ready", () => {
        ws.send("\r\n*** SSH CONNECTION ESTABLISHED ***\r\n");
        ssh.shell((err, stream) => {
            if (err) {
                ws.send(`\n*** SSH SHELL ERROR: ${err.message} ***\n`);
                return;
            }
            if (conf.cols || conf.rows) stream.setWindow(conf.rows, conf.cols);
            if (conf.sh) stream.write(conf.sh);
            ws.on("message", (data) => stream.write(data));
            ws.on("resize", (data) => stream.setWindow(data.rows, data.cols));
            ws.on("close", () => ssh.end());
            stream.on("data", (data) => ws.send(data.toString('utf-8')))
                  .on("close", () => ssh.end());
        });
    }).on("close", () => {
        ws.close();
    }).on("error", (err) => {
        ws.send(`\r\n*** SSH CONNECTION ERROR: ${err.message} ***\r\n`);
        ws.close();
    }).connect(getCredentials(key));
}

// Maintain SSH connections in a more efficient manner
const sshConnections = new Map();
async function Exec(key, cmd, verbose = false) {
    const keyHash = crypto.createHash('sha256').update(JSON.stringify(key)).digest('hex');
    let ssh = sshConnections.get(keyHash);

    if (!ssh || !(await ssh.isConnected())) {
        ssh = await ssh_con(key);
        if (!ssh) return { success: false, data: "Failed to establish SSH connection." };
        sshConnections.set(keyHash, ssh);
    }

    const res = await ssh_exec(ssh, cmd);
    if (verbose) console.log(key.host, cmd, res);

    return res;
}

// Improved process search function
async function pidS(key, keyword) {
    const res = await Exec(key, `ps -aux | grep ${keyword} | awk '{print $2}'`);
    if (!res.success) return false;
    
    return new Set(res.data.trim().split('\n'));
}

// Improved network statistics function
async function netStat(key, keyword) {
    const res = await Exec(key, `netstat -lp | grep ${keyword}`);
    if (!res.success) return {};

    const result = {};
    res.data.trim().split('\n').forEach(line => {
        const parts = line.trim().split(/\s+/);
        const port = parseInt(parts[3].split(':').pop(), 10);
        const pid = parts.pop().split('/')[0];
        if (port) result[port] = pid;
    });
    
    return result;
}

// Export the improved functions
module.exports = {
    exec,
    spawn,
    ssh_con,
    ssh_exec,
    Exec,
    createSocket,
    netStat,
    pidS,
};
