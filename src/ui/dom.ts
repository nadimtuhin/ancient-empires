type Child = Node | string | null | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Omit<HTMLElementTagNameMap[K], 'dataset'>> & { dataset?: Record<string, string> } = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  const { dataset, ...rest } = props;
  Object.assign(element, rest);
  if (dataset) Object.assign(element.dataset, dataset);
  for (const child of children) if (child) element.append(child);
  return element;
}

export const button = (label: string, onclick: () => void, props: { disabled?: boolean } = {}) =>
  h('button', { type: 'button', textContent: label, onclick, ...props });

/** Modal panel over the whole app; resolves with whichever option the player picks. */
export function choose<T>(
  root: HTMLElement,
  title: string,
  body: Array<Node | string>,
  options: Array<{ label: string; value: T; disabled?: boolean }>,
): Promise<T> {
  return new Promise((resolve) => {
    const overlay = h('div', { className: 'overlay' });
    const buttons = options.map((option) =>
      button(option.label, () => {
        overlay.remove();
        resolve(option.value);
      }, { disabled: !!option.disabled }),
    );
    const dialog = h('div', { className: 'dialog', role: 'dialog', ariaLabel: title }, h('h2', { textContent: title }));
    dialog.append(...body.map((part) => (typeof part === 'string' ? h('p', { textContent: part }) : part)), ...buttons);
    overlay.append(dialog);
    root.append(overlay);
    buttons.find((candidate) => !candidate.disabled)?.focus();
  });
}
