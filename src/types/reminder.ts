import { z } from 'zod';

export const ReminderKindSchema = z.enum(['daily', 'weekday', 'loan_return', 'custom']);
export type ReminderKind = z.infer<typeof ReminderKindSchema>;

export const ReminderSchema = z.object({
  id: z.string(),
  kind: ReminderKindSchema,
  timeOfDay: z.string().nullable(), // 'HH:mm'
  weekdays: z.array(z.number().int().min(0).max(6)).nullable(), // 0=неділя..6=субота (JS Date)
  message: z.string(),
  relatedLoanId: z.string().nullable(),
  fireAt: z.string().nullable(),
  isEnabled: z.boolean(),
  notificationIdentifier: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Reminder = z.infer<typeof ReminderSchema>;

/** Вхід форми створення нагадування. У цьому milestone UI пропонує лише `daily`/`weekday` —
 * `custom` (одноразове, за `fire_at`) потребує окремого date+time picker'а, якого в
 * застосунку ще немає, а `loan_return` чекає на фічу позик (`loan`, поки не реалізована).
 * Модель і репозиторій готові під усі чотири kind — обмеження суто в UI (докладніше —
 * CHANGELOG). */
export const CreateReminderInputSchema = z.object({
  kind: z.enum(['daily', 'weekday']),
  timeOfDay: z.string(),
  weekdays: z.array(z.number().int().min(0).max(6)).nullable().default(null),
  message: z.string().min(1),
});

export type CreateReminderInput = z.infer<typeof CreateReminderInputSchema>;
