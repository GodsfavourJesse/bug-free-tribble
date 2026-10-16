export interface AdminChallengeOption {
    id: string;
    label: string;
}

export interface AdminChallengeQuestion {
    stage: number;
    title: string;
    instruction: string;
    type: "multiple-choice" | "visual-match";
    options?: AdminChallengeOption[];
    referenceAsset?: string;
    imageOptions?: string[];
}

/**
 * Server-side question definitions.
 *
 * Never return correctAnswer to the frontend.
 */
interface QuestionDefinition {
    stage: number;
    title: string;
    instruction: string;
    type: "multiple-choice" | "visual-match";
    options?: AdminChallengeOption[];
    correctAnswer?: string;
}

export const ADMIN_SECURITY_QUESTIONS: QuestionDefinition[] = [
    {
        stage: 1,
        title: "Platform identity",
        instruction: "Which platform are you attempting to access?",
        type: "multiple-choice",
        options: [
            { id: "platform_01", label: "KARMASS" },
            { id: "platform_02", label: "A banking platform" },
            { id: "platform_03", label: "A social media platform" },
            { id: "platform_04", label: "A gaming platform" },
        ],
        correctAnswer: "platform_01",
    },
    {
        stage: 2,
        title: "Platform purpose",
        instruction: "What is the primary purpose of KARMASS?",
        type: "multiple-choice",
        options: [
            {
                id: "purpose_01",
                label: "Buying, selling, and discovering vehicles",
            },
            {
                id: "purpose_02",
                label: "Booking international flights",
            },
            {
                id: "purpose_03",
                label: "Managing hospital appointments",
            },
            {
                id: "purpose_04",
                label: "Streaming movies",
            },
        ],
        correctAnswer: "purpose_01",
    },
    {
        stage: 3,
        title: "Administrator responsibility",
        instruction:
            "Which action best describes an administrator's responsibility?",
        type: "multiple-choice",
        options: [
            {
                id: "responsibility_01",
                label:
                    "Protect the platform, review activity, and enforce policies",
            },
            {
                id: "responsibility_02",
                label: "Ignore suspicious activity",
            },
            {
                id: "responsibility_03",
                label: "Share confidential account information",
            },
            {
                id: "responsibility_04",
                label: "Bypass platform security controls",
            },
        ],
        correctAnswer: "responsibility_01",
    },
    {
        stage: 4,
        title: "Security awareness",
        instruction:
            "How should an administrator respond to a request for their password?",
        type: "multiple-choice",
        options: [
            {
                id: "security_01",
                label:
                    "Never share the password and verify unusual requests through approved channels",
            },
            {
                id: "security_02",
                label:
                    "Send the password to anyone claiming to be a colleague",
            },
            {
                id: "security_03",
                label: "Post the password in a team chat",
            },
            {
                id: "security_04",
                label: "Reuse the password in public documents",
            },
        ],
        correctAnswer: "security_01",
    },
];

/**
 * The vehicle challenge uses these asset IDs.
 *
 * Replace the IDs with the actual silhouette asset identifiers
 * used by the frontend. Each ID must map to a real image.
 */
export const VEHICLE_SILHOUETTE_ASSETS = [
    "vehicle-silhouette-01",
    "vehicle-silhouette-02",
    "vehicle-silhouette-03",
    "vehicle-silhouette-04",
    "vehicle-silhouette-05",
    "vehicle-silhouette-06",
    "vehicle-silhouette-07",
    "vehicle-silhouette-08",
] as const;

export function getAwarenessQuestion(
    stage: number,
): QuestionDefinition | undefined {
    return ADMIN_SECURITY_QUESTIONS.find(
        (question) => question.stage === stage,
    );
}

export function isCorrectAwarenessAnswer(
    stage: number,
    answer: string,
): boolean {
    const question = getAwarenessQuestion(stage);

    return question?.correctAnswer === answer.trim().toLowerCase();
}