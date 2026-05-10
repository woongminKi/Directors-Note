import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import "../styles/pretendard.css";

export const metadata: Metadata = {
	title: "Director's Note",
	description: "연기입시학원 평가 자동화 — 영상 → AI 분석 → 한국어 부모 letter",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="ko" className="h-full antialiased">
			<body className="min-h-full flex flex-col font-sans">
				{children}
				<Toaster />
			</body>
		</html>
	);
}
