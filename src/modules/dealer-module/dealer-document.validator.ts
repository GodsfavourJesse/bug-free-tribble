export interface ValidatedDealerDocument {
    format:
        | "pdf"
        | "jpg"
        | "png"
        | "webp";
}

function hasPrefix(
    buffer: Buffer,
    signature: Buffer,
): boolean {
    if (
        buffer.length <
        signature.length
    ) {
        return false;
    }

    return buffer
        .subarray(
            0,
            signature.length,
        )
        .equals(signature);
}

export function validateDealerDocument(
    buffer: Buffer,
    mimeType: string,
): ValidatedDealerDocument {
    if (buffer.length === 0) {
        throw new Error(
            "Dealer document is empty.",
        );
    }

    if (mimeType === "application/pdf") {
        const pdfSignature =
            Buffer.from(
                "%PDF-",
                "ascii",
            );

        if (
            !hasPrefix(
                buffer,
                pdfSignature,
            )
        ) {
            throw new Error(
                "The uploaded file is not a valid PDF.",
            );
        }

        return {
            format: "pdf",
        };
    }

    if (mimeType === "image/jpeg") {
        const jpegSignature =
            Buffer.from([
                0xff,
                0xd8,
                0xff,
            ]);

        if (
            !hasPrefix(
                buffer,
                jpegSignature,
            )
        ) {
            throw new Error(
                "The uploaded file is not a valid JPEG image.",
            );
        }

        return {
            format: "jpg",
        };
    }

    if (mimeType === "image/png") {
        const pngSignature =
            Buffer.from([
                0x89,
                0x50,
                0x4e,
                0x47,
                0x0d,
                0x0a,
                0x1a,
                0x0a,
            ]);

        if (
            !hasPrefix(
                buffer,
                pngSignature,
            )
        ) {
            throw new Error(
                "The uploaded file is not a valid PNG image.",
            );
        }

        return {
            format: "png",
        };
    }

    if (mimeType === "image/webp") {
        const riff =
            Buffer.from(
                "RIFF",
                "ascii",
            );

        const webp =
            Buffer.from(
                "WEBP",
                "ascii",
            );

        const hasRiff =
            hasPrefix(
                buffer,
                riff,
            );

        const hasWebp =
            buffer.length >= 12 &&
            buffer
                .subarray(
                    8,
                    12,
                )
                .equals(webp);

        if (
            !hasRiff ||
            !hasWebp
        ) {
            throw new Error(
                "The uploaded file is not a valid WebP image.",
            );
        }

        return {
            format: "webp",
        };
    }

    throw new Error(
        "Unsupported dealer document format.",
    );
}