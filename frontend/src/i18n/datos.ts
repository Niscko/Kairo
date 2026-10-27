import { useCallback } from "react";
import { useTranslation } from "react-i18next";

/**
 * Los datos de negocio (espacios, productos, insumos…) se guardan en español en
 * la base. Este diccionario los traduce al mostrarlos en inglés; cualquier valor
 * que no esté aquí (por ejemplo, lo que un usuario escriba) se muestra tal cual.
 */
const EN: Record<string, string> = {
  // Espacios y zonas
  "Sala Roble": "Oak Room",
  "Sala Ceiba": "Ceiba Room",
  Terraza: "Terrace",
  Ventana: "Window",
  Jardín: "Garden",
  Barra: "Bar",
  Sofá: "Sofa",
  "Planta 1": "Floor 1",
  "Planta 2": "Floor 2",
  Exterior: "Outdoor",

  // Cargos y áreas del personal
  administrador: "Administrator",
  barista: "Barista",
  cocina: "Kitchen",
  atencion: "Front of house",
  aseo: "Cleaning",
  Dirección: "Management",
  Cocina: "Kitchen",
  Sala: "Floor",
  Aseo: "Cleaning",

  // Productos
  "Latte de avena": "Oat latte",
  "Cold brew": "Cold brew",
  "Jugo de maracuyá": "Passion fruit juice",
  "Cerveza artesanal": "Craft beer",
  Sándwich: "Sandwich",
  "Día de cowork": "Coworking day",
  "Membresía mensual": "Monthly membership",
  "Espresso largo de origen Huila.": "Long espresso from Huila.",
  "Espresso con leche entera texturizada.": "Espresso with steamed whole milk.",
  "Espresso con leche de avena.": "Espresso with oat milk.",
  "Extracción en frío, doce horas.": "Cold extraction, twelve hours.",
  "Pulpa natural, sin azúcar añadida.": "Natural pulp, no added sugar.",
  "Lata 355 ml. Venta a mayores de 18 años.": "355 ml can. Sold to ages 18 and over.",
  "De mantequilla, horneado en la mañana.": "Butter croissant, baked in the morning.",
  "Baguette, jamón y queso.": "Baguette, ham and cheese.",
  "Chocolate al 70%.": "70% chocolate.",
  "Acceso a un puesto durante la jornada.": "Access to a desk for the day.",
  "Puestos incluidos por 30 días.": "Desks included for 30 days.",

  // Insumos y proveedores
  "Café especial": "Specialty coffee",
  "Leche entera": "Whole milk",
  "Leche de avena": "Oat milk",
  Agua: "Water",
  Azúcar: "Sugar",
  Hielo: "Ice",
  "Pan croissant": "Croissant dough",
  "Pan baguette": "Baguette bread",
  Queso: "Cheese",
  Jamón: "Ham",
  "Pulpa de maracuyá": "Passion fruit pulp",
  "Cerveza lata": "Canned beer",
  Detergente: "Detergent",
  "Papel higiénico": "Toilet paper",
  "Finca Alto Verde": "Alto Verde Farm",
  "Panadería La Miga": "La Miga Bakery",
  "Distribuciones San Juan": "San Juan Distributors",
  "Limpieza Nova": "Nova Cleaning",
  Panadería: "Bakery",
  Abarrotes: "Groceries",
  unidad: "unit",
  un: "pcs",
  paquete: "pack",
  "Inventario inicial del mes": "Opening stock for the month",
  "Merma de molienda": "Grinding loss",
  "Venta de mostrador": "Counter sale",

  // Experiencias
  "Noche de vinilo": "Vinyl night",
  "Club de lectura": "Book club",
  "Sesión en la terraza con música en vinilo, barra de cerveza y postres.":
    "Terrace session with vinyl music, a beer bar and desserts.",
  "Encuentro en Sala Roble. Incluye un americano de cortesía al llegar.":
    "Meetup in the Oak Room. Includes a complimentary americano on arrival.",

  // Equipos
  "Monitor 27 pulgadas": "27-inch monitor",
  Proyector: "Projector",
  "Equipo de sonido": "Sound system",
  "Máquina de espresso": "Espresso machine",
  Molino: "Grinder",
  "Nevera vertical": "Upright fridge",
  Impresora: "Printer",
  "Sofá modular": "Modular sofa",

  // Costos y permisos
  "Arriendo local Laureles": "Laureles premises rent",
  Energía: "Electricity",
  Acueducto: "Water utility",
  Gas: "Gas",
  "Aseo y residuos": "Cleaning and waste",
  "Derechos de música": "Music rights",
  arriendo: "rent",
  servicios: "utilities",
  obligaciones: "obligations",
  "Uso de suelos": "Land use",
  "Concepto sanitario": "Health certificate",
  "Concepto de bomberos": "Fire department certificate",
  "Derechos de ejecución musical": "Public music performance rights",
  "Venta de bebidas alcohólicas": "Alcoholic beverage sales",
  "Alcaldía de Medellín": "Medellín City Hall",
  "Secretaría de Salud": "Health Department",
};

/** Nombres con número ("Puesto 01"), que no conviene enumerar uno a uno. */
const PATRONES: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/^Últimos (\d+) días$/, (m) => `Last ${m[1]} days`],
  [/^Puesto (\d+)$/, (m) => `Desk ${m[1]}`],
  [/^Mesa (\d+)$/, (m) => `Table ${m[1]}`],
  [/^Vaso (\d+) oz$/, (m) => `${m[1]} oz cup`],
  [/^Portátil de préstamo (\d+)$/, (m) => `Loaner laptop ${m[1]}`],
];

function traducirParte(valor: string): string {
  const exacto = EN[valor];
  if (exacto !== undefined) return exacto;
  for (const [patron, resolver] of PATRONES) {
    const m = valor.match(patron);
    if (m) return resolver(m);
  }
  return valor;
}

/** Traduce un dato de negocio guardado en español; compuestos como "Mesa 04 · Sofá" se traducen por partes. */
export function traducirDato(valor: string, idioma: string): string {
  if (!idioma.startsWith("en")) return valor;
  return valor.split(" · ").map(traducirParte).join(" · ");
}

/** Devuelve una función que traduce datos de negocio al idioma activo. */
export function useDato(): (valor: string | null | undefined) => string {
  const { i18n } = useTranslation();
  const idioma = i18n.language;
  return useCallback((valor) => (valor ? traducirDato(valor, idioma) : ""), [idioma]);
}
