import { access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

const KUBECTL_BINARY_CANDIDATES = ['/usr/bin/kubectl', '/bin/kubectl', '/usr/local/bin/kubectl', '/opt/homebrew/bin/kubectl'];
const REMOTE_DB_PORT = 5432;
const STARTUP_TIMEOUT_MS = 15000;
const STOP_TIMEOUT_MS = 2000;

function resolveKubectlBinary() {
    const found = KUBECTL_BINARY_CANDIDATES.find((path) => existsSync(path));
    if (!found) {
        throw new Error(`kubectl-Binary wurde in keinem der bekannten Pfade gefunden (${KUBECTL_BINARY_CANDIDATES.join(', ')})`);
    }

    return found;
}

function stopChild(child) {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
        return Promise.resolve();
    }

    return new Promise((resolveStop) => {
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
            resolveStop();
        }, STOP_TIMEOUT_MS);
        child.once('exit', () => {
            clearTimeout(timer);
            resolveStop();
        });
        child.kill('SIGTERM');
    });
}

export async function openKubectlPortForward({ environment, kubeconfig, localPort }) {
    const kubeconfigPath = resolve(kubeconfig.replace(/^~(?=$|\/)/, homedir()));
    await access(kubeconfigPath);

    const args = [
        'port-forward',
        '--kubeconfig', kubeconfigPath,
        '--address', '127.0.0.1',
        '-n', 'spsh-service',
        'svc/socat-tunneller-pg',
        `${localPort}:${REMOTE_DB_PORT}`,
    ];
    console.log(`Starte kubectl-Port-Forward fuer ${environment}: 127.0.0.1:${localPort} -> Postgres:${REMOTE_DB_PORT}`);

    const child = spawn(resolveKubectlBinary(), args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const outputDetails = () => {
        const details = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
        return details ? `\nkubectl: ${details}` : '';
    };

    try {
        await new Promise((resolveReady, rejectReady) => {
            let settled = false;
            const finish = (action) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                child.off('error', onError);
                child.off('exit', onExit);
                action();
            };
            const onError = (error) => finish(() => rejectReady(error));
            const onExit = (code, signal) => finish(() => rejectReady(
                new Error(`kubectl-Port-Forward wurde vorzeitig beendet (Exit-Code ${code}, Signal ${signal}).${outputDetails()}`),
            ));
            const timer = setTimeout(() => finish(() => rejectReady(
                new Error(`Timeout beim Starten des kubectl-Port-Forwards.${outputDetails()}`),
            )), STARTUP_TIMEOUT_MS);

            child.on('error', onError);
            child.on('exit', onExit);
            const checkReady = () => {
                const readyMessage = `Forwarding from 127.0.0.1:${localPort} -> ${REMOTE_DB_PORT}`;
                if (stdout.includes(readyMessage) || stderr.includes(readyMessage)) {
                    finish(resolveReady);
                }
            };
            child.stdout.on('data', (chunk) => {
                stdout += chunk.toString();
                checkReady();
            });
            child.stderr.on('data', (chunk) => {
                stderr += chunk.toString();
                checkReady();
            });
        });
    } catch (error) {
        await stopChild(child);
        throw error;
    }

    const onProcessExit = () => child.kill('SIGTERM');
    process.once('exit', onProcessExit);

    return { child, onProcessExit };
}

export async function closeKubectlPortForward(forward) {
    if (!forward) return;
    process.off('exit', forward.onProcessExit);
    await stopChild(forward.child);
}
