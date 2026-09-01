using Microsoft.EntityFrameworkCore;

namespace Visualiza.Infrastructure.Persistence;

public sealed class VisualizaDbContext : DbContext
{
    public VisualizaDbContext(DbContextOptions<VisualizaDbContext> options) : base(options) { }

    public DbSet<GeneratedComponentRecord> GeneratedComponents => Set<GeneratedComponentRecord>();
    public DbSet<ParticipantRecord> Participants => Set<ParticipantRecord>();
    public DbSet<ExperimentSessionRecord> Sessions => Set<ExperimentSessionRecord>();
    public DbSet<TaskMeasurementRecord> TaskMeasurements => Set<TaskMeasurementRecord>();
    public DbSet<SusResponseRecord> SusResponses => Set<SusResponseRecord>();
    public DbSet<ComponentLibraryRecord> Libraries => Set<ComponentLibraryRecord>();
    public DbSet<SavedComponentRecord> SavedComponents => Set<SavedComponentRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var gen = modelBuilder.Entity<GeneratedComponentRecord>();
        gen.HasKey(x => x.Id);
        gen.Property(x => x.Type).HasMaxLength(64).IsRequired();
        gen.Property(x => x.Prompt).IsRequired();
        gen.Property(x => x.SourceCode).IsRequired();
        gen.Property(x => x.Language).HasMaxLength(16).IsRequired();
        gen.HasIndex(x => x.GeneratedAt);

        var participant = modelBuilder.Entity<ParticipantRecord>();
        participant.HasKey(x => x.Id);
        participant.Property(x => x.Code).HasMaxLength(32).IsRequired();
        participant.HasIndex(x => x.Code).IsUnique();

        var session = modelBuilder.Entity<ExperimentSessionRecord>();
        session.HasKey(x => x.Id);
        session.HasIndex(x => x.ParticipantId);
        session.HasIndex(x => x.StartedAt);

        var task = modelBuilder.Entity<TaskMeasurementRecord>();
        task.HasKey(x => x.Id);
        task.Property(x => x.ComponentType).HasMaxLength(64).IsRequired();
        task.Property(x => x.Condition).HasMaxLength(16).IsRequired();
        task.HasIndex(x => x.SessionId);

        var sus = modelBuilder.Entity<SusResponseRecord>();
        sus.HasKey(x => x.Id);
        // Nulo = el cuestionario valora el conjunto de una condición (ver SusResponse).
        sus.Property(x => x.ComponentType).HasMaxLength(64);
        sus.Property(x => x.Condition).HasMaxLength(16).IsRequired();
        sus.HasIndex(x => x.SessionId);

        var library = modelBuilder.Entity<ComponentLibraryRecord>();
        library.HasKey(x => x.Id);
        library.Property(x => x.Name).HasMaxLength(128).IsRequired();
        library.Property(x => x.Description).HasMaxLength(512);
        library.Property(x => x.Framework).HasMaxLength(16).IsRequired();
        library.Property(x => x.Language).HasMaxLength(16).IsRequired();
        library.HasIndex(x => x.CreatedAt);

        var saved = modelBuilder.Entity<SavedComponentRecord>();
        saved.HasKey(x => x.Id);
        saved.Property(x => x.Name).HasMaxLength(128).IsRequired();
        saved.Property(x => x.SourceCode).IsRequired();
        saved.HasIndex(x => x.LibraryId);
    }
}
