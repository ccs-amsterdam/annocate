import "@/app/globals.css";
import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import Providers from "./providers";
import SetResponsiveSize from "@/components/Common/SetResponsiveSize";
import { Toaster } from "@/components/ui/sonner";
import { PageLayout } from "./PageLayout";
import useLocalStorage from "@/hooks/useLocalStorage";

const font = Poppins({
  weight: "500",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AnnoCate",
  description: "Annotation and Content Analysis Tool",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script id="set-style-before-hydration">
          {`
            const localDarkMode = JSON.parse(localStorage.getItem("dark"))
            const defaultDarkMode = window.matchMedia("(prefers-color-scheme: dark)").matches ? "on" : "off";
            const darkMode = localDarkMode || defaultDarkMode;
            localStorage.setItem("dark", JSON.stringify(darkMode))
            document.documentElement.setAttribute("data-dark", darkMode)
        `}
        </script>
      </head>
      <body className={font.className}>
        <SetResponsiveSize />
        <Providers>
          <PageLayout>{children}</PageLayout>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
