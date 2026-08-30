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
- `schema.ts` — **fuente única de verdad**: `buildNode(block, ctx)` traduce cada uno de los 98 tipos a un árbol `UiNode`. De aquí beben tanto el lienzo como los emisores, así que no pueden divergir. No contiene afordances de edición: produce markup limpio, listo para exportar.
- `actions.ts` — modelo declarativo de estado y comportamiento: `StateVar`, `BlockAction` (`toggle` / `set` / `increment` / `reset`), `BlockEvent` y `VisibilityRule`. Contiene **generador de código e intérprete gemelos** en el mismo fichero, a propósito: al añadir una acción salta a la vista que hay que cubrir ambos caminos.

**Emisión.**
- `emit-react.ts` — emisor a la forma `export function App()` sin imports y con hooks globales, que es la que exigen el sandbox y el harness KR1. Solo declara las variables de estado realmente referenciadas (con `noUnusedLocals` activo, declarar de más rompería la compilación).
- `emitters.ts` — registro pluggable de emisores y helper `currentCode(state)`. Añadir un framework consiste en implementar `CodeEmitter` sobre la misma IR y registrarlo aquí, sin tocar el esquema ni el lienzo; `emit-vue.ts` es la prueba de que era cierto (ver §6quinquies).
- `emit-vue.ts` — emisor de Vue 3 como SFC con `<script setup>`, desde el mismo `buildNode`.
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
- `defaults.ts` — definiciones de los 98 tipos de bloque (props por defecto, icono, categoría, tab, flag de contenedor).
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

**La librería de ejemplo se elige, no se impone.** «Atenea» —el kit de 7 componentes que ejercita validación, estado, eventos, adaptabilidad y la cascada de estilos— solo se podía sembrar desde la terminal (`node scripts/seed-library.mjs`), así que en la práctica no existía para quien usa la aplicación. Ahora la pantalla inicial tiene un **punto de partida** al crear el proyecto: marcado, nace con el kit; sin marcar, nace vacío y los componentes se hacen a mano o con IA. Por defecto va **desmarcado**: quien crea un proyecto suele querer el suyo, y encontrarse siete componentes ajenos dentro obliga a borrarlos uno a uno.

> **El kit arrastra su tema.** No es solo «méteme unos componentes»: los bloques de la semilla se estilan por ROL (`bg-[var(--vz-primario)]`), así que con el tema por defecto se verían con colores que no son los suyos. Kit y tema van juntos, y en un proyecto de tipo «Librería» el tema y la hoja global viajan además a la librería del servidor —si se quedaran en el navegador, el catálogo pintaría los mismos componentes con los colores por defecto—. Los componentes se publican con el **emisor de la aplicación**, no con un TSX guardado aparte, por el mismo motivo que el script de siembra: así el ejemplo no puede describir algo distinto de lo que produciría el constructor. Y los árboles se **copian** al proyecto: son constantes de módulo y el constructor edita en sitio, de modo que sin la copia diseñar sobre un proyecto de ejemplo mutaría la plantilla del siguiente.

**Un tema es un par, no un color suelto.** Cambiar Atenea a «Nocturno» dejaba media librería ilegible: los títulos desaparecían. `themeCss` aplicaba `color: var(--vz-texto)` pero **nunca un fondo**, así que el texto casi blanco de un tema oscuro caía sobre el blanco por defecto del navegador. El texto y el fondo se eligen juntos para que contrasten, y aplicar solo uno rompe esa garantía. Ahora se pintan los dos —`pintaSuperficie`— pero **solo en las previsualizaciones**, cuyo `body` es la superficie del componente y de nadie más. El paquete exportado sigue sin fondo a propósito: allí lo pone la web anfitriona, y el tema se elige para encajar con ella.

**Borrado.** Se puede eliminar la librería completa desde su ficha, y al borrar un proyecto que publicaba en una se pregunta explícitamente qué hacer con ella: son cosas distintas y en sitios distintos —el proyecto vive en este navegador, la librería en el servidor— así que ni cascada silenciosa ni librería huérfana. Al eliminarla, los proyectos que la referenciaban se desenlazan (`unlinkBackendLibrary`) para que el siguiente guardado cree una limpia en lugar de fallar contra un id borrado.

> **Trampa de EF Core encontrada aquí.** No hay navegación entre `ComponentLibraryRecord` y `SavedComponentRecord` —la clave ajena solo existe en la base de datos—, así que EF no conoce la dependencia y puede emitir el `DELETE` de la librería antes que el de sus componentes. PostgreSQL cascadea, y el borrado de cada componente afecta entonces a 0 filas: `DbUpdateConcurrencyException` y 500. Se resuelve con dos `SaveChanges` en orden explícito. **Los tests con InMemory no podían verlo** (ahí ni cascadea ni importa el orden): salió al ejercitar la interfaz contra el PostgreSQL real.

### 6ter. Tamaño relativo, posición libre y un asistente que pregunta

**El `className` no llegaba al mismo elemento en todos los tipos.** Un `input` con etiqueta se envuelve en un `div`, así que un `w-full` estiraba el control pero no el bloque, y un `absolute` lo habría posicionado dentro de su propio envoltorio. Las utilidades que describen al bloque **dentro de su hueco** —tamaño, posición, margen, comportamiento como hijo de un flex o grid— se separan ahora del resto y se izan al elemento más externo en `buildNode`, el único punto de entrada del esquema: queda garantizado para los 98 tipos sin tocar ninguno.

