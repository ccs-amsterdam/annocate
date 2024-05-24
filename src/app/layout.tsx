import "@/app/globals.css";
import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import Providers from "./providers";
import StyledComponentRegistry from "./registry";
import { cookies } from "next/headers";
import SetResponsiveSize from "@/components/Common/SetResponsiveSize";
import { Toaster } from "@/components/ui/sonner";
import { PageLayout } from "./PageLayout";

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
  const cookieStore = cookies();
  const dark = cookieStore.get("dark");
  const fontsize = cookieStore.get("fontsize");

  return (
    <html
      lang="en"
      data-dark={dark?.value || "off"}
      data-fontsize={fontsize?.value || "medium"}
      suppressHydrationWarning
    >
      <body className={font.className}>
        <SetResponsiveSize />
        <StyledComponentRegistry>
          <Providers>
            <PageLayout>{children}</PageLayout>
            <Toaster />
          </Providers>
        </StyledComponentRegistry>
      </body>
    </html>
  );
}
