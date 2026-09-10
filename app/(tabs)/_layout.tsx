import React from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router';
// НЕ з `@react-navigation/bottom-tabs` напряму (fix2, реальний пристрій користувача) — з SDK 56
// `expo-router` більше не сумісний із прямим імпортом `@react-navigation/*` в коді застосунку
// (форкнув ці пакети у власне дерево, щоб розвиватись незалежно): бандлер валить збірку одразу
// при старті (`expo start`), навіть коли `tsc --noEmit` проходить чисто — це runtime-перевірка
// графа імпортів, не перевірка типів. `expo-router/js-tabs` — той самий, API-ідентичний форк
// (`BottomTabBar`/`BottomTabBarProps` тощо), просто під новим шляхом; докладніше —
// https://docs.expo.dev/router/migrate/sdk-55-to-56/.
import { BottomTabBar, type BottomTabBarProps } from 'expo-router/js-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design/ThemeProvider';
import { ReadingSessionMiniBar } from '@/components/session/ReadingSessionMiniBar';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
// Tabs передає tabBarIcon колір як ColorValue (може бути OpaqueColorValue на деяких
// платформах), а не завжди "живий" string — тому TabIcon приймає той самий тип, що й сам
// Ionicons, а не звужує його штучно до string.
type IconColor = React.ComponentProps<typeof Ionicons>['color'];

/**
 * Нижня навігація (п.9 ТЗ): рівно 5 вкладок, без окремої "Читаю" — поточне читання живе на
 * Головній. Іконки — Ionicons (вбудований у Expo набір, без додаткової залежності).
 *
 * `tabBar` перевизначено (Milestone 11, доповнення — панель активного читання): замість
 * дефолтного рендеру справжня нижня навігація (`BottomTabBar`, той самий компонент, який
 * `<Tabs>` намалював би сам за замовчуванням — тут лише обгорнуто, а не переписано) тепер іде
 * ОДРАЗУ під `ReadingSessionMiniBar`. Це офіційний спосіб React Navigation додати "плаваючу"
 * панель над нижньою навігацією (а не поверх екрана абсолютним позиціюванням із вручну
 * підібраним відступом): навігатор сам вимірює висоту всього кастомного `tabBar` через
 * `onLayout` і відповідно резервує місце під контентом кожної вкладки — жодних магічних чисел
 * для висоти таб-бару на iOS/Android чи safe area тут не потрібно. `ReadingSessionMiniBar` сама
 * рендерить `null`, коли немає активної сесії, — тоді як і раніше показується лише сама
 * навігація, без жодного зайвого відступу.
 *
 * **`BottomTabBar`/`BottomTabBarProps` — з `expo-router/js-tabs`, не з
 * `@react-navigation/bottom-tabs`** (докладніше — коментар біля імпорту вгорі файлу): з SDK 56
 * `expo-router` більше не сумісний із прямим імпортом пакетів `@react-navigation/*` в коді
 * застосунку.
 */
export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textTertiary,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
        tabBarLabelStyle: { fontSize: theme.typography.scale.micro.size },
      }}
      tabBar={(props: BottomTabBarProps) => (
        <View>
          <ReadingSessionMiniBar />
          <BottomTabBar {...props} />
        </View>
      )}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Головна',
          tabBarIcon: ({ color, size }) => <TabIcon name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="library/index"
        options={{
          title: 'Бібліотека',
          tabBarIcon: ({ color, size }) => <TabIcon name="library" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Календар',
          tabBarIcon: ({ color, size }) => <TabIcon name="calendar" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Пошук',
          tabBarIcon: ({ color, size }) => <TabIcon name="search" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile/index"
        options={{
          title: 'Профіль',
          tabBarIcon: ({ color, size }) => <TabIcon name="person" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}

function TabIcon({ name, color, size }: { name: IconName; color: IconColor; size: number }) {
  return <Ionicons name={name} color={color} size={size} />;
}