**Redimensionar da proporción del contenedor**, no píxeles (Alt invierte), con ajuste a fracciones: sale `w-1/2`, no `w-[49.7%]` — se lee mejor en el código y no depende del monitor donde se diseñó. La altura sigue en píxeles porque un porcentaje de alto solo surte efecto si el padre tiene altura definida. `arbitraryStyle` en `render-node` resuelve ahora **cualquier unidad**, no solo `px`: los valores arbitrarios no se pueden enumerar en el safelist, así que sin eso un `w-[50%]` no se vería en el lienzo.

**Posición libre por bloque** (`SET_FREE_POSITION`): el flujo sigue siendo el comportamiento por defecto y cualquier bloque puede liberarse para colocarse en un punto exacto de su contenedor. La acción toca dos bloques a propósito —el liberado recibe `absolute`, su contenedor `relative`—, porque si no la posición se resolvería contra un ancestro arbitrario y diferiría entre lienzo y código exportado.

> **Trampa encontrada al probarlo en navegador.** Con `absolute` en el envoltorio de edición **y** en el elemento interior, el envoltorio se quedaba sin hijos en flujo, colapsaba a tamaño cero y dejaba de recibir el puntero: el bloque no se podía ni seleccionar. En el lienzo posiciona el envoltorio; en el código exportado, donde no hay envoltorio, la clase va al elemento. `verify:emitter` gana un caso que **afirma en qué elemento cae cada clase** — la compilación valida que el código es correcto, no que las utilidades hayan caído donde debían.

**El asistente pregunta** cuando la petición admite resultados claramente distintos, antes de empezar y también sobre un componente ya montado; las opciones llegan como chips pulsables. El criterio va en el prompt como una prueba explícita («¿podrías construir dos componentes distintos que la cumplan igual de bien?»), porque un asistente que pregunta por todo devuelve al usuario el trabajo que debía ahorrarle.

> **Dos fallos silenciosos que esto destapó.** `MaxTokens` cubre razonamiento *y* respuesta: una petición ambigua agotaba el presupuesto razonando y devolvía texto vacío, que aguas abajo se comunicaba como un «Hecho.» falso. Y si el modelo respondía en prosa sin JSON, la extracción devolvía `{}` y se perdía la respuesta entera. Corregidos ampliando el presupuesto, trazando el motivo de terminación cuando no hay texto, y aceptando la prosa como respuesta conversacional (sin árbol, no puede tocar el lienzo).

### 6quater. Validaciones, eventos ampliados y diseño a partir de una imagen

**Validación declarativa de campos.** `actions.ts` gana un segundo modelo cerrado, hermano del de acciones y con la misma estructura de **generador de código e intérprete gemelos**: `ValidationRule` (`required`, `minLength`, `maxLength`, `pattern`, `email`, `min`, `max`) con mensaje propio o por defecto en español. Los cinco bloques de campo (`input`, `textarea`, `select`, `checkbox`, `date-picker`) la aceptan.

Un campo con reglas se vuelve controlado, se valida **al salir de él** —el primer momento honesto para avisar, en vez de mientras se escribe— y el mensaje desaparece en cuanto se corrige. Un formulario que contenga campos validados intercepta su propio envío aunque el usuario no haya declarado acciones: sin manejador el navegador recargaría la página y los mensajes no llegarían a verse. Solo si todo valida se ejecutan las acciones de `submit`.

> **Por qué los campos no eran controlados antes.** El esquema emitía markup inerte, así que validar exigía primero saber el valor. El enlace (`bindTo` con tipo compatible) y las reglas son las dos únicas cosas que lo activan: sin ninguna de las dos, el bloque se emite exactamente igual que siempre.

**Eventos nuevos:** `blur`, `focus`, `mouseenter`, `mouseleave` y `dblclick`, además de los tres de siempre. Los de ratón cuelgan del **bloque entero** y el resto de su control interior: «al pasar el ratón» sobre una tarjeta se refiere a la tarjeta, no al primer botón que haya dentro. Cuando el elemento ya trae un manejador propio (el enlace de un campo, el envío validado), las acciones del usuario se **componen** detrás en lugar de pisarlo — de ahí que `Attr` de tipo `event` conserve las sentencias con que se construyó.

**El botón sabe si envía** (`buttonType`): `submit` solo cuando se pide. Un botón que enviara por defecto dispararía el formulario entero al pulsarlo.

**Diseño a partir de una imagen.** El asistente acepta capturas y bocetos (adjuntar, pegar o arrastrar; PNG/JPEG/WEBP/GIF hasta 5 MB) y los interpreta con un flujo guiado de un paso por turno: **inventario** (cuántos componentes hay y cuáles, para confirmar), **destino** (librería existente por su nombre real, librería nueva o ninguna), **estilos** (los consolidados del tema o los de la imagen), **alcance funcional** (solo estructura, con estado y eventos, o con validaciones) y **construcción**.

Lo construido llega en `components`, una tanda con un árbol por componente, y **crea un componente del proyecto por elemento** en lugar de sustituir el lienzo: el lienzo edita uno, y volcar ahí varios los fundiría en uno solo. Cada árbol se valida por separado contra la paleta, así que un elemento mal formado no tira la tanda.

