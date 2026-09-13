import type { ModalProps } from 'react-native';
import { useTheme } from '@/design/ThemeProvider';

type ModalAnimationType = NonNullable<ModalProps['animationType']>;

/**
 * POLYTSIA V1.6.1, Фаза 22 (`docs/A11Y_LARGE_TEXT_AUDIT.md`) — `theme.reduceMotionEnabled`
 * (`ThemeProvider.tsx`, читає `AccessibilityInfo.isReduceMotionEnabled`) існував з Milestone 8,
 * але до цієї фази його не читав жоден компонент застосунку (перевірено `grep` по всьому
 * `src`/`app`) — прапорець збирався, але нічого не вимикав. Єдина нетривіальна анімація в
 * усьому застосунку — вбудований перехід системного `Modal` (`animationType`) на чотирьох
 * bottom sheet/попапах (`LibrarySortSheet`/`BookQuickActionsSheet`/`ReactionPicker`/
 * `JournalTimeline`); `CollapsibleSection` навмисно синхронна без анімації (`docs/…` коментар
 * там-таки), `react-native-reanimated` — залежність у `package.json`, але жодного
 * `useAnimatedStyle`/`withTiming` виклику ніде немає (окрема, поза скоупом цієї фази знахідка —
 * той самий клас "залежність без використання", що й Zustand, аудит T10).
 *
 * `'none'` замість `preferred` типу, коли `reduceMotionEnabled` — той самий підхід, що офіційно
 * рекомендує React Native (`Modal.animationType`: `'none' | 'slide' | 'fade'`) для
 * respect-reduce-motion без стороннньої бібліотеки.
 */
export function useReducedMotionAnimationType(preferred: ModalAnimationType): ModalAnimationType {
  const theme = useTheme();
  return theme.reduceMotionEnabled ? 'none' : preferred;
}
