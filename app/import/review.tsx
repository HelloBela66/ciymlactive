import React, { useMemo, useState } from 'react';
import { View, Image } from 'react-native';
import { Stack, router } from 'expo-router';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { LabeledInput } from '@/components/ui/LabeledInput';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/design/ThemeProvider';
import { useCreateBookDraft } from '@/features/library/useCreateBookDraft';
import { useImportDraftStore } from '@/stores/importDraftStore';
import { ALL_PROVIDERS } from '@/data/providers';
import { NormalizedBookDraftSchema } from '@/types/bookDraft';
import { editionFormatLabels } from '@/design/i18n-labels';
import type { EditionFormatValue } from '@/types/edition';

const FORMAT_OPTIONS = (Object.keys(editionFormatLabels) as EditionFormatValue[]).map((value) => ({
  value,
  label: editionFormatLabels[value],
}));

function parseNameList(raw: string): string[] {
  return raw
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

function parseOptionalInt(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Екран підтвердження імпорту (docs/BOOK_PROVIDERS.md, "перегляд перед збереженням — без
 * винятків"). Читає `useImportDraftStore().pending` (заповнений тапом на результат пошуку в
 * `app/(tabs)/search.tsx` чи знахідкою в `app/isbn-scan.tsx`), прогонує сирий результат через
 * `provider.normalizeBook`, і показує ту саму форму, що й ручне додавання (`app/work/new.tsx`),
 * попередньо заповнену — користувач завжди може виправити чи стерти будь-яке поле перед
 * збереженням. Порожній `pending` (наприклад, після перезавантаження застосунку чи прямого
 * переходу на цей маршрут) показує пояснення й веде назад до пошуку, а не падає.
 */
export default function ImportReviewScreen() {
  const theme = useTheme();
  const createBookDraft = useCreateBookDraft();
  const pending = useImportDraftStore((state) => state.pending);

  const provider = useMemo(
    () => (pending ? ALL_PROVIDERS.find((p) => p.id === pending.providerId) : undefined),
    [pending],
  );
  const initialDraft = useMemo(
    () => (pending && provider ? provider.normalizeBook(pending.book) : null),
    [pending, provider],
  );

  const [title, setTitle] = useState(initialDraft?.title ?? '');
  const [authors, setAuthors] = useState(initialDraft?.authors.join(', ') ?? '');
  const [originalTitle, setOriginalTitle] = useState('');
  const [description, setDescription] = useState(initialDraft?.description ?? '');
  const [seriesName, setSeriesName] = useState('');
  const [seriesPosition, setSeriesPosition] = useState('');
  const [isbn13, setIsbn13] = useState(initialDraft?.isbn13 ?? '');
  const [publisher, setPublisher] = useState(initialDraft?.publisher ?? '');
  const [translators, setTranslators] = useState('');
  const [publicationYear, setPublicationYear] = useState(
    initialDraft?.publicationYear != null ? String(initialDraft.publicationYear) : '',
  );
  const [pageCount, setPageCount] = useState(initialDraft?.pageCount != null ? String(initialDraft.pageCount) : '');
  const [language, setLanguage] = useState(initialDraft?.language ?? 'uk');
  const [format, setFormat] = useState<EditionFormatValue>(initialDraft?.format ?? 'paperback');
  const [coverUrl, setCoverUrl] = useState(initialDraft?.coverUrl ?? '');
  const [titleError, setTitleError] = useState<string | undefined>(undefined);

  if (!pending || !provider || !initialDraft) {
    return (
      <>
        <Stack.Screen
          options={{
            headerShown: true,
            title: 'Підтвердження',
            headerStyle: { backgroundColor: theme.colors.bg },
            headerTintColor: theme.colors.textPrimary,
            headerShadowVisible: false,
          }}
        />
        <ScreenContainer>
          <AppText variant="body" color="secondary" style={{ textAlign: 'center', marginTop: theme.spacing.xxl }}>
            Немає книги для перегляду — можливо, застосунок перезапустився. Знайди книгу ще раз.
          </AppText>
          <Button
            label="До пошуку"
            variant="secondary"
            onPress={() => router.replace('/(tabs)/search')}
            style={{ marginTop: theme.spacing.lg }}
          />
        </ScreenContainer>
      </>
    );
  }

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0) {
      setTitleError('Назва обов’язкова');
      return;
    }
    setTitleError(undefined);

    const parsed = NormalizedBookDraftSchema.safeParse({
      title: trimmedTitle,
      originalTitle: originalTitle.trim() || undefined,
      description: description.trim() || undefined,
      authors: parseNameList(authors),
      isbn13: isbn13.trim() || undefined,
      publisher: publisher.trim() || undefined,
      translators: parseNameList(translators),
      publicationYear: parseOptionalInt(publicationYear),
      pageCount: parseOptionalInt(pageCount),
      language: language.trim() || 'uk',
      format,
      coverUrl: coverUrl.trim() || undefined,
      seriesName: seriesName.trim() || undefined,
      seriesPosition: parseOptionalInt(seriesPosition),
      source: initialDraft.source,
    });

    if (!parsed.success) {
      setTitleError(parsed.error.issues[0]?.message ?? 'Перевір введені дані');
      return;
    }

    try {
      const { workId } = await createBookDraft.mutateAsync(parsed.data);
      useImportDraftStore.getState().clear();
      router.replace({ pathname: '/work/[workId]', params: { workId } });
    } catch {
      // `createBookDraft.isError` вже показує повідомлення користувачу нижче (Card з
      // "Не вдалося зберегти книгу") — тут лише гасимо unhandled promise rejection у
      // консолі/терміналі: реальний приклад до цього виправлення — CHECK constraint з
      // SQLite показувався як голий "Uncaught (in promise)" дамп у терміналі користувача
      // замість зрозумілого повідомлення в застосунку (сама помилка вже усунена міграцією
      // 002, але захист від подібного мовчазного краху лишаємо на майбутнє).
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Перевір дані',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer>
        <View style={{ gap: theme.spacing.lg }}>
          <AppText variant="caption" color="tertiary">
            Знайдено через {provider.displayName} — перевір і виправ дані перед збереженням.
          </AppText>

          {coverUrl.trim().length > 0 ? (
            <Image
              source={{ uri: coverUrl.trim() }}
              style={{ width: 80, height: 116, borderRadius: theme.radius.sm, backgroundColor: theme.colors.accentSoft }}
              resizeMode="cover"
            />
          ) : null}

          <LabeledInput label="Назва" required value={title} onChangeText={setTitle} error={titleError} />
          <LabeledInput
            label="Автор(и)"
            placeholder="Через кому, якщо кілька"
            value={authors}
            onChangeText={setAuthors}
          />
          <LabeledInput label="Оригінальна назва" value={originalTitle} onChangeText={setOriginalTitle} />
          <LabeledInput
            label="Опис"
            value={description}
            onChangeText={setDescription}
            multiline
            style={{ minHeight: 96, paddingTop: theme.spacing.sm, textAlignVertical: 'top' }}
          />

          <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
            <View style={{ flex: 1 }}>
              <LabeledInput label="Серія" value={seriesName} onChangeText={setSeriesName} />
            </View>
            <View style={{ width: 96 }}>
              <LabeledInput
                label="№ у серії"
                value={seriesPosition}
                onChangeText={setSeriesPosition}
                keyboardType="numeric"
              />
            </View>
          </View>

          <AppText variant="heading">Видання</AppText>

          <LabeledInput label="ISBN" value={isbn13} onChangeText={setIsbn13} keyboardType="numeric" />
          <LabeledInput label="Видавництво" value={publisher} onChangeText={setPublisher} />
          <LabeledInput
            label="Перекладач(і)"
            placeholder="Через кому, якщо кілька"
            value={translators}
            onChangeText={setTranslators}
          />

          <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
            <View style={{ flex: 1 }}>
              <LabeledInput label="Рік видання" value={publicationYear} onChangeText={setPublicationYear} keyboardType="numeric" />
            </View>
            <View style={{ flex: 1 }}>
              <LabeledInput label="Сторінок" value={pageCount} onChangeText={setPageCount} keyboardType="numeric" />
            </View>
          </View>

          <LabeledInput label="Мова" value={language} onChangeText={setLanguage} />
          <LabeledInput
            label="Обкладинка (URL)"
            placeholder="Необов'язково"
            value={coverUrl}
            onChangeText={setCoverUrl}
            autoCapitalize="none"
          />

          <ChipSelect label="Формат" options={FORMAT_OPTIONS} value={format} onChange={setFormat} />

          {createBookDraft.isError ? (
            <AppText variant="caption" color="danger">
              Не вдалося зберегти книгу. Спробуй ще раз.
            </AppText>
          ) : null}

          <Button
            label={createBookDraft.isPending ? 'Зберігаю…' : 'Зберегти книгу'}
            onPress={handleSubmit}
            disabled={createBookDraft.isPending}
          />
        </View>
      </ScreenContainer>
    </>
  );
}