**El destino se ejecuta, no solo se pregunta.** La respuesta trae además un `target` estructurado (`existing` con su `libraryId`, `new` con el nombre, o `none`) y el cliente actúa: crea la librería en el backend, publica cada componente con su TSX **y su árbol** —sin el árbol entrarían al catálogo como «solo código»— y enlaza el proyecto para que los guardados siguientes vayan a la misma. La publicación va aparte de la creación local a propósito: si el backend falla, los componentes ya están a salvo en el proyecto y el chat dice qué pasó de verdad en lugar de dar por hecho lo que se pidió.

> **Dos fallos que solo aparecieron probándolo de punta a punta contra la API real.** El primero: se preguntaba el destino y **la respuesta no se aplicaba nunca** —solo se creaban componentes locales—, así que la pregunta era un trámite sin efecto. El segundo, más sutil: pedidos «estado, eventos y validaciones», el modelo entregaba las validaciones pero devolvía los otros componentes **inertes** mientras el texto afirmaba que llevaban comportamiento («el botón marca el producto como añadido»). Un componente que miente sobre lo que hace es peor que uno que se queda corto, porque nadie lo comprueba. El prompt exige ahora materializar el alcance elegido y que `reply` solo afirme lo que el árbol contiene.

> **Lo que hizo falta para que el flujo guiado existiera.** El asistente era **sin memoria**: cada petición viajaba sola. Preguntar y luego construir con la respuesta es imposible así —volvería a preguntar en bucle—, de modo que la petición lleva ahora el historial de la conversación. El contexto de la plataforma sigue yendo en el último mensaje y no en el sistema: el árbol de bloques de hace tres preguntas ya no es el actual.

### 6quinquies. Segundo emisor: Vue 3

El registro de emisores prometía ser pluggable; `emit-vue.ts` lo demuestra. **El esquema de los 98 bloques, el lienzo y el modelo de acciones no se tocaron**: el SFC sale del mismo `buildNode`, así que lo que se ve en el lienzo y lo que se exporta como Vue son la misma cosa por construcción.

La IR es agnóstica en *estructura* pero no en el *código* que transporta, que se escribió para React. La traducción se reduce a tres reglas:

| De React | A Vue | Por qué no es un `replace` |
|---|---|---|
| `setX(v)` / `setX((n) => n + 1)` | `x = v` / `x = x + 1` | Los nombres de setter salen de las variables de estado, así que el conjunto es cerrado y no hay que adivinarlos |
| Los `ref` desnudos | `.value` **solo dentro del script** | En la plantilla se desenvuelven solos: la misma expresión necesita las dos formas según dónde acabe |
| `className`, `onClick`, `strokeWidth` | `class`, `@click`, `stroke-width` | Tabla de nombres, más `@input` en vez de `@change` en campos de texto (Vue lo dispara al salir del campo, React al teclear) |

La sustitución la hace un recorrido que **distingue código de cadenas**, no una expresión regular: los `className` calculados son literales de plantilla, y un reemplazo ciego también tocaría el texto entrecomillado. Los manejadores con declaraciones locales —el envío de un formulario validado— salen a `<script setup>` como funciones con nombre; el resto se quedan en la plantilla, que es lo idiomático. `e.preventDefault()` desaparece y se convierte en el modificador `.prevent`.

**Dónde no llega, y por qué la interfaz lo dice.** El harness KR1 y el sandbox solo saben de React, así que el emisor se declara `verifiable: false` y con Vue seleccionado: la vista previa explica que el sandbox monta React, el paquete de carpeta explica que solo se emite para React+TS, la descarga cambia a `.vue`, y publicar en una librería del backend queda deshabilitado. Enseñar TSX diciendo que es Vue sería exactamente la clase de mentira que el esquema único vino a eliminar.

> **Cómo se verifica lo que no compila `tsc`.** `verify:emitter` reemite los 96 casos como SFC y los pasa por el **compilador de Vue** (`@vue/compiler-sfc`), que valida la plantilla y las expresiones de cada atributo — justo donde vive la traducción. Compilar demuestra que el SFC es válido, no que signifique lo mismo que su gemelo React, así que 15 afirmaciones cubren aparte lo semántico: que no quede ningún `className` ni ningún `setX(`, que la visibilidad sea `v-if`, que el envío validado sea una función con `.prevent`, que dentro del script los `ref` lleven `.value`.

### 6sexies. Acceso al constructor (RF11)

Los endpoints del diseñador —`/api/components/*` y `/api/libraries/*`— estaban **abiertos**. No era solo un requisito sin cumplir: cada llamada a generación consume cuota de la API de Claude, y el controlador de librerías es escribible entero, así que cualquiera podía gastar el presupuesto del proyecto o vaciar el catálogo del estudio.

**Código de acceso compartido → JWT con rol.** No hay registro ni almacén de usuarios: el estudio no lo necesita y ASP.NET Core Identity traería un modelo de usuarios entero para un sistema cuyos participantes son anónimos por diseño. `POST /api/access/designer` canjea el código por un token con el rol `designer`, firmado con la misma clave que los de sesión —un solo secreto que gestionar— y los dos controladores exigen la política `Designer`.

**El rol es lo que los separa.** Un token de participante tiene firma válida, así que sin comprobar el rol serviría para generar componentes; y el del diseñador no puede escribir en la sesión de nadie porque no lleva el claim `sid`. Hay test para ambas direcciones: anónimo → 401, participante → 403.

| Entorno | Origen del código |
|---|---|
| `dotnet run` en local | `appsettings.Development.json` (`visualiza-dev`, versionado) |
| `docker compose up` | `Designer__AccessCode`, con valor de desarrollo por defecto; se sobreescribe con `DESIGNER_ACCESS_CODE` en `.env` |
| Despliegue Azure | `DESIGNER_ACCESS_CODE` |

