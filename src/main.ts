import middleware from "./utils/middleware";

window.Webflow ||= [];
window.Webflow.push(async () => {
  middleware();

  const contactForm = document.querySelector('[pxm-form="contact"]');

  if (contactForm) {
    const ContactForm = await import("./components/contact");

    ContactForm.default(contactForm as HTMLFormElement);
  }
});