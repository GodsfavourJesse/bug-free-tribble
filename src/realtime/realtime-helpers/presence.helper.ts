import type {
    Socket,
} from "socket.io";

interface PresenceConnection {
    socketIds: Set<string>;
}

export interface PresenceStatus {
    userId: string;
    online: boolean;
    connectionCount: number;
}

export interface PresenceRegistration {
    status: PresenceStatus;
    becameOnline: boolean;
}

export interface PresenceRemoval {
    status: PresenceStatus;
    becameOffline: boolean;
}

const connectionsByUser = new Map<
    string,
    PresenceConnection
>();

function getOrCreatePresence(
    userId: string,
): PresenceConnection {
    const existing =
        connectionsByUser.get(userId);

    if (existing) {
        return existing;
    }

    const presence: PresenceConnection = {
        socketIds: new Set<string>(),
    };

    connectionsByUser.set(
        userId,
        presence,
    );

    return presence;
}

/**
 * Register an authenticated socket.
 *
 * Multiple tabs and devices belonging to the same
 * user share a single logical presence status.
 */
export function registerPresence(
    socket: Socket,
    userId: string,
): PresenceRegistration {
    const presence =
        getOrCreatePresence(userId);

    const wasOnline =
        presence.socketIds.size > 0;

    presence.socketIds.add(socket.id);

    socket.data.userId = userId;

    return {
        status: getPresenceStatus(userId),
        becameOnline: !wasOnline,
    };
}

/**
 * Remove one socket.
 *
 * A user becomes offline only when their final
 * active socket disconnects.
 */
export function unregisterPresence(
    socketId: string,
    userId: string,
): PresenceRemoval {
    const presence =
        connectionsByUser.get(userId);

    if (!presence) {
        return {
            status: {
                userId,
                online: false,
                connectionCount: 0,
            },
            becameOffline: false,
        };
    }

    presence.socketIds.delete(socketId);

    const connectionCount =
        presence.socketIds.size;

    if (connectionCount === 0) {
        connectionsByUser.delete(userId);

        return {
            status: {
                userId,
                online: false,
                connectionCount: 0,
            },
            becameOffline: true,
        };
    }

    return {
        status: {
            userId,
            online: true,
            connectionCount,
        },
        becameOffline: false,
    };
}

/**
 * Get the current presence status for one user.
 */
export function getPresenceStatus(
    userId: string,
): PresenceStatus {
    const connectionCount =
        connectionsByUser.get(userId)
            ?.socketIds.size ?? 0;

    return {
        userId,
        online: connectionCount > 0,
        connectionCount,
    };
}

/**
 * Get the presence status of multiple users.
 */
export function getPresenceStatuses(
    userIds: string[],
): PresenceStatus[] {
    return userIds.map(
        getPresenceStatus,
    );
}

/**
 * Check whether a user has an active socket.
 */
export function isUserOnline(
    userId: string,
): boolean {
    return (
        (connectionsByUser.get(userId)
            ?.socketIds.size ?? 0) > 0
    );
}