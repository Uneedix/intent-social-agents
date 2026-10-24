import '@fontsource/inter/latin-700.css';
import './globals.css';
import './social.css';
import './header.css';
import './stories.css';
import './messenger.css';
import './polish.css';
import type { Metadata } from 'next';
import { I18nProvider } from '../components/I18n';
import SessionBoundary from '../components/SessionBoundary';
export const metadata: Metadata = { title: 'intent. — Find your people', description: 'People first. Content second.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><SessionBoundary><I18nProvider>{children}</I18nProvider></SessionBoundary></body></html>; }
