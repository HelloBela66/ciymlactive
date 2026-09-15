import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CardPreviewText } from '@/components/ui/CardPreviewText';
import { useTheme } from '@/design/ThemeProvider';
import type { ReadingRecap, RecapPeriodKind } from '@/lib/readingRecap';

/** Тонка декоративна риска — той самий прийом, що й у `SeasonCardPreview`/`MemoryCardPreview`/
 * `FingerprintCardPreview`, продубльований тут навмисно: маленькі презентаційні шматки
 * конкретного шаблону не діляться між картками (на відміну від САМОГО механізму поділитися,
 * який V1.7 Phase 5 звела в один `useShareCard` — див. `src/lib/shareCardFile.ts`). */
function SectionRule({ color }: { color: string }) {
  return <View style={{ width: 32, height: 2, borderRadius: 1, backgroundColor: color, opacity: 0.6 }} />;
}

const KIND_LABEL: Record<RecapPeriodKind, string> = {
  week: 'МІЙ ТИЖДЕНЬ',
  month: 'МІЙ МІСЯЦЬ',
  year: 'МІЙ РІК',
};

/** Скільки фактів влазить у картку, не перетворюючи її на таблицю. */
const MAX_CARD_LINES = 4;

/**
 * Картка-поділитися для Reading Recap — POLYTSIA V1.7, Phase 5 (ТЗ V1.7 модуль C, §47/§98).
 *
 * ПРИВАТНІСТЬ — головне обмеження цього компонента. Фаза 13 (Сезони) мала реальний витік:
 * `journalHighlight` виносив ТЕКСТ особистого запису щоденника на картку, якою діляться назовні
 * (`docs/READING_SEASONS.md`, розділ «Приватність»). Тому сюди фізично не передається нічого,
 * крім уже готового `ReadingRecap` — а він за побудовою складається лише з чисел і назв книг
 * (`src/lib/readingRecap.ts`): жодного тексту нотатки, жодної цитати, жодної сторінки, на якій
 * людина щось подумала. Кількість записів («4 записи у щоденнику») — це число, не зміст.
 *
 * Увесь текст — `CardPreviewText`, не `AppText` (POLYTSIA V1.6.1, Фаза 22,
 * `docs/A11Y_LARGE_TEXT_AUDIT.md`): картка має фіксований `aspectRatio` з `overflow: 'hidden'`,
 * і системне масштабування шрифту обрізало б тут цілі секції композиції, а не один рядок.
 *
 * Один фіксований формат 4:5 — як у `FingerprintCardPreview` і на відміну від Сезонів
 * (перемикач 9:16/4:5): ТЗ не просить вибору формату для recap, а зайвий перемикач — це ще одна
 * річ, яку користувач мусить вирішити, перш ніж поділитись.
 */
export function RecapCardPreview({ recap, kind }: { recap: ReadingRecap; kind: RecapPeriodKind }) {
  const theme = useTheme();
  const lines = recap.lines.slice(0, MAX_CARD_LINES);

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
      accessibilityLabel={`${KIND_LABEL[kind]}: ${recap.title}. ${recap.headline}`}
    >
      <View style={{ height: 6, backgroundColor: theme.colors.accent }}>
        <View style={{ height: 2, backgroundColor: theme.colors.onAccent, opacity: 0.25 }} />
      </View>

      <View style={{ flex: 1, padding: theme.spacing.lg, gap: theme.spacing.md }}>
        <View style={{ alignItems: 'center', gap: 2 }}>
          <CardPreviewText variant="micro" color="accent" style={{ fontWeight: '700' }}>
            {KIND_LABEL[kind]}
          </CardPreviewText>
          <CardPreviewText variant="title">{recap.title}</CardPreviewText>
          <SectionRule color={theme.colors.accent} />
        </View>

        <View style={{ flex: 1, justifyContent: 'center', gap: theme.spacing.md }}>
          <CardPreviewText variant="heading" style={{ textAlign: 'center' }} numberOfLines={3}>
            {recap.headline}
          </CardPreviewText>

          {lines.length > 0 ? (
            <View style={{ gap: theme.spacing.xs }}>
              {lines.map((line) => (
                <CardPreviewText
                  key={line.id}
                  variant="caption"
                  color="secondary"
                  style={{ textAlign: 'center' }}
                  numberOfLines={2}
                >
                  {line.text}
                </CardPreviewText>
              ))}
            </View>
          ) : null}
        </View>

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
          <CardPreviewText variant="micro" color="tertiary">
            Полиця
          </CardPreviewText>
        </View>
      </View>
    </View>
  );
}