> **Un código vacío cierra el constructor, no lo abre.** La tentación es dejar los endpoints abiertos cuando falta la configuración, para que nada se rompa; eso convertiría un despiste en un endpoint público que además gasta la cuota de la IA. Se rechaza el canje y se traza el motivo en el servidor, que es donde se arregla. La comparación del código es en **tiempo constante**: un `==` corriente sale en el primer carácter distinto, y esa diferencia medible permite adivinarlo carácter a carácter.

**En el frontend** se guarda el token, no el código: el secreto compartido no se queda indefinidamente en el navegador, y lo que sí se queda caduca solo. El cliente HTTP lo adjunta únicamente a las rutas del diseñador —los endpoints del experimento llevan el suyo, y mandar dos credenciales solo puede acabar en que gane la equivocada— y ante un 401 o 403 lo descarta para que la interfaz vuelva a pedir el código en vez de reintentar con uno muerto. **El experimento queda fuera de la puerta**: los participantes se identifican con su código de sesión y pedirles nada más rompería el protocolo.

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

### 8quater. Renombrar un componente no se podía guardar

Encontrado al montar una librería de cinco componentes con la plataforma: los cinco acabaron llamándose «Componente 1…5» y no había forma de arreglarlo desde el editor.

El campo *Nombre* de la pestaña Paquete escribía `state.componentName`, pero ese nombre **no entraba en la huella que decide si hay cambios pendientes** —`treeJson`, que solo miraba bloques, variables y estilos—. Renombrar no ensuciaba el componente, el botón Guardar seguía **deshabilitado** y el nombre no llegaba a persistirse nunca. El síntoma engañaba: el fichero del paquete pasaba a llamarse `TablaDeUsuarios.tsx` delante de ti, así que parecía que el cambio había surtido efecto.

No es que renombrar fallara: es que **la única acción capaz de persistirlo estaba apagada**. El nombre entra ahora en la huella —y en la instantánea que se toma al cargar, para que un componente no nazca marcado como modificado— y viaja a `saveComponentTree` y a `saveComponent`, de modo que el catálogo del servidor se renombra en el mismo guardado.

### 8ter. Catálogo ampliado a 98 bloques y buscador en la paleta

Comparado con los catálogos de referencia de React (MUI, shadcn/ui), faltaban piezas que se usan a diario. Se añaden **13 bloques**: `combobox`, `number-input`, `toggle-group`, `color-picker`, `range`, `time-picker`, `chip`, `carousel`, `tree`, `data-grid`, `command` y las dos gráficas (`chart-bar`, `chart-line`). El catálogo pasa de 85 a **98**, y el harness de 108 a **121 casos**, todos compilando en React y en Vue.

La señal más clara de que faltaba algo la daba el propio kit de ejemplo: `SelectorDeCantidad` construía **a mano** un selector numérico con dos `icon-button` y una variable de estado, que es exactamente lo que ahora hace `number-input` con acotado a mínimo y máximo incluido.

**Las gráficas van en SVG escrito a mano, sin dependencias.** No es una preferencia estética: el componente se emite como `export function App()` **sin imports** y el paquete promete ser autocontenido, así que una librería de gráficas está descartada por construcción. Dibujarlas con `<svg>` cabe en la IR —son elementos como cualquier otro— y por eso viajan a React y a Vue por el mismo camino que el resto, sin tocar los emisores.

**Buscador en la paleta.** Con 98 bloques, encontrar uno recorriendo siete categorías dejó de ser viable. El campo filtra por nombre y por tipo, ignora acentos y mayúsculas (`numero` encuentra «Número») y **busca en las dos pestañas a la vez**: el problema que resuelve es «sé lo que quiero pero no dónde está», y eso incluye no saber si vive en UI o en HTML — filtrar solo la pestaña activa dejaría `input` sin resultados desde UI, que es justo cuando se busca.

> **Lo que la `data-grid` no hace, y por qué.** Pagina de verdad, pero **no ordena por columna**. La IR pliega sus listas a `.map()` sobre datos **constantes**, así que un `.slice()` o un `.sort()` que dependan del estado no se pueden expresar hoy: paginar sí sale con un condicional por fila —misma condición en el lienzo y en el componente exportado—, pero reordenar exigiría un nodo de lista *calculada en tiempo de ejecución*, que es una ampliación de la IR y no un bloque más. Se deja fuera antes que emitir una cabecera clicable que no ordene: un control que miente es peor que un control que falta.

### 8bis. El código generado se lee, no solo se ejecuta

Compilar es el suelo, no el techo: lo que el usuario se lleva es código que otra persona va a leer y mantener. Se auditó lo que producen los **dos** generadores —el emisor determinista y la IA— midiendo sobre el kit de ejemplo, y salieron **23 listas de clases duplicadas en 7 componentes** (13 solo en `PanelDeIndicadores`, con sus cuatro tarjetas idénticas).

**Las clases repetidas se izan a constantes con nombre (DRY).** `hoistRepeatedClasses` recorre el cuerpo ya emitido y saca a `const CLASES_BOTON = "…"` toda lista de clases larga que aparezca dos o más veces, nombrándola por la etiqueta que la lleva. Es un paso de texto sobre el cuerpo, y no una fase del recorrido del árbol, por dos razones: no toca la traducción de los 98 bloques —donde un error se paga caro— y beneficia por igual al componente y al paquete, que comparten ese cuerpo. Solo se izan cadenas literales: un `className` con interpolación depende del estado y darle un nombre único sería mentir sobre lo que hace. Resultado medido: **23 duplicados → 0**, con 10 constantes, y los 121 casos del harness siguen compilando.

