export const GoogleRecaptcha = async () => {
  if (!window.Env || !window.Env.RECAPTCHA_V3_SITE_KEY) {
    console.error("RECAPTCHA_V3_SITE_KEY is not set");
    return;
  }

  injectV3(window.Env.RECAPTCHA_V3_SITE_KEY.trim());
  window.grecaptcha_version = "3";
};

export const injectV3 = (siteKey: string) => {
  const script = document.createElement("script");
  script.src =
    `https://www.google.com/recaptcha/api.js?render=${siteKey.trim()}`;
  script.defer = true;
  document.head.appendChild(script);
};

export async function handleRecaptcha() {
  if (grecaptcha) {
    if (!window.Env || !window.Env.RECAPTCHA_V3_SITE_KEY) {
      console.error("RECAPTCHA_V3_SITE_KEY is not set");
      return;
    }

    const siteKey = window.Env.RECAPTCHA_V3_SITE_KEY;
    const token = await grecaptcha.execute(siteKey, { action: "submit" });
    if (token) {
      return {
        response: token,
      };
    }
  }

  return null;
}

export const formHandleRecaptcha = async (
  formData: FormData,
  form: HTMLFormElement,
) => {
  const gRecaptchaData = await handleRecaptcha();

  if (!gRecaptchaData) {
    console.error("Recaptcha is not set");
    throw new Error("Recaptcha is not set");
  }

  formData.set("g-recaptcha-response", gRecaptchaData.response);
  formData.set(
    "source",
    form.getAttribute("data-name") || "Form does not have a name",
  );
};
