import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./en.json";
import es from "./es.json";

export type Idioma = "es" | "en";

export const IDIOMAS: Array<{ codigo: Idioma; etiqueta: string }> = [
  { codigo: "es", etiqueta: "Español" },
  { codigo: "en", etiqueta: "English" },
];

const CLAVE_ALMACEN = "kairo.idioma";

/** Idioma guardado en el navegador; si no hay, se deduce del del sistema. */
export function idiomaGuardado(): Idioma {
  const guardado = localStorage.getItem(CLAVE_ALMACEN);
  if (guardado === "es" || guardado === "en") return guardado;
  const delNavegador = navigator.language.toLowerCase();
  return delNavegador.startsWith("en") ? "en" : "es";
}

void i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
  },
  lng: idiomaGuardado(),
  fallbackLng: "es",
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function cambiarIdioma(codigo: Idioma): void {
  localStorage.setItem(CLAVE_ALMACEN, codigo);
  void i18n.changeLanguage(codigo);
  document.documentElement.lang = codigo;
}

export default i18n;