**Una sola clase por grupo excluyente.** Un bloque concatenaba sus clases base con las del usuario sin resolver los choques, así que el atributo salía con las dos (`text-sm text-xs`) y quién ganaba no lo decidía el atributo sino el **orden de la hoja de Tailwind**, que a igual especificidad aplica la última regla emitida. `cx` resuelve ahora cada grupo excluyente quedándose con la última clase escrita, que es la que se ha pedido a propósito.

> **Medido antes de tocarlo, y el resultado cambió la justificación.** La sospecha era que `text-xs` sobre un bloque `text-sm` no surtía efecto. Comprobado en el navegador: `text-sm text-xs` ya renderizaba a 12 px, igual que `text-xs` solo. El resultado visual era el correcto **por casualidad**, no por diseño. Comparando los 7 componentes del kit, cambian **5 atributos de 83**, y cuatro son duplicados exactos (`text-sm text-sm`, `py-8 py-8`, `w-full … w-full`): **cero cambio visual en todo el kit**. Lo que se gana no es un arreglo, es determinismo — una versión distinta de Tailwind, otro `@layer` o un safelist reordenado invertirían hoy el resultado sin tocar una línea del proyecto, y el fallo saldría en el componente exportado sin nada que lo explique.

**Una sola clase por grupo excluyente.** Un bloque concatenaba sus clases base con las del usuario sin resolver los choques, así que el atributo salía con las dos (`text-sm text-xs`) y quién ganaba no lo decidía el atributo sino el **orden de la hoja de Tailwind**, que a igual especificidad aplica la última regla emitida. `cx` resuelve ahora cada grupo excluyente quedándose con la última clase escrita, que es la que se ha pedido a propósito.

> **Medido antes de tocarlo, y el resultado cambió la justificación.** La sospecha era que `text-xs` sobre un bloque `text-sm` no surtía efecto. Comprobado en el navegador: `text-sm text-xs` ya renderizaba a 12 px, igual que `text-xs` solo. El resultado visual era el correcto **por casualidad**, no por diseño. Comparando los 7 componentes del kit cambian **5 atributos de 83**, y cuatro son duplicados exactos (`text-sm text-sm`, `py-8 py-8`, `w-full … w-full`): **cero cambio visual en todo el kit**. Lo que se gana no es un arreglo, es determinismo — otra versión de Tailwind, otro `@layer` o un safelist reordenado invertirían hoy el resultado sin tocar una línea del proyecto, y el fallo saldría en el componente exportado sin nada que lo explique.

**Un paso negativo se emite restando.** `v + -1` es correcto y compila, pero nadie lo escribe a mano y en el código exportado canta; ahora sale `v - 1`.

**El prompt de la IA tenía la mitad del criterio.** La generación de *árbol* (`assist`) ya exigía DRY y KISS, pero las de *código* (`generate` y `refine`) solo hablaban de interactividad, estilo y adaptabilidad: nada de calidad. Se añadió una sección explícita —clases repetidas a constante, elementos que solo difieren en datos a `.map()`, lógica a funciones puras con nombre, sin números mágicos, sin código muerto, nombres en español que expliquen la intención—. En `refine` importa más todavía: es donde el código se degrada, porque cada instrucción invita a añadir un bloque nuevo junto a los anteriores en vez de generalizar el que ya está.

> **Encontrado auditando el código emitido.** `SelectorDeCantidad` —el componente del kit que demuestra el estado numérico— **no enseñaba el número**. `bindTo` solo estaba contemplado en los tipos de campo, así que en un `span` se ignoraba en silencio: la propiedad existía en el panel y no hacía nada. El delator estaba en el propio código emitido, `const [, setCantidad]`, una variable que se escribe y nunca se lee. Los bloques de texto (`span`, `p`, `h1`–`h6`) admiten ahora enlace **de lectura**: enseñan el valor de cualquier variable convertido con `String()`, que es como se muestra el total de un carrito o el número de un selector.

### 9. Verificación del código generado

```bash
cd frontend && npm run verify:emitter
```
El build del frontend solo demuestra que compila *el builder*, no lo que el builder *genera*, que es lo que importa. Este guion emite 121 casos (los 98 tipos aislados, todos juntos, contenedores anidados, comportamiento completo, variable sin usar, variable solo escrita, texto con símbolos que romperían el JSX, lienzo vacío) y los compila replicando el entorno del harness KR1; además compila los paquetes contra los **tipos reales de React**.

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

`verify:styles` genera el CSS con la configuración real y comprueba las tres procedencias posibles de un `className` —los `defaultProps` de los 98 bloques, cada opción del panel de propiedades y los roles del tema que el prompt promete— más el safelist entero. Esto último cubre un fallo silencioso propio de Tailwind: **una entrada del safelist que no sea una utilidad válida se descarta sin error**, así que enumerarla no basta para darla por cubierta. En su primera ejecución cazó que el bloque `article` nacía con `prose`, una clase del plugin `@tailwindcss/typography` que no está instalado.

Coste asumido: el CSS del editor pasa de 42 KB a 712 KB (80 KB con gzip). Es el precio de que el lienzo no mienta, y se paga una vez al cargar.

