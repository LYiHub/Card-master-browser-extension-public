export function shouldReturnDirectly(index: number, total: number) {
  return total > 0 && index === total - 1;
}
