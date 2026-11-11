import fs from "node:fs";
import path from "node:path";

const DATA_DIRECTORY = path.resolve(
    process.cwd(),
    "src/data/locations"
);

const SOURCE_FILE = path.join(
    DATA_DIRECTORY,
    "all-lga-source.json"
);

const OUTPUT_FILE = path.join(
    DATA_DIRECTORY,
    "nigeria-lgas.json"
);

interface AdministrativeRecord {
    id: string;
    level: number;

    name: {
        en?: string;
        local?: string;
        slug?: string;
    };

    parent?: {
        id?: string;
        name?: {
            en?: string;
        };
    } | null;

    ancestors?: Array<{
        id?: string;
        level?: number;
        name?: {
            en?: string;
        };
    }>;
}

const REQUIRED_STATES = [
    "Abia",
    "Adamawa",
    "Akwa Ibom",
    "Anambra",
    "Bauchi",
    "Bayelsa",
    "Benue",
    "Borno",
    "Cross River",
    "Delta",
    "Ebonyi",
    "Edo",
    "Ekiti",
    "Enugu",
    "FCT",
    "Gombe",
    "Imo",
    "Jigawa",
    "Kaduna",
    "Kano",
    "Katsina",
    "Kebbi",
    "Kogi",
    "Kwara",
    "Lagos",
    "Nasarawa",
    "Niger",
    "Ogun",
    "Ondo",
    "Osun",
    "Oyo",
    "Plateau",
    "Rivers",
    "Sokoto",
    "Taraba",
    "Yobe",
    "Zamfara",
] as const;

/**
 * Derives the valid Nigerian state names directly
 * from REQUIRED_STATES.
 */
type NigerianState = (typeof REQUIRED_STATES)[number];

/**
 * Strongly typed state-to-LGA catalogue.
 */
type NigerianLocationCatalogue = Record<
    NigerianState,
    string[]
>;

/**
 * Normalizes state names from the source dataset.
 *
 * Handles:
 * - Federal Capital Territory
 * - Abuja
 * - FCT
 * - Different casing and whitespace
 */
function normalizeStateName(name: string): string {
    const normalized = name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");

    if (
        normalized === "federal capital territory" ||
        normalized === "abuja" ||
        normalized === "fct"
    ) {
        return "FCT";
    }

    return (
        REQUIRED_STATES.find(
            (state) => state.toLowerCase() === normalized
        ) ?? name.trim()
    );
}

/**
 * Resolves the parent state of an LGA record.
 */
function getParentState(
    record: AdministrativeRecord
): string | null {
    const ancestor = record.ancestors?.find(
        (item) => item.level === 1
    );

    const stateName =
        ancestor?.name?.en ??
        record.parent?.name?.en;

    return stateName
        ? normalizeStateName(stateName)
        : null;
}

/**
 * Checks whether a resolved state belongs
 * to the official Nigerian state catalogue.
 */
function isNigerianState(
    state: string
): state is NigerianState {
    return REQUIRED_STATES.includes(
        state as NigerianState
    );
}

/**
 * Generates the application-ready Nigerian
 * state-to-LGA catalogue.
 */
function main(): void {
    // Ensure the source dataset exists.
    if (!fs.existsSync(SOURCE_FILE)) {
        throw new Error(
            `Source dataset not found: ${SOURCE_FILE}`
        );
    }

    // Read the original administrative dataset.
    const parsedSource: unknown = JSON.parse(
        fs.readFileSync(SOURCE_FILE, "utf-8")
    );

    if (!Array.isArray(parsedSource)) {
        throw new Error(
            "Invalid source dataset. Expected an array of administrative records."
        );
    }

    const source =
        parsedSource as AdministrativeRecord[];

    // Initialize all 37 state/FCT entries.
    const result: NigerianLocationCatalogue =
        Object.fromEntries(
            REQUIRED_STATES.map(
                (state) => [state, [] as string[]]
            )
        ) as NigerianLocationCatalogue;

    // Process every LGA record.
    for (const record of source) {
        // Level 2 represents Local Government Areas.
        if (record.level !== 2) {
            continue;
        }

        const lgaName = record.name?.en?.trim();

        const stateName = getParentState(record);

        if (!lgaName || !stateName) {
            throw new Error(
                `Could not resolve state/LGA relationship for record ${record.id}`
            );
        }

        // Validate the resolved state.
        if (!isNigerianState(stateName)) {
            throw new Error(
                `Unknown state "${stateName}" for LGA "${lgaName}"`
            );
        }

        // Add the LGA to its corresponding state.
        result[stateName].push(lgaName);
    }

    // Remove duplicates and sort LGAs alphabetically.
    for (const state of REQUIRED_STATES) {
        result[state] = [
            ...new Set(result[state]),
        ].sort((a, b) => a.localeCompare(b));
    }

    // Calculate the total number of LGAs.
    const totalLGAs = Object.values(result).reduce(
        (total, lgas) => total + lgas.length,
        0
    );

    // Verify the expected total of 774 LGAs.
    if (totalLGAs !== 774) {
        throw new Error(
            `Expected 774 LGAs, but generated ${totalLGAs}. Check the source dataset.`
        );
    }

    // Verify all 36 states and the FCT exist.
    if (Object.keys(result).length !== 37) {
        throw new Error(
            "Expected exactly 37 state/FCT entries."
        );
    }

    // Ensure every state has at least one LGA.
    for (const state of REQUIRED_STATES) {
        if (result[state].length === 0) {
            throw new Error(
                `No LGAs found for ${state}.`
            );
        }
    }

    // Write the generated catalogue.
    fs.writeFileSync(
        OUTPUT_FILE,
        JSON.stringify(result, null, 2),
        "utf-8"
    );

    // Report generation results.
    console.log(
        "\nNigeria location catalogue generated successfully."
    );

    console.log(
        `States/FCT: ${Object.keys(result).length}`
    );

    console.log(
        `Total LGAs: ${totalLGAs}`
    );

    console.log(
        `Rivers LGAs: ${result.Rivers.length}`
    );

    console.log(
        `Output: ${OUTPUT_FILE}\n`
    );
}

main();