### 11. Colocación: que el bloque caiga donde se ve

El lienzo dibuja cada bloque dentro de un **envoltorio de edición** que aporta la selección, la barra flotante y las asas. Ese envoltorio no existe en el código exportado, así que todo lo que dependa de él es una fuente de divergencia. Aquí se cerraron cuatro:

**Colocación completa, no solo la que escribe el arrastre.** El envoltorio se posicionaba con `absolute` a secas y unos `left`/`top` reconstruidos leyendo únicamente `left-[Npx]` y `top-[Npx]` —justo las dos clases que escribe el gesto de arrastrar—. Cualquier otro vocabulario (`top-4 right-4` de la IA, `inset-x-0`, un porcentaje) se perdía y el bloque se dibujaba en la esquina superior izquierda. Ahora `splitPositionClasses` reparte: el envoltorio recibe la colocación tal cual y el elemento se queda con `relative`, para seguir siendo el marco de referencia de sus propios hijos.

**Un solo marco de referencia.** Un elemento absoluto se mide contra el ancestro posicionado más cercano; si ninguno lo está, escapa hasta la raíz. En el lienzo eso no se notaba —el envoltorio del contenedor está posicionado siempre, y hacía de marco por accidente—, pero el componente exportado sí se iba a otro sitio. `normalizePositionFrames` aplica la regla «un bloque libre se coloca respecto a su contenedor» sobre el árbol entero, y no solo cuando se saca un bloque del flujo con el ratón: también al cargar un componente guardado y al aceptar un árbol de la IA.

**El modo Interactivo enseña el componente de verdad.** Antes se le quitaba la colocación al bloque y, sin envoltorio que la llevase, el bloque volvía al flujo: el modo que promete enseñar «cómo se comporta en producción» era precisamente el que lo enseñaba mal.

**Los hijos cuelgan del contenedor.** La zona de soltar era un `div` real interpuesto entre el contenedor y sus hijos, y se comía la disposición: poner un contenedor en fila centrada no hacía nada visible, porque su único hijo pasaba a ser esa caja. Un contenedor con hijos ya no envuelve nada —el destino de soltado se registra sobre su propio envoltorio, que ocupa la misma superficie— así que `flex`, `grid`, `gap` o `space-y` llegan a los bloques igual que al exportar. El contenedor vacío sí conserva su caja, porque sin ella sería un destino invisible de altura cero.

**El bloque llena su envoltorio cuando el contenedor lo estira.** `align-items: stretch` es el valor por defecto de una caja flexible, así que dos tarjetas en fila salen a la misma altura. Pero en el lienzo el ítem que se estira no es el bloque, sino su envoltorio: el bloque se quedaba a su altura de contenido y las tarjetas se veían desiguales al editar e iguales al usarlas (58 px contra 130 px, medido). Cuando el contenedor coloca a sus hijos con caja flexible o rejilla —`laysOutChildren`, que mira también los tipos que lo hacen por serlo, como `navbar` o `grid`— el envoltorio pasa a ser rejilla y el bloque lo llena.

**El tamaño viaja con la posición.** Un porcentaje se mide contra la caja que te contiene, y fuera del flujo esa caja es el envoltorio de edición —que se encoge a su contenido—. Dejando el `w-[30%]` en el elemento, un bloque redimensionado al 30 % de su contenedor medía **3 px en el lienzo y 176 al exportar**, que es el resultado por defecto de arrastrar el asa de ancho. Cuando el bloque está fuera del flujo, las utilidades de tamaño acompañan a la posición hasta el envoltorio y el elemento lo llena. En el flujo no aplica: allí el envoltorio no se interpone como caja de referencia.

**El bloque libre va delante, no detrás.** Encontrado probando a mano en Chrome: se libera un bloque, se arrastra sobre otro creado después y **desaparece**. En el lienzo todos los envoltorios están posicionados —`relative`, para alojar las afordances de edición—, y entre hermanos posicionados sin `z-index` manda el orden del árbol, así que el bloque liberado quedaba tapado por cada bloque posterior. El componente exportado no lleva envoltorios: sus hermanos son estáticos y allí el `absolute` sí se pinta delante. Era otra vez el lienzo mintiendo, y de la peor manera —el bloque no se veía mal, no se veía—. El envoltorio que lleva la colocación recibe ahora un `z-10` **del editor, que no viaja al código**; si el bloque declara su propio `z-`, se respeta: apilar a mano es una decisión del diseño y gana sobre una compensación que solo existe para tapar un artefacto del editor.

**Liberar un bloque no deja el contenedor inservible.** Si al sacarlo del flujo el contenedor se queda sin ningún hijo en flujo, su altura deja de depender de nada: colapsa al relleno y los bloques que aloja se salen por abajo. El componente exportado hace exactamente lo mismo —comprobado—, así que disimularlo en el lienzo habría sido volver a mentir; lo que se hace es escribir un `min-h-[Npx]` **real**, con la altura que el contenedor tenía, medida al despachar la acción porque depende del contenido y no está en ninguna prop.

Sobre esa base, tres herramientas de colocación:

