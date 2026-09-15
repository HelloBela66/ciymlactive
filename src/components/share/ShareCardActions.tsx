import React from 'react';
import { View, Linking } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/design/ThemeProvider';
import type { UseShareCard } from '@/features/share/useShareCard';

/**
 * POLYTSIA V1.7, Phase 5 — SHARE INFRASTRUCTURE CONSOLIDATION (ТЗ V1.7 §13, §98), розмітка.
 *
 * Третій і останній шар дублювання, який знімає ця консолідація: той самий блок «дві кнопки +
 * статус + помилка дозволу + кнопка налаштувань» був скопійований у `app/memory/[workId].tsx`,
 * `app/seasons/[seasonKey].tsx` і `app/fingerprint.tsx` — до останнього `style={{ textAlign:
 * 'center' }}`. Відрізнявся РІВНО підпис кнопки збереження («Зберегти в галерею» проти
 * «Зберегти картку»), тож він і став пропом.
 *
 * Компонент навмисно НЕ містить самої картки й не знає, що на ній: превʼю лишається в екрані
 * (там же `cardRef` і `collapsable={false}`), а сюди приходить уже готовий стан із
 * `useShareCard`. Так екран із перемикачем формату/шаблону (Сезони, Спогад) і екран без нього
 * (Відбиток) користуються одним і тим самим блоком дій.
 */
export function ShareCardActions({
  controller,
  saveLabel = 'Зберегти в галерею',
}: {
  controller: UseShareCard;
  saveLabel?: string;
}) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Button
        label={controller.isSharing ? 'Готую зображення…' : 'Поділитися'}
        onPress={controller.share}
        disabled={controller.isBusy}
      />
      <Button
        label={controller.isSaving ? 'Зберігаю…' : saveLabel}
        variant="secondary"
        onPress={controller.save}
        disabled={controller.isBusy}
      />
      {controller.statusMessage ? (
        <AppText variant="caption" color="secondary" style={{ textAlign: 'center' }}>
          {controller.statusMessage}
        </AppText>
      ) : null}
      {controller.permissionError ? (
        <AppText variant="caption" color="danger" style={{ textAlign: 'center' }}>
          {controller.permissionError}
        </AppText>
      ) : null}
      {/* Дозвіл відхилено назавжди — системний діалог більше не з'явиться, тож єдиний робочий
          шлях веде в налаштування пристрою. Без цієї кнопки користувач тиснув би «Зберегти»
          знову й знову без жодної реакції системи. */}
      {controller.permissionBlocked ? (
        <Button
          label="Відкрити налаштування пристрою"
          variant="secondary"
          onPress={() => Linking.openSettings()}
        />
      ) : null}
    </View>
  );
}
