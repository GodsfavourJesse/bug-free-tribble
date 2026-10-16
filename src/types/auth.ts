export type AuthenticatedUser = NonNullable<
    Awaited<
        ReturnType<
            typeof import("../modules/auth/auth.service.ts").getUserFromSession
        >
    >
>;