import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CardPreviewText } from '@/components/ui/CardPreviewText';
import { CoverThumbnail } from '@/components/ui/CoverThumbnail';
import { useTheme } from '@/design/ThemeProvider';
import { SEASON_META } from '@/design/season';
import { formatSeasonLabel } from '@/lib/season';
import { formatDuration } from '@/lib/sessionTiming';
import { pluralizeUk } from '@/lib/pluralizeUk';
import type { ReadingSeasonData } from '@/features/seasons/useReadingSeason';
import type { JournalFeedEntry } from '@/types/journalEntry';

export type SeasonCardFormat = '9:16' | '4:5';

const BOOK_FORMS = ['книга', 'книги', 'книг'] as const;
const RETURN_FORMS = ['повернення', 'повернення', 'повернень'] as const;

/** Скільки обкладинок показувати в hero-стеку (ТЗ §38/56: "3–5 prominent covers... editorial
 * overlapping stack / balanced composition. Не chaotic collage") — заміна старого
 * `MAX_COLLAGE_COVERS = 9` flexWrap-грід (той самий "grid із tiny covers", якого ТЗ §38 прямо
 * забороняє в hero, лише з меншим числом). Повна кількість книг сезону лишається у метриці
 * "N книг" нижче незалежно від того, скільки обкладинок фізично влазить у стек. */
const MAX_HERO_COVERS = 5;

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
    <CardPreviewText
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{ fontSize: 32, lineHeight: 30, fontWeight: '700', color, opacity: 0.45 }}
    >
      “
    </CardPreviewText>
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
      <CardPreviewText variant="caption" style={{ fontWeight: '600', textAlign: 'center' }} numberOfLines={1}>
        {value}
      </CardPreviewText>
      <CardPreviewText variant="micro" color="tertiary" style={{ textAlign: 'center' }} numberOfLines={1}>
        {label}
      </CardPreviewText>
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
      <CardPreviewText variant="micro" color="tertiary">
        Полиця · читацький сезон
      </CardPreviewText>
    </View>
  );
}

export interface SeasonCardPreviewProps {
  /** Формат зображення (ТЗ §58: "Formats: 9:16, 4:5") — обраний чипом на екрані, впливає лише
   * на `aspectRatio` цього контейнера; уся розкладка всередині гнучка (`flex`), тож жоден рядок
   * не "ламається" за жодного з двох форматів. */
  format: SeasonCardFormat;
  data: ReadingSeasonData;
  /**
   * ПРИВАТНІСТЬ (ТЗ §59-61 — критична вимога, підтверджена аудитом #167): ця сама картка і
   * показується на екрані, і захоплюється в зображення для «Поділитися»/«Зберегти» (той самий
   * `View`, `app/seasons/[seasonKey].tsx`) — тож єдиний спосіб гарантувати, що "Default export:
   * covers + safe derived metrics" (§61) НІКОЛИ випадково не включить приватний текст щоденника,
   * це щоб сама картка ніколи не рендерила `personalHighlight` без явно переданого значення.
   * `undefined`/`null` (типовий стан) — картка показує ЛИШЕ безпечні похідні метрики, як у ТЗ
   * §59's прикладі дефолтного контенту (там немає жодної цитати). Значення сюди потрапляє лише
   * після explicit дії користувача "Додати цитату" на екрані (§60) — картка сама не вибирає
   * ЩО показати, лише ЧИ показувати передане.
   */
  personalHighlight?: JournalFeedEntry | null;
}

/**
 * Сама картка-сезон (POLYTSIA V1.6.2, #167 — READING SEASONS REDEFINITION) — той самий "тупий"
 * презентаційний компонент без жодної інтерактивності всередині, що й `MemoryCardPreview`
 * (Milestone 11, Фаза 8): екран (`app/seasons/[seasonKey].tsx`) захоплює цей `View` через
 * `react-native-view-shot`, тож будь-який `Pressable` тут був би пасткою на знімку. Рівно ОДИН
 * шаблон — ТЗ §58 прямо каже "Не complex image editor", тож єдина точка вибору лишена
 * користувачу — це формат (`format` вище), а не композиція самої картки.
 *
 * ВІЗУАЛЬНА РЕДЕФІНІЦІЯ (ТЗ §54-56): попередня версія була "stat-badge dashboard card" — грід
 * до 9 однакових обкладинок + рядок показників, структурно ідентичний Wrapped. Ця версія:
 * editorial fanned-стек 3-5 обкладинок (не грід), максимум 4 компактні метрики (книги/
 * сторінки/час/активні дні — ТЗ §41, замінює колишній "Сесій", якого в прикладі ТЗ немає),
 * без "Жанр сезону"/"Найактивніше у" аналітичних підписів (ТЗ §68: Seasons ≠ Statistics/
 * Wrapped clone) — стриманий сезонний акцент (кольорова риска + іконка `SEASON_META`)
 * лишається тим самим, що й був (уже відповідав §55 "restrained" до цієї фази).
 *
 * Увесь текст усередині — `CardPreviewText`, не `AppText` (POLYTSIA V1.6.1, Фаза 22,
 * `docs/A11Y_LARGE_TEXT_AUDIT.md`): картка фіксованого `aspectRatio` з `overflow: 'hidden'` —
 * системне масштабування шрифту тут обрізало б цілі секції композиції, а не один рядок.
 */
