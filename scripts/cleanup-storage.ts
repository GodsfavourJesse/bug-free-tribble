import {
    cleanupOrphanedDealerDocuments,
} from "../src/infrastructure/storage/storage-cleanup.service.ts";

async function main(): Promise<void> {
    console.log(
        "[storage-cleanup] Starting orphan cleanup...",
    );

    const result =
        await cleanupOrphanedDealerDocuments();

    console.log(
        "[storage-cleanup] Cleanup completed.",
    );

    console.log(
        JSON.stringify(
            result,
            null,
            2,
        ),
    );

    if (result.failed > 0) {
        console.error(
            `[storage-cleanup] ${result.failed} object(s) failed to delete.`,
        );

        process.exitCode = 1;
    }
}

main().catch(
    (error: unknown) => {
        console.error(
            "[storage-cleanup] Cleanup failed.",
            error,
        );

        process.exitCode = 1;
    },
);