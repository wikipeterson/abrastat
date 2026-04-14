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
      abra:    {'--color-bg':'#E8FAF8','--color-surface':'#FFFFFF','--color-text':'#0D4F49','--color-muted':'#1A8C80','--color-accent':'#2EC4B6','--color-accent-light':'#D6F5F2','--color-border':'#7FD9D3','--color-grid-header':'#0D4F49','--color-grid-selected':'#D6F5F2'},
      classic: {'--color-bg':'#F6F2EA','--color-surface':'#FFFCF6','--color-text':'#24312F','--color-muted':'#5B6F69','--color-accent':'#2F7D73','--color-accent-light':'#DCEBE7','--color-border':'#B7D1CA','--color-grid-header':'#24312F','--color-grid-selected':'#E5F0EC'},
      ocean:   {'--color-bg':'#EAF3FF','--color-surface':'#FFFFFF','--color-text':'#18324A','--color-muted':'#3D6F91','--color-accent':'#2F80ED','--color-accent-light':'#DCEBFF','--color-border':'#A9CFF5','--color-grid-header':'#18324A','--color-grid-selected':'#DCEBFF'},
      citrus:  {'--color-bg':'#FFF6E8','--color-surface':'#FFFFFF','--color-text':'#3F3020','--color-muted':'#8A6A3E','--color-accent':'#F4A300','--color-accent-light':'#FFE7B5','--color-border':'#F2C970','--color-grid-header':'#3F3020','--color-grid-selected':'#FFF0CC'},
    };
    var stored = localStorage.getItem('abrastat.palette');
    var vars = palettes[stored] || palettes['abra'];
    var root = document.documentElement;
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
