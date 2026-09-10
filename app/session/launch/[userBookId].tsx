import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LabeledInput } from '@/components/ui/LabeledInput';
import { CoverThumbnail } from '@/components/ui/CoverThumbnail';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { useTheme } from '@/design/ThemeProvider';
import { useUserBookWithDetails } from '@/features/library/useLibrary';
import { useActiveSession } from '@/features/reading-session/useActiveSession';
import { useStartSession } from '@/features/reading-session/useSessionMutations';

/** `''`/пробіли/сміття — "не вказано", той самий підхід, що й `parseOptionalPage` на екрані
 * активної сесії (`app/session/[sessionId].tsx`). */
function parseOptionalInt(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Компактний запуск сесії читання (Milestone 11, доповнення — пряме прохання власника
 * продукту): тап по книзі в списку "Зараз читаєш" на Головній тепер веде НЕ одразу на повний
 * Book Details (як досі в Бібліотеці — там свідомо лишається без змін, бо там довідник/керування
 * книгою, а не швидкий старт читання), а сюди — маленький, зосереджений екран "почати читання
 * саме цієї книги", після чого одразу відкривається повноцінний таймер (`/session/[sessionId]`).
 *
 * Той самий `useStartSession`, що й `ReadingControls` на Book Details (`app/work/[workId].tsx`)
 * — не нова мутація, лише інший, легший UI над тим самим стартом сесії: editable "почати зі
 * сторінки" (там — жодного поля, авто з `currentPage`) і опційна ціль у хвилинах.
 *
 * Той самий трискладовий стан активної сесії, що й `ReadingControls` — навмисно продубльований
 * тут, а не винесений у спільний хук: тут це не просто "яку кнопку показати", а "чи показувати
 * цей екран запуску взагалі" (автоматичний редирект нижче, коли сесія для ЦІЄЇ книги вже йде).
 */
export default function SessionLaunchScreen() {
  const theme = useTheme();
  const { userBookId } = useLocalSearchParams<{ userBookId: string }>();
  const { data, isLoading, isError, refetch } = useUserBookWithDetails(userBookId);
  const { data: activeSession } = useActiveSession();
  const startSession = useStartSession();

  const [startPage, setStartPage] = useState('');
  const [goalMinutes, setGoalMinutes] = useState('');

  useEffect(() => {
    // Ініціалізація редагованого поля значенням, яке приходить асинхронно із запиту (SQLite);
    // стандартний патерн "заповнити форму щойно прийшли дані", не цикл ре-рендерів.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (data) setStartPage(data.currentPage > 0 ? String(data.currentPage) : '0');
  }, [data]);

  const isThisBookActive = !!activeSession && activeSession.userBookId === userBookId;

  // Сесія для ЦІЄЇ книги вже триває (наприклад, розпочата раніше й застосунок просто
  // перезапущено) — одразу на повний екран сесії, без проміжного "почати читання" тут:
  // користувач і так тапнув книгу, щоб продовжити читати, а не щоб побачити форму старту ще
  // раз. `router.replace`, не `push` — цей екран не мав би лишатись у стеку навігації позаду.
  useEffect(() => {
    if (isThisBookActive && activeSession) {
      router.replace({ pathname: '/session/[sessionId]', params: { sessionId: activeSession.id } });
    }
  }, [isThisBookActive, activeSession]);

  const handleStart = () => {
    if (!data) return;
    const parsedStartPage = parseOptionalInt(startPage) ?? data.currentPage;
    const parsedGoalMinutes = parseOptionalInt(goalMinutes);
    startSession.mutate(
      { userBookId: data.id, startPage: parsedStartPage, goalMinutes: parsedGoalMinutes ?? null },
      {
        onSuccess: (session) => {
          router.replace({ pathname: '/session/[sessionId]', params: { sessionId: session.id } });
        },
      },
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Почати читання',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer>
        {isError ? (
          <QueryErrorState onRetry={() => refetch()} />
        ) : isLoading || !data || isThisBookActive ? (
          <AppText variant="body" color="secondary">
            Завантаження…
          </AppText>
        ) : activeSession ? (
          <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.lg }}>
            <Card style={{ gap: theme.spacing.sm }}>
              <AppText variant="heading">Спершу заверши поточне читання</AppText>
              <AppText variant="body" color="secondary">
                Одночасно можна читати лише одну книгу. Заверши або постав на паузу поточну
                сесію, перш ніж почати цю.
              </AppText>
              <Button
                label="До поточної сесії"
                onPress={() =>
                  router.replace({ pathname: '/session/[sessionId]', params: { sessionId: activeSession.id } })
                }
              />
            </Card>
          </View>
        ) : (
          <View style={{ gap: theme.spacing.xl, paddingTop: theme.spacing.lg, alignItems: 'center' }}>
            <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
              <CoverThumbnail
                coverUrl={data.edition.coverUrl}
                title={data.work.title}
                fallbackColor={data.work.coverFallbackColor}
                width={104}
                height={152}
                borderRadius={theme.radius.md}
              />
              <AppText variant="title" style={{ textAlign: 'center' }}>
                {data.work.title}
              </AppText>
              {data.work.authors.length > 0 ? (
                <AppText variant="body" color="secondary" style={{ textAlign: 'center' }}>
                  {data.work.authors.map((a) => a.name).join(', ')}
                </AppText>
              ) : null}
            </View>

            <Card style={{ width: '100%', gap: theme.spacing.lg }}>
              <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
                <View style={{ flex: 1 }}>
                  <LabeledInput
                    label="Почати зі сторінки"
                    value={startPage}
                    onChangeText={setStartPage}
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <LabeledInput
                    label="Ціль, хв (необов'язково)"
                    value={goalMinutes}
                    onChangeText={setGoalMinutes}
                    keyboardType="numeric"
                    placeholder="напр. 30"
                  />
                </View>
              </View>
              <Button
                label={startSession.isPending ? 'Починаю…' : 'Почати читання'}
                onPress={handleStart}
                disabled={startSession.isPending}
              />
            </Card>
          </View>
        )}
      </ScreenContainer>
    </>
  );
}
