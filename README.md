# Visualiza — Snapshot Entregable 4 (Depósito final)

Sistema de generación automática de componentes de interfaz de usuario con IA, soporte experimental del TFB *"Generación automática de componentes de interfaz de usuario con Inteligencia Artificial: estudio comparativo de usabilidad frente al diseño humano"* (Universitat Carlemany, Bàtxelor en Informàtica, edición 2510).

Este snapshot corresponde al **Entregable 4 — Depósito final**, congelado entre 14/09/2026 y 20/09/2026.

---

## Qué es nuevo respecto al Entregable 3

E4 = E3 + los siguientes bloques de funcionalidad y cierre:

### 1. Renderizado real del TSX en sandbox iframe
Sustituye el placeholder de `TaskView` por un componente `ComponentSandbox` que carga React 18, ReactDOM 18, Tailwind y `@babel/standalone` desde CDN dentro de un `iframe sandbox="allow-scripts"`, transpila el TSX en cliente y renderiza el componente exportado. El sandbox es ahora la única vista del componente bajo evaluación durante la sesión.

El corpus de los 10 componentes (5 tipos × 2 condiciones) vive versionado en `frontend/src/experiment/types.ts` con un campo `sourceCode` por elemento, lo que hace el experimento **reproducible bit a bit** sin depender de la BD ni de regeneraciones por IA. (El corpus se generó originalmente con GPT-4o; la plataforma usa ahora la API de Claude, pero el corpus está congelado por reproducibilidad.)

### 2. Infraestructura como código (Azure Bicep)
`infra/main.bicep` provisiona:
- **App Service Plan B1 (Linux)** + Web App contenedorizada que tira la imagen del backend desde GHCR.
- **PostgreSQL Flexible Server B1ms** con base `visualiza`, regla de firewall para servicios Azure y backup 7 días.
- **Key Vault** con el secreto JWT referenciado por la Web App vía Managed Identity (`@Microsoft.KeyVault(...)`).
- **Application Insights** conectado al backend.

`.github/workflows/deploy.yml` (disparo manual o en tag `tfb-*`) construye la imagen, la publica en GHCR y aplica el Bicep.

### 3. Polish del backend
- Endpoint `GET /healthz` con `AddHealthChecks().AddDbContextCheck<VisualizaDbContext>()` para health probes de App Service. (La auto-creación del esquema con `EnsureCreated()` al arranque está presente desde E2.)

> **Nota sobre el esquema.** Con `docker compose`, quien crea las tablas es `db/init.sql`, que Postgres ejecuta **una única vez, al inicializar un volumen vacío**. `EnsureCreated()` solo actúa si la base no tiene ninguna tabla, así que con compose es un no-op. Consecuencia práctica: **si el esquema cambia, un volumen ya existente no se actualiza solo**. Para recrearlo:
>
> ```bash
> docker compose down -v && docker compose up   # borra el volumen y reejecuta init.sql
> ```
>
> O, sin perder los datos, aplicar el script (es idempotente, todo es `CREATE ... IF NOT EXISTS`):
>
> ```bash
> docker compose cp db/init.sql postgres:/tmp/init.sql
> docker compose exec postgres psql -U visualiza -d visualiza -f /tmp/init.sql
> ```

### 4. Constructor visual de componentes (UI Builder)
El frontend incorpora un editor visual completo de componentes accesible desde la pestaña "Constructor" en `App.tsx`. El builder permite crear interfaces arrastrando bloques, editando propiedades, escribiendo código TSX directamente o generando y modificando componentes mediante conversación con Claude (API de Anthropic).

Ficheros en `frontend/src/builder/`:

**Núcleo (representación intermedia).**
- `ui-node.ts` — IR agnóstica de framework: nodos `el` / `text` / `expr` / `slot` / `when` y atributos `static` / `expr` / `event`. Cada elemento dinámico transporta tres cosas: el código a emitir, el valor de *preview* (estado inicial, para el modo diseño) y un cierre `live` / `run` ejecutable en el lienzo. Eso permite ejecutar el comportamiento **sin evaluar nunca las cadenas de código** destinadas al emisor.
- `schema.ts` — **fuente única de verdad**: `buildNode(block, ctx)` traduce cada uno de los 85 tipos a un árbol `UiNode`. De aquí beben tanto el lienzo como los emisores, así que no pueden divergir. No contiene afordances de edición: produce markup limpio, listo para exportar.
- `actions.ts` — modelo declarativo de estado y comportamiento: `StateVar`, `BlockAction` (`toggle` / `set` / `increment` / `reset`), `BlockEvent` y `VisibilityRule`. Contiene **generador de código e intérprete gemelos** en el mismo fichero, a propósito: al añadir una acción salta a la vista que hay que cubrir ambos caminos.

