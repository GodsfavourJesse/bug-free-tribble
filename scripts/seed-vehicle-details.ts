import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    importVehicleCatalog,
} from "./vehicle-data/importer.ts";

import {
    generateVehicleCatalogReport,
} from "./vehicle-data/catalog-report.ts";

import {
    validateVehicleCatalogSeed,
} from "./vehicle-data/validation.ts";

import { closeDatabase } from "../src/database/index.ts";

const currentDirectory = path.dirname(
    fileURLToPath(import.meta.url),
);

const catalogDirectory = path.join(
    currentDirectory,
    "vehicle-data",
    "catalog",
);

async function findJsonFiles(
    directory: string,
): Promise<string[]> {
    const entries = await readdir(
        directory,
        { withFileTypes: true },
    );

    const files: string[] = [];

    for (const entry of entries) {
        const fullPath = path.join(
            directory,
            entry.name,
        );

        if (entry.isDirectory()) {
            files.push(
                ...await findJsonFiles(fullPath),
            );

            continue;
        }

        if (
            entry.isFile() &&
            entry.name.endsWith(".json")
        ) {
            files.push(fullPath);
        }
    }

    return files.sort();
}

async function seedVehicleDetails() {
    console.log(
        "\nStarting KARMASS vehicle catalog import...\n",
    );

    let imported = 0;
    let failed = 0;

    const files = await findJsonFiles(
        catalogDirectory,
    );

    if (files.length === 0) {
        console.warn(
            "No vehicle research JSON files found.",
        );

        console.warn(
            `Expected catalog directory: ${catalogDirectory}`,
        );

        return;
    }

    for (const file of files) {
        try {
            const raw = await readFile(
                file,
                "utf8",
            );

            const parsed = JSON.parse(raw) as unknown;

            validateVehicleCatalogSeed(parsed);

            console.log(
                `Importing ${path.relative(catalogDirectory, file)}`,
            );

            await importVehicleCatalog(parsed);

            imported++;
        } catch (error) {
            failed++;

            console.error(
                `\nFailed to import ${file}:`,
                error,
            );
        }
    }

    console.log("\nVehicle catalog import completed.\n");

    console.table({
        filesFound: files.length,
        filesImported: imported,
        filesFailed: failed,
    });

    await generateVehicleCatalogReport();

    if (failed > 0) {
        throw new Error(
            `${failed} vehicle catalog file(s) failed to import.`,
        );
    }
}

seedVehicleDetails()
    .catch((error: unknown) => {
        console.error(
            "\nVehicle catalog seed failed:",
            error,
        );

        process.exitCode = 1;
    })
    .finally(async () => {
        await closeDatabase();
    });