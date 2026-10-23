import { createContext, useContext } from "react";

/**
 * Autocomplete y otros controles con portales al <body> deben respetar el
 * estado del WindowFrame que los contiene.
 *
 * Los formularios fuera del gestor interno (standalone) siguen visibles.
 */
export const WindowVisibilityContext = createContext({ isWindowMinimized: false });

export const useWindowVisibility = () => useContext(WindowVisibilityContext);
