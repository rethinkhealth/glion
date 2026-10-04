/** `import.meta.glob`, resolved at build time by the bundler (Rolldown, Vite). */
interface ImportMeta {
  glob<T>(pattern: string): Record<string, () => Promise<T>>;
}
