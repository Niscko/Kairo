/**
 * Tipos del dominio, alineados con los DTOs que devuelve la API.
 *
 * Son tipos a mano, no generados: el backend expone un contrato estable y
 * estos lo reflejan. Si un DTO cambia, el typecheck del frontend falla.
 */

export type Rol = "admin" | "empleado" | "cliente";

export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
  telefono: string | null;
  activo: boolean;
  creadoEn: string;
  empleado: { id: number; cargo: string } | null;
  cliente: { id: number; membresia: TipoMembresia } | null;
}

export type TipoMembresia = "ninguna" | "dia" | "mensual";
export type TipoEspacio = "puesto" | "sala" | "mesa" | "evento";
export type EstadoEspacio = "disponible" | "mantenimiento";
export type PropositoReserva = "trabajo" | "estudio" | "reunion" | "consumo" | "evento";
export type EstadoReserva = "confirmada" | "en_curso" | "completada" | "cancelada";
export type EstadoEquipo = "operativo" | "mantenimiento" | "prestado";
export type TipoEquipo = "tecnologico" | "mobiliario" | "produccion" | "administracion";
export type EstadoCosto = "pendiente" | "pagado";
export type EstadoPermiso = "vigente" | "vencido";
export type CategoriaProducto = "bebida" | "alimento" | "servicio";
export type MetodoPago = "efectivo" | "tarjeta" | "transferencia";
export type TipoMovimiento = "entrada" | "salida" | "merma";
export type EstadoExperiencia = "programada" | "en_curso" | "finalizada" | "cancelada";

export interface Espacio {
  id: number;
  nombre: string;
  tipo: TipoEspacio;
  capacidad: number;
  tarifaHora: number;
  zona: string;
  estado: EstadoEspacio;
}

export interface Paginado<T> {
  datos: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPaginas: number;
}

export type AccionRegistro = "crear" | "actualizar" | "eliminar";

/** Fila de la bitácora de altas, cambios y bajas. */
export interface RegistroActividad {
  id: number;
  creadoEn: string;
  actorNombre: string;
  actorEmail: string;
  actorRol: Rol | null;
  accion: AccionRegistro;
  entidad: string;
  entidadId: string | null;
  resumen: string;
  detalle: Record<string, string | number | boolean | null> | null;
}

export interface Reserva {
  id: number;
  espacioId: number;
  espacio: string;
  espacioTipo: string;
  clienteId: number | null;
  cliente: string | null;
  inicio: string;
  fin: string;
  proposito: PropositoReserva;
  estado: EstadoReserva;
  monto: number;
  notas: string | null;
}

export interface Cliente {
  id: number;
  nombre: string;
  email: string;
  telefono: string | null;
  documento: string | null;
  membresia: TipoMembresia;
  membresiaVence: string | null;
  activo: boolean;
}

export interface Empleado {
  id: number;
  nombre: string;
  email: string;
  telefono: string | null;
  cargo: string;
  fechaIngreso: string;
  salario?: number;
}

export interface Turno {
  id: number;
  empleadoId: number;
  nombre: string;
  cargo: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  area: string;
}

export interface Producto {
  id: number;
  nombre: string;
  categoria: CategoriaProducto;
  precio: number;
  descripcion: string | null;
  esAlcohol: boolean;
  activo: boolean;
  receta: Array<{ insumoId: number; insumo: string; unidad: string; cantidad: number }>;
}

export interface Insumo {
  id: number;
  nombre: string;
  unidad: string;
  stock: number;
  stockMinimo: number;
  costoUnitario: number;
  proveedor: string | null;
  bajoMinimo: boolean;
}

export interface Movimiento {
  id: number;
  insumoId: number;
  insumo: string;
  unidad: string;
  tipo: TipoMovimiento;
  cantidad: number;
  motivo: string | null;
  referencia: string | null;
  fecha: string;
}

