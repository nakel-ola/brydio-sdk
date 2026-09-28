/**
 * The keyboard every popup list shares (`bry-menu`, `bry-select`, the
 * catalogue-b menus and the Plan pickers), in a file of its own so each of
 * them can import it without importing another's drawing.
 */

/**
 * The keyboard every popup list answers, whatever it holds: the arrows, Home
 * and End, typing to find, and Escape to close. Answers with the row to make
 * active, or `null` for none of its business.
 */
export function nextActive(
  key: string,
  rows: readonly { label: string; disabled?: boolean }[],
  active: number,
  typed: string,
): { active: number } | 'close' | 'choose' | null {
  const usable = rows.map((row, index) => ({ index, row })).filter(({ row }) => row.disabled !== true);

  if (usable.length === 0) return key === 'Escape' ? 'close' : null;

  const at = usable.findIndex(({ index }) => index === active);
  const step = (by: number) => ({ active: usable[(((at === -1 ? 0 : at) + by) % usable.length + usable.length) % usable.length]!.index });

  switch (key) {
    case 'ArrowDown':
      return at === -1 ? { active: usable[0]!.index } : step(1);
    case 'ArrowUp':
      return at === -1 ? { active: usable[usable.length - 1]!.index } : step(-1);
    case 'Home':
      return { active: usable[0]!.index };
    case 'End':
      return { active: usable[usable.length - 1]!.index };
    case 'Escape':
      return 'close';
    case 'Enter':
    case ' ':
      return 'choose';
    default: {
      // Typing finds the next row that starts with what has been typed.
      if (key.length !== 1 || typed === '') return null;

      const from = usable.findIndex(({ index }) => index > active && rows[index]!.label.toLowerCase().startsWith(typed));
      const found = from === -1 ? usable.find(({ index }) => rows[index]!.label.toLowerCase().startsWith(typed)) : usable[from];

      return found ? { active: found.index } : null;
    }
  }
}
