import { prisma } from "../lib/prisma.js";
import { ForbiddenError } from "./errors.js";
import type { Rol } from "./tokens.js";

/**
 * Identidad efectiva de quien hace la petición.
 *
 * El discriminante es explícito a propósito. Antes se usaba `null` para decir
 * "no es cliente", pero ese valor no distingue entre el personal (que puede
 * ver todo) y un cliente sin perfil de `Cliente` (que no debería ver nada).
 * Con esa ambigüedad, una cuenta con rol `cliente` y sin perfil se colaba en
 * las rutas del personal y podía cancelar reservas ajenas.
 */
export interface Identidad {
  rol: Rol;
  /** Id del perfil `Cliente`; solo existe si `rol` es `cliente`. */
  clienteId: number | null;
  /** Id del perfil `Empleado`; solo existe si `rol` es `empleado`. */
  empleadoId: number | null;
}

/**
 * Resuelve el perfil asociado al usuario autenticado.
 *
 * Se consulta en cada petición en lugar de guardarlo en el token: el token
 * vive 15 minutos y a una persona se le puede cambiar el rol o darla de baja
 * dentro de ese plazo.
 *
 * Si el rol dice `cliente` pero no hay perfil `Cliente`, la cuenta está en un
 * estado inconsistente. No se degrada a "personal": se rechaza con un error
 * explícito, porque asumir lo contrario abriría la puerta a que un cliente
 * actúe sobre datos de otros.
 */
export async function identidadDeUsuario(usuarioId: number, rol: Rol): Promise<Identidad> {
  if (rol === "cliente") {
    const cliente = await prisma.cliente.findUnique({
      where: { usuarioId },
      select: { id: true },
    });
    if (!cliente) {
      throw new ForbiddenError("La cuenta no tiene un perfil de cliente");
    }
    return { rol, clienteId: cliente.id, empleadoId: null };
  }

  if (rol === "empleado") {
    const empleado = await prisma.empleado.findUnique({
      where: { usuarioId },
      select: { id: true },
    });
    if (!empleado) {
      throw new ForbiddenError("La cuenta no tiene un perfil de personal");
    }
    return { rol, clienteId: null, empleadoId: empleado.id };
  }

  return { rol: "admin", clienteId: null, empleadoId: null };
}

/**
 * Id de cliente del usuario autenticado, o null si no es cliente (personal o
 * dirección).
 *
 * @deprecated Usa `identidadDeUsuario`: este helper no puede distinguir entre
 * el personal y un cliente sin perfil, que es justo la ambigüedad que produjo
 * una escalada de privilegios.
 */
export async function clienteIdDeUsuario(usuarioId: number): Promise<number | null> {
  const cliente = await prisma.cliente.findUnique({
    where: { usuarioId },
    select: { id: true },
  });
  return cliente?.id ?? null;
}
