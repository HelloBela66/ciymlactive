import type { SQLiteDatabase } from 'expo-sqlite';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { BookCapsuleRepository } from '@/data/repositories/BookCapsuleRepository';
import { UserBookRepository } from '@/data/repositories/UserBookRepository';
import { queryKeys } from '@/lib/queryKeys';
import { createLogger } from '@/lib/logger';
import { useMutationErrorHandler } from '@/lib/useMutationErrorHandler';
import { fromIso, nowIso } from '@/lib/dateUtils';
import {
  calculateCapsuleReopenAt,
  normalizeCapsuleText,
  validateCapsuleContent,
} from '@/lib/bookCapsule';
import {
  requestNotificationPermissionAsync,
  hasNotificationPermissionAsync,
  scheduleDateReminderAsync,
  cancelReminderAsync,
} from '@/lib/notifications';
import type { BookCapsule, CapsuleReopenOption } from '@/types/bookCapsule';
import type { JournalEntryKind } from '@/types/journalEntry';

const log = createLogger('features/memory/bookCapsule');

/** «Час згадати книгу» — той самий заголовок для будь-якої капсули (п.10 ТЗ), лише тіло
 * підставляє назву книги. */
function buildNotificationContent(workTitle: string): { title: string; body: string } {
  return { title: 'Час згадати книгу', body: `Пам'ятаєш «${workTitle}»? Твоя капсула вже чекає.` };
}

/**
 * П.10-11 ТЗ: планує нагадування, ЯКЩО `reopenOption !== 'none'` і дозвіл на сповіщення
 * надано; інакше (дозволу немає) капсула все одно створюється/зберігається, лише без
 * запланованого сповіщення — `notificationSkipped: true` сигналізує UI показати non-blocking
 * повідомлення (п.11), а не заблокувати збереження. НІКОЛИ не запитує дозвіл повторно, якщо
 * він уже відхилений (`requestNotificationPermissionAsync` сама не перепитує, коли вже
 * `granted`; коли ні — один системний запит, як і всюди в застосунку).
 */
async function scheduleIfNeeded(
  reopenOption: CapsuleReopenOption,
  reopenAt: string | null,
  workTitle: string,
): Promise<{ notificationIdentifier: string | null; notificationSkipped: boolean }> {
  if (reopenOption === 'none' || reopenAt == null) {
    return { notificationIdentifier: null, notificationSkipped: false };
  }
  const granted = await requestNotificationPermissionAsync();
  if (!granted) {
    return { notificationIdentifier: null, notificationSkipped: true };
  }
  const { title, body } = buildNotificationContent(workTitle);
  const notificationIdentifier = await scheduleDateReminderAsync(fromIso(reopenAt), title, body);
  return { notificationIdentifier, notificationSkipped: false };
}

/** «Поточна» (найновіша) капсула книги, якщо вона вже створена — Book Memory/Completion
 * screens (Фаза 4 ТЗ). */
export function useBookCapsule(userBookId: string | undefined) {
  return useQuery<BookCapsule | null>({
    queryKey: queryKeys.bookCapsule.byUserBook(userBookId ?? ''),
    queryFn: async () => {
      if (!userBookId) return null;
      const db = await getDatabase();
      return BookCapsuleRepository.getByUserBookId(db, userBookId);
    },
    enabled: !!userBookId,
  });
}

export interface CapsuleFormInput {
  userBookId: string;
  workTitle: string;
  lastingThought: string | null;
  oneSentenceMemory: string | null;
  favoriteCharacterText: string | null;
  journalEntryKind: JournalEntryKind | null;
  journalEntryId: string | null;
  reopenOption: CapsuleReopenOption;
  completedAt: string | null;
}

export interface SaveCapsuleResult {
  capsule: BookCapsule;
  notificationSkipped: boolean;
}

/** Створення (п.4-15 ТЗ): нормалізує текст, валідує (п.14 — принаймні одне змістовне поле),
 * рахує `reopenAt` від "зараз" (це і є момент створення), планує нагадування, якщо потрібно. */
