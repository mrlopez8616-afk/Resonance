import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function PrelimsPage() {
  redirect("/fights/ufc");
}
