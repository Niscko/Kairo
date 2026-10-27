import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IDIOMAS, cambiarIdioma, type Idioma } from "@/i18n";

export function SelectorIdioma() {
  const { t, i18n } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("common.idioma")}>
          <Languages aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {IDIOMAS.map((idioma) => (
          <DropdownMenuItem
            key={idioma.codigo}
            onSelect={() => cambiarIdioma(idioma.codigo as Idioma)}
            className={i18n.language === idioma.codigo ? "font-semibold" : undefined}
          >
            {idioma.etiqueta}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