export function useCreateBookCapsule() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося зберегти капсулу.');
  return useMutation<SaveCapsuleResult, Error, CapsuleFormInput>({
    mutationFn: async (input) => {
      const lastingThought = normalizeCapsuleText(input.lastingThought);
      const oneSentenceMemory = normalizeCapsuleText(input.oneSentenceMemory);
      const favoriteCharacterText = normalizeCapsuleText(input.favoriteCharacterText);
      if (
        !validateCapsuleContent({
          lastingThought,
          oneSentenceMemory,
          favoriteCharacterText,
          journalEntryId: input.journalEntryId,
        })
      ) {
        throw new Error('Капсула не може бути порожньою — додай хоча б одну деталь.');
      }

      const createdAt = new Date();
      const reopenAt = calculateCapsuleReopenAt(input.reopenOption, createdAt);
      const { notificationIdentifier, notificationSkipped } = await scheduleIfNeeded(
        input.reopenOption,
        reopenAt,
        input.workTitle,
      );

      const db = await getDatabase();
      const capsule = await BookCapsuleRepository.create(db, {
        userBookId: input.userBookId,
        lastingThought,
        oneSentenceMemory,
        favoriteCharacterText,
        favoriteLoreEntityId: null,
        journalEntryKind: input.journalEntryKind,
        journalEntryId: input.journalEntryId,
        reopenOption: input.reopenOption,
        reopenAt,
        notificationIdentifier,
        completedAt: input.completedAt,
      });

      return { capsule, notificationSkipped };
    },
    onSuccess: ({ capsule }) => {
      queryClient.setQueryData(queryKeys.bookCapsule.byUserBook(capsule.userBookId), capsule);
    },
    onError,
  });
}

export interface UpdateCapsuleFormInput {
  id: string;
  userBookId: string;
  workTitle: string;
  lastingThought: string | null;
  oneSentenceMemory: string | null;
  favoriteCharacterText: string | null;
  journalEntryKind: JournalEntryKind | null;
  journalEntryId: string | null;
  reopenOption: CapsuleReopenOption;
}

/** Редагування (п.17 ТЗ): дата нагадування завжди рахується від ОРИГІНАЛЬНОГО `createdAt`
 * капсули (`docs/BOOK_CAPSULES.md`), не від моменту редагування. Перепланування сповіщення —
 * ЛИШЕ коли `reopenOption` справді змінився (п.17/35 — без дублювання при звичайному
 * збереженні тих самих налаштувань). */
export function useUpdateBookCapsule() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося оновити капсулу.');
  return useMutation<SaveCapsuleResult, Error, UpdateCapsuleFormInput>({
    mutationFn: async (input) => {
      const lastingThought = normalizeCapsuleText(input.lastingThought);
      const oneSentenceMemory = normalizeCapsuleText(input.oneSentenceMemory);
      const favoriteCharacterText = normalizeCapsuleText(input.favoriteCharacterText);
      if (
        !validateCapsuleContent({
          lastingThought,
          oneSentenceMemory,
          favoriteCharacterText,
          journalEntryId: input.journalEntryId,
        })
      ) {
        throw new Error('Капсула не може бути порожньою — додай хоча б одну деталь.');
      }

      const db = await getDatabase();
      const existing = await BookCapsuleRepository.getById(db, input.id);
      if (!existing) {
        throw new Error('Капсулу не знайдено.');
      }

      const optionChanged = existing.reopenOption !== input.reopenOption;
      let reopenAt = existing.reopenAt;
      let notificationIdentifier = existing.notificationIdentifier;
      let notificationSkipped = false;

      if (optionChanged) {
        await cancelReminderAsync(existing.notificationIdentifier);
        reopenAt = calculateCapsuleReopenAt(input.reopenOption, fromIso(existing.createdAt));
        const scheduled = await scheduleIfNeeded(input.reopenOption, reopenAt, input.workTitle);
        notificationIdentifier = scheduled.notificationIdentifier;
        notificationSkipped = scheduled.notificationSkipped;
      }

      await BookCapsuleRepository.update(db, {
        id: input.id,
        lastingThought,
        oneSentenceMemory,
        favoriteCharacterText,
        favoriteLoreEntityId: existing.favoriteLoreEntityId,
        journalEntryKind: input.journalEntryKind,
        journalEntryId: input.journalEntryId,
        reopenOption: input.reopenOption,
        reopenAt,
        notificationIdentifier,
      });

      const capsule: BookCapsule = {
        ...existing,
        lastingThought,
        oneSentenceMemory,
        favoriteCharacterText,
        journalEntryKind: input.journalEntryKind,
        journalEntryId: input.journalEntryId,
        reopenOption: input.reopenOption,
        reopenAt,
        notificationIdentifier,
        updatedAt: nowIso(),
      };
      return { capsule, notificationSkipped };
    },
    onSuccess: ({ capsule }) => {
      queryClient.setQueryData(queryKeys.bookCapsule.byUserBook(capsule.userBookId), capsule);
    },
    onError,
  });
}

