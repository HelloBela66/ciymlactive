import React, { useState } from 'react';
import { View, Alert } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
// SDK 56+ прибрав можливість імпортувати `@react-navigation/native` напряму в застосунках на
// Expo Router — власний вендорований форк React Navigation усередині `expo-router` конфліктує
// з окремо встановленим пакетом `@react-navigation/native` (dependency mismatch, `Metro`
// падає на старті з "As of SDK 56, expo-router is no longer compatible with react-navigation").
// Той самий `usePreventRemove`/`useNavigation` (той самий рантайм, лише інший шлях імпорту)
// тепер реекспортується через `expo-router/react-navigation`
// (https://docs.expo.dev/router/migrate/sdk-55-to-56/).
import { usePreventRemove, useNavigation } from 'expo-router/react-navigation';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { LabeledInput } from '@/components/ui/LabeledInput';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/design/ThemeProvider';
import { useCreateBookDraft } from '@/features/library/useCreateBookDraft';
import { NormalizedBookDraftSchema } from '@/types/bookDraft';
import { editionFormatLabels } from '@/design/i18n-labels';
import type { EditionFormatValue } from '@/types/edition';

const FORMAT_OPTIONS = (Object.keys(editionFormatLabels) as EditionFormatValue[]).map((value) => ({
  value,
  label: editionFormatLabels[value],
}));

/** Розбиває "Ім'я1, Ім'я2" на масив непорожніх імен — для полів автор(и)/перекладач(і). */
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
 * Ручне додавання книги (п.20 ТЗ). Один екран приховано створює і Work, і Edition —
 * складність моделі не протікає в UI (докладніше — docs/ARCHITECTURE.md, розділ "Технічні
 * ризики"). Валідація — тим самим NormalizedBookDraftSchema, яким пізніше йтимуть і зовнішні
 * провайдери (Milestone 7), тому форма й майбутній import завжди узгоджені.
 *
 * Необов'язковий query-параметр `isbn` (Milestone 7, `app/isbn-scan.tsx`, крок 4) — коли жоден
 * провайдер не знайшов відсканований штрихкод, сюди передається сам ISBN, щоб користувач не
 * вводив його вручну ще раз.
 */
export default function AddBookManuallyScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const createBookDraft = useCreateBookDraft();
  const { isbn } = useLocalSearchParams<{ isbn?: string }>();
  const initialIsbn = typeof isbn === 'string' ? isbn : '';

  // Заповнена форма без збереження (Milestone 10 fix6, `docs/STATUS_V1.md` п. 3.7) — 12+ полів,
  // а вихід свайпом/апаратною кнопкою "Назад" раніше тихо губив усе введене без попередження.
  // `justSaved` — окремий прапорець, а не просто "мутація успішна": після успіху ми самі
  // програмно йдемо на `/work/[workId]` (`router.replace` нижче), і БЕЗ цього прапорця
  // `usePreventRemove` перехопив би й ЦЮ навігацію теж (форма технічно й далі "заповнена" в
  // момент viewModel ще не розмонтувався) — показавши підтвердження виходу одразу після
  // успішного збереження, що було б неправильно.
  const [justSaved, setJustSaved] = useState(false);

  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [originalTitle, setOriginalTitle] = useState('');
  const [description, setDescription] = useState('');
  const [seriesName, setSeriesName] = useState('');
  const [seriesPosition, setSeriesPosition] = useState('');
  const [isbn13, setIsbn13] = useState(typeof isbn === 'string' ? isbn : '');
  const [publisher, setPublisher] = useState('');
  const [translators, setTranslators] = useState('');
  const [publicationYear, setPublicationYear] = useState('');
  const [pageCount, setPageCount] = useState('');
  const [language, setLanguage] = useState('uk');
  const [format, setFormat] = useState<EditionFormatValue>('paperback');
  const [coverUrl, setCoverUrl] = useState('');
  const [titleError, setTitleError] = useState<string | undefined>(undefined);

  const isDirty =
    title.trim().length > 0 ||
    authors.trim().length > 0 ||
    originalTitle.trim().length > 0 ||
    description.trim().length > 0 ||
    seriesName.trim().length > 0 ||
    seriesPosition.trim().length > 0 ||
    isbn13.trim() !== initialIsbn.trim() ||
    publisher.trim().length > 0 ||
    translators.trim().length > 0 ||
    publicationYear.trim().length > 0 ||
    pageCount.trim().length > 0 ||
    language.trim() !== 'uk' ||
    format !== 'paperback' ||
    coverUrl.trim().length > 0;

  usePreventRemove(isDirty && !justSaved, ({ data }) => {
    Alert.alert(
      'Незбережені зміни',
      'Якщо вийдеш зараз, введені дані буде втрачено.',
      [
        { text: 'Залишитись', style: 'cancel' },
        {
          text: 'Вийти без збереження',
          style: 'destructive',
          onPress: () => navigation.dispatch(data.action),
        },
      ],
    );
  });

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
      source: { sourceType: 'manual', sourceName: 'Ручне додавання' },
    });

    if (!parsed.success) {
      setTitleError(parsed.error.issues[0]?.message ?? 'Перевір введені дані');
      return;
    }

    const { workId } = await createBookDraft.mutateAsync(parsed.data);
    setJustSaved(true);
    router.replace({ pathname: '/work/[workId]', params: { workId } });
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Додати книгу',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer>
        <View style={{ gap: theme.spacing.lg }}>
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
