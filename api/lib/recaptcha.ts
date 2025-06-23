export async function validateCaptcha(token: string) {
    await getGoogleCaptchaResponseV3(
        process.env.RECAPTCHA_SECRET_KEY_V3,
        token,
    );

    return {
        data: null,
        error: null,
        status: 200,
        recaptcha_result: "success",
    };
}

async function getGoogleCaptchaResponseV3(secret: string, token: string) {
    const url = new URL("https://www.google.com/recaptcha/api/siteverify");
    url.searchParams.append("secret", secret);
    url.searchParams.append("response", token);

    const recaptchaResponse = await fetch(url, {
        method: "GET",
    });

    const recaptchaData = (await recaptchaResponse.json()) as any;

    return recaptchaData;
}
