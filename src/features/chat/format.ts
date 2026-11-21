export function formatChatTime(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('fa-IR', {
    calendar: 'persian',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
