import { GoogleRecaptcha } from "./recaptcha";

const middleware = () => {
  injectEnv();
  GoogleRecaptcha();
};

export default middleware;

const injectEnv = () => {
  window.Env = {
    RECAPTCHA_V3_SITE_KEY: import.meta.env.VITE_RECAPTCHA_SITE_KEY_V3,
  };
};
