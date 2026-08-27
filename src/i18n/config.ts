import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zhHK from "./locales/zh-HK.json";
import en from "./locales/en.json";

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: {
      "zh-HK": { translation: zhHK },
      en: { translation: en },
    },
    lng: (typeof window !== "undefined" && (localStorage.getItem("lang") as "zh-HK" | "en")) || "zh-HK",
    fallbackLng: "zh-HK",
    interpolation: { escapeValue: false },
  });
}

export default i18n;
