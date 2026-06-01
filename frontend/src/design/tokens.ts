/**
 * Storytelling design tokens — keep in sync with repo-root ``design.md``.
 * @see /design.md
 */
export const storytellingTokens = {
  name: 'Storytelling',
  colors: {
    primary: '#3B82F6',
    secondary: '#8B5CF6',
    success: '#16A34A',
    warning: '#D97706',
    danger: '#DC2626',
    surface: '#FFFFFF',
    text: '#111827',
    neutral: '#FFFFFF',
    canvas: '#F9FAFB',
    border: '#E5E7EB',
    muted: '#6B7280',
  },
  typography: {
    display: { fontFamily: 'Abril Fatface', fontSize: '3rem', lineHeight: '1.1' },
    h2: { fontFamily: 'Abril Fatface', fontSize: '1.5rem', lineHeight: '1.2' },
    body: { fontFamily: 'Inter', fontSize: '1rem', lineHeight: '1.6' },
    label: { fontFamily: 'JetBrains Mono', fontSize: '0.75rem', lineHeight: '1.4' },
    metric: { fontFamily: 'Abril Fatface', fontSize: '2.5rem', lineHeight: '1' },
    scale: [14, 16, 18, 24, 32, 40] as const,
  },
  rounded: { sm: '4px', md: '8px' },
  spacing: { sm: 4, md: 8, scale: [4, 8, 12, 16, 24, 32] as const },
} as const

export type StorytellingColor = keyof typeof storytellingTokens.colors
