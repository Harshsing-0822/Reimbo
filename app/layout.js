import '@fontsource-variable/plus-jakarta-sans';
import './globals.css';

export const metadata = {
  title: 'Reimbo — expense claims that pay you back',
  description: 'Snap a receipt in Claude. Your manager approves in one tap. You get paid. Built for Indian startups.',
};

export const viewport = { themeColor: '#0B6E4F' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
