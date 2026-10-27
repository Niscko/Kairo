import { prisma } from "../lib/prisma.js";

/**
 * Devuelve el id de cliente del usuario autenticado, o null si el usuario no
 * es cliente (personal o dirección).
 *
 * Se consulta en cada petición en lugar de guardarlo en el token: el token
 * vive 15 minutos y un empleado podría ser dado de baja dentro de ese plazo.
 */
export async function clienteIdDeUsuario(usuarioId: number): Promise<number | null> {
  const cliente = await prisma.cliente.findUnique({
    where: { usuarioId },
    select: { id: true },
  });
  return cliente?.id ?? null;
}
