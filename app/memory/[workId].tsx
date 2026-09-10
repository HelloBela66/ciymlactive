import React, { useMemo, useRef, useState } from 'react';
import { View, Linking } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { captureRef } from 'react-native-view-shot';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { MemoryCardPreview } from '@/components/memory/MemoryCardPreview';
import { useTheme } from '@/design/ThemeProvider';
import { memoryCardTemplateLabels, memoryCardTemplateDescriptions } from '@/design/i18n-labels';
import { useBookDetails } from '@/features/book-details/useBookDetails';
import { useRating } from '@/features/book-details/useRating';
import { useReadingHistory } from '@/features/reading-session/useReadingHistory';
import { useJournalEntries } from '@/features/journal/useJournal';
import { useGenresForWork } from '@/features/book-details/useGenres';
import { useBookMemory, useSetBookMemory } from '@/features/memory/useBookMemory';
import { computeBookStats } from '@/lib/bookStats';
import { shareMemoryCardImage, saveMemoryCardImageToLibrary } from '@/lib/memoryCardFile';
import { createLogger } from '@/lib/logger';
import type { MemoryCardTemplateId } from '@/types/bookMemory';

const log = createLogger('app/memory');

const TEMPLATE_OPTIONS: { value: MemoryCardTemplateId; label: string }[] = (
  Object.keys(memoryCardTemplateLabels) as MemoryCardTemplateId[]
).map((id) => ({ value: id, label: memoryCardTemplateLabels[id] }));

/** Спільні опції захоплення (Milestone 11, Фаза 9) — PNG, максимальна якість. Той самий
 * знімок іде і на "Поділитися", і на "Зберегти в галерею", тож знято в одному місці, а не
 * дубльовано в обох обробниках. Без `result` — типове значення `'tmpfile'` (реальний файл на
 * диску з розширенням `.png` у URI), навмисно НЕ `'base64'`/`'data-uri'`: і `Sharing.shareAsync`,
 * і `MediaLibrary.saveToLibraryAsync` (`memoryCardFile.ts`) чекають саме `file://`-шлях з
 * розширенням, а не рядок даних. */
const CAPTURE_OPTIONS = { format: 'png', quality: 1 } as const;

/**
 * Картка-спогад (Milestone 11, Фаза 8-9) — вибір шаблону, живий preview `MemoryCardPreview`,
 * і тепер (Фаза 9) — "Поділитися"/"Зберегти в галерею" повноцінним зображенням. Дані для
 * картки вже зібрані Фазою 7 (`book_memory.reflection`/`entry_refs`) — тут лише "яким
 * шаблоном показати" й "куди віддати результат", тому доступний лише коли спогад уже існує
 * (єдина точка входу — "Переглянути картку" на `app/completion/[workId].tsx`, видима тільки
 * коли є що показати).
 */
