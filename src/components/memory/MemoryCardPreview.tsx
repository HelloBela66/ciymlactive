import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { CoverThumbnail } from '@/components/ui/CoverThumbnail';
import { useTheme } from '@/design/ThemeProvider';
import { formatDuration } from '@/lib/sessionTiming';
import { pluralizeUk } from '@/lib/pluralizeUk';
import { pickCardMood, moodSeedValues, type CardMood } from '@/lib/memoryCardMood';
import type { BookStats } from '@/lib/bookStats';
import type { JournalEntry } from '@/types/journalEntry';
import type { Genre } from '@/types/genre';
import type { MemoryCardTemplateId } from '@/types/bookMemory';

const DAY_FORMS = ['день', 'дні', 'днів'] as const;

interface MemoryCardWork {
  title: string;
  authorNames: string;
  coverUrl: string | null | undefined;
  coverFallbackColor: string | null;
}

export interface MemoryCardPreviewProps {
  template: MemoryCardTemplateId;
  work: MemoryCardWork;
  reflection: string | null;
  /** Вибрані записи щоденника (Фаза 7), уже вирішені проти актуального `note`/`quote` —
   * викликач (`app/memory/[workId].tsx`) відповідає за фільтрацію застарілих посилань. */
  entries: JournalEntry[];
  rating: number | null;
  stats: BookStats;
  /** Жанри книги (Milestone 9, `useGenresForWork`) — визначають тематичний "вайб" водяного
   * знаку картки (`pickCardMood`, `src/lib/memoryCardMood.ts`); порожній список — це теж
   * коректний, очікуваний стан (книга без жанрів), просто вайб тоді детермінований за
   * `workId`, а не за жанром. */
  genres: Pick<Genre, 'nameUk'>[];
  /** `Work.id` — сіль для детермінованого вибору вайбу (коли жанр не впізнаний) і розкладки
   * водяного знаку (`moodSeedValues`), щоб та сама книга завжди виглядала однаково, а різні
   * книги — по-різному. */
  workId: string;
}

function StarRow({ value }: { value: number }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 2 }} accessibilityElementsHidden importantForAccessibility="no">
      {[1, 2, 3, 4, 5].map((position) => (
        <Ionicons
          key={position}
          name={value >= position ? 'star' : value >= position - 0.5 ? 'star-half' : 'star-outline'}
          size={14}
          color={theme.colors.warning}
        />
      ))}
    </View>
  );
}

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Тонка декоративна риска — той самий "лінія розділювача" прийом, що й аркуш книги з
 * ex-libris/титульною сторінкою: коротка, по центру, кольору книги (`accentColor`), а не
 * на всю ширину картки (той самий стриманий підхід, що й акцентна смужка зверху картки —
 * маленька деталь, а не декоративний блок заради блоку). */
function SectionRule({ color }: { color: string }) {
  return <View style={{ width: 32, height: 2, borderRadius: 1, backgroundColor: color, opacity: 0.6 }} />;
}

/** Велика лапка-орнамент — той самий "премій, але стримано" прийом, що й глянцева смужка на
 * `ReadingProgressBar` (імітація акценту без справжнього зображення/градієнта): один символ
 * `AppText`, збільшений через `style`, напівпрозорий, а не окрема іконка/картинка. */
function QuoteGlyph({ color }: { color: string }) {
  return (
    <AppText
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{ fontSize: 40, lineHeight: 36, fontWeight: '700', color, opacity: 0.45 }}
    >
      “
    </AppText>
  );
}

/** Іконка-медальйон у м'якій акцентній плашці (`theme.colors.accentSoft`) — той самий
 * компонент-прийом, що вже показав себе на бейджі відсотка в `ReadingProgressBar`, лише
 * круглий і трохи більший, бо тут іконка сама несе зміст (а не стоїть поруч з підписом). */
function StatBadgeTile({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={16} color={theme.colors.accent} />
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

/** Підпис застосунку внизу картки — той самий "закладка" мотив, що й круглий маркер прогресу
 * читання (`ReadingProgressBar`, іконка `bookmark`), тут лише як тиха деталь поруч з назвою
 * застосунку, а не інтерактивний елемент. */
function CardFooter() {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        marginTop: theme.spacing.sm,
      }}
    >
      <Ionicons name="bookmark" size={10} color={theme.colors.textTertiary} />
      <AppText variant="micro" color="tertiary">
        Полиця · читацький щоденник
      </AppText>
    </View>
  );
}

const WATERMARK_ICON_SIZE = 56;

