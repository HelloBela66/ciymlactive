import React, { useState } from 'react';
import { View, Pressable, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/design/ThemeProvider';
import { REACTION_ORDER, REACTION_META, isReactionId, type ReactionId } from '@/design/reactions';

/**
 * Два варіанти вибору реакції (Milestone 11, доповнення — "настрій" запису щоденника), обидва
 * поверх того самого списку `REACTION_ORDER`/`REACTION_META`, щоб іконки/підписи ніколи не
 * розійшлись між місцями показу:
 *
 * `ReactionChips` — завжди розгорнутий ряд "іконка над підписом" (той самий прийом, що й
 * чипи фільтра бібліотеки, Milestone 11 доповнення12 — іконка над текстом, а не поруч, щоб
 * ширина не залежала від довжини підпису) — для місць із запасом простору на власному рядку
 * (форма завершення сесії читання).
 *
 * `ReactionToggle` — компактний варіант для рядків записів щоденника (сесія/Book Details/
 * глобальна стрічка), де вже є картка з заголовком, іконкою "обране" й кнопкою видалення —
 * розгортати одразу всі 7 іконок прямо в рядку означало б суттєво роздути кожен запис.
 * Замість цього — один маленький тригер (поточна реакція або нейтральна "додати") ТОГО
 * САМОГО розміру/стилю, що й сусідня кнопка "обране"; тап відкриває сам `ReactionChips`
 * (той самий вибір, що й на формі завершення сесії — одне джерело правди для вигляду вибору
 * реакції) усередині системного `Modal`, а не локальної спливаючої плашки поверх картки.
 *
 * Чому саме `Modal`, а не `position: 'absolute'` поверх картки (як було спершу): у списку
 * записів (`app/journal/index.tsx` — глобальна стрічка, кожен запис своя картка одна під
 * одною) спливаюча плашка, позиційована абсолютно ВСЕРЕДИНІ картки запису, виходить за її
 * межі й малюється УСЕРЕДИНІ дерева ЦІЄЇ картки — тобто раніше, у порядку рендеру, ніж
 * НАСТУПНІ картки списку нижче. `zIndex` рятує лише в межах одного й того ж батька (тут —
 * рядок заголовка versus текст запису в тій самій картці), але не "перестрибує" через межі
 * зовсім іншої картки-сиблінга нижче в списку: та малюється пізніше й лягає ПОВЕРХ плашки,
 * тож реакції виглядали "під" наступними записами, а не над ними. `Modal` рендериться в
 * окремому нативному шарі понад усім екраном (включно з рештою списку), тож ця проблема
 * зникає структурно, а не черговим шаром `zIndex`.
 */

interface ReactionValueProps {
  /** Сире значення з БД (`note.reaction`/`quote.reaction`) — вільний `TEXT` без CHECK, тому
   * може бути й нерозпізнаним рядком (майбутня версія/пошкоджені дані); обидва компоненти
   * трактують такий випадок як "реакції немає", а не крашяться чи показують сирий рядок. */
  value: string | null;
  onChange: (id: ReactionId | null) => void;
}

function normalizeValue(value: string | null): ReactionId | null {
  return value != null && isReactionId(value) ? value : null;
}

// Дві явні центровані плитки-рядки (4+3), а не один суцільний `flexWrap` рядок (як було): при
// 7 елементах `flexWrap` + `space-evenly` розбивав їх на "5 зверху, 2 знизу" — кожен рядок сам
// по собі рівномірно розтягувався на всю ширину екрана, тож нижній рядок із двома елементами
// виглядав як випадковий залишок, а не частина продуманого макета. Фіксований розподіл
// 4+3, кожен рядок центрований (не розтягнутий), читається як свідома "піраміда" — той самий
// прийом, що й нижній неповний ряд клавіш на клавіатурі.
const CHIP_ROWS: ReactionId[][] = [REACTION_ORDER.slice(0, 4), REACTION_ORDER.slice(4)];

export function ReactionChips({ value, onChange }: ReactionValueProps) {
  const theme = useTheme();
  const selected = normalizeValue(value);

  return (
    <View style={{ gap: theme.spacing.sm }}>
      {CHIP_ROWS.map((row, index) => (
        // `flexWrap: 'wrap'` — сітка 4+3 фіксована лише в звичному випадку (для типової
        // ширини екрана 4 плитки в ряд і так уміщуються з запасом); `wrap` тут суто
        // захисний фолбек на дуже вузьких екранах (≲320pt), щоб рядок радше переніс зайву
        // плитку на другий рядок, ніж мовчки виліз за межі картки — на звичайних екранах
        // нічого не переноситься, бо все й так влазить в один рядок.
        <View
          key={index}
          style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: theme.spacing.sm }}
        >
          {row.map((id) => {
            const meta = REACTION_META[id];
            const isSelected = selected === id;
            return (
              <Pressable
                key={id}
                onPress={() => onChange(isSelected ? null : id)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={meta.label}
                style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  paddingHorizontal: theme.spacing.xs,
                  paddingVertical: theme.spacing.xs,
                  minHeight: theme.minTouchTarget,
                  minWidth: 64,
                  borderRadius: theme.radius.md,
                  backgroundColor: isSelected ? theme.colors.accent : theme.colors.surface,
                  borderWidth: 1,
                  borderColor: isSelected ? theme.colors.accent : theme.colors.border,
                }}
              >
                <Ionicons
                  name={meta.icon}
                  size={18}
                  color={isSelected ? theme.colors.onAccent : theme.colors.textSecondary}
                />
                <AppText variant="micro" color={isSelected ? 'onAccent' : 'secondary'} numberOfLines={1}>
                  {meta.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const TRIGGER_ICON_SIZE = 16;

export function ReactionToggle({ value, onChange }: ReactionValueProps) {
  const theme = useTheme();
  const selected = normalizeValue(value);
  const [expanded, setExpanded] = useState(false);

  const trigger = selected ? REACTION_META[selected] : null;

  return (
    <>
      <Pressable
        onPress={() => setExpanded(true)}
        accessibilityRole="button"
        accessibilityState={{ expanded, selected: !!selected }}
        accessibilityLabel={trigger ? `Реакція: ${trigger.label}. Змінити.` : 'Додати реакцію'}
        hitSlop={8}
        style={{
          width: theme.minTouchTarget,
          height: theme.minTouchTarget,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons
          name={trigger ? trigger.icon : 'ellipsis-horizontal-circle-outline'}
          size={TRIGGER_ICON_SIZE}
          color={trigger ? theme.colors.accent : theme.colors.textTertiary}
        />
      </Pressable>

      <Modal visible={expanded} transparent animationType="fade" onRequestClose={() => setExpanded(false)}>
        {/* Напівпрозорий бекдроп на весь екран — тап поза карткою вибору закриває модалку.
         * Внутрішня картка — звичайний (не `Pressable`) `View`: тап десь у її "порожньому"
         * місці (не на самому чипі реакції) так само проходить крізь неї до бекдропу, що
         * прийнятно (той самий підхід, що й системні action sheet) і не потребує ручного
         * `stopPropagation` — RN сам не проброшує responder на бекдроп, якщо тап влучив у
         * інтерактивний чип усередині (`ReactionChips`'s власні `Pressable`). */}
        <Pressable
          onPress={() => setExpanded(false)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.45)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.xl,
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: 360,
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radius.lg,
              borderWidth: 1,
              borderColor: theme.colors.border,
              padding: theme.spacing.lg,
              gap: theme.spacing.md,
            }}
          >
            <AppText variant="heading" style={{ textAlign: 'center' }}>
              Реакція на цей запис
            </AppText>
            <ReactionChips
              value={value}
              onChange={(reaction) => {
                onChange(reaction);
                setExpanded(false);
              }}
            />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
