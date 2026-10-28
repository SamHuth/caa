const CPU_NAMES = ['Ziggy', 'Mabel', 'Bolt', 'Pip', 'Rosco', 'Juno', 'Waffles', 'Nova', 'Biscuit', 'Tango'];

export function cpuNames(count: number): string[] {
  const pool = [...CPU_NAMES].sort(() => Math.random() - 0.5);
  return pool.slice(0, count);
}
