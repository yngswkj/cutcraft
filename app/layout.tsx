import type { Metadata } from 'next';
import { Noto_Sans_JP } from 'next/font/google';
import './globals.css';

const notoSansJP = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
  variable: '--font-noto-sans-jp',
});

export const metadata: Metadata = {
  title: 'CutCraft — 動画生成ワークフロー',
  description: 'AIを活用した動画制作ワークフローツール',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className={notoSansJP.variable}>
      <body className="bg-gray-50 text-gray-800 min-h-screen font-sans">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-3.5">
            <a href="/" className="text-lg font-bold tracking-wider text-primary-700 break-words">
              CutCraft
            </a>
            <nav className="flex items-center gap-3 sm:gap-4">
              <span className="hidden sm:inline text-xs tracking-wide text-gray-400">
                動画生成ワークフロー
              </span>
              <a
                href="/settings"
                className="text-sm text-gray-500 hover:text-primary-600 transition"
              >
                設定
              </a>
            </nav>
          </div>
        </header>
        <main className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
