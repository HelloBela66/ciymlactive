import React from 'react';
import { Pressable, View } from 'react-native';
import { Stack, router, type Href } from 'expo-router';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { CoverThumbnail } from '@/components/ui/CoverThumbnail';
import { EmptyState } from '@/components/ui/EmptyState';
import { useTheme } from '@/design/ThemeProvider';
import { useMemoryIndex, type MemoryIndexItem } from '@/features/memory/useMemoryIndex';

/** Той самий вигляд рядка, що й `MemoryCard` на `app/on-this-day.tsx` (обкладинка + назва +
 * короткий курсивний preview) — навмисно продубльований локально, той самий house-патерн
 * маленького презентаційного блоку без спільного стану. */
function MemoryIndexRow({ item }: { item: MemoryIndexItem }) {
  const theme = useTheme();
  const snippet = item.oneSentenceMemory ?? item.lastingThought;

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/memory/[workId]', params: { workId: item.workId } } as unknown as Href)}
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      <Card style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <CoverThumbnail
          coverUrl={item.coverUrl}
          title={item.title}
          fallbackColor={item.coverFallbackColor}
          width={48}
          height={70}
          borderRadius={theme.radius.sm}
        />
        <View style={{ flex: 1, gap: theme.spacing.xs, justifyContent: 'center' }}>
          <AppText variant="body">{item.title}</AppText>
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
        </View>
      </Card>
    </Pressable>
  );
}

/**
 * «Моя пам'ять» (ТЗ Фази 18, HOME REDESIGN §HOME SHORTCUTS — новий екран, `docs/HOME_REDESIGN.md`
 * §Моя пам'ять) — повний перелік книг, для яких збережено Капсулу (Фаза 4), компактний вхід із
 * Home. Tap на рядок → `/memory/[workId]` (Book Memory), те саме призначення, що й per-book вхід
 * із Book Details.
 */
export default function MemoryIndexScreen() {
  const theme = useTheme();
  const { data, isLoading } = useMemoryIndex();

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
            Книги, чиї капсули ти зберіг
          </AppText>
        </View>

        {isLoading ? (
          <AppText variant="body" color="secondary">
            Завантаження…
          </AppText>
        ) : !data || data.length === 0 ? (
          <EmptyState
            title="Тут з'являться капсули твоїх прочитаних книг."
            description="Заверши книгу і збережи капсулу — одну стійку думку, яку хочеш забрати з собою."
          />
        ) : (
          <View style={{ gap: theme.spacing.sm }}>
            {data.map((item) => (
              <MemoryIndexRow key={item.userBookId} item={item} />
            ))}
          </View>
        )}
      </ScreenContainer>
    </>
  );
}