export function SeasonCardPreview({ format, data, personalHighlight }: SeasonCardPreviewProps) {
  const theme = useTheme();
  const meta = SEASON_META[data.seasonId];
  const heroCovers = data.books.slice(0, MAX_HERO_COVERS);
  const seasonLabel = formatSeasonLabel(data.seasonId, data.year);

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
      accessibilityLabel={`Мій читацький сезон: ${seasonLabel}`}
    >
      <View style={{ height: 6, backgroundColor: theme.colors.accent }}>
        <View style={{ height: 2, backgroundColor: theme.colors.onAccent, opacity: 0.25 }} />
      </View>
      <View style={{ flex: 1, padding: theme.spacing.lg, gap: theme.spacing.md }}>
        <View style={{ alignItems: 'center', gap: 2 }}>
          <CardPreviewText variant="micro" color="accent" style={{ fontWeight: '700' }}>
            МІЙ ЧИТАЦЬКИЙ СЕЗОН
          </CardPreviewText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
            <Ionicons name={meta.icon} size={22} color={theme.colors.accent} />
            <CardPreviewText variant="title">{seasonLabel}</CardPreviewText>
          </View>
          <SectionRule color={theme.colors.accent} />
        </View>

        {heroCovers.length > 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
              {heroCovers.map((ub, index) => (
                <View
                  key={ub.id}
                  style={{
                    marginLeft: index === 0 ? 0 : -26,
                    zIndex: heroCovers.length - index,
                    transform: [{ translateY: index % 2 === 0 ? 0 : 10 }],
                  }}
                >
                  <CoverThumbnail
                    coverUrl={ub.edition.coverUrl}
                    title={ub.work.title}
                    fallbackColor={ub.work.coverFallbackColor}
                    width={62}
                    height={90}
                    borderRadius={theme.radius.sm}
                    style={{ borderWidth: 2, borderColor: theme.colors.surface }}
                  />
                </View>
              ))}
            </View>
          </View>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={meta.icon} size={48} color={theme.colors.accentSoft} />
          </View>
        )}

        <View style={{ flexDirection: 'row', paddingVertical: theme.spacing.xs }}>
          <StatBadge
            icon="book-outline"
            label={pluralizeUk(data.uniqueBooksCount, BOOK_FORMS)}
            value={String(data.uniqueBooksCount)}
          />
          <StatBadge icon="document-text-outline" label="Сторінок" value={String(data.totalPages)} />
          <StatBadge
            icon="time-outline"
            label="Час читання"
            value={data.totalMinutes > 0 ? formatDuration(data.totalMinutes * 60 * 1000) : '—'}
          />
          <StatBadge icon="flame-outline" label="Днів читав(-ла)" value={String(data.activeDays)} />
        </View>

        {data.rereadBooks.length > 0 ? (
          <CardPreviewText variant="micro" color="tertiary" style={{ textAlign: 'center', marginTop: -theme.spacing.sm }}>
            {pluralizeUk(data.rereadBooks.length, RETURN_FORMS)} до знайомих історій
          </CardPreviewText>
        ) : null}

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
              <CardPreviewText variant="micro" color="accent" style={{ fontWeight: '700' }}>
                {data.favoriteBook.isFavorite
                  ? 'УЛЮБЛЕНА КНИГА'
                  : data.favoriteBook.ratingValue != null
                    ? 'НАЙКРАЩА ОЦІНКА'
                    : 'КНИГА СЕЗОНУ'}
              </CardPreviewText>
              <CardPreviewText variant="caption" numberOfLines={1}>
                {data.favoriteBook.userBook.work.title}
              </CardPreviewText>
            </View>
          </View>
        ) : null}

        {personalHighlight ? (
          <View style={{ backgroundColor: theme.colors.accentSoft, borderRadius: theme.radius.md, padding: theme.spacing.sm }}>
            <QuoteGlyph color={theme.colors.accent} />
            <CardPreviewText variant="caption" style={{ fontStyle: 'italic', marginTop: -theme.spacing.sm }} numberOfLines={3}>
              {personalHighlight.text}
            </CardPreviewText>
          </View>
        ) : null}

        <SeasonCardFooter />
      </View>
    </View>
  );
}
