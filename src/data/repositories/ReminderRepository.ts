import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';
import type { Reminder, ReminderKind } from '@/types/reminder';

interface ReminderRow {
  id: string;
  kind: ReminderKind;
  time_of_day: string | null;
  weekdays: string | null;
  message: string;
  related_loan_id: string | null;
  fire_at: string | null;
  is_enabled: number;
  notification_identifier: string | null;
  created_at: string;
  updated_at: string;
}

function parseWeekdays(raw: string | null): number[] | null {
  if (raw == null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as number[]) : null;
  } catch {
    return null;
  }
}

function mapRow(row: ReminderRow): Reminder {
  return {
    id: row.id,
    kind: row.kind,
    timeOfDay: row.time_of_day,
    weekdays: parseWeekdays(row.weekdays),
    message: row.message,
    relatedLoanId: row.related_loan_id,
    fireAt: row.fire_at,
    isEnabled: row.is_enabled === 1,
    notificationIdentifier: row.notification_identifier,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Нагадування (розділ 28 ТЗ) — лише локальні (`expo-notifications`, без push/сервера).
 * Репозиторій зберігає рядок у SQLite й `notification_identifier`, повернутий
 * `expo-notifications` при плануванні (`src/lib/notifications.ts`) — саме за ним пізніше
 * скасовується конкретне заплановане сповіщення (увімкнення/вимкнення/видалення).
 */
export const ReminderRepository = {
  async create(
    db: SQLiteDatabase,
    params: {
      kind: ReminderKind;
      timeOfDay: string | null;
      weekdays: number[] | null;
      message: string;
      notificationIdentifier: string | null;
    },
  ): Promise<Reminder> {
    const id = generateId();
    const now = nowIso();

    await db.runAsync(
      `INSERT INTO reminder (
         id, kind, time_of_day, weekdays, message, related_loan_id, fire_at, is_enabled,
         notification_identifier, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, NULL, NULL, 1, ?, ?, ?)`,
      [
        id,
        params.kind,
        params.timeOfDay,
        params.weekdays ? JSON.stringify(params.weekdays) : null,
        params.message,
        params.notificationIdentifier,
        now,
        now,
      ],
    );

    return {
      id,
      kind: params.kind,
      timeOfDay: params.timeOfDay,
      weekdays: params.weekdays,
      message: params.message,
      relatedLoanId: null,
      fireAt: null,
      isEnabled: true,
      notificationIdentifier: params.notificationIdentifier,
      createdAt: now,
      updatedAt: now,
    };
  },

  async listAll(db: SQLiteDatabase): Promise<Reminder[]> {
    const rows = await db.getAllAsync<ReminderRow>(`SELECT * FROM reminder ORDER BY created_at DESC`);
    return rows.map(mapRow);
  },

  /** Перемикання увімкнено/вимкнено — плюс новий (або обнулений) `notification_identifier`,
   * бо ввімкнення планує нове сповіщення заново, а вимкнення його скасовує. */
  async setEnabled(db: SQLiteDatabase, id: string, isEnabled: boolean, notificationIdentifier: string | null) {
    await db.runAsync(
      `UPDATE reminder SET is_enabled = ?, notification_identifier = ?, updated_at = ? WHERE id = ?`,
      [isEnabled ? 1 : 0, notificationIdentifier, nowIso(), id],
    );
  },

  async remove(db: SQLiteDatabase, id: string): Promise<void> {
    await db.runAsync(`DELETE FROM reminder WHERE id = ?`, [id]);
  },
};
