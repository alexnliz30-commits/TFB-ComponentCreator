# Visualiza — análisis estadístico SUS (Entregable 4)
#
# Requiere los paquetes: tidyverse, rstatix, effectsize, here.
# Entrada: visualiza_export.csv (vista anonymized_export).
# Salida:  ./out/ con tabla descriptiva, contraste IA vs Human y figuras.
#
# Ejecutar:
#   Rscript analysis/analyze_sus.R analysis/visualiza_export.csv

suppressPackageStartupMessages({
  library(tidyverse)
  library(rstatix)
  library(effectsize)
})

args <- commandArgs(trailingOnly = TRUE)
csv_path <- if (length(args) >= 1) args[[1]] else "analysis/visualiza_export.csv"

if (!file.exists(csv_path)) {
  stop(sprintf("No se encuentra el CSV de entrada en %s", csv_path))
}

raw <- readr::read_csv(csv_path, show_col_types = FALSE)

# ── 1. Limpieza y tipado ─────────────────────────────────────────────────────
sus <- raw |>
  filter(!is.na(sus_score)) |>
  transmute(
    participant_no,
    component_type = sus_component_type,
    condition      = factor(sus_condition, levels = c("Ai", "Human")),
    score          = sus_score
  )

# ── 2. Descriptivos por condición ────────────────────────────────────────────
descriptive <- sus |>
  group_by(condition) |>
  summarise(
    n     = n(),
    mean  = mean(score),
    sd    = sd(score),
    median= median(score),
    iqr   = IQR(score),
    .groups = "drop"
  )

# ── 3. Diferencia pareada por participante y componente ─────────────────────
pairs <- sus |>
  pivot_wider(names_from = condition, values_from = score) |>
  filter(!is.na(Ai), !is.na(Human)) |>
  mutate(diff = Ai - Human)

# Test de normalidad de las diferencias
shapiro <- shapiro.test(pairs$diff)

if (shapiro$p.value > 0.05) {
  primary_test <- t.test(pairs$Ai, pairs$Human, paired = TRUE)
  effect       <- cohens_d(pairs$Ai, pairs$Human, paired = TRUE)
  test_label   <- "Paired t-test"
} else {
  primary_test <- wilcox.test(pairs$Ai, pairs$Human, paired = TRUE,
                              exact = FALSE, conf.int = TRUE)
  effect       <- rank_biserial(pairs$Ai, pairs$Human, paired = TRUE)
  test_label   <- "Wilcoxon signed-rank"
}

# ── 4. Figuras ───────────────────────────────────────────────────────────────
dir.create("out", showWarnings = FALSE)

p_violin <- ggplot(sus, aes(condition, score, fill = condition)) +
  geom_violin(alpha = 0.6) +
  geom_boxplot(width = 0.15, alpha = 0.7) +
  labs(x = NULL, y = "SUS score",
       title = "Distribución SUS por condición") +
  theme_minimal()
ggsave("out/sus_distribution.png", p_violin, width = 6, height = 4, dpi = 150)

# ── 5. Tabla resumen y salida ────────────────────────────────────────────────
out <- list(
  descriptive    = descriptive,
  shapiro_diff   = tibble::tibble(W = shapiro$statistic, p = shapiro$p.value),
  primary_test   = broom::tidy(primary_test) |> mutate(test = test_label),
  effect_size    = as.data.frame(effect),
  n_participants = dplyr::n_distinct(sus$participant_no),
  n_pairs        = nrow(pairs)
)

readr::write_csv(out$descriptive, "out/descriptive.csv")
readr::write_csv(out$primary_test, "out/primary_test.csv")

cat("\n────────  Resumen del análisis SUS  ────────\n")
print(out$descriptive)
cat("\nShapiro-Wilk sobre diferencias pareadas:\n"); print(out$shapiro_diff)
cat("\nPrueba principal:\n"); print(out$primary_test)
cat("\nTamaño del efecto:\n"); print(out$effect_size)
cat(sprintf("\nFiguras guardadas en ./out/  | n=%d participantes | pares=%d\n",
            out$n_participants, out$n_pairs))
