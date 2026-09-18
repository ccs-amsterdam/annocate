"use client";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/loader";
import { Settings } from "lucide-react";
import { useMiddlecat } from "middlecat-react";
import Link from "next/link";

export default function Home() {
  const { user, loading, signIn, signOut } = useMiddlecat();

  if (loading) return <Loading />;
  if (!user?.email)
    return (
      <div className="mt-[13vh] flex justify-center">
        <Button onClick={() => signIn()}>Sign in</Button>
      </div>
    );

  return (
    <div className="mt-[13vh] flex h-full flex-col">
      <div className="flex flex-col items-center gap-2">
        <h3>What are you here for?</h3>

        <div className="flex h-min flex-wrap justify-center gap-2 p-2">
          <Link href="/projects" className="h-30 w-60">
            <Button className="w-full">To Annotate</Button>
          </Link>
          <Link href="/projects" className="h-30 w-60">
            <Button className="w-full">To design tasks</Button>
          </Link>
        </div>
        <Link href="/admin" className="h-30 w-60">
          <Button variant="ghost" className="flex w-full items-center gap-2">
            <Settings className="h-6 w-6" />
            Admin stuff
          </Button>
        </Link>
      </div>
    </div>
  );
}
