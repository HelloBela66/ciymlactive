import React from 'react';
import { View, Pressable } from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/design/ThemeProvider';
import { dataIntegrityCategoryLabels } from '@/design/i18n-labels';
import { useDataIntegrityCheck } from '@/features/data-doctor/useDataIntegrityCheck';
import {
  DATA_INTEGRITY_CATEGORIES,
  type DataIntegrityCategory,
  type DataIntegrityIssue,
  type DataIntegrityLink,
} from '@/domain/dataIntegrityDoctor';
import { pluralizeUk } from '@/lib/pluralizeUk';

const PROBLEM_FORMS = ['проблема', 'проблеми', 'проблем'] as const;

/** Переносить `DataIntegrityLink` (дані, без Expo Router) у реальну навігацію — єдине місце,
 * що знає про конкретні маршрути (`work/[workId]`, `session/[sessionId]`, `shelf/[shelfId]`,
 * `series/[seriesId]` — усі чотири вже існують і використовуються деінде в застосунку, тож
 * typed routes їх напевно знають; додаткового `as unknown as Href` тут не потрібно). */
function navigateToLink(link: DataIntegrityLink) {
  if (!link) return;
  switch (link.type) {
    case 'work':
      router.push({ pathname: '/work/[workId]', params: { workId: link.workId } });
      return;
    case 'session':
      router.push({ pathname: '/session/[sessionId]', params: { sessionId: link.sessionId } });
      return;
    case 'shelf':
      router.push({ pathname: '/shelf/[shelfId]', params: { shelfId: link.shelfId } });
      return;
    case 'series':
      router.push({ pathname: '/series/[seriesId]', params: { seriesId: link.seriesId } });
      return;
  }
}

function CategoryCard({ category, issues }: { category: DataIntegrityCategory; issues: DataIntegrityIssue[] }) {
  const theme = useTheme();
  const ok = issues.length === 0;

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          padding: theme.spacing.lg,
        }}
      >
        <Ionicons
          name={ok ? 'checkmark-circle' : 'alert-circle'}
          size={20}
          color={ok ? theme.colors.success : theme.colors.warning}
        />
        <AppText variant="heading" style={{ flex: 1 }}>
          {dataIntegrityCategoryLabels[category]}
        </AppText>
        <AppText variant="caption" color="secondary">
          {ok ? 'Гаразд' : `${issues.length} ${pluralizeUk(issues.length, PROBLEM_FORMS)}`}
        </AppText>
      </View>

      {issues.map((issue, index) => (
        <Pressable
          key={`${issue.code}-${index}`}
          onPress={issue.link ? () => navigateToLink(issue.link) : undefined}
          disabled={!issue.link}
          accessibilityRole={issue.link ? 'button' : undefined}
          accessibilityLabel={issue.message}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.md,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
          }}
        >
          <AppText variant="body" color="secondary" style={{ flex: 1 }}>
            {issue.message}
          </AppText>
          {issue.link ? <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} /> : null}
        </Pressable>
      ))}
    </Card>
  );
}

/**
 * «Перевірка даних» (POLYTSIA V1.5, Фаза 5 — Data Integrity Doctor). Запускається вручну
 * (ТЗ Фази 5 не вимагає автоматичного сканування на кожен вхід у Профіль) — кнопка нижче
 * запускає `useDataIntegrityCheck()` (`DataIntegrityRepository.runCheck` →
 * `runDataIntegrityCheck`, `src/domain/dataIntegrityDoctor.ts`), результат — по чекмарку на
 * кожну з 6 категорій ТЗ і список знайдених проблем з можливістю перейти до сутності, де це
 * має сенс (`DataIntegrityIssue.link`).
 *
 * НАВМИСНО без жодного auto-repair (ТЗ Фази 5: "жодного destructive auto-repair на цьому
 * milestone") — лише знаходження й навігація до проблемного запису; сам запис користувач
 * виправляє звичайним UI картки/сесії/полиці/серії.
 */
export default function DataDoctorScreen() {
  const theme = useTheme();
  const check = useDataIntegrityCheck();
  const report = check.data;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Перевірка даних',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer>
        <View style={{ gap: theme.spacing.lg }}>
          <Card style={{ gap: theme.spacing.sm }}>
            <AppText variant="heading">Перевірити локальну базу</AppText>
            <AppText variant="body" color="secondary">
              Шукає в книгах, сесіях читання, прогресі, щоденнику, полицях і серіях суперечливі
              чи «осиротілі» записи — наприклад, сесію без книги чи сторінку прогресу за межами
              обсягу видання. Нічого не виправляє й не видаляє автоматично — лише показує, де
              варто подивитись.
            </AppText>
            <Button
              label={check.isPending ? 'Перевіряю…' : report ? 'Перевірити ще раз' : 'Перевірити дані'}
              onPress={() => check.mutate()}
              disabled={check.isPending}
            />
          </Card>

          {report ? (
            <>
              {!report.hasIssues ? (
                <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
                  <Ionicons name="checkmark-circle" size={22} color={theme.colors.success} />
                  <AppText variant="heading" style={{ flex: 1 }}>
                    Проблем не знайдено
                  </AppText>
                </Card>
              ) : null}

              {DATA_INTEGRITY_CATEGORIES.map((category) => (
                <CategoryCard key={category} category={category} issues={report.byCategory[category]} />
              ))}
            </>
          ) : null}
        </View>
      </ScreenContainer>
    </>
  );
}
