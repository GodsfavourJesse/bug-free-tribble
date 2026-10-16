import type { ClaimedJob, JobType } from "./job.queue.ts";
import { handleNotificationJob } from "./notification.handler.ts";

export type JobHandler = (
    job: ClaimedJob,
) => Promise<void>;

export type JobHandlerRegistry = Partial<
    Record<JobType, JobHandler>
> ;

export function createJobHandlerRegistry(
    handlers: JobHandlerRegistry,
): JobHandlerRegistry {
    const registry: JobHandlerRegistry = {};

    for (const [type, handler] of Object.entries(handlers)) {
        if (typeof handler !== "function") {
            throw new Error(
                `Invalid job handler registered for "${type}".`,
            );
        }

        registry[type as JobType] = handler;
    }

    return Object.freeze(registry);

}

export function getSupportedJobTypes(
    registry: JobHandlerRegistry,
): JobType[] {
    return (
        Object.keys(registry) as JobType[]
    ).filter((type) => typeof registry[type] === "function");
}

export async function executeJobHandler(
    job: ClaimedJob,
    registry: JobHandlerRegistry,
): Promise<void> {
    const handler = registry[job.type];

    if (!handler) {
        throw new Error(
            `No handler is registered for job type "${job.type}".`,
        );
    }

    await handler(job);

}

export const notificationJobHandlers = createJobHandlerRegistry({
    NOTIFICATION_DISPATCH: handleNotificationJob,
});