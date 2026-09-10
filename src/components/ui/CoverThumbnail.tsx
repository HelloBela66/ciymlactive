import React, { useEffect, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { AppText } from './AppText';
import { useTheme } from '@/design/ThemeProvider';

interface CoverThumbnailProps {
  /** `Edition.coverUrl` — офіційна обкладинка (від провайдера) або власне фото користувача
   * (`file://`/`https://`, докладніше — `docs/COVERS.md`). `undefined`/`null`/`''` — усі
   * рівнозначно "немає обкладинки". */
  coverUrl?: string | null;
  /** Для fallback-плашки — перша літера, і для `accessibilityLabel`. */
  title: string;
  fallbackColor?: string | null;
  width: number;
  height: number;
  /** За замовчуванням `theme.radius.sm` — те саме значення, яким усі ці плашки вже
   * малювались по всьому застосунку до Milestone 10. */
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  /** Викликається, коли зображення не вдалось завантажити (те саме, що переводить компонент
   * назад на fallback-плашку всередині) — доступний для місць, яким потрібно знати саме про
   * "URL є, але картинка не завантажилась" (застаріле посилання на мініатюру провайдера,
   * мережева помилка тощо), а не лише "coverUrl порожній". */
  onLoadError?: () => void;
}

/**
 * Єдиний компонент показу обкладинки книги (Milestone 10) — замінює однакові вручну
 * намальовані кольорові плашки, що були розкидані по Home/Бібліотеці/Пошуку/Book
 * Details/Календарю/Полицям/Wrapped (усі — `View` 40×58 з `backgroundColor:
 * coverFallbackColor`, без жодного зображення, хоча `Edition.coverUrl` уже давно зберігався
 * в БД і навіть синхронізувався в спільний каталог — просто ніде не рендерився).
 *
 * `expo-image` (пакет був у `package.json` ще з Milestone 0 як заготовка, досі жодного разу
 * не імпортований) замість `Image` з `react-native` — вбудоване кешування зображень за
 * замовчуванням, важливо саме тут: той самий `coverUrl` рендериться в кількох списках
 * (Бібліотека, Home, Пошук) одночасно, кешування уникає повторного завантаження з мережі
 * кожного разу.
 *
 * Якщо `coverUrl` немає АБО зображення не завантажилось (`onError` — наприклад, застаріле
 * посилання на мініатюру), показує ту саму кольорову плашку з ініціалом, що й раніше — тож
 * ніде не стає гірше, ніж було, лише краще, коли зображення справді є.
 *
 * **Milestone 10 fix3, потім навмисно ВІДКОЧЕНО**: був короткий період, коли цей компонент
 * додатково намагався розпізнати конкретну заглушку ISBNdb ("BOOK COVER NOT AVAILABLE",
 * `images.isbndb.com`) за співвідношенням сторін завантаженого зображення — на реальному
 * пристрої це почало хибно ховати й СПРАВЖНІ обкладинки декількох інших книг (пороги на
 * основі одного виміряного зразка виявились надто грубими для цього). Замість продовжувати
 * підбирати евристику — прибрано повністю: `onError` тепер знову єдине джерело "не
 * завантажилось", а користувач сам вирішує, чи заміняти обкладинку, кнопкою "Додати/Змінити
 * обкладинку", яка тепер доступна на Book Details ЗАВЖДИ, незалежно від того, чи обкладинка
 * вже є (`app/work/[workId].tsx`, `docs/COVERS.md`) — це і простіше, і надійніше за
 * автоматичне вгадування "хороша це обкладинка чи заглушка".
 */
export function CoverThumbnail({
  coverUrl,
  title,
  fallbackColor,
  width,
  height,
  borderRadius,
  style,
  onLoadError,
}: CoverThumbnailProps) {
  const theme = useTheme();
  const [hasError, setHasError] = useState(false);
  const radius = borderRadius ?? theme.radius.sm;
  const trimmedUrl = coverUrl?.trim();
  const showImage = !!trimmedUrl && !hasError;

  // Той самий `CoverThumbnail` рендерить різні книги при повторному використанні того самого
  // компонента в списку (React переставляє/перевикористовує instance за key), а `hasError` —
  // локальний стан конкретного instance: без скидання при зміні `coverUrl` помилка одного
  // зображення "прилипає" й до наступної книги, чий `coverUrl` міг завантажитись успішно.
  useEffect(() => {
    setHasError(false);
  }, [trimmedUrl]);

  if (showImage) {
    return (
      <Image
        source={{ uri: trimmedUrl }}
        // `expo-image`'s `Image` має власний, дещо ширший тип стилю, ніж RN `ViewStyle` (напр.
        // `overflow` в ньому НЕ дозволяє `'scroll'`, лише `'visible' | 'hidden'`, на відміну від
        // `ViewStyle`) — `style` цього компонента навмисно типізований просто як `ViewStyle`
        // (той самий проп передається і в fallback `View` нижче), тож пряме поєднання з
        // `Image`-стилем через `[...]` не типізується без явного `as never`. Безпечно: жоден
        // виклик цього компонента не передає `overflow`/інші несумісні поля через `style`.
        style={[{ width, height, borderRadius: radius, backgroundColor: theme.colors.border }, style] as never}
        contentFit="cover"
        transition={150}
        accessibilityLabel={`Обкладинка: ${title}`}
        onError={() => {
          setHasError(true);
          onLoadError?.();
        }}
      />
    );
  }

  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: fallbackColor ?? theme.colors.accent,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <AppText variant={width >= 100 ? 'display' : 'caption'} color="onAccent">
        {title.trim().charAt(0).toUpperCase() || '?'}
      </AppText>
    </View>
  );
}
