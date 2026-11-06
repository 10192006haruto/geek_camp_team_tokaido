import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ここメシ | この近く、何食べる？",
  description: "旅先やお出かけ先で、現在地の近くから今日食べるお店を見つけよう。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
