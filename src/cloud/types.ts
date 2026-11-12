export type CloudProviderId = 'google' | 'yandex';

/** Копия данных в облаке и время её последней записи (ISO 8601). */
export interface CloudFile {
  json: string;
  modifiedAt: string;
}

/** Облачное хранилище одной копии файла `exportBackup`. */
export interface CloudProvider {
  id: CloudProviderId;
  /** Название хранилища: «Google Диск». */
  label: string;
  /** Подпись кнопки входа: «Войти через Google». */
  loginLabel: string;
  /** Почта или логин владельца токена. */
  whoami(token: string): Promise<string>;
  /** Время записи копии в облаке или `null`, если копии нет. */
  stat(token: string): Promise<string | null>;
  /** Записывает копию поверх прежней и возвращает время записи. */
  upload(token: string, json: string): Promise<string>;
  /** Читает копию или возвращает `null`, если копии нет. */
  download(token: string): Promise<CloudFile | null>;
}

export class CloudError extends Error {
  /** `true` — токен больше не действует, нужен новый вход. */
  readonly unauthorized: boolean;

  constructor(message: string, unauthorized = false) {
    super(message);
    this.name = 'CloudError';
    this.unauthorized = unauthorized;
  }
}

/** Имя файла копии в обоих хранилищах. */
export const CLOUD_FILE_NAME = 'kalkulyator-kaloriynosti.json';
