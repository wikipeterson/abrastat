import type { Metadata } from 'next'
import { DM_Sans, Fraunces } from 'next/font/google'
import { AuthProvider } from '@/components/auth/AuthProvider'
import { BuildStamp } from '@/components/dev/BuildStamp'
import './globals.css'

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
})

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  style: ['italic', 'normal'],
})

export const metadata: Metadata = {
  title: 'AbraStat',
  description: 'Statistics made for students.',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
}

const paletteInitScript = `
  try {
    var palettes = {
      abra:     {'--color-bg':'#E8FAF8','--color-surface':'#FFFFFF','--color-text':'#0D4F49','--color-muted':'#1A8C80','--color-accent':'#2EC4B6','--color-accent-light':'#D6F5F2','--color-border':'#7FD9D3','--color-grid-header':'#0D4F49','--color-grid-selected':'#D6F5F2'},
      midnight: {'--color-bg':'#0F172A','--color-surface':'#1E293B','--color-text':'#F1F5F9','--color-muted':'#94A3B8','--color-accent':'#38BDF8','--color-accent-light':'#0C4A6E','--color-border':'#334155','--color-grid-header':'#1E293B','--color-grid-selected':'#1E3A5F'},
      ocean:    {'--color-bg':'#EAF3FF','--color-surface':'#FFFFFF','--color-text':'#18324A','--color-muted':'#3D6F91','--color-accent':'#2F80ED','--color-accent-light':'#DCEBFF','--color-border':'#A9CFF5','--color-grid-header':'#18324A','--color-grid-selected':'#DCEBFF'},
      indigo:   {'--color-bg':'#EEF2FF','--color-surface':'#FFFFFF','--color-text':'#1E1B4B','--color-muted':'#4338CA','--color-accent':'#6366F1','--color-accent-light':'#E0E7FF','--color-border':'#A5B4FC','--color-grid-header':'#1E1B4B','--color-grid-selected':'#E0E7FF'},
      grape:    {'--color-bg':'#FAF5FF','--color-surface':'#FFFFFF','--color-text':'#3B0764','--color-muted':'#7E22CE','--color-accent':'#A855F7','--color-accent-light':'#F3E8FF','--color-border':'#D8B4FE','--color-grid-header':'#3B0764','--color-grid-selected':'#F3E8FF'},
      rose:     {'--color-bg':'#FFF1F2','--color-surface':'#FFFFFF','--color-text':'#4C0519','--color-muted':'#BE123C','--color-accent':'#F43F5E','--color-accent-light':'#FFE4E8','--color-border':'#FECDD3','--color-grid-header':'#4C0519','--color-grid-selected':'#FFE4E8'},
      ember:    {'--color-bg':'#FFF7ED','--color-surface':'#FFFFFF','--color-text':'#431407','--color-muted':'#C2410C','--color-accent':'#EA580C','--color-accent-light':'#FFEDD5','--color-border':'#FED7AA','--color-grid-header':'#431407','--color-grid-selected':'#FEF3C7'},
      citrus:   {'--color-bg':'#FFF6E8','--color-surface':'#FFFFFF','--color-text':'#3F3020','--color-muted':'#8A6A3E','--color-accent':'#F4A300','--color-accent-light':'#FFE7B5','--color-border':'#F2C970','--color-grid-header':'#3F3020','--color-grid-selected':'#FFF0CC'},
      sage:     {'--color-bg':'#F0FDF4','--color-surface':'#FFFFFF','--color-text':'#14532D','--color-muted':'#15803D','--color-accent':'#16A34A','--color-accent-light':'#DCFCE7','--color-border':'#86EFAC','--color-grid-header':'#14532D','--color-grid-selected':'#DCFCE7'},
      classic:  {'--color-bg':'#F6F2EA','--color-surface':'#FFFCF6','--color-text':'#24312F','--color-muted':'#5B6F69','--color-accent':'#2F7D73','--color-accent-light':'#DCEBE7','--color-border':'#B7D1CA','--color-grid-header':'#24312F','--color-grid-selected':'#E5F0EC'},
    };
    var stored = localStorage.getItem('abrastat.palette');
    var vars = palettes[stored] || palettes['abra'];
    var root = document.documentElement;
    if (stored) root.dataset.palette = stored;
    Object.keys(vars).forEach(function(k) { root.style.setProperty(k, vars[k]); });
  } catch (error) {}
`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      data-palette="abra"
      suppressHydrationWarning
      className={`${dmSans.variable} ${fraunces.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: paletteInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          {children}
          <BuildStamp />
        </AuthProvider>
      </body>
    </html>
  )
}
