import type { Metadata } from "next";
import { RegistrosScreen } from "@/components/registros/RegistrosScreen";

export const metadata: Metadata = { title: "Registros" };

export default function RegistrosPage() {
  return <RegistrosScreen />;
}
