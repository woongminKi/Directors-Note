import type { Metadata } from "next";
import { Providers } from "@/app/providers";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import "../styles/pretendard.css";

export const metadata: Metadata = {
	title: "Director's Note",
	description: "연기입시학원 평가 자동화 — 영상 → AI 분석 → 한국어 부모 letter",
	manifest: "/site.webmanifest",
	icons: {
		icon: [
			{ url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
			{ url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
		],
		apple: "/apple-touch-icon.png",
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="ko" className="h-full antialiased">
			<body className="min-h-full flex flex-col font-sans">
				<Providers>{children}</Providers>
				<Toaster />
			</body>
		</html>
	);
}