export interface Proveedor {
  id: number;
  nombre: string;
  contacto: string | null;
  telefono: string | null;
  categoria: string;
  insumos: number;
}

export interface Venta {
  id: number;
  cliente: string | null;
  empleado: string | null;
  fecha: string;
  metodoPago: MetodoPago;
  total: number;
  items: Array<{ producto: string; cantidad: number; precio: number }>;
}

export interface Experiencia {
  id: number;
  nombre: string;
  descripcion: string | null;
  espacio: string;
  inicio: string;
  fin: string;
  capacidad: number;
  precio: number;
  estado: EstadoExperiencia;
  participantes: number;
  empleados: string[];
  equipos: string[];
  productos: Array<{ producto: string; cantidad: number }>;
}

export interface Equipo {
  id: number;
  nombre: string;
  tipo: TipoEquipo;
  estado: EstadoEquipo;
  espacio: string | null;
  costo: number;
}

export interface Costo {
  id: number;
  concepto: string;
  categoria: string;
  monto: number;
  periodo: string;
  vencimiento: string | null;
  estado: EstadoCosto;
}

export interface Permiso {
  id: number;
  nombre: string;
  entidad: string;
  numero: string | null;
  vencimiento: string;
  estado: EstadoPermiso;
  vencePronto: boolean;
}

export interface Dashboard {
  rol: Rol;
  ahora: string;
  espacios: Array<{
    id: number;
    nombre: string;
    tipo: TipoEspacio;
    zona: string;
    estado: EstadoEspacio;
    presencia: "ocupado" | "libre";
    proximoFin: string | null;
  }>;
  ocupados: number;
  ventasHoy: { total: number; operaciones: number };
  reservas: Array<{
    id: number;
    espacio: string;
    cliente: string | null;
    inicio: string;
    fin: string;
    estado: EstadoReserva;
  }>;
  stock: Array<{ id: number; nombre: string; unidad: string; stock: number; stockMinimo: number }>;
  permisos: Array<{ id: number; nombre: string; entidad: string; vencimiento: string; estado: string }>;
  turnos: Array<{
    id: number;
    nombre: string;
    cargo: string;
    horaInicio: string;
    horaFin: string;
    area: string;
  }>;
  experiencias: Array<{
    id: number;
    nombre: string;
    inicio: string;
    fin: string;
    estado: string;
    participantes: number;
  }>;
  serie: Array<{ dia: string; total: number }>;
  consumoMes?: number;
  costosPendientes?: Array<{ id: number; concepto: string; monto: number; vencimiento: string | null }>;
  costosPendientesTotal?: number;
}

export type RangoReporte = "hoy" | "7d" | "21d" | "mes" | "custom";

export interface Reporte {
  rango: RangoReporte;
  periodo: string;
  desde: string;
  hasta: string;
  ingresos: {
    ventas: number;
    reservasRealizadas: number;
    reservasPrevistas: number;
    experienciasRealizadas: number;
    experienciasPrevistas: number;
    total: number;
  };
  egresos: {
    fijos: number;
    insumos: number;
    experiencias: number;
    total: number;
    detalle: Array<{
      id: number;
      concepto: string;
      categoria: string;
      monto: number;
      periodo: string;
      estado: string;
      prorrateado: number;
    }>;
  };
  margenRealizado: number;
  ocupacionPromedio: number;
  utilizacion: Array<{
    id: number;
    nombre: string;
    tipo: string;
    horas: number;
    porcentaje: number;
  }>;
  demanda: Array<{ hora: number; reservas: number; ventas: number }>;
  flujo: Array<{ dia: string; ingresos: number; egresos: number }>;
  topProductos: Array<{ id: number; nombre: string; cantidad: number; ingresos: number }>;
  experiencias: Array<{
    id: number;
    nombre: string;
    estado: string;
    participantes: number;
    capacidad: number;
    ingresos: number;
    costoProductos: number;
    costoEspacio: number;
    margen: number;
  }>;
}
