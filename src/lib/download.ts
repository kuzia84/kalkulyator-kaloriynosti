/** Отдаёт браузеру текст как файл для сохранения. */
export function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  // Ссылку освобождаем после того, как браузер начал загрузку.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Имя файла без символов, которые запрещены в Windows и iOS. */
export function safeFileName(name: string, fallback: string): string {
  const cleaned = name
    .replace(/[/\\:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || fallback).slice(0, 80);
}
