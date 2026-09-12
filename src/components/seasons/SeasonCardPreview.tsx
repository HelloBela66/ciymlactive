import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { CoverThumbnail } from '@/components/ui/CoverThumbnail';
import { useTheme } from '@/design/ThemeProvider';
import { SEASON_META } from '@/design/season';
import { formatDuration } from '@/lib/sessionTiming';
import { pluralizeUk } from '@/lib/pluralizeUk';
import type { ReadingSeasonData } from '@/features/seasons/useReadingSeason';

export type SeasonCardFormat = '9:16' | '4:5';

const BOOK_FORMS = ['книга', 'книги', 'книг'] as const;

/** Місяць у прийменниковому відмінку ("у грудні") для рядка найактивнішого місяця —
 * той самий "локальний масив підписів" підхід, що й `DAY_FORMS`/`BOOK_FORMS` по всьому
 * застосунку, лише тут місяці, а не форми числівника. */
const MONTH_LOCATIVE = [
  'січні',
  'лютому',
  'березні',
  'квітні',
  'травні',
  'червні',
  'липні',
  'серпні',
  'вересні',
  'жовтні',
  'листопаді',
  'грудні',
] as const;

/** Скільки обкладинок влазить у "колаж" (ТЗ: "Cover collage"), перш ніж він стає надто
 * тісним на портретній картці — довільне, але узгоджене з розміром тайлу нижче число. */
const MAX_COLLAGE_COVERS = 9;

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Тонка декоративна риска — той самий прийом, що й `SectionRule` у `MemoryCardPreview.tsx`,
 * продубльований тут навмисно (house convention: маленькі презентаційні шматки не діляться
 * між фічами-картками, `docs/DNF_IMPROVEMENT.md`/`docs/SPOILER_SAFE.md` вже пояснювали той
 * самий вибір для інших пар файлів). */
function SectionRule({ color }: { color: string }) {
  return <View style={{ width: 32, height: 2, borderRadius: 1, backgroundColor: color, opacity: 0.6 }} />;
}

function QuoteGlyph({ color }: { color: string }) {
  return (
    <AppText
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{ fontSize: 32, lineHeight: 30, fontWeight: '700', color, opacity: 0.45 }}
    >
      “
    </AppText>
  );
}

function StatBadge({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={15} color={theme.colors.accent} />
      </View>
      <AppText variant="caption" style={{ fontWeight: '600', textAlign: 'center' }} numberOfLines={1}>
        {value}
      </AppText>
      <AppText variant="micro" color="tertiary" style={{ textAlign: 'center' }} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

function SeasonCardFooter() {
  const theme = useTheme();
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: theme.spacing.sm }}
    >
      <Ionicons name="bookmark" size={10} color={theme.colors.textTertiary} />
      <AppText variant="micro" color="tertiary">
        Полиця · читацький сезон
      </AppText>
    </View>
  );
}

export interface SeasonCardPreviewProps {
  /** Формат зображення (ТЗ Фази 13, «SHARE TEMPLATE»: "Formats: 9:16, 4:5") — обраний чипом
   * на екрані, впливає лише на `aspectRatio` цього контейнера; уся розкладка всередині
   * гнучка (`flex`), тож жоден рядок не "ламається" за жодного з двох форматів. */
  format: SeasonCardFormat;
  data: ReadingSeasonData;
}

/**
 * Сама картка-сезон (ТЗ Фази 13) — той самий "тупий" презентаційний компонент без жодної
 * інтерактивності всередині, що й `MemoryCardPreview` (Milestone 11, Фаза 8): екран
 * (`app/seasons/[seasonKey].tsx`) захоплює цей `View` через `react-native-view-shot`, тож
 * будь-який `Pressable` тут був би пасткою на знімку. На відміну від `MemoryCardPreview`
 * (чотири обираних шаблони), тут рівно ОДИН шаблон — ТЗ прямо каже "Не додавай complex image
 * editor", тож єдина точка вибору лишена користувачу — це формат (`format` вище), а не
 * композиція самої картки.
 */
