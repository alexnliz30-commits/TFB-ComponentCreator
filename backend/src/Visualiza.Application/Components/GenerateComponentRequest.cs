using Visualiza.Domain.Components;

namespace Visualiza.Application.Components;

public sealed record GenerateComponentRequest(
    ComponentType Type,
    string Prompt,
    TargetFramework Framework = TargetFramework.React,
    CodeLanguage Language = CodeLanguage.TypeScript);
