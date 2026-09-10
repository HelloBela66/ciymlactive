import React from 'react';
import { View, Pressable } from 'react-native';
import { router, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { CoverThumbnail } from '@/components/ui/CoverThumbnail';
import { ReadingProgressBar } from '@/components/ui/ReadingProgressBar';
import { useTheme } from '@/design/ThemeProvider';
import { useActiveSession } from '@/features/reading-session/useActiveSession';
import { useSessionWithBook } from '@/features/reading-session/useSessionWithBook';
import { useLiveElapsedMs } from '@/features/reading-session/useLiveElapsedMs';
import { usePauseSession, useResumeSession } from '@/features/reading-session/useSessionMutations';
import { formatDuration, isCurrentlyPaused } from '@/lib/sessionTiming';
import { computeProgressPercent } from '@/lib/progressPercent';

const COVER_WIDTH = 36;
const COVER_HEIGHT = 52;
const ACTION_SIZE = 40;

/**
 * Панель активного читання (Milestone 11, доповнення — прямий запит власника продукту:
 * "уведомление... і статус прочитання книги в барі і %, книга/автор, пауза/завершити, час
 * читання", натхнено iOS Live Activity сторонніх застосунків, докладніше в CHANGELOG). Справжня
 * iOS Live Activity технічно недосяжна зараз (немає платного Apple Developer акаунту, повністю
 * managed Expo без нативного коду, немає можливості зібрати/протестувати iOS з цього
 * середовища) — Android-аналог (persistent system notification) вимагав би нового нативного
 * модуля й пересборки dev-client. Власник продукту (`AskUserQuestion`) свідомо обрав
 * найдосяжніший зараз варіант: власна, повністю в JS/RN панель ВСЕРЕДИНІ застосунку — видима з
 * будь-якої вкладки, поки є активна сесія, без жодного нативного коду й пересборки.
 *
 * Монтується один раз у `app/(tabs)/_layout.tsx` (композиція з кастомним `tabBar`, одразу над
 * справжньою нижньою навігацією) — НЕ дублюється по кожному екрану вкладки. Замінює собою
 * колишній `ActiveSessionBanner`, що існував лише на Home: та сама інформація ("незавершена
 * сесія") тепер доступна звідусіль, тож окремий Home-банер став би просто дублюванням тієї
 * самої дії двома різними візуальними мовами.
 *
 * Дизайн: спокійна картка-панель (не throbbing/яскравий "лайв" стиль скріншотів-натхнення) —
 * той самий принцип, що й решта застосунку (docs/ARCHITECTURE.md, розділ 6): обкладинка й
 * акцентний колір самі несуть відчуття "щось активне зараз відбувається", без важких
 * градієнтів/анімацій.
 *
 * Тап по обкладинці/назві — повний екран сесії (`app/session/[sessionId].tsx`, той самий
 * таймер/дані, просто розгорнуто). Пауза/відновлення — миттєва дія прямо тут, без переходу
 * (не потребує форми). "Завершити" веде на повний екран з одразу розгорнутою формою
 * завершення (`?openFinish=1`) — кінцева сторінка/нотатка про настрій навмисно лишаються
 * повноцінною формою на великому екрані, а не тісним інпутом у панелі: саме там ця форма вже
 * перевірена й валідована (Milestone 8 fix), дублювати її тут — зайвий ризик розбіжності між
 * двома копіями тієї самої логіки.
 */
export function ReadingSessionMiniBar() {
  const theme = useTheme();
  const { data: activeSession } = useActiveSession();
  const { data } = useSessionWithBook(activeSession?.id);
  const pauseSession = usePauseSession();
  const resumeSession = useResumeSession();

  const elapsedMs = useLiveElapsedMs(data?.session);

  if (!activeSession || !data) return null;

  const { session, userBook } = data;
  const paused = isCurrentlyPaused(session.pausedIntervals);
  const percent = computeProgressPercent(userBook.currentPage, userBook.edition.pageCount);
  const authors = userBook.work.authors.map((a) => a.name).join(', ');

  const goToSession = () => {
    router.push({ pathname: '/session/[sessionId]', params: { sessionId: session.id } });
  };

  const goToFinish = () => {
    // `as unknown as Href` — той самий, уже усталений у застосунку прийом (`app/(tabs)/index.tsx`)
    // для необов'язкового параметра, якого локальний кеш typed routes ще не бачив.
    router.push({
      pathname: '/session/[sessionId]',
      params: { sessionId: session.id, openFinish: '1' },
    } as unknown as Href);
  };

  // Захист від подвійного тапу (аудит M11, п.6.5) — єдина мутуюча кнопка в цій панелі, що його
  // не мала: `ReadingSessionRepository.pause`/`resume` — це "прочитати стан → перевірити →
  // записати", не один атомарний SQL-вираз, тож два швидкі тапи поспіль теоретично можуть
  // обидва прочитати стан ДО першого запису й другий запис мовчки затре перший (втрачений
  // інтервал паузи). Синхронна перевірка тут, а не лише `disabled` на `Pressable` нижче —
  // той самий підхід, що й `handleShare`/`handleSave` в `app/memory/[workId].tsx`.
  const togglePending = pauseSession.isPending || resumeSession.isPending;
  const handleTogglePause = () => {
    if (togglePending) return;
    if (paused) {
      resumeSession.mutate({ id: session.id, userBookId: session.userBookId });
    } else {
      pauseSession.mutate({ id: session.id, userBookId: session.userBookId });
    }
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.sm,
        backgroundColor: theme.colors.surfaceRaised,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
      }}
    >
      <Pressable
        onPress={goToSession}
        accessibilityRole="button"
        accessibilityLabel={`Читання: ${userBook.work.title}${authors ? `, ${authors}` : ''}. ${
          paused ? 'На паузі' : `Триває, ${formatDuration(elapsedMs)}`
        }${percent != null ? `, прочитано ${Math.round(percent)}%` : ''}. Відкрити сесію.`}
        style={({ pressed }) => ({
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <CoverThumbnail
          coverUrl={userBook.edition.coverUrl}
          title={userBook.work.title}
          fallbackColor={userBook.work.coverFallbackColor}
          width={COVER_WIDTH}
          height={COVER_HEIGHT}
        />
        <View style={{ flex: 1, gap: 3 }}>
          <AppText variant="body" numberOfLines={1}>
            {userBook.work.title}
          </AppText>
          <AppText variant="caption" color="secondary" numberOfLines={1}>
            {authors || ' '}
          </AppText>
          {percent != null ? (
            <View style={{ marginTop: 2 }}>
              <ReadingProgressBar percent={percent} height={4} showLabel={false} />
            </View>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2, minWidth: 54 }}>
          <AppText variant="caption" color={paused ? 'tertiary' : 'accent'} style={{ fontVariant: ['tabular-nums'] }}>
            {formatDuration(elapsedMs)}
          </AppText>
          {percent != null ? (
            <AppText variant="micro" color="tertiary">
              {Math.round(percent)}%
            </AppText>
          ) : (
            <AppText variant="micro" color="tertiary">
              {paused ? 'на паузі' : 'читаю'}
            </AppText>
          )}
        </View>
      </Pressable>

      <Pressable
        onPress={handleTogglePause}
        disabled={togglePending}
        accessibilityRole="button"
        accessibilityState={{ disabled: togglePending }}
        accessibilityLabel={paused ? 'Продовжити читання' : 'Поставити на паузу'}
        hitSlop={6}
        style={({ pressed }) => ({
          width: ACTION_SIZE,
          height: ACTION_SIZE,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: togglePending ? 0.5 : pressed ? 0.7 : 1,
        })}
      >
        <Ionicons name={paused ? 'play' : 'pause'} size={18} color={theme.colors.accent} />
      </Pressable>

      <Pressable
        onPress={goToFinish}
        accessibilityRole="button"
        accessibilityLabel="Завершити сесію читання"
        hitSlop={6}
        style={({ pressed }) => ({
          width: ACTION_SIZE,
          height: ACTION_SIZE,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Ionicons name="checkmark" size={20} color={theme.colors.accent} />
      </Pressable>
    </View>
  );
}
