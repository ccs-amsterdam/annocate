import { DarkModeButton } from "@/components/Common/Theme";
import Link from "next/link";

export default async function Home() {
  return (
    <main>
      <div>
        <div>
          <Link href="/job">job</Link>
          <Link href="/manage">manage</Link>
          <DarkModeButton />
        </div>
      </div>
    </main>
  );
}
