/**
 * Process lifecycle state shared between the server, the
 * health endpoints and the shutdown logic.
 */
let shuttingDown = false;

export function markShuttingDown(): void {
    shuttingDown = true;
}

export function isShuttingDown(): boolean {
    return shuttingDown;
}
