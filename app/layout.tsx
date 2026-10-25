import '@fontsource/inter/latin-700.css';
import './globals.css';
import './social.css';
import './header.css';
import './stories.css';
import './messenger.css';
import './polish.css';
import './design.css';
import './mobile-chat.css';
import './mobile-hub.css';
import type { Metadata } from 'next';
import { I18nProvider } from '../components/I18n';
import SessionBoundary from '../components/SessionBoundary';
import Appearance from '../components/Appearance';
export const metadata: Metadata = { title: 'intent. — Find your people', description: 'People first. Content second.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><SessionBoundary><I18nProvider><Appearance>{children}</Appearance></I18nProvider></SessionBoundary></body></html>; }