export function SeasonCardPreview({ format, data }: SeasonCardPreviewProps) {
  const theme = useTheme();
  const meta = SEASON_META[data.seasonId];
  const covers = data.booksFinished.slice(0, MAX_COLLAGE_COVERS);
  const monthLabel = data.busiestMonth ? MONTH_LOCATIVE[data.busiestMonth.month - 1] ?? null : null;

  const captionParts = [
    data.topGenre ? `Жанр сезону: ${data.topGenre.name}` : null,
    monthLabel ? `Найактивніше у ${monthLabel}` : null,
  ].filter((part): part is string => part != null);

  return (
    <View
      style={{
        width: '100%',
        aspectRatio: format === '9:16' ? 9 / 16 : 4 / 5,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        overflow: 'hidden',
      }}
      accessibilityLabel={`Мій читацький сезон: ${meta.label} ${data.year}`}
    >
      <View style={{ height: 6, backgroundColor: theme.colors.accent }}>
        <View style={{ height: 2, backgroundColor: theme.colors.onAccent, opacity: 0.25 }} />
      </View>
      <View style={{ flex: 1, padding: theme.spacing.lg, gap: theme.spacing.md }}>
        <View style={{ alignItems: 'center', gap: 2 }}>
          <AppText variant="micro" color="accent" style={{ fontWeight: '700' }}>
            МІЙ ЧИТАЦЬКИЙ СЕЗОН
          </AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
            <Ionicons name={meta.icon} size={22} color={theme.colors.accent} />
            <AppText variant="title">
              {meta.label} {data.year}
            </AppText>
          </View>
          <SectionRule color={theme.colors.accent} />
        </View>

        {covers.length > 0 ? (
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: 'center',
              alignContent: 'center',
              gap: theme.spacing.xs,
            }}
          >
            {covers.map((ub) => (
              <CoverThumbnail
                key={ub.id}
                coverUrl={ub.edition.coverUrl}
                title={ub.work.title}
                fallbackColor={ub.work.coverFallbackColor}
                width={40}
                height={58}
                borderRadius={theme.radius.sm}
              />
            ))}
          </View>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={meta.icon} size={48} color={theme.colors.accentSoft} />
          </View>
        )}

        <View style={{ flexDirection: 'row', paddingVertical: theme.spacing.xs }}>
          <StatBadge
            icon="book-outline"
            label={pluralizeUk(data.booksFinished.length, BOOK_FORMS)}
            value={String(data.booksFinished.length)}
          />
          <StatBadge icon="document-text-outline" label="Сторінок" value={String(data.totalPages)} />
          <StatBadge
            icon="time-outline"
            label="Час читання"
            value={data.totalMinutes > 0 ? formatDuration(data.totalMinutes * 60 * 1000) : '—'}
          />
          <StatBadge icon="flash-outline" label="Сесій" value={String(data.sessionsCount)} />
        </View>

        {data.favoriteBook ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
              paddingTop: theme.spacing.sm,
            }}
          >
            <CoverThumbnail
              coverUrl={data.favoriteBook.userBook.edition.coverUrl}
              title={data.favoriteBook.userBook.work.title}
              fallbackColor={data.favoriteBook.userBook.work.coverFallbackColor}
              width={32}
              height={46}
            />
            <View style={{ flex: 1 }}>
              <AppText variant="micro" color="accent" style={{ fontWeight: '700' }}>
                {data.favoriteBook.isFavorite ? 'УЛЮБЛЕНА КНИГА' : 'НАЙКРАЩА ОЦІНКА'}
              </AppText>
              <AppText variant="caption" numberOfLines={1}>
                {data.favoriteBook.userBook.work.title}
              </AppText>
            </View>
          </View>
        ) : null}

        {data.journalHighlight ? (
          <View style={{ backgroundColor: theme.colors.accentSoft, borderRadius: theme.radius.md, padding: theme.spacing.sm }}>
            <QuoteGlyph color={theme.colors.accent} />
            <AppText variant="caption" style={{ fontStyle: 'italic', marginTop: -theme.spacing.sm }} numberOfLines={3}>
              {data.journalHighlight.text}
            </AppText>
          </View>
        ) : null}

        {captionParts.length > 0 ? (
          <AppText variant="micro" color="tertiary" style={{ textAlign: 'center' }}>
            {captionParts.join(' · ')}
          </AppText>
        ) : null}

        <SeasonCardFooter />
      </View>
    </View>
  );
}
