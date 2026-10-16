import { startImageAnalysisWorker } from "../src/modules/image-module/image-analysis/image-analysis.worker.ts";

async function main(): Promise<void> {
    await startImageAnalysisWorker();
}

main().catch((error: unknown) => {
    console.error(
        "[image-analysis-worker] Fatal worker error.",
        error,
    );

    process.exitCode = 1;
});