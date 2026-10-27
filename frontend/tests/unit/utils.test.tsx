import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn", () => {
  it("combina clases condicionales", () => {
    const activo = false;
    expect(cn("a", activo && "b", "c")).toBe("a c");
  });

  it("resuelve conflictos de Tailwind conservando la última", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-sm text-muted-foreground", "text-lg")).toBe(
      "text-muted-foreground text-lg",
    );
  });

  it("acepta arrays y objetos de clsx", () => {
    expect(cn(["a", "b"], { c: true, d: false })).toBe("a b c");
  });
});

describe("render de humo", () => {
  it("monta un componente con estilos globales", () => {
    render(<p className="text-foreground">Kairo</p>);
    expect(screen.getByText("Kairo")).toBeInTheDocument();
  });
});