export default function MemoryCardScreen() {
  const theme = useTheme();
  const { workId } = useLocalSearchParams<{ workId: string }>();
  const { data, isLoading, isError, refetch } = useBookDetails(workId);
  const userBookId = data?.userBook?.id;

  const { data: memory, isLoading: isMemoryLoading } = useBookMemory(userBookId);
  const { data: allEntries } = useJournalEntries(userBookId);
  const { data: sessions } = useReadingHistory(userBookId);
  const { data: rating } = useRating(userBookId);
  // Лише для "вайбу" водяного знаку картки (`MemoryCardPreview`) — порожній масив за
  // замовчуванням (доки завантажується/якщо жанрів нема) коректний сам по собі: тоді вайб
  // просто детермінований за `workId`, а не за жанром (`pickCardMood`).
  const { data: genres } = useGenresForWork(workId);
  const setMemory = useSetBookMemory();

  // Той самий "dirty override" патерн, що й `RatingSection.displayedReview`
  // (`app/work/[workId].tsx`) — щойно обраний шаблон видно одразу, без миготіння між
  // локальним вибором і ще не повернутим результатом мутації.
  const [templateOverride, setTemplateOverride] = useState<MemoryCardTemplateId | null>(null);
  const displayedTemplate = templateOverride ?? memory?.templateId ?? 'classic';

  // Реф на саму картку для захоплення в зображення (Фаза 9). `collapsable={false}` на самому
  // `View` нижче — обов'язково для Android: без нього нативна оптимізація дерева view може
  // "сплющити"/прибрати цей вузол, і `captureRef` або впаде, або захопить не те (відоме й
  // задокументоване обмеження `react-native-view-shot`).
  const cardRef = useRef<View>(null);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [permissionBlocked, setPermissionBlocked] = useState(false);

  // Інлайн `useMutation` прямо в екрані (не в `features/memory/`) — той самий вибір, що й
  // `saveMutation` у `app/cover-photo/[editionId].tsx`: це взаємодія з пристроєм (захоплення
  // View, системний "Поділитися", фотогалерея), а не SQLite-мутація даних, тож їй тут і місце.
  const shareCard = useMutation({
    mutationFn: async () => {
      const uri = await captureRef(cardRef, CAPTURE_OPTIONS);
      return shareMemoryCardImage(uri);
    },
    onSuccess: (shared) => {
      setStatusMessage(shared ? null : 'Системне "Поділитися" тут недоступне.');
    },
    onError: (error) => {
      log.error('Не вдалося поділитися карткою', { error: error instanceof Error ? error.message : String(error) });
      setStatusMessage('Не вдалося поділитися карткою. Спробуй ще раз.');
    },
  });

  const saveCard = useMutation({
    mutationFn: async () => {
      const uri = await captureRef(cardRef, CAPTURE_OPTIONS);
      return saveMemoryCardImageToLibrary(uri);
    },
    onSuccess: (outcome) => {
      if (outcome.kind === 'saved') {
        setStatusMessage('Картку збережено в галерею.');
        return;
      }
      setPermissionError(
        outcome.canAskAgain
          ? 'Немає дозволу зберегти в галерею.'
          : 'Доступ до збереження фото відхилено назавжди — увімкни дозвіл для «Полиці» в налаштуваннях пристрою.',
      );
      setPermissionBlocked(!outcome.canAskAgain);
    },
    onError: (error) => {
      log.error('Не вдалося зберегти картку в галерею', {
        error: error instanceof Error ? error.message : String(error),
      });
      setStatusMessage('Не вдалося зберегти картку. Спробуй ще раз.');
    },
  });

  // Явна синхронна перевірка "вже виконується" (аудит M11, п.6.3) — той самий захист, що й
  // `handleStatusChange` в `app/work/[workId].tsx` (`if (isStatusPending) return;`), а не лише
  // покладання на `Button.disabled`: `disabled` стає `true` тільки ПІСЛЯ повторного рендеру з
  // новим `isPending`, тож швидкий подвійний тап теоретично встигає натиснути двічі до того,
  // як кнопка візуально стане неактивною — тут же другий виклик відсікається одразу, без
  // очікування на рендер.
  const handleShare = () => {
    if (shareCard.isPending || saveCard.isPending) return;
    setStatusMessage(null);
    setPermissionError(null);
    setPermissionBlocked(false);
    shareCard.mutate();
  };

  const handleSave = () => {
    if (shareCard.isPending || saveCard.isPending) return;
    setStatusMessage(null);
    setPermissionError(null);
    setPermissionBlocked(false);
    saveCard.mutate();
  };

  const selectedEntries = useMemo(() => {
    if (!memory || !allEntries) return [];
    const ids = new Set(memory.entryRefs.map((ref) => ref.id));
    return allEntries.filter((entry) => ids.has(entry.id));
  }, [memory, allEntries]);

  const stats = computeBookStats({
    sessions,
    pageCount: data?.primaryEdition?.pageCount,
    currentPage: data?.userBook?.currentPage,
    startedAt: data?.userBook?.startedAt,
    finishedAt: data?.userBook?.finishedAt,
  });

  const handleTemplateChange = (templateId: MemoryCardTemplateId) => {
    if (!userBookId || !memory) return;
    setTemplateOverride(templateId);
    setMemory.mutate(
      {
        userBookId,
        reflection: memory.reflection,
        entryRefs: memory.entryRefs,
        templateId,
      },
      {
        // Відкат оптимістичного вибору при помилці (аудит M11, п.6.4) — без цього екран і
        // далі показував (і дозволяв експортувати) шаблон, що НЕ зберігся в БД, аж до
        // перемонтування компонента; глобальний `onError` у `useSetBookMemory` лише показує
        // toast, `displayedTemplate` тут не чіпає.
        onError: () => setTemplateOverride(null),
      },
    );
  };

  const authorNames = data?.work.authors.map((a) => a.name).join(', ') ?? '';

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Картка-спогад',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer>
        {isError ? (
          <QueryErrorState onRetry={() => refetch()} />
        ) : isLoading || !data || isMemoryLoading ? (
          <AppText variant="body" color="secondary">
            Завантаження…
          </AppText>
        ) : !data.userBook || !memory ? (
          <AppText variant="body" color="secondary">
            Спершу створи спогад про цю книгу на екрані підсумку читання.
          </AppText>
        ) : (
          <View style={{ gap: theme.spacing.lg }}>
            <View ref={cardRef} collapsable={false}>
              <MemoryCardPreview
                template={displayedTemplate}
                work={{
                  title: data.work.title,
                  authorNames,
                  coverUrl: data.primaryEdition?.coverUrl,
                  coverFallbackColor: data.work.coverFallbackColor,
                }}
                reflection={memory.reflection}
                entries={selectedEntries}
                rating={rating?.value ?? null}
                stats={stats}
                genres={genres ?? []}
                workId={workId}
              />
            </View>

            <Card style={{ gap: theme.spacing.sm }}>
              <ChipSelect
                label="Шаблон картки"
                options={TEMPLATE_OPTIONS}
                value={displayedTemplate}
                onChange={handleTemplateChange}
                disabled={setMemory.isPending}
              />
              <AppText variant="caption" color="tertiary">
                {memoryCardTemplateDescriptions[displayedTemplate]}
              </AppText>
            </Card>

            <View style={{ gap: theme.spacing.sm }}>
              <Button
                label={shareCard.isPending ? 'Готую зображення…' : 'Поділитися'}
                onPress={handleShare}
                disabled={shareCard.isPending || saveCard.isPending}
              />
              <Button
                label={saveCard.isPending ? 'Зберігаю…' : 'Зберегти в галерею'}
                variant="secondary"
                onPress={handleSave}
                disabled={shareCard.isPending || saveCard.isPending}
              />
              {statusMessage ? (
                <AppText variant="caption" color="secondary" style={{ textAlign: 'center' }}>
                  {statusMessage}
                </AppText>
              ) : null}
              {permissionError ? (
                <AppText variant="caption" color="danger" style={{ textAlign: 'center' }}>
                  {permissionError}
                </AppText>
              ) : null}
              {permissionBlocked ? (
                <Button
                  label="Відкрити налаштування пристрою"
                  variant="secondary"
                  onPress={() => Linking.openSettings()}
                />
              ) : null}
            </View>
          </View>
        )}
      </ScreenContainer>
    </>
  );
}
