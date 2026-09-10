import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable, Alert } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { LabeledInput } from '@/components/ui/LabeledInput';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { Card } from '@/components/ui/Card';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { CoverThumbnail } from '@/components/ui/CoverThumbnail';
import { NoteCategoryPicker, type NoteCategoryValue } from '@/components/session/NoteCategoryPicker';
import { ReactionChips, ReactionToggle } from '@/components/journal/ReactionPicker';
import { useTheme } from '@/design/ThemeProvider';
import { REACTION_META, type ReactionId } from '@/design/reactions';
import { useSessionWithBook } from '@/features/reading-session/useSessionWithBook';
import { useAllNoteCategories } from '@/features/notes/useNoteCategories';
import { resolveEntryTypeLabel, categoriesToMap } from '@/lib/journalEntryLabel';
import {
  usePauseSession,
  useResumeSession,
  useFinishSession,
  useDiscardSession,
} from '@/features/reading-session/useSessionMutations';
import { useCreateNote, useRemoveNote } from '@/features/notes/useNotes';
import { useCreateQuote, useRemoveQuote } from '@/features/quotes/useQuotes';
import {
  useJournalBySession,
  useToggleJournalFavorite,
  useSetJournalReaction,
  useJournalDraft,
  useSaveJournalDraft,
  useClearJournalDraft,
} from '@/features/journal/useJournal';
import { useUpdateCurrentPage } from '@/features/library/useUpdateUserBook';
import { useLiveElapsedMs } from '@/features/reading-session/useLiveElapsedMs';
import { formatDuration, isCurrentlyPaused } from '@/lib/sessionTiming';
import { computeProgressPercent } from '@/lib/progressPercent';
import { createLogger } from '@/lib/logger';
import type { NoteType } from '@/types/note';
import type { JournalEntry, JournalEntryKind } from '@/types/journalEntry';

const log = createLogger('app/session');

const KIND_OPTIONS = [
  { value: 'note' as JournalEntryKind, label: 'Нотатка' },
  { value: 'quote' as JournalEntryKind, label: 'Цитата' },
];

/** `''`/пробіли/сміття (нечислове значення) — усі рівнозначно "сторінку не вказано", а не
 * `NaN`, що потрапило б у SQLite як реальне значення (той самий підхід, що й `parseOptionalInt`
 * у `app/work/new.tsx`). */
