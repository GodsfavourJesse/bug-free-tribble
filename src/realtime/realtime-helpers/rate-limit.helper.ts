type RateLimitPolicy = {
    /**
     * Maximum number of events allowed
     * during the configured time window.
     */
    maxEvents: number;

    /**
     * Time window in milliseconds.
     */
    windowMs: number;
};

type EventRecord = {
    timestamps: number[];
};

const eventRecords = new Map<
    string,
    EventRecord
>();

const DEFAULT_POLICY: RateLimitPolicy = {
    maxEvents: 30,
    windowMs: 10_000,
};

const EVENT_POLICIES: Record<
    string,
    RateLimitPolicy
> = {
    "conversation:join": {
        maxEvents: 10,
        windowMs: 10_000,
    },

    "conversation:leave": {
        maxEvents: 20,
        windowMs: 10_000,
    },

    "typing:start": {
        maxEvents: 15,
        windowMs: 10_000,
    },

    "typing:stop": {
        maxEvents: 20,
        windowMs: 10_000,
    },
};

function getRecordKey(
    socketId: string,
    eventName: string,
): string {
    return `${socketId}:${eventName}`;
}

/**
 * Checks whether a socket may emit an event.
 *
 * Uses a sliding time window to limit event frequency.
 */
export function isSocketEventAllowed(
    socketId: string,
    eventName: string,
    now: number = Date.now(),
): boolean {
    const policy =
        EVENT_POLICIES[eventName] ??
        DEFAULT_POLICY;

    const key = getRecordKey(
        socketId,
        eventName,
    );

    const existing =
        eventRecords.get(key);

    const cutoff =
        now - policy.windowMs;

    const timestamps =
        existing?.timestamps.filter(
            (timestamp) => timestamp > cutoff,
        ) ?? [];

    if (timestamps.length >= policy.maxEvents) {
        eventRecords.set(key, {
            timestamps,
        });

        return false;
    }

    timestamps.push(now);

    eventRecords.set(key, {
        timestamps,
    });

    return true;
}

/**
 * Clears rate-limit records for a disconnected socket.
 */
export function clearSocketRateLimits(
    socketId: string,
): void {
    const prefix = `${socketId}:`;

    for (const key of eventRecords.keys()) {
        if (key.startsWith(prefix)) {
            eventRecords.delete(key);
        }
    }
}

/**
 * Removes expired records to keep memory usage bounded.
 *
 * Call periodically from the Socket.IO server.
 */
export function cleanupRateLimitRecords(
    now: number = Date.now(),
): void {
    for (const [key, record] of eventRecords) {
        const separator = key.indexOf(":");

        const eventName =
            separator === -1
                ? ""
                : key.slice(separator + 1);

        const policy =
            EVENT_POLICIES[eventName] ??
            DEFAULT_POLICY;

        const cutoff =
            now - policy.windowMs;

        const timestamps =
            record.timestamps.filter(
                (timestamp) => timestamp > cutoff,
            );

        if (timestamps.length === 0) {
            eventRecords.delete(key);
            continue;
        }

        eventRecords.set(key, {
            timestamps,
        });
    }
}