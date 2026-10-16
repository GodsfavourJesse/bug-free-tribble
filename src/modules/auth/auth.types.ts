export interface SessionMetadata {
    userAgent?: string;
    ipAddress?: string;
}

export interface RegisterUserInput {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string | undefined;
}

export interface LoginUserInput {
    email: string;
    password: string;
}

export interface SessionListItem {
    id: string;
    userAgent: string | null;
    ipAddress: string | null;
    createdAt: Date;
    lastUsedAt: Date | null;
    expiresAt: Date;
    revokedAt: Date | null;
    isCurrent: boolean;
}