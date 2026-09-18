-- Visualiza — Schema initialization for PostgreSQL 16
-- Run once against the 'visualiza' database created by docker-compose.

-- 1. Generated components (AI-produced UI components)
CREATE TABLE IF NOT EXISTS "GeneratedComponents" (
    "Id"           uuid         NOT NULL DEFAULT gen_random_uuid(),
    "Type"         varchar(64)  NOT NULL,
    "Prompt"       text         NOT NULL,
    "SourceCode"   text         NOT NULL,
    "Language"     varchar(16)  NOT NULL,
    "GeneratedAt"  timestamptz  NOT NULL DEFAULT now(),
    "Compiled"     boolean      NOT NULL DEFAULT false,
    "Diagnostics"  text,
    CONSTRAINT "PK_GeneratedComponents" PRIMARY KEY ("Id")
);

CREATE INDEX IF NOT EXISTS "IX_GeneratedComponents_GeneratedAt"
    ON "GeneratedComponents" ("GeneratedAt");

-- 2. Experiment participants
CREATE TABLE IF NOT EXISTS "Participants" (
    "Id"        uuid        NOT NULL DEFAULT gen_random_uuid(),
    "Code"      varchar(32) NOT NULL,
    "CreatedAt" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "PK_Participants" PRIMARY KEY ("Id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "IX_Participants_Code"
    ON "Participants" ("Code");

-- 3. Experiment sessions
CREATE TABLE IF NOT EXISTS "Sessions" (
    "Id"            uuid        NOT NULL DEFAULT gen_random_uuid(),
    "ParticipantId" uuid        NOT NULL,
    "StartedAt"     timestamptz NOT NULL DEFAULT now(),
    "CompletedAt"   timestamptz,
    CONSTRAINT "PK_Sessions" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_Sessions_Participants" FOREIGN KEY ("ParticipantId")
        REFERENCES "Participants" ("Id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IX_Sessions_ParticipantId"
    ON "Sessions" ("ParticipantId");

CREATE INDEX IF NOT EXISTS "IX_Sessions_StartedAt"
    ON "Sessions" ("StartedAt");

-- 4. Task measurements (time-on-task, errors, success per condition)
CREATE TABLE IF NOT EXISTS "TaskMeasurements" (
    "Id"            uuid        NOT NULL DEFAULT gen_random_uuid(),
    "SessionId"     uuid        NOT NULL,
    "ComponentType" varchar(64) NOT NULL,
    "Condition"     varchar(16) NOT NULL,
    "DurationMs"    integer     NOT NULL,
    "ErrorCount"    integer     NOT NULL DEFAULT 0,
    "Success"       boolean     NOT NULL DEFAULT false,
    "CreatedAt"     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "PK_TaskMeasurements" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_TaskMeasurements_Sessions" FOREIGN KEY ("SessionId")
        REFERENCES "Sessions" ("Id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IX_TaskMeasurements_SessionId"
    ON "TaskMeasurements" ("SessionId");

-- 5. SUS responses (System Usability Scale, 10 items + computed score)
CREATE TABLE IF NOT EXISTS "SusResponses" (
    "Id"            uuid        NOT NULL DEFAULT gen_random_uuid(),
    "SessionId"     uuid        NOT NULL,
    -- Nulo cuando el cuestionario valora el CONJUNTO de una condicion y no un
    -- componente suelto, que es como se administra desde el rediseno del
    -- protocolo. Ver Visualiza.Domain.Experiment.SusResponse.
    "ComponentType" varchar(64),
    "Condition"     varchar(16) NOT NULL,
    "Item1"         integer     NOT NULL,
    "Item2"         integer     NOT NULL,
    "Item3"         integer     NOT NULL,
    "Item4"         integer     NOT NULL,
    "Item5"         integer     NOT NULL,
    "Item6"         integer     NOT NULL,
    "Item7"         integer     NOT NULL,
    "Item8"         integer     NOT NULL,
    "Item9"         integer     NOT NULL,
    "Item10"        integer     NOT NULL,
    "Score"         double precision NOT NULL,
    "CreatedAt"     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "PK_SusResponses" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_SusResponses_Sessions" FOREIGN KEY ("SessionId")
        REFERENCES "Sessions" ("Id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IX_SusResponses_SessionId"
    ON "SusResponses" ("SessionId");

-- 6. Component libraries (product feature: user collections per framework)
CREATE TABLE IF NOT EXISTS "Libraries" (
    "Id"          uuid         NOT NULL DEFAULT gen_random_uuid(),
    "Name"        varchar(128) NOT NULL,
    "Description" varchar(512) NOT NULL DEFAULT '',
    "Framework"   varchar(16)  NOT NULL,
    "Language"    varchar(16)  NOT NULL,
    "CreatedAt"   timestamptz  NOT NULL DEFAULT now(),
    -- Estilos GLOBALES de la librería, que comparten todos sus componentes:
    -- el tema por roles (color de marca, tipografía, forma) y una hoja libre.
    -- Nulos en las creadas antes de que el tema viviera aquí; entonces el cliente
    -- aplica el suyo por defecto. Mandan sobre los estilos propios de cada
    -- componente, que solo los pisan marcando la declaración con `!propio`.
    "ThemeJson"    text        NULL,
    "GlobalStyles" text        NULL,
    CONSTRAINT "PK_Libraries" PRIMARY KEY ("Id")
);

CREATE INDEX IF NOT EXISTS "IX_Libraries_CreatedAt"
    ON "Libraries" ("CreatedAt");

-- Una base de datos que YA tenía tablas no la migra nadie: `EnsureCreated()` es
-- no-op en cuanto encuentra el esquema, así que el `CREATE TABLE` de arriba no
-- añade columnas a una instalación existente y la librería se quedaría sin sus
-- estilos globales sin dar ningún error. Esto sí las añade, y es idempotente.
ALTER TABLE "Libraries" ADD COLUMN IF NOT EXISTS "ThemeJson"    text NULL;
ALTER TABLE "Libraries" ADD COLUMN IF NOT EXISTS "GlobalStyles" text NULL;

-- 7. Components saved into a library
CREATE TABLE IF NOT EXISTS "SavedComponents" (
    "Id"         uuid         NOT NULL DEFAULT gen_random_uuid(),
    "LibraryId"  uuid         NOT NULL,
    "Name"       varchar(128) NOT NULL,
    "SourceCode" text         NOT NULL,
    -- Árbol de bloques del constructor. Nulo en los componentes generados como
    -- código: del TSX emitido no se puede volver al árbol, así que sin esto un
    -- componente de la librería no se puede reabrir para editarlo visualmente.
    "TreeJson"   text         NULL,
    "CreatedAt"  timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT "PK_SavedComponents" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_SavedComponents_Libraries" FOREIGN KEY ("LibraryId")
        REFERENCES "Libraries" ("Id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IX_SavedComponents_LibraryId"
    ON "SavedComponents" ("LibraryId");

-- 8. Designer projects and their access codes (RF11)
--
-- Solo la identidad del proyecto y el hash de su código: el contenido —los
-- componentes y sus árboles de bloques— vive en el navegador. El código en claro
-- no se guarda, así que un volcado de esta tabla no abre ningún proyecto.
CREATE TABLE IF NOT EXISTS "DesignerProjects" (
    "Id"        uuid         NOT NULL DEFAULT gen_random_uuid(),
    "Name"      varchar(128) NOT NULL,
    "CodeHash"  varchar(64)  NOT NULL,
    "CreatedAt" timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT "PK_DesignerProjects" PRIMARY KEY ("Id")
);

CREATE INDEX IF NOT EXISTS "IX_DesignerProjects_CreatedAt"
    ON "DesignerProjects" ("CreatedAt");

-- Columnas añadidas después de la primera versión del esquema.
--
-- `CREATE TABLE IF NOT EXISTS` no toca una tabla que ya existe, y `EnsureCreated()`
-- es no-op en cuanto hay tablas: sobre un volumen de Postgres anterior la columna
-- no aparecería y la feature quedaría rota sin que ningún test lo viera (los tests
-- usan InMemory). Reaplicar este fichero es la vía de migración, así que la
-- alteración va aquí y es idempotente.
ALTER TABLE "SavedComponents" ADD COLUMN IF NOT EXISTS "TreeJson" text NULL;

-- Bases creadas antes del rediseno del protocolo: la columna era obligatoria.
ALTER TABLE "SusResponses" ALTER COLUMN "ComponentType" DROP NOT NULL;