**Emisión.**
- `emit-react.ts` — emisor a la forma `export function App()` sin imports y con hooks globales, que es la que exigen el sandbox y el harness KR1. Solo declara las variables de estado realmente referenciadas (con `noUnusedLocals` activo, declarar de más rompería la compilación).
- `emitters.ts` — registro pluggable de emisores y helper `currentCode(state)`. Añadir Vue 3 / Vue 2 / Angular consiste en implementar `CodeEmitter` sobre la misma IR y registrarlo aquí, sin tocar el esquema ni el lienzo.
- `emit-package.ts` — segundo artefacto de salida: la **carpeta del componente** (ver §8).

**Lienzo y paneles.**
- `BuilderView.tsx` — layout principal (paleta, canvas, paneles laterales, código y preview), contexto DnD con `@dnd-kit/core` y conmutador Diseño / Interactivo.
- `BlockPalette.tsx` — paleta colapsable con los bloques arrastrables en dos tabs (HTML y UI) y sus categorías.
- `BuilderCanvas.tsx` — superficie de edición; provee el runtime de estado del modo interactivo.
- `BlockRenderer.tsx` — envuelve el markup que produce el esquema con los afordances de edición (etiqueta, selección, arrastre, borrado, zona de soltar). En modo interactivo ese envoltorio desaparece.
- `render-node.tsx` — renderiza la IR a React y aloja `useCanvasRuntime`, el estado vivo del lienzo.
- `PropertiesPanel.tsx` — propiedades del bloque seleccionado por secciones colapsables (ver §7).
- `ActionsPanel.tsx` — variables de estado, acciones por evento, visibilidad condicional y enlace `bindTo` (ver §8).
- `panel-ui.tsx` — controles compartidos por los paneles laterales.
- `style-utils.ts` — manipulación de `className` Tailwind por breakpoint, `STYLE_SECTIONS` y helpers de visibilidad/navegadores (ver §7).
- `templates.ts` — cuatro plantillas de arranque (`landing`, `dashboard`, `form`, `pricing`).
- `CodeView.tsx` — tres vistas: **Componente** (la forma `App()`, editable a mano, se refleja como `codeOverride`), **Paquete** (la carpeta exportable, de solo lectura por derivada) y **Estilos** (CSS/SASS propio).
- `AiChatPanel.tsx` — chat con Claude. Con bloques en el lienzo usa el endpoint `assist`: la IA recibe el árbol completo (bloques, props, variables de estado, bloque seleccionado y código emitido) y devuelve el árbol modificado, validado en cliente por `sanitize-tree.ts` antes de aplicarse (deshacible). Sin bloques, genera o refina código (ver §8).
- `useBuilderStore.ts` — estado con `useReducer` y contextos React, con historial de deshacer/rehacer.
- `defaults.ts` — definiciones de los 85 tipos de bloque (props por defecto, icono, categoría, tab, flag de contenedor).
- `types.ts` — tipos del builder.

El preview reutiliza el `ComponentSandbox` de `frontend/src/components/ComponentSandbox.tsx` (iframe + React 18 + Tailwind + @babel/standalone) para renderizar el TSX generado en tiempo real.

> **Por qué existe la IR.** Antes había *dos* implementaciones paralelas de cada bloque: una para pintar el lienzo (`BlockRenderer`) y otra para exportar (`tree-to-tsx`). Se desincronizaron: de los 85 tipos de la paleta, **41 se exportaban como `<div>tipo</div>`** — `navbar`, `stat`, `table-ui`, `timeline`, `calendar`, `switch`, `slider`, `rating`, `grid`, `flex`, `cta`, `strong`, `pre`… El lienzo mostraba un componente y el código exportado era otro. Con el esquema único eso deja de ser posible por construcción.

### 5. Pipeline de análisis estadístico reproducible
`analysis/`:
- `export_anonymized.sql` — vista `anonymized_export` con id ordinal del participante (sin código) y offsets temporales relativos.
- `analyze_sus.R` — script R que carga el CSV, calcula descriptivos por condición, prueba la normalidad de las diferencias pareadas, aplica t pareada o Wilcoxon según corresponda, reporta el tamaño del efecto (Cohen d o rank-biserial) y dibuja el violin plot SUS vs condición.
- `README.md` — instrucciones reproducibles.

