namespace Visualiza.Domain.Components;

/// <summary>
/// Tipo de componente que se pide generar.
///
/// Los cinco primeros son el corpus del estudio: cada uno lleva sus propios
/// requisitos en el prompt del sistema, y son los que las medidas del
/// experimento referencian por nombre. No se tocan ni se reordenan.
/// </summary>
public enum ComponentType
{
    RegistrationForm,
    DataTable,
    StatsPanel,
    NavigationMenu,
    ProductCard,

    /// <summary>
    /// Componente descrito libremente por quien lo pide.
    /// </summary>
    /// <remarks>
    /// El catálogo cerrado de cinco tipos tenía sentido para el experimento, que
    /// compara siempre los mismos, pero como herramienta obligaba a encajar lo
    /// que querías en una de cinco casillas: pedir un acordeón o un calendario
    /// significaba elegir «formulario de registro» y esperar que la descripción
    /// pesara más que la etiqueta. Aquí no hay etiqueta que contradecir, y el
    /// prompt del sistema cae a sus reglas generales —que es lo que ya hacían
    /// los `_ =>` de los dos generadores—.
    /// </remarks>
    Custom
}
