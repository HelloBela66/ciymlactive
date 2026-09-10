import uuid from 'react-native-uuid';

/** Генерує UUID v4 як TEXT primary key (див. docs/DATABASE.md — навіщо не autoincrement). */
export function generateId(): string {
  return uuid.v4() as string;
}
