import { useColorScheme } from 'react-native';

export interface Theme {
  dark: boolean;
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  primary: string;
  primarySoft: string;
  onPrimary: string;
  positive: string;
  positiveSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
}

const light: Theme = {
  dark: false,
  bg: '#F6F7F9',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF0F3',
  border: '#E3E6EA',
  text: '#14171A',
  textMuted: '#5B636D',
  textFaint: '#8A929C',
  primary: '#2F6BFF',
  primarySoft: '#E6EEFF',
  onPrimary: '#FFFFFF',
  positive: '#16A34A',
  positiveSoft: '#E3F6EA',
  warning: '#C2780A',
  warningSoft: '#FDF1DC',
  danger: '#D92D20',
  dangerSoft: '#FDE7E5',
};

const dark: Theme = {
  dark: true,
  bg: '#0E1013',
  surface: '#171A1F',
  surfaceAlt: '#20242B',
  border: '#2A2F37',
  text: '#F2F4F7',
  textMuted: '#A3ABB5',
  textFaint: '#737B86',
  primary: '#6B95FF',
  primarySoft: '#1C2740',
  onPrimary: '#0E1013',
  positive: '#4ADE80',
  positiveSoft: '#14281C',
  warning: '#F2B24C',
  warningSoft: '#2E2414',
  danger: '#F97066',
  dangerSoft: '#331A18',
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const font = {
  hero: { fontSize: 40, fontWeight: '700' as const, letterSpacing: -1 },
  title: { fontSize: 22, fontWeight: '700' as const },
  heading: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  label: { fontSize: 13, fontWeight: '500' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
};
