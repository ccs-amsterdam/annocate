"use client";
import { Button } from "@/components/ui/button";
import { useMiddlecat } from "middlecat-react";
import Link from "next/link";

export default function Home() {
  const { user, loading, signIn, signOut } = useMiddlecat();

  return (
    <div className="flex h-full flex-col items-center justify-center">
      <div className="flex flex-col  items-center gap-2">
        <h3>What are you here for?</h3>

        <div className="flex h-min flex-wrap justify-center gap-2 p-2">
          <Link href="/home/manage" className="h-30 w-60">
            <Button className="w-full">Annotate</Button>
          </Link>
          <Link href="/home/manage" className="h-30 w-60">
            <Button variant="secondary" className="w-full">
              Manage jobs
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
