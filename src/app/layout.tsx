import "./globals.css";
import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { AuthProvider } from "@/contexts/auth";
import StyledComponentRegistry from "./registry";
import { cookies } from "next/headers";
import ResponsiveContainer from "@/components/Common/ResponsiveContainer";

const font = Poppins({
  weight: "500",
  subsets: ["devanagari"],
  display: "swap",
});
export const metadata: Metadata = {
  title: "AnnoCate",
  description: "Annotation and Content Analysis Tool",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = cookies();
  const dark = cookieStore.get("dark");
  const fontsize = cookieStore.get("fontsize");

  return (
    <html
      lang="en"
      data-dark={dark?.value || "off"}
      data-fontsize={fontsize?.value || "medium"}
    >
      <body className={font.className}>
        <StyledComponentRegistry>
          <AuthProvider>
            <ResponsiveContainer>{children}</ResponsiveContainer>
          </AuthProvider>
        </StyledComponentRegistry>
      </body>
    </html>
  );
}
