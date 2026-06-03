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
      abra:     {'--color-bg':'#F7FAF9','--color-surface':'#FFFFFF','--color-text':'#0E3D38','--color-muted':'#5A726E','--color-accent':'#16A89B','--color-accent-light':'#E2F4F1','--color-border':'#DCE6E3','--color-grid-header':'#0E3D38','--color-grid-selected':'#E2F4F1','--color-accent-strong':'#0D6E64','--color-gold':'#E8920C','--color-gold-light':'#FBEFD6'},
      midnight: {'--color-bg':'#0F172A','--color-surface':'#1E293B','--color-text':'#F1F5F9','--color-muted':'#94A3B8','--color-accent':'#38BDF8','--color-accent-light':'#0C4A6E','--color-border':'#334155','--color-grid-header':'#1E293B','--color-grid-selected':'#1E3A5F','--color-accent-strong':'#0369A1','--color-gold':'#F0A93A','--color-gold-light':'#3A2A08'},
      ocean:    {'--color-bg':'#EAF3FF','--color-surface':'#FFFFFF','--color-text':'#18324A','--color-muted':'#3D6F91','--color-accent':'#2F80ED','--color-accent-light':'#DCEBFF','--color-border':'#A9CFF5','--color-grid-header':'#18324A','--color-grid-selected':'#DCEBFF','--color-accent-strong':'#1C5BC0','--color-gold':'#E8920C','--color-gold-light':'#FBEFD6'},
      indigo:   {'--color-bg':'#EEF2FF','--color-surface':'#FFFFFF','--color-text':'#1E1B4B','--color-muted':'#4338CA','--color-accent':'#6366F1','--color-accent-light':'#E0E7FF','--color-border':'#A5B4FC','--color-grid-header':'#1E1B4B','--color-grid-selected':'#E0E7FF','--color-accent-strong':'#4338CA','--color-gold':'#E8920C','--color-gold-light':'#FBEFD6'},
      grape:    {'--color-bg':'#FAF5FF','--color-surface':'#FFFFFF','--color-text':'#3B0764','--color-muted':'#7E22CE','--color-accent':'#A855F7','--color-accent-light':'#F3E8FF','--color-border':'#D8B4FE','--color-grid-header':'#3B0764','--color-grid-selected':'#F3E8FF','--color-accent-strong':'#7E22CE','--color-gold':'#E8920C','--color-gold-light':'#FBEFD6'},
      rose:     {'--color-bg':'#FFF1F2','--color-surface':'#FFFFFF','--color-text':'#4C0519','--color-muted':'#BE123C','--color-accent':'#F43F5E','--color-accent-light':'#FFE4E8','--color-border':'#FECDD3','--color-grid-header':'#4C0519','--color-grid-selected':'#FFE4E8','--color-accent-strong':'#BE123C','--color-gold':'#E8920C','--color-gold-light':'#FBEFD6'},
      ember:    {'--color-bg':'#FFF7ED','--color-surface':'#FFFFFF','--color-text':'#431407','--color-muted':'#C2410C','--color-accent':'#EA580C','--color-accent-light':'#FFEDD5','--color-border':'#FED7AA','--color-grid-header':'#431407','--color-grid-selected':'#FEF3C7','--color-accent-strong':'#C2410C','--color-gold':'#C9820A','--color-gold-light':'#FBEFD6'},
      citrus:   {'--color-bg':'#FFF6E8','--color-surface':'#FFFFFF','--color-text':'#3F3020','--color-muted':'#8A6A3E','--color-accent':'#F4A300','--color-accent-light':'#FFE7B5','--color-border':'#F2C970','--color-grid-header':'#3F3020','--color-grid-selected':'#FFF0CC','--color-accent-strong':'#92600A','--color-gold':'#0E8C7F','--color-gold-light':'#DBF1ED'},
      sage:     {'--color-bg':'#F0FDF4','--color-surface':'#FFFFFF','--color-text':'#14532D','--color-muted':'#15803D','--color-accent':'#16A34A','--color-accent-light':'#DCFCE7','--color-border':'#86EFAC','--color-grid-header':'#14532D','--color-grid-selected':'#DCFCE7','--color-accent-strong':'#166534','--color-gold':'#E8920C','--color-gold-light':'#FBEFD6'},
      classic:  {'--color-bg':'#F6F2EA','--color-surface':'#FFFCF6','--color-text':'#24312F','--color-muted':'#5B6F69','--color-accent':'#2F7D73','--color-accent-light':'#DCEBE7','--color-border':'#B7D1CA','--color-grid-header':'#24312F','--color-grid-selected':'#E5F0EC','--color-accent-strong':'#235D54','--color-gold':'#E8920C','--color-gold-light':'#FBEFD6'},
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
