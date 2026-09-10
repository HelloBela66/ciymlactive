import { useErrorToast } from '@/design/ErrorToastProvider';
import type { Logger } from './logger';

/**
 * Спільний `onError` для `useMutation` (Milestone 8 — аудит показав: ЖОДНА з ~29 мутацій у
 * застосунку не мала `onError`, тож збій губився мовчки). Логує через модульний логер фічі
 * (`createLogger('...')`, той самий, що вже викликається на верхньому рівні кожного файлу з
 * хуками) і показує користувачу короткий тост через `useErrorToast()` (`ErrorToastProvider`,
 * підключений у `app/_layout.tsx`) — замінює однакові 3-4 рядки, які інакше довелось би
 * повторювати в кожному з ~29 місць.
 *
 * `userMessage` — коротке, конкретне повідомлення про ЩО саме не вдалось (не загальне
 * "Сталася помилка") — легше зрозуміти, що саме варто повторити.
 */
export function useMutationErrorHandler(log: Logger, userMessage: string) {
  const { showError } = useErrorToast();
  return (error: unknown) => {
    log.error('Мутація впала', { error: error instanceof Error ? error.message : String(error) });
    showError(userMessage);
  };
}