/**
 * Тематичний водяний знак картки — доповнення після Фази 10, за прямим запитом власника
 * продукту про "унікальну генерацію" картки для кожної книги/жанру (`pickCardMood`,
 * `src/lib/memoryCardMood.ts`). Два примірники тієї самої іконки вайбу по діагональних
 * кутах картки (класична композиція), дуже низька непрозорість (0.10-0.12) — фонова
 * текстура, а не елемент, що конкурує з текстом/статистикою. Малий розмір і позиція, щільно
 * притиснута до самого кута (2-8% від краю) — навмисний компроміс: 4 шаблони мають РІЗНИЙ
 * вміст по кутах (наприклад, шаблон "Цитата" кладе туди суцільну кольорову плашку, "Статистика"
 * — заголовок на всю ширину), тож гарантії "завжди повністю поза текстом для геть усіх
 * шаблонів" тут немає — лише мінімізація площі можливого перетину: або знак ховається під
 * непрозорою плашкою (нешкідливо, просто непомітний у цьому шаблоні), або ледь проступає під
 * текстом на дуже низькій непрозорості (теж некритично для читабельності). Позиція й
 * обертання — детерміновані за `seedKey` (`moodSeedValues`), тож не "мигочуть" між
 * ре-рендерами тієї самої картки.
 */
function MoodWatermark({ mood, seedKey }: { mood: CardMood; seedKey: string }) {
  const [a1 = 0.5, a2 = 0.5, b1 = 0.5, b2 = 0.5] = moodSeedValues(`${seedKey}:${mood.key}`, 4);

  return (
    <View
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}
      accessibilityElementsHidden
      importantForAccessibility="no"
      pointerEvents="none"
    >
      <Ionicons
        name={mood.icon as IconName}
        size={WATERMARK_ICON_SIZE}
        color={mood.tint}
        style={{
          position: 'absolute',
          top: `${2 + a1 * 6}%`,
          right: `${2 + a2 * 6}%`,
          opacity: 0.12,
          transform: [{ rotate: '-16deg' }],
        }}
      />
      <Ionicons
        name={mood.icon as IconName}
        size={Math.round(WATERMARK_ICON_SIZE * 0.65)}
        color={mood.tint}
        style={{
          position: 'absolute',
          bottom: `${2 + b1 * 6}%`,
          left: `${2 + b2 * 6}%`,
          opacity: 0.1,
          transform: [{ rotate: '12deg' }],
        }}
      />
    </View>
  );
}

/** Перший вибраний запис-цитата, а якщо серед вибраного цитат немає — перший запис узагалі
 * (шаблон "Цитата" все одно має що показати, навіть якщо користувач додав лише нотатку). */
function pickFeaturedText(entries: JournalEntry[]): string | null {
  const quote = entries.find((e) => e.kind === 'quote');
  return (quote ?? entries[0])?.text ?? null;
}

/**
 * Сама картка-спогад (Milestone 11, Фаза 8) — фіксоване співвідношення сторін 4:5 (портрет,
 * зручний і для стрічки, і для "історій" більшості соцмереж), єдиний компонент рендеру для
 * усіх заготовлених шаблонів. Навмисно "тупий" презентаційний компонент без жодної
 * інтерактивності всередині (жодних Pressable) — Фаза 9 захоплюватиме його в PNG через ref,
 * тож будь-який інтерактивний елемент тут був би пасткою на знімку.
 */
