import type {
    Request,
    Response,
} from "express";

import {
    AppError,
} from "../../errors/app-error.ts";

import {
    deleteMyAccount,
    getMyAccount,
    getPrivacySettings,
    updateMyAccount,
    updatePrivacySettings,
} from "./me.service.ts";

import {
    updateMeSchema,
    updatePrivacySchema,
} from "./me.validation.ts";

function requireUser(
    request: Request,
) {
    const user = request.user;

    if (!user) {
        throw new AppError(
            "Authentication required.",
            401,
            "AUTHENTICATION_REQUIRED",
        );
    }

    return user;
}

export async function getMe(
    request: Request,
    response: Response,
): Promise<void> {
    const user = requireUser(request);

    const result = await getMyAccount(
        user.id,
    );

    response.status(200).json({
        success: true,
        data: result,
    });
}

export async function patchMe(
    request: Request,
    response: Response,
): Promise<void> {
    const user = requireUser(request);

    const input = updateMeSchema.parse(
        request.body,
    );

    const result = await updateMyAccount(
        user.id,
        input,
    );

    response.status(200).json({
        success: true,
        data: result,
        message: "Account updated successfully.",
    });
}

export async function getPrivacy(
    request: Request,
    response: Response,
): Promise<void> {
    const user = requireUser(request);

    const settings = await getPrivacySettings(
        user.id,
    );

    response.status(200).json({
        success: true,
        data: {
            privacy: settings,
        },
    });
}

export async function patchPrivacy(
    request: Request,
    response: Response,
): Promise<void> {
    const user = requireUser(request);

    const input = updatePrivacySchema.parse(
        request.body,
    );

    const settings = await updatePrivacySettings(
        user.id,
        input,
    );

    response.status(200).json({
        success: true,
        data: {
            privacy: settings,
        },
        message: "Privacy settings updated successfully.",
    });
}

export async function deleteAccount(
    request: Request,
    response: Response,
): Promise<void> {
    const user = requireUser(request);

    await deleteMyAccount(user.id);

    response.clearCookie(
        "karmass_session",
        {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite:
                process.env.NODE_ENV === "production"
                    ? "none"
                    : "lax",
            path: "/",
        },
    );

    response.status(200).json({
        success: true,
        message: "Your account has been deleted.",
    });
}