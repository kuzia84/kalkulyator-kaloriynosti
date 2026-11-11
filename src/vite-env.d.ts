/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vanillajs" />

/** Версия из package.json. Подставляет Vite при сборке. */
declare const __APP_VERSION__: string;
/** Номер сборки: короткий SHA коммита в CI, локально — dev-<время сборки>. */
declare const __BUILD_ID__: string;
/** Время сборки, ISO 8601. */
declare const __BUILT_AT__: string;
