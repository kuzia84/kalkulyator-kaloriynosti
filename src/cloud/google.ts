import { cloudFetch } from './http';
import { CLOUD_FILE_NAME, type CloudProvider } from './types';

const LABEL = 'Google Диск';
const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const USERINFO = 'https://www.googleapis.com/oauth2/v3/userinfo';

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
/** `drive.file` открывает приложению только файлы, которые оно создало само. */
export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const GOOGLE_SCOPE = `${GOOGLE_DRIVE_SCOPE} email`;

interface DriveFile {
  id: string;
  modifiedTime: string;
}

function auth(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

async function findFile(token: string): Promise<DriveFile | null> {
  const q = `name = '${CLOUD_FILE_NAME}' and trashed = false`;
  const url = `${API}?${new URLSearchParams({
    q,
    spaces: 'drive',
    orderBy: 'modifiedTime desc',
    pageSize: '1',
    fields: 'files(id,modifiedTime)',
  })}`;
  const res = await cloudFetch(LABEL, url, { headers: auth(token) });
  const data = (await res.json()) as { files?: DriveFile[] };
  return data.files?.[0] ?? null;
}

async function createFile(token: string, json: string): Promise<DriveFile> {
  const boundary = `kk-${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({ name: CLOUD_FILE_NAME, mimeType: 'application/json' });
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${json}\r\n--${boundary}--`;
  const res = await cloudFetch(LABEL, `${UPLOAD}?uploadType=multipart&fields=id,modifiedTime`, {
    method: 'POST',
    headers: { ...auth(token), 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  return (await res.json()) as DriveFile;
}

async function updateFile(token: string, id: string, json: string): Promise<DriveFile> {
  const res = await cloudFetch(
    LABEL,
    `${UPLOAD}/${encodeURIComponent(id)}?uploadType=media&fields=id,modifiedTime`,
    {
      method: 'PATCH',
      headers: { ...auth(token), 'Content-Type': 'application/json' },
      body: json,
    },
  );
  return (await res.json()) as DriveFile;
}

export const google: CloudProvider = {
  id: 'google',
  label: LABEL,
  loginLabel: 'Войти через Google',

  async whoami(token) {
    const res = await cloudFetch(LABEL, USERINFO, { headers: auth(token) });
    const data = (await res.json()) as { email?: string };
    return data.email ?? '';
  },

  async stat(token) {
    return (await findFile(token))?.modifiedTime ?? null;
  },

  async upload(token, json) {
    const existing = await findFile(token);
    const saved = existing
      ? await updateFile(token, existing.id, json)
      : await createFile(token, json);
    return saved.modifiedTime;
  },

  async download(token) {
    const file = await findFile(token);
    if (!file) return null;
    const res = await cloudFetch(LABEL, `${API}/${encodeURIComponent(file.id)}?alt=media`, {
      headers: auth(token),
    });
    return { json: await res.text(), modifiedAt: file.modifiedTime };
  },
};
