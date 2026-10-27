/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * URL base del API. Vacío = mismo origen (proxy de nginx o de Vite en dev).
   * Solo se expone si el nombre empieza por VITE_.
   */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}