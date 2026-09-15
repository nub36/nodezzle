/** Одинаковое чтение команды сообщения в Telegram ingress и простом симуляторе. */
export function messageCommand(text: string): string | undefined {
  return /^\/([a-zA-Z0-9_]{1,32})(?:@\S+)?(?:\s|$)/.exec(text)?.[1];
}
