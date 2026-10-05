// Reusable local SSH port forward (analogous to the "SSH Tunnel" tab in pgAdmin).
// No dependency on any specific caller - just spawns/tears down `ssh -L ...`.

import { writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Do work only for MacOS and Linux systems!
 * Fixed, non-writable candidate locations for the ssh binary - avoids relying on PATH resolution.
 */
const SSH_BINARY_CANDIDATES = ['/usr/bin/ssh', '/bin/ssh', '/usr/local/bin/ssh', '/opt/homebrew/bin/ssh'];
const DEFAULT_WAIT_TIMEOUT_MS = 15000;
const PORT_POLL_INTERVAL_MS = 300;
const SIGKILL_GRACE_PERIOD_MS = 2000;

function resolveSshBinary() {
    const found = SSH_BINARY_CANDIDATES.find((path) => existsSync(path));
    if (!found) {
        throw new Error(`ssh-Binary wurde in keinem der bekannten Pfade gefunden (${SSH_BINARY_CANDIDATES.join(', ')})`);
    }

    return found;
}

function waitForPort(port, child, timeoutMs = DEFAULT_WAIT_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        let settled = false;
        // Ensures resolve/reject and the exit-listener cleanup happen exactly once, no matter which path wins.
        const settle = (action) => {
            if (settled) return;
            settled = true;
            child.off('exit', onExit);
            action();
        };
        const onExit = (code) => settle(() => reject(new Error(`SSH-Tunnel wurde vorzeitig beendet (Exit-Code ${code})`)));
        child.once('exit', onExit);

        const tryConnect = () => {
            const socket = net.connect(port, '127.0.0.1');
            socket.once('connect', () => {
                socket.end();
                settle(resolve);
            });
            socket.once('error', () => {
                socket.destroy();
                if (Date.now() - start > timeoutMs) {
                    settle(() => reject(new Error('Timeout beim Warten auf den SSH-Tunnel')));
                    return;
                }
                setTimeout(tryConnect, PORT_POLL_INTERVAL_MS);
            });
        };
        tryConnect();
    });
}

// Prompts for a value interactively without echoing the input (for passwords/passphrases).
// More reliable than a shell-level 'read -s', since it's always prompted in the same
// process regardless of shell/terminal session.
export function promptHidden(promptText) {
    return new Promise((resolve, reject) => {
        if (!process.stdin.isTTY) {
            reject(new Error(`Kann '${promptText.trim()}' nicht interaktiv abfragen (kein TTY) - bitte per ENV-Variable setzen.`));
            return;
        }

        process.stdout.write(promptText);
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');

        let input = '';
        const onData = (char) => {
            switch (char) {
                case '\n':
                case '\r':
                case '\u0004':
                    process.stdin.removeListener('data', onData);
                    process.stdin.setRawMode(false);
                    process.stdin.pause();
                    process.stdout.write('\n');
                    resolve(input);
                    break;
                case '\u0003':
                    process.stdout.write('\n');
                    process.exit(130);
                    break;
                case '\u007f':
                    input = input.slice(0, -1);
                    break;
                default:
                    input += char;
                    break;
            }
        };

        process.stdin.on('data', onData);
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
// Prompts interactively for the key's passphrase (leer falls keine).
export async function openSshTunnel({ sshHost, sshPort, sshUser, sshKey, dbHost, dbPort, localPort }) {
    console.log(`Baue SSH-Tunnel auf: ${sshUser}@${sshHost}:${sshPort} -> ${dbHost}:${dbPort} (lokal: ${localPort})`);
    await assertLocalPortIsFree(localPort);

    const passphrase = await promptHidden(`Passphrase fuer ${sshKey} (leer falls keine): `);
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

    const child = spawn(resolveSshBinary(), sshArgs, { stdio: ['ignore', 'ignore', 'pipe'], env });
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

    const tunnel = { child, askPassScript };
    installTunnelCleanupHandlers(tunnel);

    return tunnel;
}

// Terminates the tunnel, escalating to SIGKILL if it doesn't exit gracefully. Safe to call twice.
export async function closeSshTunnel(tunnel) {
    if (!tunnel || tunnel.closed) return;
    tunnel.closed = true;

    if (isChildRunning(tunnel.child)) {
        tunnel.child.kill('SIGTERM');
        await new Promise((resolve) => {
            const timer = setTimeout(() => {
                tunnel.child.kill('SIGKILL');
                resolve();
            }, SIGKILL_GRACE_PERIOD_MS);
            tunnel.child.once('exit', () => {
                clearTimeout(timer);
                resolve();
            });
        });
    }

    if (tunnel.askPassScript) await unlink(tunnel.askPassScript).catch(() => {});
}

function isChildRunning(child) {
    return child.exitCode === null && child.signalCode === null;
}

function installTunnelCleanupHandlers(tunnel) {
    for (const signal of ['SIGINT', 'SIGTERM']) {
        process.on(signal, () => {
            console.error(`\n${signal} empfangen, schliesse SSH-Tunnel...`);
            closeSshTunnel(tunnel)
                .catch((err) => console.error(err))
                .finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
        });
    }

    for (const event of ['uncaughtException', 'unhandledRejection']) {
        process.on(event, (err) => {
            console.error(err);
            closeSshTunnel(tunnel)
                .catch((cleanupErr) => console.error(cleanupErr))
                .finally(() => process.exit(1));
        });
    }
}
