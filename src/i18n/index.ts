import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import ar from "./ar.json";
export function createI18n(language = "en") {
  const instance = createInstance();
  void instance.use(initReactI18next).init({
    lng: language,
    fallbackLng: "en",
    resources: { en: { translation: en }, ar: { translation: ar } },
    initAsync: false,
    interpolation: { escapeValue: false },
  });
  return instance;
}
