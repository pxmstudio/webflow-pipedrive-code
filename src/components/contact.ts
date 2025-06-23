import { handleRecaptcha } from "../utils/recaptcha";

const ContactForm = (form: HTMLFormElement) => {
  let isSubmitting = false;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (isSubmitting) {
      console.error("Form already submitted");
      return;
    }

    const submitButton = form.querySelector<HTMLButtonElement>(
      'input[type="submit"], button[type="submit"]',
    );

    if (!submitButton) {
      console.error("Submit button not found");
      return;
    }

    const errorEl = form.parentElement?.querySelector<HTMLElement>(
      ".w-form-fail",
    );

    const redirectUrl = form.getAttribute("data-redirect");

    const textEl = form.querySelector<HTMLElement>("[data-text]");
    const originalText = textEl?.innerHTML;

    const formData = new FormData(form);

    isSubmitting = true;

    if (textEl) {
      textEl.innerHTML = "Loading...";
    }

    if (submitButton) {
      submitButton.disabled = true;
    }

    const gRecaptchaData = await handleRecaptcha();

    if (!gRecaptchaData) {
      isSubmitting = false;
      submitButton.disabled = false;
      return;
    }

    formData.set("g-recaptcha-response", gRecaptchaData.response);
    formData.set(
      "source",
      form.getAttribute("data-name") || "Form does not have a name",
    );

    const response = await handleFormSubmit(formData);

    if (response.error) {
      console.error(response.error);

      if (errorEl) {
        errorEl.style.display = "block";
        errorEl.innerHTML = "Error submitting form. Please try again later.";
      }

      isSubmitting = false;
      submitButton.disabled = false;
      return;
    }

    if (errorEl) {
      errorEl.style.display = "none";
    }

    if (redirectUrl) {
      window.location.href = redirectUrl;
      return;
    }

    const successEl = form.parentElement?.querySelector<HTMLElement>(
      ".w-form-done",
    );

    if (successEl) {
      successEl.style.display = "block";
    }

    form.style.display = "none";

    if (textEl) {
      textEl.innerHTML = originalText || "";
    }

    isSubmitting = false;
    submitButton.disabled = false;
  });
};

export default ContactForm;

async function handleFormSubmit(formData: FormData) {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_API_URL}/api/form-submission?source=contact`,
      {
        method: "POST",
        body: formData,
      },
    );

    const responseData = await response.json();

    return responseData;
  } catch (error) {
    console.error(`${error}`);
    return null;
  }
}
