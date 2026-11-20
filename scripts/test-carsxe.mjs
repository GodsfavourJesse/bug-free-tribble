import "dotenv/config";

const apiKey = process.env.CARSXE_API_KEY;

if (!apiKey) {
    console.error("CARSXE_API_KEY is missing.");
    process.exit(1);
}

const url = new URL(
    "https://api.carsxe.com/v1/ymm-options"
);

url.searchParams.set("key", apiKey);
url.searchParams.set("dimension", "years");

console.log("Testing CarsXE connection...");
console.log("Host:", url.hostname);
console.log("Timeout: 30 seconds");

const startedAt = Date.now();

try {
    const response = await fetch(url, {
        method: "GET",
        headers: {
            Accept: "application/json",
        },
        signal: AbortSignal.timeout(30_000),
    });

    const body = await response.text();

    console.log("\nHTTP Status:", response.status);
    console.log("Duration:", Date.now() - startedAt, "ms");

    try {
        const data = JSON.parse(body);

        console.log(
            "Response keys:",
            Object.keys(data)
        );

        console.log(
            "Response preview:",
            JSON.stringify(data).slice(0, 1500)
        );

    } catch {
        console.log("Response is not valid JSON.");
        console.log(body.slice(0, 1000));
    }

} catch (error) {
    console.error("\nConnection failed.");
    console.error("Error name:", error.name);
    console.error("Error message:", error.message);
    console.error("Error cause:", error.cause);
}