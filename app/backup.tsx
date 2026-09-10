import React, { useState } from 'react';
import { View, Alert, Switch } from 'react-native';
import { Stack } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { uk } from 'date-fns/locale';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/design/ThemeProvider';
import { useExportBackup, usePickBackupFile, useRestoreBackup } from '@/features/backup/useBackup';
import { useAutoBackupSettings, useSetAutoBackupEnabled } from '@/features/backup/useAutoBackup';
import { useExportLibraryCsv } from '@/features/library-io/useExportLibraryCsv';

/**
 * Backup/restore (`docs/BACKUP_FORMAT.md`, Milestone 6). Export пише JSON у файл і одразу
 * відкриває системне "Поділитися" (Файли/хмара/месенджер — користувач сам обирає, куди
 * зберегти, застосунок нічого не завантажує на сервер, повністю офлайн). Restore завжди
 * показує підтвердження з деталями файлу перед перезаписом (п.35 ТЗ, без винятків) — тут
 * через `Alert.alert`, а не власну модалку, бо це разова дія "точка неповернення", де
 * нативний системний діалог доречніший за кастомний UI.
 */
export default function BackupScreen() {
  const theme = useTheme();
  const exportBackup = useExportBackup();
  const pickFile = usePickBackupFile();
  const restoreBackup = useRestoreBackup();
  const exportCsv = useExportLibraryCsv();
  const autoBackupSettings = useAutoBackupSettings();
  const setAutoBackupEnabled = useSetAutoBackupEnabled();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleExport = () => {
    setStatusMessage(null);
    exportBackup.mutate(undefined, {
      onSuccess: (result) => {
        setStatusMessage(
          result.shared
            ? 'Резервну копію створено — обери, куди зберегти, у вікні, що відкрилось.'
            : 'Резервну копію збережено у файлах застосунку (системне "Поділитися" тут недоступне).',
        );
      },
      onError: () => setStatusMessage('Не вдалося створити резервну копію.'),
    });
  };

  const handleExportCsv = () => {
    setStatusMessage(null);
    exportCsv.mutate(undefined, {
      onSuccess: (result) => {
        setStatusMessage(
          result.shared
            ? 'CSV-файл створено — обери, куди зберегти, у вікні, що відкрилось.'
            : 'CSV-файл збережено у файлах застосунку (системне "Поділитися" тут недоступне).',
        );
      },
      onError: () => setStatusMessage('Не вдалося створити CSV-файл.'),
    });
  };

  const handlePickFile = () => {
    setStatusMessage(null);
    pickFile.mutate(undefined, {
      onSuccess: (result) => {
        if (result.kind === 'cancelled') return;
        if (result.kind === 'error') {
          setStatusMessage(result.message);
          return;
        }

        const { envelope, summary } = result.pending;
        const exportedAtLabel = format(parseISO(envelope.exportedAt), 'd MMMM yyyy, HH:mm', { locale: uk });

        Alert.alert(
          'Відновити з резервної копії?',
          `Файл створено ${exportedAtLabel}.\n\nКниг: ${summary.works} · У бібліотеці: ${summary.userBooks} · ` +
            `Сесій читання: ${summary.sessions} · Нотаток: ${summary.notes}\n\n` +
            'Це ПОВНІСТЮ ЗАМІНИТЬ усі поточні дані застосунку на дані з файлу. Скасувати цю дію не можна.',
          [
            { text: 'Скасувати', style: 'cancel' },
            {
              text: 'Замінити дані',
              style: 'destructive',
              onPress: () => {
                restoreBackup.mutate(envelope, {
                  onSuccess: () => setStatusMessage('Дані відновлено з резервної копії.'),
                  onError: () => setStatusMessage('Не вдалося відновити дані — попередній стан не змінено.'),
                });
              },
            },
          ],
        );
      },
      onError: () => setStatusMessage('Не вдалося відкрити файл.'),
    });
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Резервна копія',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer>
        <View style={{ gap: theme.spacing.lg }}>
          <Card style={{ gap: theme.spacing.sm }}>
            <AppText variant="heading">Створити резервну копію</AppText>
            <AppText variant="body" color="secondary">
              Уся бібліотека, сесії читання, нотатки, цитати, оцінки, цілі й нагадування —
              одним JSON-файлом. Нічого не завантажується на сервер (застосунок повністю
              офлайн) — ти сам обираєш, де зберегти файл.
            </AppText>
            <Button
              label={exportBackup.isPending ? 'Створюю…' : 'Створити й поділитися'}
              onPress={handleExport}
              disabled={exportBackup.isPending}
            />
          </Card>

          <Card style={{ gap: theme.spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <AppText variant="heading">Автоматичний бекап</AppText>
              <Switch
                value={autoBackupSettings.data?.enabled ?? true}
                onValueChange={(value) => setAutoBackupEnabled.mutate(value)}
                trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
              />
            </View>
            <AppText variant="body" color="secondary">
              Раз на кілька днів застосунок тихо зберігає резервну копію у власних файлах —
              додаткова страховка між ручними бекапами вище. Нічого нікуди не надсилається,
              лишаються лише останні кілька копій.
            </AppText>
            <AppText variant="caption" color="secondary">
              {autoBackupSettings.data?.lastRunAt
                ? `Останній автобекап: ${format(parseISO(autoBackupSettings.data.lastRunAt), 'd MMMM yyyy, HH:mm', { locale: uk })}`
                : 'Автобекапу ще не було.'}
            </AppText>
          </Card>

          <Card style={{ gap: theme.spacing.sm }}>
            <AppText variant="heading">Експорт у CSV</AppText>
            <AppText variant="body" color="secondary">
              Уся бібліотека однією таблицею (назва, автори, статус, оцінка, жанри, полиці
              тощо) — для Excel, Google Таблиць чи будь-якої іншої обробки поза застосунком.
              Це не резервна копія: із CSV-файлу не можна відновити дані назад у застосунок,
              для цього — файл вище.
            </AppText>
            <Button
              label={exportCsv.isPending ? 'Створюю…' : 'Створити CSV і поділитися'}
              variant="secondary"
              onPress={handleExportCsv}
              disabled={exportCsv.isPending}
            />
          </Card>

          <Card style={{ gap: theme.spacing.sm }}>
            <AppText variant="heading">Відновити з файлу</AppText>
            <AppText variant="body" color="secondary">
              Обери раніше створений файл резервної копії. Перед перезаписом застосунок
              покаже деталі файлу й попросить підтвердження — поточні дані нічим не
              замінюються без явної згоди.
            </AppText>
            <Button
              label={pickFile.isPending || restoreBackup.isPending ? 'Обробляю…' : 'Обрати файл'}
              variant="secondary"
              onPress={handlePickFile}
              disabled={pickFile.isPending || restoreBackup.isPending}
            />
          </Card>

          {statusMessage ? (
            <AppText variant="caption" color="secondary" style={{ textAlign: 'center' }}>
              {statusMessage}
            </AppText>
          ) : null}
        </View>
      </ScreenContainer>
    </>
  );
}