/** Видалення (п.18 ТЗ): скасовує заплановане сповіщення, видаляє РЯДОК капсули, нічого більше
 * не чіпає (журнал/Book Memory/статус книги — незмінні). `invalidateQueries`, а не
 * оптимістичний `setQueryData(null)` — на відміну від `useRemoveBookMemory` (щонайбільше один
 * спогад на книгу), капсул на книгу технічно може бути кілька (п.13 ТЗ, перечитування), тож
 * після видалення "поточної" запит сам заново визначає наступну найновішу, якщо вона є. */
export function useRemoveBookCapsule() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося видалити капсулу.');
  return useMutation<void, Error, { id: string; userBookId: string }>({
    mutationFn: async ({ id }) => {
      const db = await getDatabase();
      const existing = await BookCapsuleRepository.getById(db, id);
      if (existing) {
        await cancelReminderAsync(existing.notificationIdentifier);
      }
      await BookCapsuleRepository.remove(db, id);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bookCapsule.byUserBook(variables.userBookId) });
    },
    onError,
  });
}

/** П.19 ТЗ — позначає капсулу переглянутою ПІСЛЯ настання `reopenAt` ("viewed" стан, не
 * плутати з майбутнім повноцінним "completed recall" — окрема Фаза Recall). Викликається
 * Capsule View screen'ом (`app/capsule/[workId].tsx`) лише коли `isCapsuleDue` вже `true` і
 * `openedAt` ще `null` — звичайний перегляд до настання дати нагадування НЕ рахується. */
export function useMarkCapsuleOpened() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string; userBookId: string }>({
    mutationFn: async ({ id }) => {
      const db = await getDatabase();
      await BookCapsuleRepository.markOpened(db, id, nowIso());
    },
    onSuccess: (_data, variables) => {
      queryClient.setQueryData<BookCapsule | null>(
        queryKeys.bookCapsule.byUserBook(variables.userBookId),
        (current) => (current && current.id === variables.id ? { ...current, openedAt: nowIso() } : current),
      );
    },
    // Тиха, необов'язкова фонова дія (не форма/явна дія користувача) — без `useMutationErrorHandler`
    // (без toast'у при збої): показувати помилку через "не вдалось позначити переглянутим" було
    // б зайвим шумом для дії, яку користувач навіть не ініціював напряму.
  });
}

/**
 * П.36 ТЗ: JSON-бекап відновлює ДАНІ капсул, але не OS-розклад сповіщень (`notification_identifier`
 * у файлі належить іншому запуску/пристрою й нічого вже не заплановано). Викликається з
 * `useRestoreBackup.onSuccess` (`src/features/backup/useBackup.ts`) одразу після `restoreAll`:
 * для кожної капсули з `reopenAt` у МАЙБУТНЬОМУ (минулі свідомо пропускаються, п.36) планує
 * нове сповіщення й оновлює `notification_identifier` на щойно отриманий. Тихо, БЕЗ системного
 * запиту дозволу (`hasNotificationPermissionAsync`, не `requestNotificationPermissionAsync`) —
 * якщо дозволу немає, капсули просто лишаються без запланованого нагадування (той самий
 * non-blocking підхід, що й п.11 ТЗ при звичайному створенні).
 *
 * Капсул мало (п.45 ТЗ) — послідовний N+1 (`UserBookRepository.getByIdWithDetails` на назву
 * книги для тексту сповіщення) тут свідомо прийнятний: разовий крок одразу після restore, не
 * "гарячий" шлях застосунку.
 */
export async function rebuildCapsuleRemindersAsync(db: SQLiteDatabase): Promise<void> {
  const capsules = await BookCapsuleRepository.listWithFutureReminder(db, nowIso());
  if (capsules.length === 0) return;

  const granted = await hasNotificationPermissionAsync();
  if (!granted) return;

  for (const capsule of capsules) {
    if (capsule.reopenAt == null) continue;
    const userBook = await UserBookRepository.getByIdWithDetails(db, capsule.userBookId);
    if (!userBook) continue;

    const { title, body } = buildNotificationContent(userBook.work.title);
    const notificationIdentifier = await scheduleDateReminderAsync(fromIso(capsule.reopenAt), title, body);
    await BookCapsuleRepository.setNotificationIdentifier(db, capsule.id, notificationIdentifier);
  }
}
