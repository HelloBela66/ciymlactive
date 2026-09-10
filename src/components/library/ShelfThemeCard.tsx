import React from 'react';
import { View, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/design/ThemeProvider';
import { getShelfThemeImage, SHELF_THEME_ASPECT_RATIO } from '@/design/shelfThemes';

interface ShelfThemeCardProps {
  /** Сире значення `shelf.theme`/обраної теми в пікері — звичайний `string`, не звужений
   * `ShelfThemeId` (той самий підхід, що вже був у видаленому `ShelfIllustration`): резолвиться
   * в готове зображення через `getShelfThemeImage`, яка сама розпізнає й старі, і нерозпізнані
   * значення (`src/design/shelfThemes.ts`), тож цей компонент ніколи не падає й не показує
   * порожню картку, хай яке значення прийде з БД. */
  themeId: string;
  /** Назва полиці (картка в бібліотеці) або підпис теми (пункт пікера) — завжди звичайний
   * текст UI, ніколи не частина зображення (пряма вимога власника продукту: візуальна тема й
   * назва повністю незалежні одне від одного). */
  title: string;
  /** Другий рядок під назвою — кількість книг (лише картка бібліотеки); пікер його не передає. */
  subtitle?: string;
  /** Позначка вибраної теми в пікері (`app/shelf/new.tsx`) — товща акцентна рамка, без
   * додаткового glow/тіні (п. 6 дизайн-токенів, `src/design/tokens.ts`: "жодних важких тіней").
   * Картка бібліотеки цей проп не передає — там позначати нічого. */
  selected?: boolean;
  onPress: () => void;
  /** Ширина картки — пікер (велика 2-колонкова сітка) і бібліотека (компактна горизонтальна
   * стрічка) передають різну ширину, самі ж пропорції (radius/padding/aspectRatio/текст) —
   * рівно ті самі для обох, тому й спільний компонент, а не дві окремі верстки. */
  width: number;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  /** Доповнення16 (власник продукту, скріншот з Бібліотеки): при рідному співвідношенні сторін
   * зображення (~6.15:1) звичайний "картинка згори, підпис окремим блоком знизу" (`'stacked'`,
   * дефолт — і надалі так у пікері `app/shelf/new.tsx`) неминуче дає короткий, тонкий кадр
   * зображення поруч із відносно високим текстовим блоком (два рядки читабельного тексту фізично
   * не стискаються нижче ~40-50px) — саме це власник продукту й показав на скріншоті: підпис
   * візуально переважає над ілюстрацією. `'overlay'` (картка Бібліотеки, `ShelfCard` нижче) —
   * підпис не окремий блок під зображенням, а невеликий напівпрозорий "ярлик", підтягнутий
   * від’ємним `marginTop` на нижній край самого зображення: загальна висота картки — це
   * практично висота самого зображення (+ невеликий "хвіст" ярлика знизу), а не сума
   * "зображення + повний текстовий блок". */
  variant?: 'stacked' | 'overlay';
}

/**
 * Спільна картка тематичного оформлення полиці (Milestone 11, доповнення13) — ОДИН компонент
 * для ОБОХ місць, де оформлення полиці показується: пункт пікера при створенні (`app/shelf/
 * new.tsx`) і сама картка полиці в Бібліотеці (`app/(tabs)/library/index.tsx`). Пряма вимога
 * власника продукту: "не роби окрему верстку для кожного жанру" — усі 10 тем відрізняються
 * ЛИШЕ зображенням (`getShelfThemeImage`), розмір/радіус/відступи/розташування тексту/товщина
 * рамки — однакові для всіх.
 *
 * Замінює видалений `ShelfIllustration.tsx` (векторні "корінці"+іконка на токенах UI-палітри) —
 * тепер кожна тема це справжнє ілюстроване зображення (`src/design/shelfThemes.ts`), а не
 * намальований прямокутник. Той самий принцип, що й раніше (`ShelfIllustration`'s власний
 * doc-коментар): перегляд у пікері має виглядати РІВНО так само, як потім сама картка
 * бібліотеки, лише в іншому розмірі — тому спільний компонент, а не дублювання розмітки.
 */
export function ShelfThemeCard({
  themeId,
  title,
  subtitle,
  selected,
  onPress,
  width,
  accessibilityLabel,
  style,
  variant = 'stacked',
}: ShelfThemeCardProps) {
  const theme = useTheme();
  const image = getShelfThemeImage(themeId);

  // `contentFit="contain"` (доповнення15, НЕ `"cover"`, яким це було доповнення13/14) —
  // `SHELF_THEME_ASPECT_RATIO` тут той самий, що й у самого файлу (`shelfThemes.ts`), тож у
  // типовому випадку `contain` заповнює контейнер так само точно, як заповнював би `cover`;
  // різниця — в захисті: якщо реальна ширина картки округлиться так, що обчислена
  // `aspectRatio`-висота вийде на піксель вужчою/ширшою за файл, `cover` МОВЧКИ обрізав би
  // зображення під контейнер, а `contain` натомість трохи зменшить зображення й покаже його
  // ЦІЛИМ, з мінімальним відступом кольору картки замість втраченого шматка композиції.
  const artwork = (
    <Image
      source={image}
      style={{ width: '100%', aspectRatio: SHELF_THEME_ASPECT_RATIO, backgroundColor: theme.colors.surface }}
      contentFit="contain"
    />
  );

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={accessibilityLabel}
      style={[{ width }, style]}
    >
      <View
        style={{
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.surface,
          // Товща акцентна рамка — єдиний сигнал вибору (без тіні/glow, `Card`'s "делікатна
          // картка: тонкий border замість важких тіней"-принцип поширений і сюди). Картка
          // бібліотеки (`selected` не передається) завжди лишається на нейтральній тонкій рамці.
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? theme.colors.accent : theme.colors.border,
          overflow: 'hidden',
        }}
      >
        {artwork}

        {variant === 'stacked' ? (
          // Текстова "табличка" ОКРЕМИМ блоком під зображенням — пікер `app/shelf/new.tsx`
          // (там достатньо ширини для картки, тож короткий кадр зображення (~6.15:1) поруч із
          // повним текстовим блоком не виглядає незбалансовано).
          <View
            style={{
              paddingHorizontal: theme.spacing.xs,
              paddingVertical: theme.spacing.xs,
              gap: 2,
              alignItems: 'center',
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
            }}
          >
            <AppText variant="micro" numberOfLines={1} color={selected ? 'accent' : 'primary'} style={{ textAlign: 'center' }}>
              {title}
            </AppText>
            {subtitle ? (
              <AppText variant="micro" color="tertiary" numberOfLines={1}>
                {subtitle}
              </AppText>
            ) : null}
          </View>
        ) : (
          // Доповнення16: підпис — компактний напівпрозорий "ярлик" (`surface` теми + альфа, тож
          // коректно виглядає і в світлій, і в темній темі застосунку без окремого хардкодженого
          // кольору), підтягнутий невеликим від'ємним `marginTop` на нижній край самого
          // зображення — НЕ на всю висоту ярлика (це закрило б майже все зображення при такій
          // ширині картки, зображення тут лише ~40-55px заввишки саме через рідне широке
          // співвідношення сторін ~6.15:1), а лише частково: більшість зображення лишається
          // видимою НАД ярликом, ярлик перекриває тільки його нижню смужку (переважно
          // однотонну "полицю-планку" на кожному з 10 асетів, не ключовий декор).
          <View
            style={{
              marginTop: -theme.spacing.md,
              marginHorizontal: theme.spacing.sm,
              marginBottom: theme.spacing.sm,
              borderRadius: theme.radius.md - 2,
              backgroundColor: `${theme.colors.surface}EB`,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.sm,
            }}
          >
            <AppText
              variant="caption"
              numberOfLines={1}
              color="primary"
              style={{ fontWeight: '600', lineHeight: 16 }}
            >
              {title}
            </AppText>
            {subtitle ? (
              <AppText variant="micro" color="secondary" numberOfLines={1} style={{ marginTop: 2 }}>
                {subtitle}
              </AppText>
            ) : null}
          </View>
        )}
      </View>
    </Pressable>
  );
}
