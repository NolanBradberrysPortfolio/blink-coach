import { ScrollViewStyleReset } from 'expo-router/html';
import React from 'react';

export default function RootHtml({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <html lang="en">
      <head>
        <title>Blink Coach</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="description" content="A private, local-only blink awareness coach for screen use." />
        <meta name="theme-color" content="#121A2D" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Blink Coach" />
        <link rel="manifest" href="manifest.json" />
        <link rel="apple-touch-icon" href="icons/apple-touch-icon.png" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
