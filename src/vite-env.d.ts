/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_TITLE?: string;
  readonly VITE_STORE_IDENTIFIER?: string;
  readonly VITE_DEFAULT_TAX_RATE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}