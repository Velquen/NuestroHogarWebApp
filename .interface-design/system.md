# Interface System

## Direction and feel
- Product tone: hogar colaborativo, calido, ordenado, legible rapido.
- UI tone: minimalista moderno, sin efecto vidrio, sin contraste agresivo.
- Data overlays (tooltips/desplegables): lectura inmediata de valor + contexto.

## Palette guidance
- Base warm surface: `#fffaf4` (usar opacidad alta, recomendado `95%` o superior).
- Main ink warm: rango `#3f3128` a `#5c4738`.
- Secondary text warm: rango `#7c6656` a `#7d6655`.
- Member accent colors: usar solo para marcador/punto y barras/segmentos de datos.
- Evitar fondos transparentes sobre charts oscuros para tooltips.

## Depth strategy
- Single subtle depth model:
- Border: `1px` con tono calido de baja intensidad (ej: `border-[#6b5545]/20`).
- Shadow: suave y corta, sin dramatismo (ej: `shadow-[0_14px_34px_-24px_rgba(84,61,45,0.48)]`).
- No `backdrop-blur` en tooltips de metricas.

## Spacing base unit
- Base: `4px`.
- Tooltip compact:
- Padding horizontal: `12px`.
- Padding vertical: `10px`.
- Gap interno entre label y valor: `12px`.
- Radio recomendado: `16px` (`rounded-2xl`).

## Typography
- Labels de contexto: uppercase, tracking amplio (`~0.11em-0.14em`), `11px`.
- Nombre de miembro: `13px`, `font-medium`.
- Valor principal: `14px`, `font-semibold`, `tabular-nums`.
- Total/resumen: `13px`, `font-semibold`.

## Shared component patterns
- Daily chart tooltip:
- Header de fecha.
- Lista por integrante con punto de color + valor.
- Separador final + total diario.
- Distribution donut tooltip:
- Nombre + marcador de color + valor unico.
- Sublinea con `% del total`.
- Estado vacio explicito si no hay actividad/puntos.

## Consistency rules
- Tooltips de "Ritmo diario y contribucion" y "Distribucion" deben compartir:
- misma familia de superficie (fondo, borde, sombra),
- misma jerarquia tipografica,
- misma escala de radio y spacing.
- Si se ajusta la paleta o estilo global de tooltips, aplicar a ambos en la misma tarea salvo solicitud explicita de excepcion.