export function MemoryCardPreview({
  template,
  work,
  reflection,
  entries,
  rating,
  stats,
  genres,
  workId,
}: MemoryCardPreviewProps) {
  const theme = useTheme();
  const accentColor = work.coverFallbackColor ?? theme.colors.accent;
  const mood = pickCardMood(genres, workId);

  return (
    <View
      style={{
        width: '100%',
        aspectRatio: 4 / 5,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        overflow: 'hidden',
      }}
      accessibilityLabel={`Картка-спогад книги ${work.title}`}
    >
      <MoodWatermark mood={mood} seedKey={workId} />
      <View style={{ height: 6, backgroundColor: accentColor }}>
        {/* Глянцева смужка — той самий прийом "імітація об'єму без градієнта/тіні", що й на
         * заповненні `ReadingProgressBar`, тут лише вужча смужка на верхньому краю картки. */}
        <View style={{ height: 2, backgroundColor: theme.colors.onAccent, opacity: 0.25 }} />
      </View>
      <View style={{ flex: 1, padding: theme.spacing.lg }}>
        {template === 'classic' ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.md }}>
            <CoverThumbnail
              coverUrl={work.coverUrl}
              title={work.title}
              fallbackColor={work.coverFallbackColor}
              width={96}
              height={140}
              borderRadius={theme.radius.md}
            />
            <View style={{ alignItems: 'center', gap: theme.spacing.xs }}>
              <AppText variant="heading" style={{ textAlign: 'center' }} numberOfLines={2}>
                {work.title}
              </AppText>
              {work.authorNames.length > 0 ? (
                <AppText variant="caption" color="secondary" style={{ textAlign: 'center' }}>
                  {work.authorNames}
                </AppText>
              ) : null}
              <SectionRule color={accentColor} />
            </View>
            {rating != null ? <StarRow value={rating} /> : null}
            {reflection ? (
              <View
                style={{
                  backgroundColor: theme.colors.accentSoft,
                  borderRadius: theme.radius.md,
                  paddingHorizontal: theme.spacing.md,
                  paddingTop: theme.spacing.xs,
                  paddingBottom: theme.spacing.sm,
                  alignSelf: 'stretch',
                }}
              >
                <QuoteGlyph color={accentColor} />
                <AppText
                  variant="caption"
                  style={{ fontStyle: 'italic', textAlign: 'center', marginTop: -theme.spacing.sm }}
                  numberOfLines={4}
                >
                  {reflection}
                </AppText>
              </View>
            ) : null}
          </View>
        ) : null}

        {template === 'quote' ? (
          <View style={{ flex: 1, justifyContent: 'space-between', gap: theme.spacing.md }}>
            <View
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                gap: theme.spacing.sm,
                backgroundColor: theme.colors.accentSoft,
                borderRadius: theme.radius.lg,
                padding: theme.spacing.lg,
              }}
            >
              <QuoteGlyph color={accentColor} />
              {pickFeaturedText(entries) ? (
                <AppText variant="title" style={{ textAlign: 'center', fontStyle: 'italic' }} numberOfLines={7}>
                  {pickFeaturedText(entries)}
                </AppText>
              ) : (
                <AppText variant="caption" color="tertiary" style={{ textAlign: 'center' }}>
                  Додай цитату чи нотатку до спогаду, щоб побачити її тут.
                </AppText>
              )}
            </View>
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
                coverUrl={work.coverUrl}
                title={work.title}
                fallbackColor={work.coverFallbackColor}
                width={32}
                height={46}
              />
              <View style={{ flex: 1 }}>
                <AppText variant="caption" numberOfLines={1}>
                  {work.title}
                </AppText>
                {work.authorNames.length > 0 ? (
                  <AppText variant="micro" color="secondary" numberOfLines={1}>
                    {work.authorNames}
                  </AppText>
                ) : null}
              </View>
            </View>
          </View>
        ) : null}

        {template === 'stats' ? (
          <View style={{ flex: 1, gap: theme.spacing.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <CoverThumbnail
                coverUrl={work.coverUrl}
                title={work.title}
                fallbackColor={work.coverFallbackColor}
                width={56}
                height={82}
                borderRadius={theme.radius.sm}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="heading" numberOfLines={2}>
                  {work.title}
                </AppText>
                {work.authorNames.length > 0 ? (
                  <AppText variant="caption" color="secondary" numberOfLines={1}>
                    {work.authorNames}
                  </AppText>
                ) : null}
                <SectionRule color={accentColor} />
              </View>
            </View>
            {/* Без обгортки-плашки: у кожного медальйону вже свій `accentSoft`-фон
             * (`StatBadgeTile`), і якщо покласти їх ще й на спільну плашку того самого
             * кольору — медальйони просто зникнуть на однаковому тлі. */}
            <View style={{ flexDirection: 'row', paddingVertical: theme.spacing.sm }}>
              <StatBadgeTile
                icon="time-outline"
                label="Час читання"
                value={stats.totalSeconds > 0 ? formatDuration(stats.totalSeconds * 1000) : '—'}
              />
              <StatBadgeTile
                icon="document-text-outline"
                label="Сторінок"
                value={stats.pagesRead != null ? String(stats.pagesRead) : '—'}
              />
              <StatBadgeTile
                icon="calendar-outline"
                label="Днів читання"
                value={stats.days != null ? `${stats.days} ${pluralizeUk(stats.days, DAY_FORMS)}` : '—'}
              />
            </View>
            <View style={{ flex: 1, justifyContent: 'center' }}>
              {reflection ? (
                <AppText variant="caption" style={{ fontStyle: 'italic', textAlign: 'center' }} numberOfLines={3}>
                  «{reflection}»
                </AppText>
              ) : null}
            </View>
          </View>
        ) : null}

        {template === 'minimal' ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.lg }}>
            <CoverThumbnail
              coverUrl={work.coverUrl}
              title={work.title}
              fallbackColor={work.coverFallbackColor}
              width={120}
              height={174}
              borderRadius={theme.radius.md}
            />
            <View style={{ alignItems: 'center', gap: theme.spacing.xs }}>
              <AppText variant="title" style={{ textAlign: 'center' }} numberOfLines={2}>
                {work.title}
              </AppText>
              {work.authorNames.length > 0 ? (
                <AppText variant="caption" color="secondary" style={{ textAlign: 'center' }}>
                  {work.authorNames}
                </AppText>
              ) : null}
              <SectionRule color={accentColor} />
            </View>
          </View>
        ) : null}

        <CardFooter />
      </View>
    </View>
  );
}
