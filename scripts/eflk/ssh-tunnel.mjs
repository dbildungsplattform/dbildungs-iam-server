// Reusable local SSH port forward (analogous to the "SSH Tunnel" tab in pgAdmin).
// No dependency on any specific caller - just spawns/tears down `ssh -L ...`.

import { writeFile, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function waitForPort(port, child, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const start = Date.now();
        const onExit = (code) => {
            if (!settled) {
                settled = true;
                reject(new Error(`SSH-Tunnel wurde vorzeitig beendet (Exit-Code ${code})`));
            }
        };
        child.once('exit', onExit);
        const tryConnect = () => {
            const socket = net.connect(port, '127.0.0.1');
            socket.once('connect', () => {
                socket.end();
                if (!settled) {
                    settled = true;
                    child.off('exit', onExit);
                    resolve();
                }
            });
            socket.once('error', () => {
                socket.destroy();
                if (Date.now() - start > timeoutMs) {
                    if (!settled) {
                        settled = true;
                        child.off('exit', onExit);
                        reject(new Error('Timeout beim Warten auf den SSH-Tunnel'));
                    }
                    return;
                }
                setTimeout(tryConnect, 300);
            });
        };
        tryConnect();
    });
}

// Writes an askpass helper script that supplies the passphrase, so ssh doesn't
// have to prompt for it interactively (no TTY in the child process).
async function createAskPassScript() {
    const scriptPath = join(tmpdir(), `eflk-ssh-askpass-${process.pid}-${Date.now()}.sh`);
    await writeFile(scriptPath, '#!/bin/sh\nprintf \'%s\' "$SSH_KEY_PASSPHRASE"\n', { mode: 0o700 });

    return scriptPath;
}

// Rejects if something is already listening on localPort - otherwise waitForPort() could
// happily connect to a stale/stuck tunnel from an earlier run instead of our fresh one.
function assertLocalPortIsFree(port) {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                reject(new Error(
                    `Lokaler Port ${port} ist bereits belegt (evtl. ein haengengebliebener SSH-Tunnel `
                    + `aus einem frueheren Lauf - pruefen mit 'lsof -iTCP:${port}' und ggf. beenden, `
                    + `oder einen anderen lokalen Port verwenden).`,
                ));
                return;
            }
            reject(err);
        });
        server.listen(port, '127.0.0.1', () => {
            server.close(resolve);
        });
    });
}

// Sets up a local SSH port forward: localPort -> dbHost:dbPort, tunnelled via sshUser@sshHost.
export async function openSshTunnel({ sshHost, sshPort, sshUser, sshKey, dbHost, dbPort, localPort, passphrase }) {
    await assertLocalPortIsFree(localPort);

    const askPassScript = passphrase ? await createAskPassScript() : undefined;

    const sshArgs = [
        '-i', sshKey,
        '-p', String(sshPort),
        '-L', `${localPort}:${dbHost}:${dbPort}`,
        '-N',
        '-o', 'ExitOnForwardFailure=yes',
        '-o', 'StrictHostKeyChecking=accept-new',
        // BatchMode would also prevent supplying the passphrase via askpass
        ...(askPassScript ? [] : ['-o', 'BatchMode=yes']),
        `${sshUser}@${sshHost}`,
    ];
    const env = askPassScript
        ? { ...process.env, SSH_ASKPASS: askPassScript, SSH_ASKPASS_REQUIRE: 'force', SSH_KEY_PASSPHRASE: passphrase }
        : process.env;
    const child = spawn('ssh', sshArgs, { stdio: ['ignore', 'ignore', 'pipe'], env });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
    });

    try {
        await waitForPort(localPort, child);
    } catch (err) {
        child.kill();
        if (askPassScript) await unlink(askPassScript).catch(() => {});
        throw new Error(`${err.message}${stderr ? `\nssh stderr: ${stderr.trim()}` : ''}`);
    }

    return { child, askPassScript };
}

// Terminates the tunnel, escalating to SIGKILL if it doesn't exit gracefully. Safe to call twice.
export async function closeSshTunnel(tunnel) {
    if (!tunnel || tunnel.closed) return;
    tunnel.closed = true;

    if (tunnel.child.exitCode === null && tunnel.child.signalCode === null) {
        tunnel.child.kill('SIGTERM');
        await new Promise((resolve) => {
            const timer = setTimeout(() => {
                tunnel.child.kill('SIGKILL');
                resolve();
            }, 2000);
            tunnel.child.once('exit', () => {
                clearTimeout(timer);
                resolve();
            });
        });
    }

    if (tunnel.askPassScript) await unlink(tunnel.askPassScript).catch(() => {});
}

// Safety net so the tunnel is still closed on Ctrl+C/SIGTERM/a crash - these run outside of
// main()'s own try/finally. getTunnel() is a getter since the tunnel is only known once openSshTunnel() resolves.
export function installTunnelCleanupHandlers(getTunnel) {
    for (const signal of ['SIGINT', 'SIGTERM']) {
        process.on(signal, () => {
            console.error(`\n${signal} empfangen, schliesse SSH-Tunnel...`);
            closeSshTunnel(getTunnel())
                .catch((err) => console.error(err))
                .finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
        });
    }

    for (const event of ['uncaughtException', 'unhandledRejection']) {
        process.on(event, (err) => {
            console.error(err);
            closeSshTunnel(getTunnel())
                .catch((cleanupErr) => console.error(cleanupErr))
                .finally(() => process.exit(1));
        });
    }
}
