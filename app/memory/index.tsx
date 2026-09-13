import React from 'react';
import { Pressable, View } from 'react-native';
import { Stack, router, type Href } from 'expo-router';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { JournalPreview } from '@/components/ui/JournalPreview';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { QuickAction } from '@/components/ui/QuickAction';
import { useTheme } from '@/design/ThemeProvider';
import { useMemoryIndex, type MemoryIndexItem } from '@/features/memory/useMemoryIndex';
import { useMemoryHub, type RereadCandidate } from '@/features/memory/useMemoryHub';
import type { CapsuleDueCandidate } from '@/lib/homeContext';

/** Той самий вигляд рядка, що й `MemoryCard` на `app/on-this-day.tsx` (обкладинка + назва +
 * короткий курсивний preview) — з Фази 19 (DESIGN SYSTEM EXTENSION) спільний рядок винесено в
 * `JournalPreview` (`src/components/ui/JournalPreview.tsx`), тут лишається лише обгортка
 * `Pressable`/`Card` і власний вміст (автори, snippet). */
function MemoryIndexRow({ item }: { item: MemoryIndexItem }) {
  const snippet = item.oneSentenceMemory ?? item.lastingThought;

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/memory/[workId]', params: { workId: item.workId } } as unknown as Href)}
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      <Card>
        <JournalPreview title={item.title} coverUrl={item.coverUrl} coverFallbackColor={item.coverFallbackColor}>
          {item.authors ? (
            <AppText variant="caption" color="secondary">
              {item.authors}
            </AppText>
          ) : null}
          {snippet ? (
            <AppText variant="caption" color="tertiary" numberOfLines={2} style={{ fontStyle: 'italic' }}>
              «{snippet}»
            </AppText>
          ) : null}
        </JournalPreview>
      </Card>
    </Pressable>
  );
}

/** MEMORY HUB HIERARCHY, Фаза 16 (`docs/MEMORY_HUB.md`) — рядок "Час згадати": та сама
 * capsule-CTA семантика, що й `CapsuleDueContextCard` на Home (`src/components/home/
 * HomeContextCard.tsx`), лише як рядок списку (тап на весь рядок), а не окрема картка з
 * кнопкою — тут кандидатів може бути кілька одночасно, на відміну від Home-слоту. */
function DueCapsuleRow({ candidate }: { candidate: CapsuleDueCandidate }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/recall/[workId]', params: { workId: candidate.workId } } as unknown as Href)}
      accessibilityRole="button"
      accessibilityLabel={`${candidate.title}. Згадати книгу.`}
    >
      <Card>
        <JournalPreview title={candidate.title} coverUrl={candidate.coverUrl} coverFallbackColor={candidate.coverFallbackColor}>
          <AppText variant="caption" color="secondary">
            Твоя капсула цієї книги вже чекає.
          </AppText>
        </JournalPreview>
      </Card>
    </Pressable>
  );
}

/** MEMORY HUB HIERARCHY, Фаза 16 — рядок "Перечитання": тап веде напряму на порівняння
 * (`app/reread-comparison/[workId].tsx`), той самий "один тап, без проміжної картки" підхід,
 * що й `DueCapsuleRow`/`MemoryIndexRow` вище. */
function RereadCandidateRow({ candidate }: { candidate: RereadCandidate }) {
  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: '/reread-comparison/[workId]', params: { workId: candidate.workId } } as unknown as Href)
      }
      accessibilityRole="button"
      accessibilityLabel={`${candidate.title}. Порівняти прочитання.`}
    >
      <Card>
        <JournalPreview title={candidate.title} coverUrl={candidate.coverUrl} coverFallbackColor={candidate.coverFallbackColor}>
          <AppText variant="caption" color="secondary">
            Ти прочитав цю книгу кілька разів — подивись, як змінилось враження.
          </AppText>
        </JournalPreview>
      </Card>
    </Pressable>
  );
}

