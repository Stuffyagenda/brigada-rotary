import { ProfileProvider } from "@/lib/auth/profile";

// TODO(auth-admin): comprobar la sesión en el servidor y redirigir a /login.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return <ProfileProvider>{children}</ProfileProvider>;
}