| Herramienta | Qué hace |
|---|---|
| **Guías e imantado** (`align-guides.tsx`) | Al mover un bloque libre, se imanta a los bordes y centros del contenedor y de los hermanos, y dibuja la línea que explica el salto. Corrige la posición que se **escribe**, no solo la que se pinta. `Alt` lo desactiva. |
| **Alinear y repartir** (`align.ts`) | Seis destinos respecto al contenedor, más reparto de huecos iguales entre hermanos libres sin mover los extremos. Un bloque libre se ancla con posición; uno en el flujo, con márgenes automáticos. |
| **Disposición del contenedor** (`container-layout.ts`) | Rejilla de 3×3 —«dónde quiero el grupo de hijos»— más dirección, repartir y separación. Traduce a `justify-*` / `items-*` según el eje, que es la regla que obliga a entender flexbox. |

Dos detalles que solo se ven al usarlos: los márgenes automáticos no mueven a un elemento **de línea**, y buena parte de los 98 tipos lo son (botón, badge, enlace, span), así que alinear en el flujo les da además nivel de bloque y ancho de contenido; y centrar se escribe como `left-1/2` + `-translate-x-1/2` en lugar de en píxeles, para que siga centrado cuando el contenedor cambie de ancho.

`verify:styles` cubre ahora también lo que escriben estos menús, generándolo con las mismas funciones que usa la interfaz: una lista paralela se habría quedado desfasada a la primera.

### 12. Adaptable a cualquier pantalla, sin configurar nada

Un componente creado sin tocar ajustes tiene que servir igual en un móvil que en un escritorio. Tres reglas, todas en el esquema —fuente única— para que el lienzo y el código exportado digan lo mismo:

| Regla | Antes | Ahora |
|---|---|---|
| Rejilla | `grid-cols-3` fijas: tres tarjetas de ~120 px en un móvil | `grid-cols-1 sm:grid-cols-2 md:grid-cols-3`, mobile-first |
| Fila | los hijos se comprimían hasta ser ilegibles | `flex-wrap`: bajan a la línea siguiente |
| Ancho fijo | `w-[560px]` se salía de la pantalla y aparecía scroll horizontal | se acompaña de `max-w-full`: conserva la medida donde cabe y se encoge donde no |

Lo del ancho se aplica en `buildNode`, el único punto de entrada del esquema, así que vale venga el número del ratón, del panel o de la IA.

Se verifica midiendo a tres anchos reales (375 / 768 / 1280) que nada se sale por el lado, que la rejilla se pliega a una columna en móvil y la mantiene en escritorio, y que la tarjeta de ancho fijo se encoge en móvil y conserva sus 560 px en escritorio.

### 13. La vista previa tiene que pintar algo

Fallaba de la peor manera posible: el componente **montaba** dentro del iframe —React y Babel cargados, el DOM correcto, ni un error en consola— pero el documento se quedaba **sin layout**: su `<html>` medía 0×0 y no se veía nada.

**El sandbox del experimento medía 150 px.** Encontrado recorriendo el flujo del participante en Chrome: el componente a evaluar se veía por una rendija y había que hacer scroll dentro de ella. `ComponentSandbox` se dibuja con `h-full`, y sus tres usos normales —las fichas del catálogo, la previsualización por dispositivo— lo alojan en una caja con altura propia. `TaskView` lo soltaba en una columna de altura automática, donde `height: 100%` no resuelve contra nada y el navegador aplica los **150 px por defecto de un elemento reemplazado**. No es solo estética: el participante puntuaba con el SUS un componente que no veía entero, así que la ventana entraba como variable extraña en la medida. El sandbox informa ahora de su altura por `postMessage` —no se puede leer `contentDocument`, el iframe es de origen opaco a propósito— y el anfitrión lo hace crecer. Se activa con `autoAlto`, solo donde hace falta: sin la opción el HTML generado sigue siendo byte a byte el de antes.

La causa es que `srcdoc` se escribía **dos veces seguidas con el mismo valor**. Reproducido fuera de la aplicación con un iframe pelado: una asignación funciona, dos en el mismo tick dejan el documento sin layout, y separadas en el tiempo tampoco fallan. El efecto lleva ahora un guardián que solo toca el iframe cuando el HTML cambia de verdad.

De paso se le da al iframe un **almacenamiento de mentira**. El sandbox es `allow-scripts` sin `allow-same-origin`, así que su origen es opaco y leer `localStorage` **lanza** en vez de devolver `null`; las herramientas que llegan por CDN lo consultan para cachear y la excepción subía sin capturar. Concederle `allow-same-origin` lo callaría y sería un error: junto a `allow-scripts` permite que el documento se quite el aislamiento, y ahí dentro corre código generado por una IA mientras en ese mismo origen viven la sesión del diseñador y los proyectos del usuario.

> La comprobación afirma **geometría**, no presencia en el DOM: con el fallo activo, «el texto está» y «Tailwind aplica» seguían pasando.

