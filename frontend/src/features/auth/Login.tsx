import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/input";
import { useSesion } from "./Sesion";

const esquema = z.object({
  email: z.string().email("login.emailInvalido"),
  password: z.string().min(1, "login.passwordRequerido"),
});

type Datos = z.infer<typeof esquema>;

/**
 * Traduce el mensaje de error de Zod. Las claves del esquema ya son claves
 * del diccionario; si alguna no existiera, se muestra tal cual para no
 * ocultar el problema.
 */
function mensajeError(
  t: (clave: string) => string,
  clave: string | undefined,
): string {
  if (!clave) return t("login.credenciales");
  const traducida = t(clave);
  return traducida === clave ? clave : traducida;
}

export function Login() {
  const { t } = useTranslation();
  const { entrar } = useSesion();
  const navegar = useNavigate();
  const ubicacion = useLocation();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Datos>({
    resolver: zodResolver(esquema),
    defaultValues: { email: "admin@kairo.local", password: "kairo123" },
  });

  async function enviar(datos: Datos) {
    try {
      await entrar(datos.email, datos.password);
      // Vuelve a la ruta que el usuario intentaba abrir antes del login.
      const destino = (ubicacion.state as { desde?: string } | null)?.desde ?? "/";
      navegar(destino, { replace: true });
    } catch (error) {
      const mensaje = (error as { message?: string }).message;
      setError("password", {
        message: mensaje ?? t("login.credenciales"),
      });
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">Kairo</p>
          <h1 className="mt-2 font-display text-display-md font-semibold">{t("gate.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("gate.lead")}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("login.title")}</CardTitle>
            <CardDescription>{t("login.lead")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(enviar)} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="email">{t("common.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  aria-invalid={Boolean(errors.email)}
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-xs text-destructive" role="alert">
                    {mensajeError(t, errors.email.message)}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t("login.password")}</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={Boolean(errors.password)}
                  {...register("password")}
                />
                {errors.password && (
                  <p className="text-xs text-destructive" role="alert">
                    {mensajeError(t, errors.password.message)}
                  </p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? t("common.cargando") : t("login.submit")}
              </Button>
            </form>

            <div className="mt-4 rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">{t("login.demoTitle")}</p>
              <ul className="mt-1 space-y-0.5">
                <li>admin@kairo.local — {t("role.admin")}</li>
                <li>barista@kairo.local — {t("role.empleado")}</li>
                <li>valentina@kairo.local — {t("role.cliente")}</li>
              </ul>
              <p className="mt-1">kairo123</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