/**
 * «Моя пам'ять» (ТЗ Фази 18, HOME REDESIGN §HOME SHORTCUTS — новий екран, `docs/HOME_REDESIGN.md`
 * §Моя пам'ять; розширено до повноцінного хабу — MEMORY HUB HIERARCHY, Фаза 16,
 * `docs/MEMORY_HUB.md`) — "що варто згадати", на відміну від «Мій щоденник» ("що я записував") і
 * «Моя історія» (secondary, повна хронологічна стрічка). П'ять розділів:
 *
 * 1. **Цей день у твоєму читанні** — простий вхід до вже наявного `/on-this-day` (Фаза 3), до
 *    цієї фази досяжного лише через лотерею Home-контекстної картки (часто програє іншим
 *    кандидатам) — єдина 🔴-позначена прогалина цього кластера в аудиті V1.6.1, §44 "Пара 5".
 * 2. **Час згадати** — УСІ due-капсули (не лише одна, на відміну від Home-слоту), кожна веде на
 *    `/recall/[workId]` — та сама точка входу, що й Recall, тож окремого розділу "Recall" тут
 *    немає (Recall ніде в застосунку не має власного глобального переліку, лише per-book і
 *    Home-слот — цей розділ і Є його фактичним глобальним входом).
 * 3. **Повернутися пізніше** — вхід до `/journal` з параметром `revisitLater: '1'`, той самий
 *    deep-link, що вже підключений від `app/completion/[workId].tsx` (Фаза 11) — жодного
 *    нового бекенду.
 * 4. **Капсули** — незмінена (`useMemoryIndex`, Фаза 18) поведінка попереднього варіанту цього
 *    екрана, тепер під власним заголовком серед інших розділів пам'яті.
 * 5. **Перечитання** — книги з ≥2 завершеними прочитаннями, кожна веде на
 *    `/reread-comparison/[workId]` — до цієї фази такий перелік існував лише
 *    ПОЧИНАЮЧИ з конкретної книги (Book Details/Book Memory), не як глобальний список.
 *
 * Розділи 2 і 5 — "тиха деградація": не рендеряться взагалі, коли порожні (той самий принцип,
 * що й `OnThisDayCard`/усі insight-фічі V1.6), щоб порожній розділ не займав місце марно.
 * Розділи 1 і 3 завжди показані — це прості посилання на вже наявні екрани, не залежні від
 * даних (самі ці екрани вже мають власний порожній стан).
 */
export default function MemoryIndexScreen() {
  const theme = useTheme();
  const { data, isLoading } = useMemoryIndex();
  const { data: hub, isLoading: isHubLoading } = useMemoryHub();

  const isAnyLoading = isLoading || isHubLoading;
  const dueCapsules = hub?.dueCapsules ?? [];
  const rereadCandidates = hub?.rereadCandidates ?? [];

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: '',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer>
        <View style={{ gap: theme.spacing.xs, marginBottom: theme.spacing.xl }}>
          <AppText variant="title">Моя пам&apos;ять</AppText>
          <AppText variant="body" color="secondary">
            Усе, що варто згадати з твого читання
          </AppText>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <QuickAction
            icon="calendar-outline"
            label="Цей день у твоєму читанні"
            description="Спогади з цієї календарної дати за минулі роки"
            onPress={() => router.push('/on-this-day' as unknown as Href)}
          />
        </View>

        {isAnyLoading ? (
          <AppText variant="body" color="secondary" style={{ marginTop: theme.spacing.xl }}>
            Завантаження…
          </AppText>
        ) : (
          <>
            {dueCapsules.length > 0 ? (
              <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.xl }}>
                <SectionHeader title="Час згадати" />
                {dueCapsules.map((candidate) => (
                  <DueCapsuleRow key={candidate.capsuleId} candidate={candidate} />
                ))}
              </View>
            ) : null}

            <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.xl }}>
              <QuickAction
                icon="bookmark-outline"
                label="Повернутися пізніше"
                description="Записи щоденника, позначені «повернутися пізніше»"
                onPress={() => router.push({ pathname: '/journal', params: { revisitLater: '1' } } as unknown as Href)}
              />
            </View>

            <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.xl }}>
              <SectionHeader title="Капсули" />
              {!data || data.length === 0 ? (
                <EmptyState
                  title="Тут з'являться капсули твоїх прочитаних книг."
                  description="Заверши книгу і збережи капсулу — одну стійку думку, яку хочеш забрати з собою."
                />
              ) : (
                data.map((item) => <MemoryIndexRow key={item.userBookId} item={item} />)
              )}
            </View>

            {rereadCandidates.length > 0 ? (
              <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.xl }}>
                <SectionHeader title="Перечитання" />
                {rereadCandidates.map((candidate) => (
                  <RereadCandidateRow key={candidate.userBookId} candidate={candidate} />
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScreenContainer>
    </>
  );
}