### 6. Librerías de componentes y generación multi-framework
Funcionalidad de producto (el experimento SUS sigue siendo React + Tailwind exclusivamente, por reproducibilidad).

**Dominio.** `Domain/Libraries/` añade `ComponentLibrary` y `SavedComponent`; `Domain/Components/` añade `TargetFramework` (React | Vue2 | Vue3 | Angular), `CodeLanguage` (TypeScript | JavaScript) y `LanguageTokens` (mapa framework+lenguaje → extensión `tsx`/`jsx`/`vue`/`ts`). Invariante de dominio: **Angular exige TypeScript** — una librería Angular+JS se rechaza en el constructor de la entidad.

**Aplicación.** `IComponentLibraryRepository` + seis casos de uso (`CreateLibrary`, `ListLibraries`, `GetLibrary`, `SaveComponentToLibrary`, `DeleteSavedComponent`, `DeleteLibrary`) y sus DTOs en `Libraries/LibraryDtos.cs`.

**API.** `LibrariesController`:

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/libraries` | Crea una librería (nombre, framework, lenguaje) |
| GET | `/api/libraries` | Lista las librerías |
| GET | `/api/libraries/{id}` | Detalle con sus componentes guardados |
| DELETE | `/api/libraries/{id}` | Elimina la librería y todos sus componentes |
| POST | `/api/libraries/{id}/components` | Guarda un componente: **201 al crear, 200 al revisar** |
| DELETE | `/api/libraries/{id}/components/{componentId}` | Elimina un componente guardado |

**Generación multi-framework.** `GenerateComponentRequest` acepta `framework` y `language` opcionales (por defecto React/TypeScript, lo que mantiene el comportamiento previo y los tests existentes). `OpenAiComponentGenerator.BuildSystemPrompt` está parametrizado por framework, con un contrato de salida por tecnología: React → `export function App()` en TSX; Vue 3 → SFC con `<script setup>`; Vue 2 → Options API; Angular → componente standalone con signals. `MockMultiframeworkSources` provee stubs Vue2/Vue3/Angular para el modo mock.

**Verificación estática parcial.** El harness `tsc --noEmit` (KR1) solo puede validar React+TypeScript, así que la respuesta de generación incorpora un campo **`verified: bool`**: `false` significa que el componente se devolvió *sin* verificación de compilación, no que haya fallado. El KR1 del OKR se sigue midiendo únicamente sobre React+TS.

`verified` es `false` en dos situaciones distintas:
1. **La tecnología no es React+TS** (Vue 2/3, Angular): el harness no aplica.
2. **El entorno no tiene Node**: el harness no puede ejecutarse.

> **Nota de entorno (KR1).** El harness invoca `npx -p typescript tsc`, así que necesita Node.js en la máquina que corre el backend. Las imágenes del backend (`dotnet/sdk:8.0` en `docker-compose.yml`, `dotnet/aspnet:8.0` en el `Dockerfile` de producción) **no incluyen Node**: en esos entornos la generación funciona con normalidad y devuelve `verified: false`, sin verificar. Es una degradación deliberada: se prefirió no engordar las imágenes antes que arrastrar Node a producción, donde la verificación no se usa. **La medición del KR1 se hace en el host o en CI**, donde Node sí está presente (`cd backend && dotnet test`, o el flujo de desarrollo con `dotnet run`). Nunca se interpreta la ausencia de Node como fallo de compilación: eso haría que el KR1 midiera 0 % en vez de reflejar que no hubo medición.

**Frontend.** `api/libraries.ts` (cliente tipado) y la vista `libraries/LibrariesView.tsx`, accesible desde la pestaña "Librerías" de `App.tsx`: crear librería eligiendo framework y lenguaje (la opción JavaScript queda deshabilitada al elegir Angular, reflejando la invariante de dominio), generar componentes con IA según la tecnología de la librería, y guardar / copiar / descargar con la extensión correcta. El preview en sandbox solo se ofrece para librerías React+TS, que es lo único que el pipeline Babel del iframe sabe transpilar. `BuilderView` gana un botón "Guardar" que persiste el TSX del lienzo en una librería React+TS.

### 6bis. La librería como catálogo

La librería sigue siendo **la unidad**: lo que se exporta es la librería entera. Lo que cambia es cómo se lee — como catálogo de sus componentes, con cada ficha renderizada en vivo y no como una lista de bloques de código.

**Persistencia del árbol.** `SavedComponent` gana `TreeJson`. El `SourceCode` es el artefacto de salida y la transformación no tiene vuelta: del TSX emitido no se puede reconstruir el árbol de bloques. Sin guardarlo, un componente de la librería solo se podía ver y descargar, nunca reabrir para editarlo. Es nulo en los componentes generados como código, que el catálogo marca **«solo código»** y no ofrece para editar en vez de abrir el constructor en blanco.

> **Migración.** `CREATE TABLE IF NOT EXISTS` no toca una tabla existente y `EnsureCreated()` es no-op en cuanto hay tablas, así que sobre un volumen de PostgreSQL anterior la columna no aparecería y la funcionalidad quedaría rota sin que ningún test lo viera (usan InMemory). Por eso `db/init.sql` termina con un `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` idempotente: reaplicar ese fichero es la vía de migración.

**Guardar es un upsert.** Desde el constructor se guarda muchas veces el mismo componente. Dando siempre de alta, la librería acumulaba copias homónimas y dejaba de poder leerse como catálogo. La identidad se resuelve por `componentId` cuando el cliente ya la conoce (el proyecto local lo guarda en `savedComponentId`) y, si no, por nombre dentro de la librería.

**Editar.** El catálogo es la fuente de verdad de la librería, pero el constructor trabaja dentro de un proyecto local, así que editar trae el árbol al proyecto abierto (`importSavedComponent`). Reutiliza la entrada si ese componente ya se había traído: abrir dos veces desde el catálogo dejaría copias divergentes que al guardar se pisarían entre sí en el backend.

**Exportación de la librería.** `emit-library.ts` compone sobre `emitPackage` —que sigue siendo quien sabe emitir *un* componente— y produce un paquete único: cada componente en su carpeta y **el tema una sola vez en la raíz**, que es lo que hace que cambiar el color de marca repinte la librería entera desde un sitio. Se entrega en un zip escrito por `zip.ts`, una implementación mínima del formato (método *stored*) para no arrastrar una dependencia entera: descargar treinta ficheros sueltos con el nombre aplanado no es exportar una librería.

**Borrado.** Se puede eliminar la librería completa desde su ficha, y al borrar un proyecto que publicaba en una se pregunta explícitamente qué hacer con ella: son cosas distintas y en sitios distintos —el proyecto vive en este navegador, la librería en el servidor— así que ni cascada silenciosa ni librería huérfana. Al eliminarla, los proyectos que la referenciaban se desenlazan (`unlinkBackendLibrary`) para que el siguiente guardado cree una limpia en lugar de fallar contra un id borrado.

> **Trampa de EF Core encontrada aquí.** No hay navegación entre `ComponentLibraryRecord` y `SavedComponentRecord` —la clave ajena solo existe en la base de datos—, así que EF no conoce la dependencia y puede emitir el `DELETE` de la librería antes que el de sus componentes. PostgreSQL cascadea, y el borrado de cada componente afecta entonces a 0 filas: `DbUpdateConcurrencyException` y 500. Se resuelve con dos `SaveChanges` en orden explícito. **Los tests con InMemory no podían verlo** (ahí ni cascadea ni importa el orden): salió al ejercitar la interfaz contra el PostgreSQL real.

### 6ter. Tamaño relativo, posición libre y un asistente que pregunta

**El `className` no llegaba al mismo elemento en todos los tipos.** Un `input` con etiqueta se envuelve en un `div`, así que un `w-full` estiraba el control pero no el bloque, y un `absolute` lo habría posicionado dentro de su propio envoltorio. Las utilidades que describen al bloque **dentro de su hueco** —tamaño, posición, margen, comportamiento como hijo de un flex o grid— se separan ahora del resto y se izan al elemento más externo en `buildNode`, el único punto de entrada del esquema: queda garantizado para los 85 tipos sin tocar ninguno.

**Redimensionar da proporción del contenedor**, no píxeles (Alt invierte), con ajuste a fracciones: sale `w-1/2`, no `w-[49.7%]` — se lee mejor en el código y no depende del monitor donde se diseñó. La altura sigue en píxeles porque un porcentaje de alto solo surte efecto si el padre tiene altura definida. `arbitraryStyle` en `render-node` resuelve ahora **cualquier unidad**, no solo `px`: los valores arbitrarios no se pueden enumerar en el safelist, así que sin eso un `w-[50%]` no se vería en el lienzo.

**Posición libre por bloque** (`SET_FREE_POSITION`): el flujo sigue siendo el comportamiento por defecto y cualquier bloque puede liberarse para colocarse en un punto exacto de su contenedor. La acción toca dos bloques a propósito —el liberado recibe `absolute`, su contenedor `relative`—, porque si no la posición se resolvería contra un ancestro arbitrario y diferiría entre lienzo y código exportado.

> **Trampa encontrada al probarlo en navegador.** Con `absolute` en el envoltorio de edición **y** en el elemento interior, el envoltorio se quedaba sin hijos en flujo, colapsaba a tamaño cero y dejaba de recibir el puntero: el bloque no se podía ni seleccionar. En el lienzo posiciona el envoltorio; en el código exportado, donde no hay envoltorio, la clase va al elemento. `verify:emitter` gana un caso que **afirma en qué elemento cae cada clase** — la compilación valida que el código es correcto, no que las utilidades hayan caído donde debían.

**El asistente pregunta** cuando la petición admite resultados claramente distintos, antes de empezar y también sobre un componente ya montado; las opciones llegan como chips pulsables. El criterio va en el prompt como una prueba explícita («¿podrías construir dos componentes distintos que la cumplan igual de bien?»), porque un asistente que pregunta por todo devuelve al usuario el trabajo que debía ahorrarle.

> **Dos fallos silenciosos que esto destapó.** `MaxTokens` cubre razonamiento *y* respuesta: una petición ambigua agotaba el presupuesto razonando y devolvía texto vacío, que aguas abajo se comunicaba como un «Hecho.» falso. Y si el modelo respondía en prosa sin JSON, la extracción devolvía `{}` y se perdía la respuesta entera. Corregidos ampliando el presupuesto, trazando el motivo de terminación cuando no hay texto, y aceptando la prosa como respuesta conversacional (sin árbol, no puede tocar el lienzo).

### 7. Panel de Propiedades ampliado
`PropertiesPanel.tsx` deja de ser un editor de texto y clases sueltas y pasa a ser un panel de estilos por secciones colapsables, apoyado en `builder/style-utils.ts`:

- **Breakpoints.** Un selector Base / `sm` / `md` / `lg` / `xl` (mobile-first, con el ancho de cada uno como pista) determina sobre qué prefijo Tailwind escriben los controles; `getUtility` / `setUtility` leen y reescriben la utilidad correspondiente dentro de `className` sin tocar el resto.
- **Secciones de estilo** (`STYLE_SECTIONS`): diseño (layout), espaciado, tamaño, tipografía, fondo y color, y bordes y sombra.
- **Visibilidad por dispositivo.** Traduce a utilidades `hidden` / `md:` / `lg:` mediante `getDeviceVisibility` / `setDeviceVisibility`.
- **Navegadores.** Selector Chrome / Firefox / Safari / Edge que se serializa en la prop `browsers` (`parseBrowsers` / `serializeBrowsers`), que el esquema emite como atributo `data-browsers`.
- **Contenido y escape hatch.** Campos de contenido genéricos con etiquetas en español, más un campo `className` libre para cualquier utilidad que las secciones no cubran.

### 8. Comportamiento, modo interactivo y exportación como paquete

**Estado y acciones.** El lienzo permitía componer *forma* pero no *comportamiento*: todo lo exportado era inerte (botones sin handler, tabs que no cambiaban, modales que no cerraban). El modelo de `actions.ts` añade variables de estado a nivel de componente y acciones declarativas enlazadas a eventos (`click`, `change`, `submit`), más visibilidad condicional por bloque. El emisor las traduce a `useState` y manejadores reales.

Es deliberadamente **cerrado** —no admite código arbitrario— por dos razones: así cualquier emisor futuro (Vue, Angular) puede traducirlo con garantías, y el usuario no puede romper el sandbox con una expresión inválida.

Los bloques con estado natural (`tabs`, `accordion`, `pagination`, `stepper`, `switch`, `rating`) aceptan una prop `bindTo`: enlazados a una variable se emiten interactivos; sin enlazar, estáticos. Nada de comportamiento oculto no solicitado.

**Modo Diseño / Interactivo.** El clic no puede significar a la vez «selecciona para editar» y «pulsa el botón», de ahí el conmutador. En Interactivo el componente se comporta como en producción, con estado real y un botón de reiniciar; la edición queda pausada.

**Exportación como paquete.** `emit-package.ts` produce el artefacto de *entrega*, distinto del de *verificación*:

```
MiComponente/
├─ MiComponente.tsx    componente con nombre, interface de props y estado
├─ MiComponente.css    estilos propios (si los hay; también .scss)
├─ index.ts            punto de entrada
└─ README.md           uso, tabla de props y requisitos
```

Se extiende por props (`className` del raíz y valor inicial de cada variable de estado) sin tocar el fichero, y `<MiComponente />` sigue funcionando porque todo tiene valor por defecto.

**Hoja de estilos autocontenida.** El botón «Generar CSS autónomo» llama a `POST /api/components/stylesheet`, que ejecuta la CLI de Tailwind sobre el marcado del componente y devuelve una hoja con **solo las utilidades empleadas**. Con ella el paquete funciona en cualquier proyecto sin instalar ni configurar Tailwind. El SASS propio del usuario se compila en el mismo paso y se anexa al final, de modo que gana a las utilidades.

La clave de la portabilidad está en el *preflight*: el reset global de Tailwind (`*`, `html`, `body`) arrasaría los estilos de la web anfitriona, así que se desactiva (`corePlugins: { preflight: false }`) y en su lugar se emite un reset equivalente **acotado a la clase `visualiza-component`** de la raíz, escrito con `:where()` para que tenga especificidad cero y no compita con nada. No es cosmético: las utilidades `border` solo fijan el grosor, así que sin `border-style: solid` no se vería ningún borde.

> **Nota de entorno.** Igual que el harness del KR1, esto requiere Node en la máquina del backend, que las imágenes de contenedor no llevan. Sin Node el endpoint responde 200 con `generated: false` y la interfaz lo dice explícitamente: el paquete sigue siendo válido, pero dependerá de Tailwind en destino. El `README.md` de cada paquete se genera acorde a lo que realmente contiene, en lugar de prometer una portabilidad que no tenga.
>
> La versión de Tailwind va **fijada a la 3** en la invocación (`-p tailwindcss@3`). Sin fijarla, npx resuelve la 4, donde la CLI se movió al paquete `@tailwindcss/cli` y la llamada falla; además la 4 cambia la sintaxis de las directivas `@tailwind`. La 3 es la que usa el frontend, así que el CSS exportado coincide con lo que se ve en el lienzo.

**IA sobre el bloque seleccionado.** `POST /api/components/patch-block` devuelve un **parche JSON**, no código. Frente a `refine`, que devuelve código y congela el componente (el árbol deja de gobernarlo y se pierde la edición visual), el parche mantiene el bloque editable, entra en el historial de deshacer y no puede romper la compilación.

`PatchBlockUseCase` sanea todo lo que devuelve el modelo contra una lista blanca —claves `props` / `events` / `visibleIf`, eventos y acciones permitidos— y **rechaza variables de estado inventadas**, que dejarían el bloque apuntando a nada. Un parche malformado se descarta entero antes que aplicarse a medias.

### 9. Verificación del código generado

```bash
cd frontend && npm run verify:emitter
```
El build del frontend solo demuestra que compila *el builder*, no lo que el builder *genera*, que es lo que importa. Este guion emite 92 casos (los 85 tipos aislados, todos juntos, contenedores anidados, comportamiento completo, variable sin usar, variable solo escrita, texto con símbolos que romperían el JSX, lienzo vacío) y los compila replicando el entorno del harness KR1; además compila los paquetes contra los **tipos reales de React**.

Las dos redes son necesarias, y no redundantes: el stub del harness declara `IntrinsicElements` como `any`, así que no puede detectar errores de tipado de atributos. Compilar los paquetes contra `@types/react` sí — de hecho así apareció que los `aria-valuemin` / `aria-valuemax` se emitían como cadena cuando React los tipa como número.

### 10. Vocabulario de estilo: que el lienzo pinte lo que promete

```bash
cd frontend && npm run verify:styles
```

El CSS del editor se compila **en build-time**: Tailwind escanea `./src/**` y genera regla solo para las clases escritas ahí literalmente. Eso basta para la interfaz del editor, pero no para el **lienzo**, donde el `className` lo deciden en tiempo de ejecución la IA, el panel de propiedades o el usuario. Una clase que no estuviera ya en las fuentes no tenía regla y **el navegador la ignoraba sin decir nada**: el componente se veía descuadrado en el lienzo mientras que en Preview (Tailwind en runtime) y en el paquete exportado (CLI de Tailwind) salía perfecto. Es la misma enfermedad que el refactor a IR única vino a curar —el lienzo mintiendo sobre lo que exporta— por otra vía.

`src/builder/style-vocabulary.js` enumera el vocabulario una sola vez y de ahí salen tres proyecciones que antes habrían divergido:

| Proyección | Consumidor | Para qué |
|---|---|---|
| `SAFELIST` | `tailwind.config.js` | Que las reglas existan siempre, las use alguien hoy o no |
| `VOCABULARY_FOR_AI` | contexto del asistente (`styleVocabulary`) | Que el modelo se ciña a lo que el lienzo sabe pintar |
| `isKnownUtility` | validación | Poder detectar una clase muerta |

Es JavaScript y no TypeScript porque `tailwind.config.js` lo importa en tiempo de build de Node, donde no hay transpilación; los tipos van en el `.d.ts` hermano.

`verify:styles` genera el CSS con la configuración real y comprueba las tres procedencias posibles de un `className` —los `defaultProps` de los 85 bloques, cada opción del panel de propiedades y los roles del tema que el prompt promete— más el safelist entero. Esto último cubre un fallo silencioso propio de Tailwind: **una entrada del safelist que no sea una utilidad válida se descarta sin error**, así que enumerarla no basta para darla por cubierta. En su primera ejecución cazó que el bloque `article` nacía con `prose`, una clase del plugin `@tailwindcss/typography` que no está instalado.

Coste asumido: el CSS del editor pasa de 42 KB a 712 KB (80 KB con gzip). Es el precio de que el lienzo no mienta, y se paga una vez al cargar.

---

## Estado del sistema al cierre del Entregable 4

| Pieza | Estado |
|---|---|
| Backend Clean Architecture (4 capas + 3 proyectos de test xUnit) | ✅ |
| Endpoints `/api/components` — `generate`, `refine`, `patch-block`, `stylesheet` | ✅ |
| Generación multi-framework (React / Vue 2 / Vue 3 / Angular) con flag `verified` | ✅ |
| Librerías de componentes (dominio + 5 casos de uso + `LibrariesController`) | ✅ |
| Persistencia EF Core + PostgreSQL + EnsureCreated al arranque | ✅ |
| Harness TSX (`tsc --noEmit`) — KR1 del OKR | ✅ |
| JWT + sesiones participante + endpoints SUS/tasks/complete | ✅ |
| Frontend completo Welcome → (Task con sandbox real → SUS) × 10 → Done | ✅ |
| Constructor visual (UI Builder): paleta, canvas, código, preview, IA chat, plantillas | ✅ |
| Esquema único de bloques (IR) — lienzo y export derivan de la misma fuente | ✅ 85/85 tipos |
| Modelo de estado y acciones declarativas + visibilidad condicional | ✅ |
| Modo Diseño / Interactivo con estado real | ✅ |
| Exportación como paquete de carpeta (componente + props + estilos + índice) | ✅ |
| Hoja de estilos autocontenida al exportar (Tailwind → CSS) + compilación SASS | ✅ (requiere Node; degrada, ver §8) |
| Emisores multi-framework en el builder visual | ⏳ solo React; registro pluggable listo |
| Panel de propiedades con breakpoints, secciones de estilo, visibilidad y navegadores | ✅ |
| Editor de CSS/SASS propio por componente | ✅ |
| IA por bloque con parche JSON saneado (`/api/components/patch-block`) | ✅ |
| Vista de Librerías (crear, generar según tecnología, guardar / copiar / descargar) | ✅ |
| Cliente HTTP configurable vía `VITE_API_BASE_URL` | ✅ |
| Endpoint `/healthz` con check de PostgreSQL | ✅ |
| Dockerfiles producción (backend + frontend nginx) | ✅ |
| Bicep + workflow despliegue Azure (App Service + PG Flexible + Key Vault + App Insights) | ✅ |
| Pipeline análisis SUS (SQL view + R) | ✅ |
| Vocabulario de estilo compartido (safelist + contexto de la IA + validación) | ✅ 2384 clases base → 9172 entradas de safelist |
| Librería como catálogo (ver en vivo, editar, eliminar) con árbol persistido | ✅ |
| Exportación de la librería entera como paquete zip con tema compartido | ✅ |
| Dimensionado relativo al contenedor (%, fracciones) en los 85 tipos | ✅ |
| Posición libre opcional por bloque, conviviendo con el flujo | ✅ |
| El asistente pregunta cuando la petición admite resultados distintos | ✅ |
| Tests backend | ✅ 76/76 verdes (Domain 26, Application 30, Api 20) |
| Verificación del código emitido (`npm run verify:emitter`) | ✅ 93/93 componentes, 4/4 paquetes |
| Verificación de estilos del lienzo (`npm run verify:styles`) | ✅ 79 defaults, 574 opciones del panel, 41 roles, 9172 safelist |

## Cómo correrlo en local

```bash
# Sin Docker:
cd backend && dotnet run --project src/Visualiza.Api --urls http://localhost:5080 &
cd frontend && npm install && npm run dev

# Con docker-compose (requiere copiar .env.example a .env y rellenarlo):
cp .env.example .env
docker compose up

# Tests del backend:
cd backend && dotnet test

# Verificación del código que genera el builder:
cd frontend && npm run verify:emitter
```

### Configuración de secretos

`appsettings.json` **no versiona el secreto de firma JWT**: la clave `Jwt:Secret` se deja vacía a propósito. El resto de valores de esa sección (`Issuer`, `Audience`) y `Anthropic:Model` sí están, porque no son secretos y `JwtOptions` los necesita definidos.

El secreto llega por tres vías según el entorno:

| Entorno | Origen |
|---|---|
| `dotnet run` en local | `appsettings.Development.json` (secreto de desarrollo, versionado) |
| `docker compose up` | `Jwt__Secret`, con valor de desarrollo por defecto; se sobreescribe con `JWT_SECRET` en `.env` |
| Despliegue Azure | Key Vault, referenciado por la Web App vía Managed Identity |

`JwtTokenService` **aborta al construirse** si el secreto está vacío o mide menos de 32 caracteres, así que un fallo de configuración se manifiesta al arrancar y no como un 500 opaco a mitad de sesión. Para generar uno: `openssl rand -base64 48`.

## Cómo desplegar en Azure

```bash
az login
az group create -n visualiza-rg -l westeurope
gh workflow run deploy.yml -f resourceGroup=visualiza-rg
```

Antes hay que dar de alta en GitHub Secrets: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `POSTGRES_ADMIN_PASSWORD`, `JWT_SECRET`.

## Cómo reproducir el análisis estadístico

```bash
psql ... -f analysis/export_anonymized.sql
psql ... -c "\COPY (SELECT * FROM anonymized_export) TO 'analysis/visualiza_export.csv' CSV HEADER"
Rscript analysis/analyze_sus.R analysis/visualiza_export.csv
# Salidas: out/sus_distribution.png, out/descriptive.csv, out/primary_test.csv
```

## Estructura del proyecto

```
visualiza/
├─ backend/
│  ├─ src/
│  │  ├─ Visualiza.Domain/          Entidades + invariantes (Components, Experiment, Libraries)
│  │  ├─ Visualiza.Application/     Casos de uso + abstracciones
│  │  ├─ Visualiza.Infrastructure/  EF Core, Claude (Anthropic), JWT, harness TSX
│  │  └─ Visualiza.Api/             Program.cs, controllers, /healthz
│  ├─ tests/                        xUnit por capa (58 pruebas)
│  ├─ Dockerfile                    multi-stage sdk:8.0 → aspnet:8.0
│  └─ Visualiza.sln
├─ frontend/
│  ├─ src/
│  │  ├─ api/                       Cliente HTTP centralizado (VITE_API_BASE_URL)
│  │  ├─ builder/                   UI Builder
│  │  │                             · núcleo: ui-node (IR), schema (85 bloques), actions
│  │  │                             · emisión: emit-react, emitters, emit-package
│  │  │                             · lienzo: BuilderView, BlockPalette, BuilderCanvas,
│  │  │                               BlockRenderer, render-node
│  │  │                             · paneles: PropertiesPanel, ActionsPanel, panel-ui,
│  │  │                               CodeView, AiChatPanel
│  │  │                             · soporte: useBuilderStore, defaults, types,
│  │  │                               style-utils, templates
│  │  ├─ components/                ComponentSandbox (preview iframe)
│  │  ├─ experiment/                Welcome, Task, SUS, Done, corpus
│  │  ├─ libraries/                 LibrariesView (librerías multi-framework)
│  │  ├─ App.tsx                    Switch Constructor / Librerías / Experimento
│  │  └─ ExperimentView.tsx         Orquestador del flujo experimental
│  ├─ scripts/                      verify-emitter (verificación del código generado)
│  ├─ Dockerfile                    multi-stage node:20 → nginx:1.27
│  └─ nginx.conf
├─ infra/main.bicep                 App Service + PG Flexible + Key Vault + App Insights
├─ analysis/                        SQL view + R + README
├─ .github/workflows/               ci.yml + deploy.yml
├─ docker-compose.yml
├─ .env.example
└─ README.md (este fichero)
```

Tag final del repositorio: `tfb-final`.
