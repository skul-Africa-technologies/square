import { redirect } from "next/navigation";

// Canonical Messages list lives at /messages; keep /dm as an alias.
export default function DmPage() {
  redirect("/messages");
}