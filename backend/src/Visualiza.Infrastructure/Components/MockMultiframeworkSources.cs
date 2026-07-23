using Visualiza.Domain.Components;

namespace Visualiza.Infrastructure.Components;

/// <summary>
/// Stubs deterministas por framework para el modo mock (desarrollo sin coste de API).
/// No pretenden la riqueza de los mocks React del experimento: demuestran el contrato
/// de salida de cada tecnología para la funcionalidad de librerías.
/// </summary>
public static class MockMultiframeworkSources
{
    public static string For(TargetFramework framework, CodeLanguage language, ComponentType type)
    {
        var title = Title(type);
        return framework switch
        {
            TargetFramework.Vue3 => Vue3(title, language),
            TargetFramework.Vue2 => Vue2(title),
            TargetFramework.Angular => Angular(title),
            _ => throw new ArgumentOutOfRangeException(nameof(framework), framework, "Unsupported framework for mock generation.")
        };
    }

    private static string Title(ComponentType type) => type switch
    {
        ComponentType.RegistrationForm => "Formulario de registro",
        ComponentType.DataTable => "Tabla de datos",
        ComponentType.StatsPanel => "Panel de estadísticas",
        ComponentType.NavigationMenu => "Menú de navegación",
        ComponentType.ProductCard => "Tarjeta de producto",
        _ => "Componente UI"
    };

    private static string Vue3(string title, CodeLanguage language) =>
        $$"""
        <script setup{{(language == CodeLanguage.TypeScript ? " lang=\"ts\"" : "")}}>
        import { ref } from 'vue'

        const clicks = ref(0)
        </script>

        <template>
          <section class="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h2 class="text-lg font-semibold text-slate-900">{{title}}</h2>
            <p class="text-sm text-slate-500">Componente de ejemplo generado en modo mock (Vue 3, Composition API).</p>
            <button
              class="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
              @click="clicks++"
            >
              Interacciones: {{ "{{ clicks }}" }}
            </button>
          </section>
        </template>
        """;

    private static string Vue2(string title) =>
        $$"""
        <script>
        export default {
          name: 'MockComponent',
          data() {
            return { clicks: 0 }
          },
          methods: {
            increment() {
              this.clicks += 1
            }
          }
        }
        </script>

        <template>
          <section class="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h2 class="text-lg font-semibold text-slate-900">{{title}}</h2>
            <p class="text-sm text-slate-500">Componente de ejemplo generado en modo mock (Vue 2, Options API).</p>
            <button
              class="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
              @click="increment"
            >
              Interacciones: {{ "{{ clicks }}" }}
            </button>
          </section>
        </template>
        """;

    private static string Angular(string title) =>
        $$"""
        import { Component, signal } from '@angular/core';

        @Component({
          selector: 'app-mock-component',
          standalone: true,
          template: `
            <section class="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
              <h2 class="text-lg font-semibold text-slate-900">{{title}}</h2>
              <p class="text-sm text-slate-500">Componente de ejemplo generado en modo mock (Angular standalone).</p>
              <button
                class="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
                (click)="increment()"
              >
                Interacciones: {{ "{{ clicks() }}" }}
              </button>
            </section>
          `,
        })
        export class MockComponent {
          readonly clicks = signal(0);

          increment(): void {
            this.clicks.update((value) => value + 1);
          }
        }
        """;
}
