import type { Metadata } from "next";
import { MembersAdmin } from "@/components/admin/MembersAdmin";

export const metadata: Metadata = { title: "Miembros" };

// Solo admin: el permiso lo comprueba `MembersAdmin` en el cliente y la RLS en el servidor.
export default function MiembrosPage() {
  return <MembersAdmin />;
}
