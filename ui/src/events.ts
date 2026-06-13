const PREFIX = "__ytz:";

export const emit = (name: string) =>
  window.dispatchEvent(new CustomEvent(PREFIX + name));

export const subscribe = (name: string, fn: () => void): (() => void) => {
  const key = PREFIX + name;
  window.addEventListener(key, fn);
  return () => window.removeEventListener(key, fn);
};
