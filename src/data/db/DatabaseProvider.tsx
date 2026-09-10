import React, { createContext, useContext, useEffect, useState } from 'react';
import { View, StyleSheet, Text, ActivityIndicator } from 'react-native';
import { getDatabase } from './client';
import { migrateDbIfNeeded } from './migrationRunner';
import { GenreRepository } from '@/data/repositories/GenreRepository';
import { createLogger } from '@/lib/logger';
import { useTheme } from '@/design/ThemeProvider';

const log = createLogger('db/DatabaseProvider');

type DbState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; error: string };

const DbReadyContext = createContext(false);

/** Дозволяє екранам переконатись, що БД готова, не імпортуючи client.ts напряму. */
export function useIsDatabaseReady(): boolean {
  return useContext(DbReadyContext);
}

/**
 * Гейтить рендер дерева застосунку до застосування всіх SQLite-міграцій.
 * Це критично для core loop (п.12 ТЗ): жоден екран не повинен встигнути відрендеритись і
 * спробувати прочитати з БД до того, як схема готова.
 */
export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DbState>({ status: 'loading' });
  const theme = useTheme();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await getDatabase();
        const version = await migrateDbIfNeeded(db);
        // Куратований список жанрів (Milestone 9) — ідемпотентно (INSERT OR IGNORE за
        // slug), тож безпечно виконувати на кожному старті застосунку, не лише один раз.
        await GenreRepository.ensureSeeded(db);
        log.info('База даних готова', { version });
        if (!cancelled) setState({ status: 'ready' });
      } catch (err) {
        log.error('Не вдалося ініціалізувати базу даних', err);
        if (!cancelled) {
          setState({ status: 'error', error: err instanceof Error ? err.message : String(err) });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.bg }]}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.bg, padding: theme.spacing.xl }]}>
        <Text style={{ color: theme.colors.danger, textAlign: 'center', fontSize: theme.typography.scale.body.size }}>
          Не вдалося підготувати локальну базу даних. Спробуй перезапустити застосунок.
        </Text>
      </View>
    );
  }

  return <DbReadyContext.Provider value={true}>{children}</DbReadyContext.Provider>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
