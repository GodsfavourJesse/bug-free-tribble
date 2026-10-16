import {
    createHash,
} from "node:crypto";

const BASE_URL =
    process.env.KARMASS_API_URL ??
    "http://localhost:4000/api/v1/admin/auth";

const VEHICLE_ASSETS = [
    "vehicle-silhouette-01",
    "vehicle-silhouette-02",
    "vehicle-silhouette-03",
    "vehicle-silhouette-04",
    "vehicle-silhouette-05",
    "vehicle-silhouette-06",
    "vehicle-silhouette-07",
    "vehicle-silhouette-08",
] as const;

const ANSWERS = [
    "platform_01",
    "purpose_01",
    "responsibility_01",
    "security_01",
] as const;

interface ApiResponse<T> {
    success: boolean;
    message?: string;
    data?: T;
    error?: {
        code?: string;
        message?: string;
    };
}

interface ChallengeQuestion {
    stage: number;
    title: string;
    instruction: string;
    type: "multiple-choice" | "visual-match";
    options?: Array<{
        id: string;
        label: string;
    }>;
    referenceAsset?: string;
    imageOptions?: string[];
    targetAsset?: string;
}

interface StartChallengeData {
    challengeToken: string;
    expiresAt: string;
    totalStages: number;
    question: ChallengeQuestion;
}

interface CurrentChallengeData {
    expiresAt: string;
    totalStages: number;
    completedStages: number;
    question: ChallengeQuestion;
}

interface AnswerData {
    completed: boolean;
    completedStages: number;
    totalStages: number;
    nextQuestion?: ChallengeQuestion;
}

async function request<T>(
    path: string,
    body: Record<string, unknown>,
): Promise<{
    status: number;
    body: ApiResponse<T>;
}> {
    const response = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });

    const text = await response.text();

    let parsed: ApiResponse<T>;

    try {
        parsed = JSON.parse(text) as ApiResponse<T>;
    } catch {
        throw new Error(
            `${path} returned a non-JSON response. ` +
            `HTTP ${response.status}: ${text.slice(0, 300)}`,
        );
    }

    return {
        status: response.status,
        body: parsed,
    };
}

function assert(
    condition: unknown,
    message: string,
): asserts condition {
    if (!condition) {
        throw new Error(`TEST FAILED: ${message}`);
    }
}

function expectedVisualAnswer(
    challengeToken: string,
): string {
    const tokenHash = createHash("sha256")
        .update(challengeToken, "utf8")
        .digest("hex");

    const rankedAssets = VEHICLE_ASSETS
        .map((asset) => ({
            asset,
            rank: createHash("sha256")
                .update(`${tokenHash}:${asset}`, "utf8")
                .digest("hex"),
        }))
        .sort((a, b) => a.rank.localeCompare(b.rank));

    const expected = rankedAssets[0]?.asset;

    if (!expected) {
        throw new Error(
            "Could not calculate the expected visual answer.",
        );
    }

    return expected;
}

async function main(): Promise<void> {
    console.log("\nKARMASS Admin Security Challenge Tests\n");

    // 1. Start a challenge.
    const start = await request<StartChallengeData>(
        "/security-challenge/start",
        {},
    );

    assert(
        start.status === 201 && start.body.success,
        "Challenge should start successfully.",
    );

    const startData = start.body.data;

    assert(
        startData !== undefined,
        "Start response should contain data.",
    );

    const token = startData.challengeToken;

    assert(
        typeof token === "string" && token.length >= 40,
        "Challenge token should be present and valid.",
    );

    assert(
        startData.totalStages === 5,
        "Challenge should contain five stages.",
    );

    assert(
        !("correctAnswer" in startData.question),
        "Public question must not expose correctAnswer.",
    );

    assert(
        !("targetAsset" in startData.question),
        "Public question must not expose targetAsset.",
    );

    console.log("PASS: challenge starts and token is returned.");

    // 2. Submit the four awareness answers.
    for (let index = 0; index < ANSWERS.length; index += 1) {
        const current = await request<CurrentChallengeData>(
            "/security-challenge/current",
            {
                challengeToken: token,
            },
        );

        assert(
            current.status === 200 && current.body.success,
            `Stage ${index + 1}: current question should be available.`,
        );

        const question = current.body.data?.question;

        assert(
            question?.stage === index + 1,
            `Expected stage ${index + 1}.`,
        );

        assert(
            !("correctAnswer" in question),
            `Stage ${index + 1} must not expose correctAnswer.`,
        );

        assert(
            !("targetAsset" in question),
            `Stage ${index + 1} must not expose targetAsset.`,
        );

        const result = await request<AnswerData>(
            "/security-challenge/answer",
            {
                challengeToken: token,
                answer: ANSWERS[index],
            },
        );

        assert(
            result.status === 200 && result.body.success,
            `Stage ${index + 1}: correct answer should be accepted.`,
        );

        console.log(`PASS: awareness stage ${index + 1}.`);
    }

    // 3. Retrieve the visual challenge.
    const current = await request<CurrentChallengeData>(
        "/security-challenge/current",
        {
            challengeToken: token,
        },
    );

    assert(
        current.status === 200 && current.body.success,
        "Visual challenge should be available.",
    );

    const visualQuestion = current.body.data?.question;

    assert(
        visualQuestion?.stage === 5,
        "Visual question should be stage five.",
    );

    assert(
        visualQuestion.type === "visual-match",
        "Stage five should be a visual-match challenge.",
    );

    assert(
        !("targetAsset" in visualQuestion),
        "Visual question must not expose targetAsset.",
    );

    assert(
        Array.isArray(visualQuestion.imageOptions) &&
            visualQuestion.imageOptions.length === 4,
        "Visual challenge should have four options.",
    );

    const visualAnswer = expectedVisualAnswer(token);

    assert(
        visualQuestion.imageOptions.includes(visualAnswer),
        "Expected visual answer must be one of the displayed options.",
    );

    console.log("PASS: visual challenge hides its answer.");

    // 4. Submit the visual answer.
    const finalAnswer = await request<AnswerData>(
        "/security-challenge/answer",
        {
            challengeToken: token,
            answer: visualAnswer,
        },
    );

    assert(
        finalAnswer.status === 200 && finalAnswer.body.success,
        "Correct visual answer should be accepted.",
    );

    assert(
        finalAnswer.body.data?.completed === true,
        "Challenge should be completed.",
    );

    assert(
        finalAnswer.body.data?.completedStages === 5,
        "All five stages should be completed.",
    );

    console.log("PASS: challenge completes all five stages.");

    // 5. Verify a completed challenge cannot be submitted again.
    const replay = await request<AnswerData>(
        "/security-challenge/answer",
        {
            challengeToken: token,
            answer: visualAnswer,
        },
    );

    assert(
        replay.status >= 400,
        "A completed challenge must reject further answers.",
    );

    console.log("PASS: completed challenge rejects replay.");

    console.log("\nAll challenge tests passed.\n");
}

main().catch((error: unknown) => {
    console.error("\nSecurity challenge test failed.");

    if (error instanceof Error) {
        console.error(error.message);
    } else {
        console.error(error);
    }

    process.exitCode = 1;
});