function parseOptionalPage(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Активна сесія читання (п.12 ТЗ). Таймер — чисте обчислення з `started_at`/`paused_intervals`,
 * що вже лежать у SQLite (записані одразу при старті сесії) — тому force-quit просто
 * призводить до relaunch і повторного відкриття цього ж екрана з тими самими даними, без
 * втрати часу (докладніше — `src/lib/sessionTiming.ts`). Той самий таймер (`useLiveElapsedMs`)
 * тепер тікає й на панелі активного читання, видимій з будь-якої вкладки (`ReadingSessionMiniBar`,
 * Milestone 11, доповнення) — вона ж і відновлює доступ до "осиротілої" сесії після force-quit,
 * замість колишнього банера, який був лише на Home.
 *
 * Milestone 11 (Фаза 3): екран отримав велику обкладинку/автора зверху й секцію швидкого
 * запису щоденника (думка/питання/теорія/момент/цитата) прямо тут — щоб зберегти момент
 * читання можна було без виходу з таймера. Композер і сам таймер повністю незалежні (той
 * самий `now`-стан, що й раніше) — набір тексту в композері жодного разу не перераховує й не
 * скидає таймер.
 */
export default function ActiveSessionScreen() {
  const theme = useTheme();
  const { sessionId, openFinish } = useLocalSearchParams<{ sessionId: string; openFinish?: string }>();
  const { data, isLoading, isError, refetch } = useSessionWithBook(sessionId);
  const pauseSession = usePauseSession();
  const resumeSession = useResumeSession();
  const finishSession = useFinishSession();
  const discardSession = useDiscardSession();
  const createMoodNote = useCreateNote();
  const setMoodReactionValue = useSetJournalReaction();

  // `openFinish=1` — панель активного читання (`ReadingSessionMiniBar`, доступна з будь-якої
  // вкладки) веде сюди одним тапом одразу з відкритою формою завершення, замість того, щоб
  // сама намагатись зібрати кінцеву сторінку/нотатку в тісній панелі: форма завершення й так
  // валідована й перевірена лише тут, дублювати її — зайвий ризик розбіжності. Лише
  // початкове значення (lazy-ініціалізатор) — подальші зміни параметра (їх і не буде для
  // того самого екрана) не мають наново розгортати форму, яку користувач уже міг закрити.
  const [showFinishForm, setShowFinishForm] = useState(() => openFinish === '1');
  const [endPage, setEndPage] = useState('');
  const [moodNote, setMoodNote] = useState('');
  // "Настрій" сеансу (Milestone 11, доповнення — власник продукту, ідея з референсом):
  // необов'язкова ОДНА з 7 фіксованих реакцій, окремо від вільного тексту "Нотатка про
  // настрій" вище — докладніше про рішення НЕ зливати їх в одне поле й НЕ вимагати текст для
  // реакції — коментар біля `ReactionChips` нижче й `handleFinish`.
  const [moodReaction, setMoodReaction] = useState<ReactionId | null>(null);

  const elapsedMs = useLiveElapsedMs(data?.session);
  const paused = data ? isCurrentlyPaused(data.session.pausedIntervals) : false;

  // Синхронний "намір паузи" — окремо від `paused` вище (похідне з даних запиту, які можуть
  // на мить відставати від щойно відправленої мутації пауза/відновлення: `pause`/`resume`
  // читають рядок, перевіряють, пишуть — не один атомарний SQL-вираз). Без цього швидка
  // послідовність "тап Пауза" → одразу тап "Завершити читання" могла прочитати в ефекті
  // автопаузи нижче ЩЕ старі (не по паузі) дані запиту, переплутати щойно поставлену вручну
  // паузу з "паузи ще нема" і зайво накласти автопаузу поверх неї — тоді "Назад" помилково
  // відновив би сесію, яку користувач щойно свідомо лишив на паузі.
  //
  // `intentSeededRef` — сіє `pausedIntentRef` РІВНО ОДИН РАЗ, коли дані сесії вперше
  // завантажились (щоб коректно відобразити стан "уже на паузі до відкриття цього екрана").
  // Після цього `pausedIntentRef` міняють лише явні дії тут-таки (`handleTogglePause`,
  // автопауза, `closeFinishForm`) — НЕ повторний сеанс від рефетчу запиту, інакше та сама
  // затримка мережі/SQLite, що й породжує гонку, одразу затерла б щойно виставлений намір.
  const pausedIntentRef = useRef(false);
  const intentSeededRef = useRef(false);

  useEffect(() => {
    if (!data || intentSeededRef.current) return;
    intentSeededRef.current = true;
    pausedIntentRef.current = isCurrentlyPaused(data.session.pausedIntervals);
  }, [data]);

  // Синхронне дзеркало `showFinishForm` (Milestone 11, доповнення — фікс гонки з незалежного
  // аудиту, п.1 нижче) — потрібне лише всередині `runPauseOrResume`'s `onSettled`, який може
  // спрацювати НАБАГАТО пізніше моменту виклику (мережа/SQLite): звірятись треба з тим, чи
  // форма відкрита ЗАРАЗ, а не була відкрита в момент диспетчеризації мутації, інакше
  // відкладена дія (див. чергу нижче) могла б застосуватись до вже застарілого стану екрана.
  const showFinishFormRef = useRef(showFinishForm);
  // eslint-disable-next-line react-hooks/refs -- навмисний синхронний "мірор" без затримки
  // ефекту (React-документований патерн: мутація ref під час рендеру, значення читається лише
  // пізніше в асинхронному `onSettled` вище). Проєкт не використовує React Compiler — це суто
  // майбутня застереження лінтера, не реальний ризик у поточному рантаймі.
  showFinishFormRef.current = showFinishForm;

  // Захист від подвійного тапу (той самий підхід, що й `ReadingSessionMiniBar.tsx`,
  // аудит M11 п.6.5) — синхронна перевірка тут, а не лише `disabled` на кнопці нижче.
  const togglePausePending = pauseSession.isPending || resumeSession.isPending;

  // ВИПРАВЛЕННЯ (незалежний аудит після Milestone 11, п.1): раніше `handleTogglePause`,
  // автопауза (ефект нижче) і `closeFinishForm` кожен викликав `pauseSession.mutate`/
  // `resumeSession.mutate` напряму, лише `handleTogglePause` перевіряв `togglePausePending`.
  // `ReadingSessionRepository.pause`/`resume` — це "прочитати рядок → перевірити → записати",
  // НЕ один атомарний SQL-вираз, тож дві такі мутації з РІЗНИХ місць (напр. автопауза при
  // відкритті форми завершення й одразу "Назад" до того, як перша встигла завершитись) могли
  // опинитись "у польоті" одночасно на той самий `reading_session.id` — пізніший запис мовчки
  // затирав інтервал паузи, записаний раніше.
  //
  // `runPauseOrResume` — ЄДИНА точка виклику pause/resume для всіх трьох місць (кнопка,
  // автопауза, "Назад"): поки попередня pause/resume-мутація ще виконується, нова не
  // диспетчерується одразу, а лише ЗАПАМ'ЯТОВУЄТЬСЯ (`queuedPauseIntentRef`, останній намір
  // перемагає) і застосовується автоматично одразу після завершення поточної — жодна дія
  // користувача не губиться, лише на частку секунди відкладається, і в один момент часу існує
  // не більш як один pause/resume-запит у польоті.
  const pauseResumeInFlightRef = useRef(false);
  const queuedPauseIntentRef = useRef<'pause' | 'resume' | null>(null);

  const runPauseOrResume = (action: 'pause' | 'resume', onError?: () => void) => {
    if (!data) return;
    if (pauseResumeInFlightRef.current) {
      queuedPauseIntentRef.current = action;
      return;
    }
    pauseResumeInFlightRef.current = true;
    pausedIntentRef.current = action === 'pause';
    const mutation = action === 'pause' ? pauseSession : resumeSession;
    mutation.mutate(
      { id: data.session.id, userBookId: data.session.userBookId },
      {
        onError: () => {
          // Відкат оптимістичного наміру при помилці — інакше `pausedIntentRef` назавжди
          // розійшовся б із фактичним станом у БД (мутація не зроблена, дані незмінні).
          pausedIntentRef.current = action !== 'pause';
          onError?.();
        },
        onSettled: () => {
          pauseResumeInFlightRef.current = false;
          const queued = queuedPauseIntentRef.current;
          queuedPauseIntentRef.current = null;
          if (queued) {
            runPauseOrResume(queued);
            return;
          }
          // Черга спорожніла — звіряємо намір із тим, чи форма завершення відкрита ЗАРАЗ:
          // якщо так, а сесія щойно опинилась НЕ на паузі й автопауза для цього відкриття ще
          // не виставлена (могло статись через щойно застосований відкладений намір
          // "відновити" з надто швидкого циклу "Завершити"→"Назад"→"Завершити" — див. коментар
          // над `showFinishFormRef`), автопауза мала б бути активною знову.
          if (showFinishFormRef.current && !pausedIntentRef.current && !autoPausedRef.current) {
            autoPausedRef.current = true;
            // Той самий відкат onError, що й у первинному виклику автопаузи нижче — інакше
            // при невдалій корективній паузі тут `autoPausedRef` лишився б застряглим на
            // `true` без фактичної паузи сесії, а `!autoPausedRef.current`-охорона вище
            // назавжди заблокувала б будь-яку подальшу спробу виправити цю розбіжність.
            runPauseOrResume('pause', () => { autoPausedRef.current = false; });
          }
        },
      },
    );
  };

  const handleTogglePause = () => {
    if (!data || togglePausePending) return;
    runPauseOrResume(paused ? 'resume' : 'pause');
  };

  // Автопауза на час заповнення форми завершення (фікс: раніше таймер рахувального
  // "чистого часу читання" (`computeElapsedMs`) продовжував рости, поки користувач вписував
  // кінцеву сторінку/нотатку/настрій — `ReadingSessionRepository.finish` фіксує `ended_at` в
  // МОМЕНТ фактичного збереження, тож усі секунди заповнення форми мовчки потрапляли в
  // збережену тривалість сесії). Пауза — той самий механізм, що й ручна кнопка "Пауза": поки
  // остання пауза не "resumed", `computeElapsedMs` не росте (`sessionTiming.ts`), і
  // `finish()` сам закриває цю паузу моментом `ended_at`, тож весь час на формі коректно НЕ
  // рахується як час читання.
  //
  // `autoPausedRef` — щоб не плутати "паузу, яку поставила ця форма" з паузою, яку користувач
  // уже тримав до того, як натиснув "Завершити читання": лише в першому випадку "Назад"
  // повинен автоматично відновити читання, у другому — лишити на паузі, як і було. Перевірка
  // йде проти `pausedIntentRef` (синхронний намір), а не напряму проти `data` — саме це й
  // закриває гонку, описану вище.
  //
  // `pauseSession` (стабільний мутатор з `useMutation`) навмисно не в переліку залежностей —
  // той самий підхід, що й у рефетч-ефектах `JournalComposer` нижче.
  const autoPausedRef = useRef(false);

  useEffect(() => {
    if (!data || !showFinishForm) return;
    if (autoPausedRef.current) return;
    if (pausedIntentRef.current) return;
    autoPausedRef.current = true;
    runPauseOrResume('pause', () => {
      // Той самий відкат, що й у `runPauseOrResume` для `pausedIntentRef` — якщо мутація не
      // вдалась, `autoPausedRef` теж має повернутись, інакше форма назавжди "думатиме", що
      // вже подбала про паузу, і перестане намагатись знову.
      autoPausedRef.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, showFinishForm]);

  const openFinishForm = () => setShowFinishForm(true);

  const closeFinishForm = () => {
    if (autoPausedRef.current) {
      // eslint-disable-next-line react-hooks/immutability -- звичайний обробник події (не
      // рендер): той самий безпечний патерн запису в ref, що й в `onSettled`/ефекті вище.
      // Проєкт не використовує React Compiler — суто майбутнє застереження лінтера.
      autoPausedRef.current = false;
      runPauseOrResume('resume');
    }
    setShowFinishForm(false);
  };

  /** Скасувати сесію повністю (Milestone 8.4) — на відміну від "Завершити читання", прогрес
   * (час, сторінки) НЕ зберігається: для випадків "відкрив не ту книгу", "це був тестовий
   * запуск" тощо, коли зберігати чернетку сесії в історію не має сенсу. `ReadingSessionRepository.discard`
   * — теж м'яке видалення (`deleted_at`), тож `useReadingHistory`/`useActiveSession` просто
   * перестають її бачити. Записи щоденника, додані під час сесії, НЕ видаляються разом з нею
   * — це вже реальні думки користувача про книгу, а не частина статистики читання. */
  const handleDiscard = () => {
    if (!data) return;
    Alert.alert(
      'Скасувати сесію?',
      'Прогрес цієї сесії (час, сторінки) не буде збережено в історію читання. Нотатки й цитати, які ти встиг(ла) додати, залишаться. Цю дію не можна відмінити.',
      [
        { text: 'Ні, продовжити', style: 'cancel' },
        {
          text: 'Скасувати сесію',
          style: 'destructive',
          onPress: () => {
            discardSession.mutate(
              { id: data.session.id, userBookId: data.session.userBookId },
              {
                onSuccess: () => {
                  router.replace({ pathname: '/work/[workId]', params: { workId: data.userBook.work.id } });
                },
              },
            );
          },
        },
      ],
    );
  };

  const handleFinish = async () => {
    if (!data) return;
    const parsedEndPage = Number.parseInt(endPage.trim(), 10);
    const finalEndPage = Number.isFinite(parsedEndPage) ? parsedEndPage : data.session.startPage;

    try {
      await finishSession.mutateAsync({
        id: data.session.id,
        userBookId: data.session.userBookId,
        endPage: finalEndPage,
        moodNote: moodNote.trim() || null,
      });

      // "Настрій" сеансу (доповнення) — необов'язково, окремо від `moodNote` вище й
      // не блокує завершення сесії, якщо не вдасться: сесія вже збережена, а мітка настрою —
      // приємне доповнення, не критична дія, тож помилка тут лише лягає в лог, без alert/toast
      // і без відкату вже успішного завершення сесії.
      if (moodReaction) {
        try {
          const note = await createMoodNote.mutateAsync({
            userBookId: data.session.userBookId,
            sessionId: data.session.id,
            type: 'moment',
            text: REACTION_META[moodReaction].label,
          });
          await setMoodReactionValue.mutateAsync({
            id: note.id,
            kind: 'note',
            userBookId: data.session.userBookId,
            reaction: moodReaction,
          });
        } catch (error) {
          log.warn('Не вдалося зберегти настрій сеансу', { error });
        }
      }

      router.replace({ pathname: '/work/[workId]', params: { workId: data.userBook.work.id } });
    } catch {
      // `useFinishSession`'s `onError` вже показав тост із причиною (Milestone 8) — тут
      // лише не даємо необробленому reject вилетіти в консоль/термінал, той самий підхід,
      // що й у `app/import/review.tsx`. Форма лишається відкритою, користувач може
      // спробувати ще раз без повторного набору даних.
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: data?.userBook.work.title ?? 'Читання',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer>
        {isError ? (
          <QueryErrorState onRetry={() => refetch()} />
        ) : isLoading ? (
          <AppText variant="body" color="secondary">
            Завантаження…
          </AppText>
        ) : !data ? (
          <AppText variant="body" color="secondary">
            Сесію не знайдено. Можливо, її вже завершено.
          </AppText>
        ) : (
          <View style={{ gap: theme.spacing.xl, paddingTop: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}>
            <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
              <CoverThumbnail
                coverUrl={data.userBook.edition.coverUrl}
                title={data.userBook.work.title}
                fallbackColor={data.userBook.work.coverFallbackColor}
                width={92}
                height={134}
                borderRadius={theme.radius.md}
              />
              <AppText variant="title" style={{ textAlign: 'center' }}>
                {data.userBook.work.title}
              </AppText>
              {data.userBook.work.authors.length > 0 ? (
                <AppText variant="body" color="secondary" style={{ textAlign: 'center' }}>
                  {data.userBook.work.authors.map((a) => a.name).join(', ')}
                </AppText>
              ) : null}
            </View>

            <Card style={{ alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.xl }}>
              {paused ? (
                <View
                  style={{
                    paddingHorizontal: theme.spacing.md,
                    paddingVertical: theme.spacing.xs,
                    borderRadius: theme.radius.pill,
                    backgroundColor: theme.colors.accentSoft,
                  }}
                >
                  <AppText variant="caption" color="accent">
                    На паузі
                  </AppText>
                </View>
              ) : null}

              <AppText variant="display" style={{ fontSize: 56, lineHeight: 64 }}>
                {formatDuration(elapsedMs)}
              </AppText>

              <AppText variant="caption" color="tertiary">
                {data.userBook.currentPage > data.session.startPage
                  ? `Зараз на сторінці ${data.userBook.currentPage}`
                  : `Почато зі сторінки ${data.session.startPage}`}
                {data.session.goalMinutes ? ` · ціль ${data.session.goalMinutes} хв` : ''}
              </AppText>
            </Card>

            {!showFinishForm ? (
              <View style={{ gap: theme.spacing.md }}>
                <Button
                  label={paused ? 'Продовжити' : 'Пауза'}
                  variant="secondary"
                  onPress={handleTogglePause}
                  disabled={togglePausePending}
                />
                <Button label="Завершити читання" onPress={openFinishForm} />
                <Button
                  label={discardSession.isPending ? 'Скасовую…' : 'Скасувати сесію'}
                  variant="ghost"
                  onPress={handleDiscard}
                  disabled={discardSession.isPending}
                />
              </View>
            ) : (
              <View style={{ gap: theme.spacing.lg }}>
                <LabeledInput
                  label="На якій сторінці зупинився?"
                  value={endPage}
                  onChangeText={setEndPage}
                  keyboardType="numeric"
                  placeholder={String(data.session.startPage)}
                />
                <LabeledInput
                  label="Нотатка про настрій (необов'язково)"
                  value={moodNote}
                  onChangeText={setMoodNote}
                />
                <View style={{ gap: theme.spacing.xs }}>
                  <AppText variant="caption" color="secondary">
                    Настрій цього сеансу (необов&apos;язково)
                  </AppText>
                  <ReactionChips value={moodReaction} onChange={setMoodReaction} />
                </View>
                <Button
                  label={finishSession.isPending ? 'Зберігаю…' : 'Зберегти сесію'}
                  onPress={handleFinish}
                  disabled={finishSession.isPending}
                />
                <Button label="Назад" variant="ghost" onPress={closeFinishForm} />
              </View>
            )}

            {!showFinishForm ? (
              <View style={{ gap: theme.spacing.lg }}>
                <JournalComposer
                  userBookId={data.session.userBookId}
                  editionId={data.userBook.edition.id}
                  sessionId={data.session.id}
                  currentPage={data.userBook.currentPage}
                  pageCount={data.userBook.edition.pageCount}
                />
                <SessionJournalEntries sessionId={data.session.id} userBookId={data.session.userBookId} />
              </View>
            ) : null}
          </View>
        )}
      </ScreenContainer>
    </>
  );
}

interface JournalComposerProps {
  userBookId: string;
  editionId: string;
  sessionId: string;
  currentPage: number;
  pageCount: number | null;
}

/**
 * Швидкий запис думки/питання/теорії/моменту/цитати прямо під час читання (Milestone 11,
 * Фаза 3, п.2-3 ТЗ). Композер завжди розгорнутий (не за "+ Додати", на відміну від секцій
 * нотаток/цитат на екрані книги) — це головна дія цього екрана, тому жодного зайвого тапу.
 *
 * Чернетка (`journal_draft`) автозберігається з дебаунсом при кожній зміні тексту й
 * відновлюється один раз при відкритті екрана (`restoredRef` — щоб фоновий рефетч чернетки
 * пізніше не затер те, що користувач уже почав вводити).
 */
function JournalComposer({ userBookId, editionId, sessionId, currentPage, pageCount }: JournalComposerProps) {
  const theme = useTheme();
  const [kind, setKind] = useState<JournalEntryKind>('note');
  const [category, setCategory] = useState<NoteCategoryValue>({ type: 'thought', categoryId: null });
  const [text, setText] = useState('');
  const [comment, setComment] = useState('');
  const [page, setPage] = useState(currentPage > 0 ? String(currentPage) : '');

  const createNote = useCreateNote();
  const createQuote = useCreateQuote();
  const updateCurrentPage = useUpdateCurrentPage();
  const draftQuery = useJournalDraft(userBookId);
  const saveDraft = useSaveJournalDraft();
  const clearDraft = useClearJournalDraft();

  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || draftQuery.isLoading) return;
    restoredRef.current = true;
    const draft = draftQuery.data;
    if (draft && (draft.text.trim().length > 0 || (draft.comment ?? '').trim().length > 0)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- одноразова гідратація
      // локальної форми з чернетки, збереженої в SQLite (асинхронна БД, іншого способу
      // дістати ці дані до першого рендеру немає); `restoredRef` вище гарантує рівно один
      // прохід, каскадного ре-рендеру тут не виникає.
      setKind(draft.kind);
      // Чернетка зберігає лише вбудований `type` (`journal_draft` таблиця не має власного
      // поля під власну категорію) — власна категорія, яку користувач тапнув перед тим, як
      // вийти з екрана, при відновленні чернетки НЕ відновлюється (categoryId: null),
      // навмисний і задокументований компроміс, а не забутий випадок: рідкісна ситуація
      // (force-quit/crash посеред набору тексту), і після відновлення чернетки все одно
      // видно повний список категорій, щоб обрати ще раз одним тапом.
      if (draft.kind === 'note' && draft.type) setCategory({ type: draft.type as NoteType, categoryId: null });
      setText(draft.text);
      setComment(draft.comment ?? '');
      if (draft.page != null) setPage(String(draft.page));
    }
  }, [draftQuery.isLoading, draftQuery.data]);

  useEffect(() => {
    if (!restoredRef.current) return;
    const trimmedText = text.trim();
    const trimmedComment = comment.trim();
    if (trimmedText.length === 0 && trimmedComment.length === 0) {
      clearDraft.mutate({ userBookId });
      return;
    }
    const handle = setTimeout(() => {
      saveDraft.mutate({
        userBookId,
        sessionId,
        kind,
        type: kind === 'note' ? category.type : null,
        text,
        comment: kind === 'quote' ? comment : null,
        page: parseOptionalPage(page) ?? null,
      });
    }, 600);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, category, text, comment, page]);

  const isSaving = createNote.isPending || createQuote.isPending;

  const handleSave = async () => {
    const trimmedText = text.trim();
    if (!trimmedText) return;
    const parsedPage = parseOptionalPage(page);
    const progressPercent = computeProgressPercent(parsedPage ?? null, pageCount);

    if (kind === 'note') {
      await createNote.mutateAsync({
        userBookId,
        sessionId,
        type: category.type,
        categoryId: category.categoryId,
        text: trimmedText,
        page: parsedPage,
        progressPercent,
      });
    } else {
      await createQuote.mutateAsync({
        userBookId,
        editionId,
        sessionId,
        text: trimmedText,
        comment: comment.trim() || undefined,
        page: parsedPage,
        progressPercent,
      });
    }

    // Композер і так знає сторінку, яку читач щойно ввів — доречно оновити "поточну сторінку"
    // книги заодно, а не чекати завершення сесії (Milestone 3 передбачало саме це — `useUpdateCurrentPage`
    // існував, але ніде не викликався). Лише вперед, ніколи назад — щоб пізніша нотатка про
    // вже прочитаний уривок не відкотила прогрес.
    if (parsedPage != null && parsedPage > currentPage) {
      updateCurrentPage.mutate({ id: userBookId, currentPage: parsedPage });
    }

    clearDraft.mutate({ userBookId });
    setText('');
    setComment('');
    // `kind`/`category`/`page` навмисно НЕ скидаються — часто одразу після цього хочеться
    // додати ще один запис тієї самої категорії з тієї самої сторінки.
  };

  return (
    <Card style={{ gap: theme.spacing.md }}>
      <AppText variant="heading">Записати думку</AppText>

      <ChipSelect label="Що записуємо" options={KIND_OPTIONS} value={kind} onChange={setKind} />
      {kind === 'note' ? (
        <NoteCategoryPicker userBookId={userBookId} value={category} onChange={setCategory} />
      ) : null}

      <LabeledInput
        label={kind === 'note' ? 'Що спало на думку?' : 'Текст цитати'}
        value={text}
        onChangeText={setText}
        multiline
        style={{ minHeight: 88, paddingTop: theme.spacing.sm, textAlignVertical: 'top' }}
      />

      {kind === 'quote' ? (
        <LabeledInput label="Коментар (необов'язково)" value={comment} onChangeText={setComment} />
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.md }}>
        <View style={{ width: 100 }}>
          <LabeledInput label="Сторінка" value={page} onChangeText={setPage} keyboardType="numeric" />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label={isSaving ? 'Зберігаю…' : 'Зберегти запис'}
            onPress={handleSave}
            disabled={!text.trim() || isSaving}
          />
        </View>
      </View>
    </Card>
  );
}

/** Записи, додані під час цієї сесії — живий "лог" одразу під композером, найновіші зверху
 * (той самий порядок, що й скрізь у застосунку). Порожньо на самому початку сесії — просто
 * не рендериться, доки нема що показувати. */
function SessionJournalEntries({ sessionId, userBookId }: { sessionId: string; userBookId: string }) {
  const theme = useTheme();
  const { data: entries } = useJournalBySession(sessionId);
  // Включно з м'яко видаленими (`useAllNoteCategories`, не `useActiveNoteCategories`) — запис,
  // зроблений раніше цієї ж сесії власною категорією, яку користувач щойно прибрав у панелі
  // "Керувати", має й далі показувати її назву, а не порожню мітку (`resolveEntryTypeLabel`).
  const { data: categories } = useAllNoteCategories(userBookId);
  const categoriesById = categoriesToMap(categories);
  const removeNote = useRemoveNote();
  const removeQuote = useRemoveQuote();
  const toggleFavorite = useToggleJournalFavorite();
  const setReaction = useSetJournalReaction();

  if (!entries || entries.length === 0) return null;

  const handleRemove = (entry: JournalEntry) => {
    if (entry.kind === 'note') {
      removeNote.mutate({ id: entry.id, userBookId, sessionId });
    } else {
      removeQuote.mutate({ id: entry.id, userBookId, sessionId });
    }
  };

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <AppText variant="caption" color="secondary">
        Записано під час цієї сесії ({entries.length})
      </AppText>

      {entries.map((entry) => (
        <Card key={entry.id} style={{ gap: theme.spacing.xs }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText variant="caption" color="accent">
              {resolveEntryTypeLabel(entry, categoriesById)}
              {entry.page != null ? ` · с. ${entry.page}` : ''}
            </AppText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
              <ReactionToggle
                value={entry.reaction}
                onChange={(reaction) =>
                  setReaction.mutate({ id: entry.id, kind: entry.kind, userBookId, reaction, sessionId: entry.sessionId })
                }
              />
              <Pressable
                onPress={() =>
                  toggleFavorite.mutate({
                    id: entry.id,
                    kind: entry.kind,
                    userBookId,
                    isFavorite: !entry.isFavorite,
                    sessionId: entry.sessionId,
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={entry.isFavorite ? 'Прибрати з обраного' : 'Додати в обране'}
                hitSlop={8}
                style={{
                  width: theme.minTouchTarget,
                  height: theme.minTouchTarget,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons
                  name={entry.isFavorite ? 'heart' : 'heart-outline'}
                  size={18}
                  color={entry.isFavorite ? theme.colors.danger : theme.colors.textTertiary}
                />
              </Pressable>
              <Pressable
                onPress={() => handleRemove(entry)}
                accessibilityRole="button"
                accessibilityLabel="Видалити запис"
                hitSlop={8}
                style={{
                  width: theme.minTouchTarget,
                  height: theme.minTouchTarget,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="trash-outline" size={16} color={theme.colors.textTertiary} />
              </Pressable>
            </View>
          </View>
          <AppText variant="body" style={entry.kind === 'quote' ? { fontStyle: 'italic' } : undefined}>
            {entry.text}
          </AppText>
          {entry.comment ? (
            <AppText variant="caption" color="secondary">
              {entry.comment}
            </AppText>
          ) : null}
        </Card>
      ))}
    </View>
  );
}
