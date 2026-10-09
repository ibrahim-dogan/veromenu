import { Geist, Geist_Mono, Fraunces } from "next/font/google";

export const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "latin-ext"] });
export const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
export const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin", "latin-ext"] });
export const fontVars = `${geistSans.variable} ${geistMono.variable} ${fraunces.variable}`;
