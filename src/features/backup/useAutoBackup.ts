import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AutoBackupSettingsStorage } from '@/lib/autoBackupSettingsStorage';
import { queryKeys } from '@/lib/queryKeys';
import { createLogger } from '@/lib/logger';
import { useMutationErrorHandler } from '@/lib/useMutationErrorHandler';

const log = createLogger('features/backup/useAutoBackup');

export interface AutoBackupSettings {
  enabled: boolean;
  lastRunAt: string | null;
}

/** Читає стан "увімкнено?"/"коли востаннє" для UI (`app/backup.tsx`) — саме сховище
 * (`expo-secure-store`) незалежне від SQLite, тож цей хук навмисно НЕ чекає на готовність
 * БД (на відміну від решти екрана бекапів). */
export function useAutoBackupSettings() {
  return useQuery<AutoBackupSettings>({
    queryKey: queryKeys.autoBackup.settings,
    queryFn: async () => {
      const [enabled, lastRunAt] = await Promise.all([
        AutoBackupSettingsStorage.isEnabled(),
        AutoBackupSettingsStorage.getLastRunAt(),
      ]);
      return { enabled, lastRunAt };
    },
  });
}

export function useSetAutoBackupEnabled() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося зберегти налаштування авто-бекапу.');
  return useMutation({
    mutationFn: (value: boolean) => AutoBackupSettingsStorage.setEnabled(value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.autoBackup.settings });
    },
    onError,
  });
}
