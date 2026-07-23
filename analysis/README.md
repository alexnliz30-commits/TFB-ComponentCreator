# Pipeline de análisis estadístico

Este directorio contiene el material reproducible para el análisis del experimento.

## Archivos

| Fichero | Propósito |
|---|---|
| `export_anonymized.sql` | Crea la vista `anonymized_export` en PostgreSQL y la exporta a `visualiza_export.csv`. |
| `analyze_sus.R` | Análisis SUS principal (descriptivos, normalidad, test pareado, tamaño de efecto, figura). |
| `out/` | Generado por el script R: figuras y tablas resumen. |

## Flujo

```bash
# 1) Exportar datos anonimizados (con todas las sesiones cerradas):
psql -h <host> -U visualiza -d visualiza -f analysis/export_anonymized.sql
psql -h <host> -U visualiza -d visualiza \
     -c "\COPY (SELECT * FROM anonymized_export) TO 'analysis/visualiza_export.csv' CSV HEADER"

# 2) Análisis SUS:
Rscript analysis/analyze_sus.R analysis/visualiza_export.csv
```

## Reproducibilidad

El CSV de exportación + los scripts del directorio son suficientes para reproducir el análisis sin necesidad de la BD original. Para entregar al tribunal se adjunta el CSV anonimizado junto al volcado del directorio `out/`.