> **Dos notas de cosas que salieron a la luz probando esto, ajenas a la colocación.**
>
> **Los bloques del lienzo no se podían arrastrar en absoluto.** El envoltorio extendía los `listeners` de dnd-kit y a continuación escribía `onPointerDown={freePosition ? startMove : undefined}`; en JSX gana lo último, así que para un bloque en el flujo —el caso normal— el manejador del sensor se sustituía por `undefined`. Ahora los eventos de puntero tienen un solo dueño, elegido según el régimen del bloque.
>
> **Ctrl+Z y Ctrl+Y no existían.** Los botones de deshacer y rehacer los anuncian en su tooltip, pero no había nada escuchando el teclado: la interfaz prometía un atajo que no estaba. Añadidos, ignorándolos mientras se escribe —el lienzo tiene campos de texto por todas partes y ahí Ctrl+Z debe deshacer lo tecleado, no el diseño entero—.

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
| Esquema único de bloques (IR) — lienzo y export derivan de la misma fuente | ✅ 98/98 tipos |
| Modelo de estado y acciones declarativas + visibilidad condicional | ✅ |
| Modo Diseño / Interactivo con estado real | ✅ |
| Exportación como paquete de carpeta (componente + props + estilos + índice) | ✅ |
| Hoja de estilos autocontenida al exportar (Tailwind → CSS) + compilación SASS | ✅ (requiere Node; degrada, ver §8) |
| Emisores multi-framework en el builder visual | ✅ Ocho destinos desde la misma IR (React, Vue 3 y Vue 2 en TS y JS; Angular 22 y 21 en TS); selector en la vista de código. React y Angular se entregan además **como carpeta**, y una librería de cualquiera de los dos se exporta como zip con un directorio por componente |
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
| Dimensionado relativo al contenedor (%, fracciones) en los 98 tipos | ✅ |
| Posición libre opcional por bloque, conviviendo con el flujo | ✅ |
| El asistente pregunta cuando la petición admite resultados distintos | ✅ |
| Validación declarativa de campos (7 reglas) con generador e intérprete gemelos | ✅ |
| Eventos `blur` / `focus` / `mouseenter` / `mouseleave` / `dblclick`, componibles | ✅ |
| Asistente con imágenes: inventario → destino → estilos → alcance → construcción | ✅ |
| Tandas de varios componentes creados como componentes del proyecto | ✅ |
| Destino de la tanda ejecutado: crea la librería o publica en la existente | ✅ |
| Acceso al constructor (RF11): código → JWT con rol `designer`, puerta en la UI | ✅ |
| Tests backend | ✅ 109/109 verdes (Domain 31, Application 48, Api 30) |
| Verificación del código emitido (`npm run verify:emitter`) | ✅ 129 componentes en TSX y JSX, 9 paquetes de React (TS y JS), 129 SFC de Vue 3 y Vue 2 en los dos lenguajes, 258 clases de Angular y **129 paquetes de carpeta de Angular** |
| Verificación de estilos del lienzo (`npm run verify:styles`) | ✅ 79 defaults, 587 opciones del panel, 41 roles, 9231 safelist |
| Colocación coherente lienzo ↔ código exportado (posición, marco de referencia, modo interactivo) | ✅ ver §11 |
| Guías e imantado al mover, alinear/repartir y disposición del contenedor | ✅ ver §11 |
| Componentes adaptables a cualquier pantalla por defecto | ✅ ver §12 |
| Vista previa (iframe con Tailwind y Babel en runtime) | ✅ ver §13 |

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

El **código de acceso al constructor** (`Designer:AccessCode`, RF11) sigue las mismas tres vías y la misma regla de no versionarse; a diferencia del secreto, dejarlo vacío no impide arrancar: cierra el constructor (ver §6sexies).

La **clave de la API de Claude** (`Anthropic:ApiKey`) no puede seguir esas tres vías tal cual, porque la primera de ellas —un valor de desarrollo versionado— no existe para una credencial de pago. Sus orígenes son:

| Entorno | Origen |
|---|---|
| `dotnet run` en local | `appsettings.Local.json` (no versionado, cargado por `Program.cs`) |
| `docker compose up` | `Anthropic__ApiKey`, desde `ANTHROPIC_API_KEY` en `.env` |
| Despliegue Azure | Key Vault, referenciado por la Web App vía Managed Identity |

> **En Docker gana el `.env`, no `appsettings.Local.json`.** El bind mount `./backend:/src` mete el fichero local dentro del contenedor, así que las dos vías están presentes a la vez y es fácil creer que se está editando la que manda. No lo es: `Program.cs` inserta `appsettings.Local.json` **antes** de las variables de entorno a propósito, para que `ConnectionStrings__Postgres` de Compose siga apuntando al Postgres de la red interna y no al del fichero. La consecuencia es que `Anthropic__ApiKey` del `.env` también gana. Cambiar la clave solo en `appsettings.Local.json` y levantar con Docker deja el contenedor usando la clave vieja del `.env`, y el síntoma es un `401 authentication_error` de la API de Anthropic que no señala a la configuración. **Al rotar la clave hay que tocar los dos ficheros**, o usar solo el que corresponda al modo en que se arranque.

## Cómo desplegar en Azure

```bash
az login
az group create -n visualiza-rg -l westeurope
gh workflow run deploy.yml -f resourceGroup=visualiza-rg
```

Antes hay que dar de alta en GitHub Secrets: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `POSTGRES_ADMIN_PASSWORD`, `JWT_SECRET`, `DESIGNER_ACCESS_CODE` y `ANTHROPIC_API_KEY`.

`ANTHROPIC_API_KEY` es opcional, pero **omitirlo no deja el despliegue sin IA de forma visible: lo deja generando con el mock**. `Anthropic:UseMock` vale `true` en `appsettings.json`, así que una Web App sin esa variable devuelve componentes enlatados con un 200 y sin avisar. Por eso el Bicep fija `Anthropic__UseMock` explícitamente en las dos ramas: `false` cuando hay clave, `true` cuando no la hay, para que el modo del despliegue esté escrito y no herede un valor por defecto pensado para el arranque en local.

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
│  │  │                             · núcleo: ui-node (IR), schema (98 bloques), actions
│  │  │                             · emisión: emit-react, emit-vue, emitters, emit-package
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
